import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { buildCanonicalConversationRequest } from "../../src/lib/providers/canonical-request";
import { getDefaultModelForProvider } from "../../src/lib/providers/model-catalog";
import type {
  NormalizedProviderEvent,
  ProviderId,
  ProviderRuntimeOptions,
} from "../../src/lib/providers/provider.types";
import { buildCurrentTaskAwarenessRetrievedContext } from "../../src/lib/task-context/current-task-awareness";
import type { AppNotificationCreateInput } from "../../src/lib/notifications/notification.types";
import { workspaceHasActiveTurns } from "../../src/lib/notifications/notification.types";
import {
  createWorkspaceConfluencePage,
  createWorkspaceFigmaResource,
  createWorkspaceInfoCustomField,
  createWorkspaceJiraIssue,
  createWorkspaceLinkedPullRequest,
  createWorkspaceSlackThread,
  createWorkspaceTodoItem,
  extractConfluencePageReference,
  extractFigmaResourceReference,
  extractJiraIssueReference,
  extractSlackThreadReference,
  type WorkspaceInfoCustomField,
  type WorkspaceInformationState,
  type WorkspaceInfoFieldType,
  type WorkspaceLinkedPrStatus,
} from "../../src/lib/workspace-information";
import {
  buildPendingProviderTurnState,
  buildRecentTimestamp,
} from "../../src/store/chat-state-helpers";
import {
  applyApprovalState,
  applyUserInputState,
} from "../../src/store/editor.utils";
import {
  buildProjectDefaultWorkspaceId,
  buildImportedWorktreeWorkspaceId,
  buildWorkspaceCreationNotice,
  buildWorkspaceRootNodeModulesSymlinkCommand,
  normalizeProjectDisplayName,
  normalizeProjectWorkspaceRootNodeModulesSymlinkPreference,
  normalizeRecentProjectStates,
  normalizeWorkspaceInitCommand,
  resolveCurrentProjectDefaultWorkspaceId,
  resolveProjectNameFromPath,
  resolveProjectWorkspaceInitCommand,
  resolveProjectWorkspaceRootNodeModulesSymlinkPreference,
  resolveWorkspaceRemoteBaseBranchTarget,
  sanitizeBranchName,
  summarizeTerminalCommandDetail,
  summarizeWorkspaceInitCommand,
  toWorkspaceFolderName,
  upsertRecentProjectState,
  type RecentProjectState,
} from "../../src/store/project.utils";
import {
  buildWorkspaceSessionState,
  createEmptyWorkspaceState,
  createWorkspaceSnapshot,
  defaultWorkspaceName,
  type WorkspaceSessionState,
} from "../../src/store/workspace-session-state";
import { applyProviderEventsToWorkspaceSession } from "../../src/store/workspace-turn-replay";
import {
  findLatestPendingApprovalPart,
  findLatestPendingUserInputPart,
  findPendingApprovalMessageByRequestId,
} from "../../src/store/provider-message.utils";
import type { ChatMessage, Task } from "../../src/types/chat";
import { findWorkspaceTaskOrThrow } from "../../src/lib/tasks";
import { ensureHostServicePersistenceReady } from "./persistence";
import { createKeyedAsyncQueue } from "./keyed-async-queue";
import { providerRuntime } from "../providers/runtime";
import type { BridgeEvent } from "../providers/types";
import { runCommand } from "../main/utils/command";

export interface RegisteredWorkspaceInfo {
  id: string;
  name: string;
  updatedAt: string;
  path: string;
  branch: string;
  isDefault: boolean;
}

export interface RegisteredProjectInfo {
  projectPath: string;
  projectName: string;
  defaultBranch: string;
  activeWorkspaceId: string;
  defaultWorkspaceId: string;
  workspaces: RegisteredWorkspaceInfo[];
}

export interface CreatedWorkspaceInfo {
  workspaceId: string;
  workspaceName: string;
  workspacePath: string;
  branch: string;
  projectPath: string;
  projectName: string;
  noticeLevel?: "success" | "warning";
  message?: string;
}

export interface TaskRunResult {
  workspaceId: string;
  taskId: string;
  taskTitle: string;
  turnId: string;
  provider: ProviderId;
  model: string;
}

export interface TaskStatusResult {
  workspaceId: string;
  taskId: string;
  title: string;
  provider: ProviderId;
  updatedAt: string;
  activeTurnId: string | null;
  latestTurnId: string | null;
  latestTurnCompletedAt: string | null;
  messageCount: number;
  latestAssistantText: string | null;
  pendingApprovals: Array<{
    messageId: string;
    requestId: string;
    toolName: string;
    description: string;
  }>;
  pendingUserInputs: Array<{
    messageId: string;
    requestId: string;
    toolName: string;
    questionCount: number;
  }>;
}

export interface WorkspaceInformationMutationResult {
  workspaceId: string;
  workspaceInformation: WorkspaceInformationState;
}

const workspaceSessionCacheById = new Map<string, WorkspaceSessionState>();
const workspacePersistChainById = new Map<string, Promise<void>>();
const workspaceProviderEventQueue = createKeyedAsyncQueue<string>();
const WORKSPACE_SESSION_CACHE_LIMIT = 32;
let localMcpEventListener:
  | ((event: {
      type: "workspace-information-updated";
      payload: WorkspaceInformationMutationResult;
    }) => void)
  | null = null;

type WorkspaceInformationResourceKind =
  | "jira"
  | "pull_request"
  | "confluence"
  | "figma"
  | "slack";

type WorkspaceCustomFieldValueInput = string | number | boolean | null;

function normalizeProjectPath(projectPath: string) {
  return path.resolve(projectPath.trim());
}

async function assertDirectoryExists(projectPath: string) {
  const stat = await fs.stat(projectPath);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${projectPath}`);
  }
}

async function detectDefaultBranch(projectPath: string) {
  const branchResult = await runCommand({
    cwd: projectPath,
    command:
      "git symbolic-ref --short refs/remotes/origin/HEAD || git symbolic-ref --short HEAD || echo main",
  });
  const branchLine = (branchResult.stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return branchLine ? branchLine.replace(/^origin\//, "") : "main";
}

function createEmptyWorkspaceSnapshot() {
  const empty = createEmptyWorkspaceState();
  return createWorkspaceSnapshot({
    activeTaskId: empty.activeTaskId,
    tasks: empty.tasks,
    messagesByTask: empty.messagesByTask,
    promptDraftByTask: empty.promptDraftByTask,
    editorTabs: empty.editorTabs,
    activeEditorTabId: empty.activeEditorTabId,
    terminalTabs: empty.terminalTabs,
    activeTerminalTabId: empty.activeTerminalTabId,
    terminalDocked: empty.terminalDocked,
    providerSessionByTask: empty.providerSessionByTask,
  });
}

function toWorkspaceList(
  project: RecentProjectState,
): RegisteredWorkspaceInfo[] {
  return project.workspaces.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    updatedAt: workspace.updatedAt,
    path: project.workspacePathById[workspace.id] ?? project.projectPath,
    branch: project.workspaceBranchById[workspace.id] ?? project.defaultBranch,
    isDefault: Boolean(project.workspaceDefaultById[workspace.id]),
  }));
}

async function persistWorkspaceSession(args: {
  workspaceId: string;
  workspaceName: string;
  session: WorkspaceSessionState;
}) {
  const store = ensureHostServicePersistenceReady();
  store.upsertWorkspace({
    id: args.workspaceId,
    name: args.workspaceName,
    snapshot: createWorkspaceSnapshot({
      activeTaskId: args.session.activeTaskId,
      tasks: args.session.tasks,
      messagesByTask: args.session.messagesByTask,
      promptDraftByTask: args.session.promptDraftByTask,
      workspaceInformation: args.session.workspaceInformation,
      editorTabs: args.session.editorTabs,
      activeEditorTabId: args.session.activeEditorTabId,
      terminalTabs: args.session.terminalTabs,
      activeTerminalTabId: args.session.activeTerminalTabId,
      terminalDocked: args.session.terminalDocked,
      providerSessionByTask: args.session.providerSessionByTask,
    }) as never,
  });
}

function queueWorkspaceSessionPersist(args: {
  workspaceId: string;
  workspaceName: string;
  session: WorkspaceSessionState;
}) {
  const previous =
    workspacePersistChainById.get(args.workspaceId) ?? Promise.resolve();
  let tracked: Promise<void>;
  tracked = previous
    .catch(() => undefined)
    .then(() => persistWorkspaceSession(args))
    .catch((error) => {
      console.error("[stave-mcp] failed to persist workspace session", error, {
        workspaceId: args.workspaceId,
      });
    })
    .finally(() => {
      if (workspacePersistChainById.get(args.workspaceId) === tracked) {
        workspacePersistChainById.delete(args.workspaceId);
      }
    });
  workspacePersistChainById.set(args.workspaceId, tracked);
  return tracked;
}

async function loadNormalizedProjects() {
  const store = ensureHostServicePersistenceReady();
  return {
    store,
    projects: normalizeRecentProjectStates({
      projects: store.loadProjectRegistry() as RecentProjectState[],
    }),
  };
}

async function saveNormalizedProjects(projects: RecentProjectState[]) {
  const store = ensureHostServicePersistenceReady();
  store.saveProjectRegistry({
    projects: normalizeRecentProjectStates({ projects }) as never[],
  });
}

function findProjectByPath(
  projects: RecentProjectState[],
  projectPath: string,
) {
  return (
    projects.find((project) => project.projectPath === projectPath) ?? null
  );
}

function findWorkspaceRegistration(args: {
  projects: RecentProjectState[];
  workspaceId: string;
}) {
  for (const project of args.projects) {
    const workspace =
      project.workspaces.find((item) => item.id === args.workspaceId) ?? null;
    if (!workspace) {
      continue;
    }
    return {
      project,
      workspace,
      workspacePath:
        project.workspacePathById[workspace.id] ?? project.projectPath,
      branch:
        project.workspaceBranchById[workspace.id] ?? project.defaultBranch,
    };
  }
  return null;
}

async function ensureProjectRegistryEntry(args: {
  projectPath: string;
  projectName?: string;
  defaultBranch?: string;
}) {
  const projectPath = normalizeProjectPath(args.projectPath);
  await assertDirectoryExists(projectPath);
  const resolvedProjectName = normalizeProjectDisplayName({
    projectPath,
    projectName:
      args.projectName?.trim() || resolveProjectNameFromPath({ projectPath }),
  });
  const defaultBranch =
    args.defaultBranch?.trim() || (await detectDefaultBranch(projectPath));
  const now = new Date().toISOString();

  const { store, projects } = await loadNormalizedProjects();
  const existingProject = findProjectByPath(projects, projectPath);
  const defaultWorkspaceId = existingProject
    ? resolveCurrentProjectDefaultWorkspaceId({
        projectPath,
        workspaces: existingProject.workspaces,
        workspaceDefaultById: existingProject.workspaceDefaultById,
      })
    : buildProjectDefaultWorkspaceId({ projectPath });
  const existingSnapshot = store.loadWorkspaceSnapshot({
    workspaceId: defaultWorkspaceId,
  });

  if (!existingSnapshot) {
    store.upsertWorkspace({
      id: defaultWorkspaceId,
      name: defaultWorkspaceName,
      snapshot: createEmptyWorkspaceSnapshot() as never,
    });
  }

  const nextProject: RecentProjectState = existingProject
    ? {
        ...existingProject,
        projectName: resolvedProjectName,
        defaultBranch,
        lastOpenedAt: now,
        activeWorkspaceId:
          existingProject.activeWorkspaceId || defaultWorkspaceId,
        workspaceBranchById: {
          ...existingProject.workspaceBranchById,
          [defaultWorkspaceId]:
            existingProject.workspaceBranchById[defaultWorkspaceId] ||
            defaultBranch,
        },
        workspacePathById: {
          ...existingProject.workspacePathById,
          [defaultWorkspaceId]:
            existingProject.workspacePathById[defaultWorkspaceId] ||
            projectPath,
        },
        workspaceDefaultById: {
          ...existingProject.workspaceDefaultById,
          [defaultWorkspaceId]: true,
        },
        workspaces: existingProject.workspaces.some(
          (workspace) => workspace.id === defaultWorkspaceId,
        )
          ? existingProject.workspaces
          : [
              {
                id: defaultWorkspaceId,
                name: defaultWorkspaceName,
                updatedAt: now,
              },
              ...existingProject.workspaces,
            ],
      }
    : {
        projectPath,
        projectName: resolvedProjectName,
        lastOpenedAt: now,
        defaultBranch,
        workspaces: [
          {
            id: defaultWorkspaceId,
            name: defaultWorkspaceName,
            updatedAt: now,
          },
        ],
        activeWorkspaceId: defaultWorkspaceId,
        workspaceBranchById: { [defaultWorkspaceId]: defaultBranch },
        workspacePathById: { [defaultWorkspaceId]: projectPath },
        workspaceDefaultById: { [defaultWorkspaceId]: true },
        projectBasePrompt: "",
        newWorkspaceInitCommand: "",
        newWorkspaceUseRootNodeModulesSymlink: false,
      };

  const nextProjects = upsertRecentProjectState({
    projects,
    project: nextProject,
  });
  await saveNormalizedProjects(nextProjects);

  return {
    projectPath,
    projectName: resolvedProjectName,
    defaultBranch,
    project: nextProject,
    defaultWorkspaceId,
  };
}

async function loadWorkspaceSession(workspaceId: string) {
  const cached = workspaceSessionCacheById.get(workspaceId);
  if (cached) {
    workspaceSessionCacheById.delete(workspaceId);
    workspaceSessionCacheById.set(workspaceId, cached);
    return cached;
  }

  const store = ensureHostServicePersistenceReady();
  const snapshot = store.loadWorkspaceSnapshot({ workspaceId });
  if (!snapshot) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }
  const latestTurns = store.listActiveTurnsForWorkspace({
    workspaceId,
    limit: 200,
  });
  const session = buildWorkspaceSessionState({
    snapshot: snapshot as never,
    latestTurns: latestTurns as never,
  });
  return cacheWorkspaceSession(workspaceId, session);
}

function cacheWorkspaceSession(
  workspaceId: string,
  session: WorkspaceSessionState,
) {
  workspaceSessionCacheById.delete(workspaceId);
  workspaceSessionCacheById.set(workspaceId, session);
  while (workspaceSessionCacheById.size > WORKSPACE_SESSION_CACHE_LIMIT) {
    const oldestWorkspaceId = workspaceSessionCacheById.keys().next().value;
    if (!oldestWorkspaceId) {
      break;
    }
    workspaceSessionCacheById.delete(oldestWorkspaceId);
  }
  return session;
}

export function setLocalMcpEventListener(
  listener: typeof localMcpEventListener,
) {
  localMcpEventListener = listener;
}

export async function cleanupLocalMcpRuntime() {
  localMcpEventListener = null;
  // Drain the provider-event queue first — handlers inside it call
  // store.completeTurn() and queueWorkspaceSessionPersist(), both of which
  // write to SQLite.  If we close persistence before the queue drains,
  // those writes either crash or silently lose data.
  await workspaceProviderEventQueue.drain();
  const pendingPersists = [...workspacePersistChainById.values()];
  workspacePersistChainById.clear();
  await Promise.allSettled(pendingPersists);
  workspaceSessionCacheById.clear();
}

function emitWorkspaceInformationUpdate(
  payload: WorkspaceInformationMutationResult,
) {
  localMcpEventListener?.({
    type: "workspace-information-updated",
    payload,
  });
}

function normalizeWorkspaceResourceKind(
  value: string,
): WorkspaceInformationResourceKind {
  switch (value.trim()) {
    case "jira":
    case "pull_request":
    case "confluence":
    case "figma":
    case "slack":
      return value.trim();
    default:
      throw new Error(`Unsupported workspace resource kind: ${value}`);
  }
}

function normalizeWorkspaceFieldType(value: string): WorkspaceInfoFieldType {
  switch (value.trim()) {
    case "text":
    case "textarea":
    case "number":
    case "boolean":
    case "date":
    case "url":
    case "single_select":
      return value.trim();
    default:
      throw new Error(`Unsupported workspace custom field type: ${value}`);
  }
}

function normalizeLinkedPullRequestStatus(
  value?: string,
): WorkspaceLinkedPrStatus {
  switch (value?.trim()) {
    case "open":
    case "review":
    case "merged":
    case "closed":
    case "planned":
      return value.trim();
    default:
      return "planned";
  }
}

function normalizeStringList(value?: string[]) {
  const seen = new Set<string>();
  return (value ?? []).flatMap((entry) => {
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) {
      return [];
    }
    seen.add(trimmed);
    return [trimmed];
  });
}

function coerceWorkspaceCustomFieldValue(args: {
  field: WorkspaceInfoCustomField;
  value: WorkspaceCustomFieldValueInput;
}) {
  const { field, value } = args;
  switch (field.type) {
    case "number":
      if (value === null || value === "") {
        return { ...field, value: null };
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        return { ...field, value };
      }
      if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return { ...field, value: parsed };
        }
      }
      throw new Error(`Invalid numeric value for custom field ${field.id}.`);
    case "boolean":
      if (typeof value === "boolean") {
        return { ...field, value };
      }
      if (typeof value === "string") {
        if (value === "true") {
          return { ...field, value: true };
        }
        if (value === "false") {
          return { ...field, value: false };
        }
      }
      throw new Error(`Invalid boolean value for custom field ${field.id}.`);
    case "text":
    case "textarea":
    case "date":
    case "url":
      return {
        ...field,
        value: value == null ? "" : String(value).trim(),
      };
    case "single_select": {
      const nextValue = value == null ? "" : String(value).trim();
      if (nextValue && !field.options.includes(nextValue)) {
        throw new Error(
          `Value "${nextValue}" is not a valid option for custom field ${field.id}.`,
        );
      }
      return {
        ...field,
        value: nextValue,
      };
    }
    default:
      return {
        ...field,
        value: value == null ? "" : String(value).trim(),
      };
  }
}

function normalizeWorkspaceInfoString(value?: string) {
  return value?.trim() || "";
}
async function updateWorkspaceInformationState(args: {
  workspaceId: string;
  updater: (current: WorkspaceInformationState) => WorkspaceInformationState;
}) {
  const session = await loadWorkspaceSession(args.workspaceId);
  const { projects } = await loadNormalizedProjects();
  const registration = findWorkspaceRegistration({
    projects,
    workspaceId: args.workspaceId,
  });
  const nextWorkspaceInformation = args.updater(session.workspaceInformation);
  const nextSession = cacheWorkspaceSession(args.workspaceId, {
    ...session,
    workspaceInformation: nextWorkspaceInformation,
  });
  await queueWorkspaceSessionPersist({
    workspaceId: args.workspaceId,
    workspaceName: registration?.workspace.name ?? args.workspaceId,
    session: nextSession,
  });
  emitWorkspaceInformationUpdate({
    workspaceId: args.workspaceId,
    workspaceInformation: nextWorkspaceInformation,
  });
  return {
    workspaceId: args.workspaceId,
    workspaceInformation: nextWorkspaceInformation,
  } satisfies WorkspaceInformationMutationResult;
}

export async function getWorkspaceInformation(args: { workspaceId: string }) {
  const session = await loadWorkspaceSession(args.workspaceId);
  return {
    workspaceId: args.workspaceId,
    workspaceInformation: session.workspaceInformation,
  };
}

export async function replaceWorkspaceNotes(args: {
  workspaceId: string;
  notes: string;
}) {
  return updateWorkspaceInformationState({
    workspaceId: args.workspaceId,
    updater: (current) => ({
      ...current,
      notes: args.notes,
    }),
  });
}

export async function appendWorkspaceNotes(args: {
  workspaceId: string;
  text: string;
}) {
  const text = args.text.trim();
  if (!text) {
    throw new Error("Workspace notes append text is required.");
  }
  return updateWorkspaceInformationState({
    workspaceId: args.workspaceId,
    updater: (current) => ({
      ...current,
      notes: current.notes.trim() ? `${current.notes.trim()}\n${text}` : text,
    }),
  });
}

export async function clearWorkspaceNotes(args: { workspaceId: string }) {
  return updateWorkspaceInformationState({
    workspaceId: args.workspaceId,
    updater: (current) => ({
      ...current,
      notes: "",
    }),
  });
}

export async function addWorkspaceTodo(args: {
  workspaceId: string;
  text: string;
}) {
  const text = args.text.trim();
  if (!text) {
    throw new Error("Workspace todo text is required.");
  }
  return updateWorkspaceInformationState({
    workspaceId: args.workspaceId,
    updater: (current) => {
      const nextTodo = createWorkspaceTodoItem();
      nextTodo.text = text;
      return {
        ...current,
        todos: [...current.todos, nextTodo],
      };
    },
  });
}

export async function updateWorkspaceTodo(args: {
  workspaceId: string;
  todoId: string;
  text?: string;
  completed?: boolean;
}) {
  if (args.text === undefined && args.completed === undefined) {
    throw new Error("Workspace todo update requires text or completed.");
  }
  return updateWorkspaceInformationState({
    workspaceId: args.workspaceId,
    updater: (current) => {
      let found = false;
      const todos = current.todos.map((todo) => {
        if (todo.id !== args.todoId) {
          return todo;
        }
        found = true;
        return {
          ...todo,
          ...(args.text !== undefined ? { text: args.text.trim() } : {}),
          ...(args.completed !== undefined
            ? { completed: args.completed }
            : {}),
        };
      });
      if (!found) {
        throw new Error(`Workspace todo not found: ${args.todoId}`);
      }
      return {
        ...current,
        todos,
      };
    },
  });
}

export async function removeWorkspaceTodo(args: {
  workspaceId: string;
  todoId: string;
}) {
  return updateWorkspaceInformationState({
    workspaceId: args.workspaceId,
    updater: (current) => {
      const todos = current.todos.filter((todo) => todo.id !== args.todoId);
      if (todos.length === current.todos.length) {
        throw new Error(`Workspace todo not found: ${args.todoId}`);
      }
      return {
        ...current,
        todos,
      };
    },
  });
}

export async function addWorkspaceResource(args: {
  workspaceId: string;
  kind: string;
  url: string;
  title?: string;
  issueKey?: string;
  status?: string;
  note?: string;
  nodeId?: string;
  channelName?: string;
  spaceKey?: string;
}) {
  const kind = normalizeWorkspaceResourceKind(args.kind);
  const url = args.url.trim();
  if (!url) {
    throw new Error("Workspace resource URL is required.");
  }
  const title = args.title?.trim() ?? "";
  const note = args.note?.trim() ?? "";
  return updateWorkspaceInformationState({
    workspaceId: args.workspaceId,
    updater: (current) => {
      switch (kind) {
        case "jira": {
          const nextLink = createWorkspaceJiraIssue();
          nextLink.issueKey = args.issueKey?.trim() ?? "";
          nextLink.title = title || nextLink.issueKey || url;
          nextLink.url = url;
          nextLink.status = args.status?.trim() ?? "";
          nextLink.note = note;
          return {
            ...current,
            jiraIssues: [...current.jiraIssues, nextLink],
          };
        }
        case "pull_request": {
          const nextLink = createWorkspaceLinkedPullRequest();
          nextLink.title = title || url;
          nextLink.url = url;
          nextLink.status = normalizeLinkedPullRequestStatus(args.status);
          nextLink.note = note;
          return {
            ...current,
            linkedPullRequests: [...current.linkedPullRequests, nextLink],
          };
        }
        case "confluence": {
          const nextLink = createWorkspaceConfluencePage();
          nextLink.title = title || url;
          nextLink.url = url;
          nextLink.spaceKey = args.spaceKey?.trim() ?? "";
          nextLink.note = note;
          return {
            ...current,
            confluencePages: [...current.confluencePages, nextLink],
          };
        }
        case "figma": {
          const nextLink = createWorkspaceFigmaResource();
          nextLink.title = title || url;
          nextLink.url = url;
          nextLink.nodeId = args.nodeId?.trim() ?? "";
          nextLink.note = note;
          return {
            ...current,
            figmaResources: [...current.figmaResources, nextLink],
          };
        }
        case "slack": {
          const nextLink = createWorkspaceSlackThread();
          nextLink.url = url;
          nextLink.channelName = args.channelName?.trim() ?? "";
          nextLink.note = note;
          return {
            ...current,
            slackThreads: [...current.slackThreads, nextLink],
          };
        }
      }
    },
  });
}

export async function removeWorkspaceResource(args: {
  workspaceId: string;
  kind: string;
  itemId: string;
}) {
  const kind = normalizeWorkspaceResourceKind(args.kind);
  return updateWorkspaceInformationState({
    workspaceId: args.workspaceId,
    updater: (current) => {
      switch (kind) {
        case "jira": {
          const jiraIssues = current.jiraIssues.filter(
            (item) => item.id !== args.itemId,
          );
          if (jiraIssues.length === current.jiraIssues.length) {
            throw new Error(`Workspace resource not found: ${args.itemId}`);
          }
          return {
            ...current,
            jiraIssues,
          };
        }
        case "pull_request": {
          const linkedPullRequests = current.linkedPullRequests.filter(
            (item) => item.id !== args.itemId,
          );
          if (linkedPullRequests.length === current.linkedPullRequests.length) {
            throw new Error(`Workspace resource not found: ${args.itemId}`);
          }
          return {
            ...current,
            linkedPullRequests,
          };
        }
        case "confluence": {
          const confluencePages = current.confluencePages.filter(
            (item) => item.id !== args.itemId,
          );
          if (confluencePages.length === current.confluencePages.length) {
            throw new Error(`Workspace resource not found: ${args.itemId}`);
          }
          return {
            ...current,
            confluencePages,
          };
        }
        case "figma": {
          const figmaResources = current.figmaResources.filter(
            (item) => item.id !== args.itemId,
          );
          if (figmaResources.length === current.figmaResources.length) {
            throw new Error(`Workspace resource not found: ${args.itemId}`);
          }
          return {
            ...current,
            figmaResources,
          };
        }
        case "slack": {
          const slackThreads = current.slackThreads.filter(
            (item) => item.id !== args.itemId,
          );
          if (slackThreads.length === current.slackThreads.length) {
            throw new Error(`Workspace resource not found: ${args.itemId}`);
          }
          return {
            ...current,
            slackThreads,
          };
        }
      }
    },
  });
}

export async function addWorkspaceCustomField(args: {
  workspaceId: string;
  fieldType: string;
  label: string;
  value?: WorkspaceCustomFieldValueInput;
  options?: string[];
}) {
  const fieldType = normalizeWorkspaceFieldType(args.fieldType);
  const label = args.label.trim();
  if (!label) {
    throw new Error("Workspace custom field label is required.");
  }
  return updateWorkspaceInformationState({
    workspaceId: args.workspaceId,
    updater: (current) => {
      let nextField = createWorkspaceInfoCustomField({
        type: fieldType,
        label,
      });
      if (nextField.type === "single_select") {
        const options = normalizeStringList(args.options);
        nextField = {
          ...nextField,
          options,
          value: options.includes(nextField.value)
            ? nextField.value
            : (options[0] ?? ""),
        };
      }
      if (args.value !== undefined) {
        nextField = coerceWorkspaceCustomFieldValue({
          field: nextField,
          value: args.value,
        });
      }
      return {
        ...current,
        customFields: [...current.customFields, nextField],
      };
    },
  });
}

export async function setWorkspaceCustomField(args: {
  workspaceId: string;
  fieldId: string;
  value?: WorkspaceCustomFieldValueInput;
  label?: string;
  options?: string[];
}) {
  if (
    args.value === undefined &&
    args.label === undefined &&
    args.options === undefined
  ) {
    throw new Error(
      "Workspace custom field update requires value, label, or options.",
    );
  }
  return updateWorkspaceInformationState({
    workspaceId: args.workspaceId,
    updater: (current) => {
      let found = false;
      const customFields = current.customFields.map((field) => {
        if (field.id !== args.fieldId) {
          return field;
        }
        found = true;
        let nextField: WorkspaceInfoCustomField = field;
        if (args.label !== undefined) {
          nextField = {
            ...nextField,
            label: args.label.trim(),
          };
        }
        if (nextField.type === "single_select" && args.options !== undefined) {
          const options = normalizeStringList(args.options);
          nextField = {
            ...nextField,
            options,
            value: options.includes(nextField.value)
              ? nextField.value
              : (options[0] ?? ""),
          };
        }
        if (args.value !== undefined) {
          nextField = coerceWorkspaceCustomFieldValue({
            field: nextField,
            value: args.value,
          });
        }
        return nextField;
      });
      if (!found) {
        throw new Error(`Workspace custom field not found: ${args.fieldId}`);
      }
      return {
        ...current,
        customFields,
      };
    },
  });
}

export async function removeWorkspaceCustomField(args: {
  workspaceId: string;
  fieldId: string;
}) {
  return updateWorkspaceInformationState({
    workspaceId: args.workspaceId,
    updater: (current) => {
      const customFields = current.customFields.filter(
        (field) => field.id !== args.fieldId,
      );
      if (customFields.length === current.customFields.length) {
        throw new Error(`Workspace custom field not found: ${args.fieldId}`);
      }
      return {
        ...current,
        customFields,
      };
    },
  });
}

export async function addWorkspaceJiraIssue(args: {
  workspaceId: string;
  url: string;
  issueKey?: string;
  title?: string;
  status?: string;
  note?: string;
}) {
  const parsed = extractJiraIssueReference(args.url);
  const workspaceInformation = await addWorkspaceResource({
    workspaceId: args.workspaceId,
    kind: "jira",
    url: normalizeWorkspaceInfoString(args.url),
    issueKey:
      normalizeWorkspaceInfoString(args.issueKey) || parsed?.issueKey || "",
    title:
      normalizeWorkspaceInfoString(args.title) ||
      normalizeWorkspaceInfoString(args.issueKey) ||
      parsed?.issueKey ||
      "Jira issue",
    status: normalizeWorkspaceInfoString(args.status),
    note: normalizeWorkspaceInfoString(args.note),
  });
  return {
    workspaceId: workspaceInformation.workspaceId,
    added: workspaceInformation.workspaceInformation.jiraIssues.at(-1) ?? null,
    workspaceInformation: workspaceInformation.workspaceInformation,
  };
}

export async function addWorkspaceConfluencePage(args: {
  workspaceId: string;
  url: string;
  title?: string;
  spaceKey?: string;
  note?: string;
}) {
  const parsed = extractConfluencePageReference(args.url);
  const workspaceInformation = await addWorkspaceResource({
    workspaceId: args.workspaceId,
    kind: "confluence",
    url: normalizeWorkspaceInfoString(args.url),
    title:
      normalizeWorkspaceInfoString(args.title) ||
      parsed?.title ||
      parsed?.spaceKey ||
      "Confluence page",
    spaceKey:
      normalizeWorkspaceInfoString(args.spaceKey) || parsed?.spaceKey || "",
    note: normalizeWorkspaceInfoString(args.note),
  });
  return {
    workspaceId: workspaceInformation.workspaceId,
    added:
      workspaceInformation.workspaceInformation.confluencePages.at(-1) ?? null,
    workspaceInformation: workspaceInformation.workspaceInformation,
  };
}

export async function addWorkspaceFigmaResource(args: {
  workspaceId: string;
  url: string;
  title?: string;
  nodeId?: string;
  note?: string;
}) {
  const parsed = extractFigmaResourceReference(args.url);
  const workspaceInformation = await addWorkspaceResource({
    workspaceId: args.workspaceId,
    kind: "figma",
    url: normalizeWorkspaceInfoString(args.url),
    title:
      normalizeWorkspaceInfoString(args.title) ||
      parsed?.title ||
      parsed?.fileKey ||
      "Figma resource",
    nodeId: normalizeWorkspaceInfoString(args.nodeId) || parsed?.nodeId || "",
    note: normalizeWorkspaceInfoString(args.note),
  });
  return {
    workspaceId: workspaceInformation.workspaceId,
    added:
      workspaceInformation.workspaceInformation.figmaResources.at(-1) ?? null,
    workspaceInformation: workspaceInformation.workspaceInformation,
  };
}

export async function addWorkspaceSlackThread(args: {
  workspaceId: string;
  url: string;
  channelName?: string;
  note?: string;
}) {
  const parsed = extractSlackThreadReference(args.url);
  const workspaceInformation = await addWorkspaceResource({
    workspaceId: args.workspaceId,
    kind: "slack",
    url: normalizeWorkspaceInfoString(args.url),
    channelName:
      normalizeWorkspaceInfoString(args.channelName) || parsed?.channelId || "",
    note: normalizeWorkspaceInfoString(args.note),
  });
  return {
    workspaceId: workspaceInformation.workspaceId,
    added:
      workspaceInformation.workspaceInformation.slackThreads.at(-1) ?? null,
    workspaceInformation: workspaceInformation.workspaceInformation,
  };
}
function buildTaskTitleFromPrompt(prompt: string) {
  return (
    prompt
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 48) || "New Task"
  );
}

function findPendingApprovals(messages: ChatMessage[]) {
  const pending: Array<{
    messageId: string;
    requestId: string;
    toolName: string;
    description: string;
  }> = [];

  for (const message of messages) {
    const approvalPart = findLatestPendingApprovalPart({ message });
    if (!approvalPart) {
      continue;
    }
    pending.push({
      messageId: message.id,
      requestId: approvalPart.requestId,
      toolName: approvalPart.toolName,
      description: approvalPart.description,
    });
  }

  return pending;
}

function findPendingUserInputs(messages: ChatMessage[]) {
  const pending: Array<{
    messageId: string;
    requestId: string;
    toolName: string;
    questionCount: number;
  }> = [];

  for (const message of messages) {
    const userInputPart = findLatestPendingUserInputPart({ message });
    if (!userInputPart) {
      continue;
    }
    pending.push({
      messageId: message.id,
      requestId: userInputPart.requestId,
      toolName: userInputPart.toolName,
      questionCount: userInputPart.questions.length,
    });
  }

  return pending;
}

async function persistNotification(notification: AppNotificationCreateInput) {
  try {
    const store = ensureHostServicePersistenceReady();
    store.createNotification({ notification: notification as never });
  } catch (error) {
    console.warn("[stave-mcp] failed to persist notification", error, {
      kind: notification.kind,
      workspaceId: notification.workspaceId,
      taskId: notification.taskId,
      turnId: notification.turnId,
    });
  }
}

async function persistApprovalNotification(args: {
  workspaceId: string;
  taskId: string;
  turnId: string;
  provider: ProviderId;
  event: Extract<NormalizedProviderEvent, { type: "approval" }>;
  session: WorkspaceSessionState;
}) {
  const { projects } = await loadNormalizedProjects();
  const registration = findWorkspaceRegistration({
    projects,
    workspaceId: args.workspaceId,
  });
  const taskTitle =
    args.session.tasks.find((task) => task.id === args.taskId)?.title ?? "Task";
  const location = findPendingApprovalMessageByRequestId({
    messages: args.session.messagesByTask[args.taskId] ?? [],
    requestId: args.event.requestId,
  });
  if (!location) {
    return;
  }
  await persistNotification({
    id: randomUUID(),
    kind: "task.approval_requested",
    title: taskTitle,
    body: `${args.event.toolName}: ${args.event.description}`,
    projectPath: registration?.project.projectPath ?? null,
    projectName: registration?.project.projectName ?? null,
    workspaceId: args.workspaceId,
    workspaceName: registration?.workspace.name ?? null,
    taskId: args.taskId,
    taskTitle,
    turnId: args.turnId,
    providerId: args.provider,
    action: {
      type: "approval",
      requestId: args.event.requestId,
      messageId: location.messageId,
    },
    payload: {
      toolName: args.event.toolName,
      description: args.event.description,
    },
    dedupeKey: `task.approval_requested:${args.turnId}:${args.event.requestId}`,
  });
}

async function persistTurnCompletedNotification(args: {
  workspaceId: string;
  taskId: string;
  turnId: string;
  provider: ProviderId;
  event: Extract<NormalizedProviderEvent, { type: "done" }>;
  session: WorkspaceSessionState;
}) {
  if (
    workspaceHasActiveTurns({
      activeTurnIdsByTask: args.session.activeTurnIdsByTask,
    })
  ) {
    return;
  }

  const { projects } = await loadNormalizedProjects();
  const registration = findWorkspaceRegistration({
    projects,
    workspaceId: args.workspaceId,
  });
  const taskTitle =
    args.session.tasks.find((task) => task.id === args.taskId)?.title ?? "Task";

  await persistNotification({
    id: randomUUID(),
    kind: "task.turn_completed",
    title: taskTitle,
    body: `Latest run finished in ${registration?.workspace.name ?? args.workspaceId}.`,
    projectPath: registration?.project.projectPath ?? null,
    projectName: registration?.project.projectName ?? null,
    workspaceId: args.workspaceId,
    workspaceName: registration?.workspace.name ?? null,
    taskId: args.taskId,
    taskTitle,
    turnId: args.turnId,
    providerId: args.provider,
    action: null,
    payload: {
      stopReason: args.event.stop_reason ?? null,
    },
    dedupeKey: `task.turn_completed:${args.turnId}`,
  });
}

async function handleProviderEvent(args: {
  workspaceId: string;
  workspaceName: string;
  taskId: string;
  provider: ProviderId;
  model: string;
  turnId: string;
  event: BridgeEvent;
}) {
  const store = ensureHostServicePersistenceReady();
  const session = await loadWorkspaceSession(args.workspaceId);
  const applied = applyProviderEventsToWorkspaceSession({
    session,
    taskId: args.taskId,
    events: [args.event as NormalizedProviderEvent],
    provider: args.provider,
    model: args.model,
    turnId: args.turnId,
  });
  cacheWorkspaceSession(args.workspaceId, applied.session);
  await queueWorkspaceSessionPersist({
    workspaceId: args.workspaceId,
    workspaceName: args.workspaceName,
    session: applied.session,
  });

  if (args.event.type === "approval") {
    await persistApprovalNotification({
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      turnId: args.turnId,
      provider: args.provider,
      event: args.event,
      session: applied.session,
    });
  }
  if (args.event.type === "done") {
    await persistTurnCompletedNotification({
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      turnId: args.turnId,
      provider: args.provider,
      event: args.event,
      session: applied.session,
    });
    store.completeTurn({ id: args.turnId });
  }
}

export async function registerProject(args: {
  projectPath: string;
  projectName?: string;
  defaultBranch?: string;
}) {
  const ensured = await ensureProjectRegistryEntry(args);
  return {
    projectPath: ensured.projectPath,
    projectName: ensured.project.projectName,
    defaultBranch: ensured.project.defaultBranch,
    activeWorkspaceId: ensured.project.activeWorkspaceId,
    defaultWorkspaceId: ensured.defaultWorkspaceId,
    workspaces: toWorkspaceList(ensured.project),
  } satisfies RegisteredProjectInfo;
}

export async function createWorkspace(args: {
  projectPath: string;
  name: string;
  mode: "branch" | "clean";
  fromBranch?: string;
  fromBranchKind?: "local" | "remote";
  initCommand?: string;
  useRootNodeModulesSymlink?: boolean;
}) {
  const trimmedName = args.name.trim();
  if (!trimmedName) {
    throw new Error("Workspace name is required.");
  }

  const ensured = await ensureProjectRegistryEntry({
    projectPath: args.projectPath,
  });
  const projectPath = ensured.projectPath;
  const project = ensured.project;
  const branchName = sanitizeBranchName({ value: trimmedName });
  if (!branchName) {
    throw new Error("Workspace branch name is invalid.");
  }

  const existingWorkspace =
    toWorkspaceList(project).find(
      (workspace) =>
        workspace.branch === branchName ||
        workspace.name === branchName ||
        workspace.path ===
          `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: branchName, unique: true })}`,
    ) ?? null;
  if (existingWorkspace) {
    return {
      workspaceId: existingWorkspace.id,
      workspaceName: existingWorkspace.name,
      workspacePath: existingWorkspace.path,
      branch: existingWorkspace.branch,
      projectPath,
      projectName: project.projectName,
      message: "Workspace already exists.",
      noticeLevel: "warning",
    } satisfies CreatedWorkspaceInfo;
  }

  const workspacePath = `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: branchName, unique: true })}`;
  const workspaceId = buildImportedWorktreeWorkspaceId({
    projectPath,
    worktreePath: workspacePath,
  });
  let baseBranch =
    args.fromBranch?.trim() ||
    project.defaultBranch ||
    ensured.defaultBranch ||
    "main";
  const initCommand = normalizeWorkspaceInitCommand({
    value:
      args.initCommand ??
      resolveProjectWorkspaceInitCommand({
        projectPath,
        recentProjects: [project],
      }),
  });
  const useRootNodeModulesSymlink =
    args.useRootNodeModulesSymlink === undefined
      ? resolveProjectWorkspaceRootNodeModulesSymlinkPreference({
          projectPath,
          recentProjects: [project],
        })
      : normalizeProjectWorkspaceRootNodeModulesSymlinkPreference({
          value: args.useRootNodeModulesSymlink,
        });
  const notices: Array<{ level: "success" | "warning"; message: string }> = [];

  const remoteTarget =
    args.mode === "branch"
      ? await resolveWorkspaceRemoteBaseBranchTarget({
          baseBranch,
          fromBranchKind: args.fromBranchKind,
          verifyRef: async (ref) =>
            (
              await runCommand({
                cwd: projectPath,
                command: `git show-ref --verify --quiet ${JSON.stringify(ref)}`,
              })
            ).ok,
        })
      : null;
  if (remoteTarget) {
    const fetchResult = await runCommand({
      cwd: projectPath,
      command: `git fetch ${remoteTarget.remoteName} --prune`,
    });
    if (!fetchResult.ok) {
      const localBranchProbe = await runCommand({
        cwd: projectPath,
        command: `git show-ref --verify --quiet ${JSON.stringify(`refs/heads/${remoteTarget.localBranch}`)}`,
      });
      baseBranch = localBranchProbe.ok ? remoteTarget.localBranch : baseBranch;
      notices.push({
        level: "warning",
        message: localBranchProbe.ok
          ? `Could not refresh \`${args.fromBranch}\`; created the workspace from local \`${remoteTarget.localBranch}\` instead. ${summarizeTerminalCommandDetail(
              {
                stderr: fetchResult.stderr,
                stdout: fetchResult.stdout,
                fallback: "git fetch failed.",
              },
            )}`
          : `Could not refresh \`${args.fromBranch}\`; created the workspace from the cached remote-tracking ref instead. ${summarizeTerminalCommandDetail(
              {
                stderr: fetchResult.stderr,
                stdout: fetchResult.stdout,
                fallback: "git fetch failed.",
              },
            )}`,
      });
    }
  }

  await runCommand({
    cwd: projectPath,
    command: "mkdir -p .stave/workspaces",
  });
  const addResult = await runCommand({
    cwd: projectPath,
    command:
      args.mode === "clean"
        ? `git worktree add -b ${JSON.stringify(branchName)} ${JSON.stringify(workspacePath)}`
        : `git worktree add -b ${JSON.stringify(branchName)} ${JSON.stringify(workspacePath)} ${JSON.stringify(baseBranch)}`,
  });
  if (!addResult.ok) {
    const fallbackResult = await runCommand({
      cwd: projectPath,
      command: `git worktree add ${JSON.stringify(workspacePath)} ${JSON.stringify(branchName)}`,
    });
    if (!fallbackResult.ok) {
      throw new Error(
        (
          fallbackResult.stderr ||
          addResult.stderr ||
          "Failed to create git worktree."
        ).trim(),
      );
    }
  }

  if (useRootNodeModulesSymlink) {
    const linkResult = await runCommand({
      cwd: workspacePath,
      command: buildWorkspaceRootNodeModulesSymlinkCommand({ projectPath }),
    });
    if (linkResult.ok) {
      notices.push({
        level: "success",
        message:
          "Linked `node_modules` from the repository root into the new workspace.",
      });
    } else {
      notices.push({
        level: "warning",
        message: `Linking the shared root \`node_modules\` failed. ${summarizeTerminalCommandDetail(
          {
            stderr: linkResult.stderr,
            stdout: linkResult.stdout,
            fallback: "Command failed.",
          },
        )}`,
      });
    }
  }

  if (initCommand) {
    const initResult = await runCommand({
      cwd: workspacePath,
      command: initCommand,
    });
    const summarizedCommand = summarizeWorkspaceInitCommand({
      command: initCommand,
    });
    if (initResult.ok) {
      notices.push({
        level: "success",
        message: `Ran the post-create command: ${summarizedCommand}`,
      });
    } else {
      notices.push({
        level: "warning",
        message: `The post-create command failed: ${summarizedCommand}. ${summarizeTerminalCommandDetail(
          {
            stderr: initResult.stderr,
            stdout: initResult.stdout,
            fallback: "Command failed.",
          },
        )}`,
      });
    }
  }

  const store = ensureHostServicePersistenceReady();
  const snapshot = createEmptyWorkspaceSnapshot();
  store.upsertWorkspace({
    id: workspaceId,
    name: branchName,
    snapshot: snapshot as never,
  });
  cacheWorkspaceSession(
    workspaceId,
    buildWorkspaceSessionState({ snapshot: snapshot as never }),
  );

  const now = new Date().toISOString();
  const nextProject: RecentProjectState = {
    ...project,
    lastOpenedAt: now,
    activeWorkspaceId: workspaceId,
    workspaces: [
      ...project.workspaces,
      { id: workspaceId, name: branchName, updatedAt: now },
    ],
    workspaceBranchById: {
      ...project.workspaceBranchById,
      [workspaceId]: branchName,
    },
    workspacePathById: {
      ...project.workspacePathById,
      [workspaceId]: workspacePath,
    },
    workspaceDefaultById: {
      ...project.workspaceDefaultById,
      [workspaceId]: false,
    },
  };
  const { projects } = await loadNormalizedProjects();
  await saveNormalizedProjects(
    upsertRecentProjectState({
      projects,
      project: nextProject,
    }),
  );

  const notice = buildWorkspaceCreationNotice({ notices });
  return {
    workspaceId,
    workspaceName: branchName,
    workspacePath,
    branch: branchName,
    projectPath,
    projectName: project.projectName,
    ...(notice ?? {}),
  } satisfies CreatedWorkspaceInfo;
}

export async function runTask(args: {
  workspaceId: string;
  prompt: string;
  taskId?: string;
  title?: string;
  provider?: ProviderId;
  runtimeOptions?: ProviderRuntimeOptions;
}) {
  const { projects } = await loadNormalizedProjects();
  const registration = findWorkspaceRegistration({
    projects,
    workspaceId: args.workspaceId,
  });
  if (!registration) {
    throw new Error(`Workspace not found: ${args.workspaceId}`);
  }

  const workspacePath = registration.workspacePath;
  const workspaceName = registration.workspace.name;
  let session = await loadWorkspaceSession(args.workspaceId);
  const provider = args.provider ?? "stave";
  const model =
    args.runtimeOptions?.model?.trim() ||
    getDefaultModelForProvider({
      providerId: provider,
    });

  let task = findWorkspaceTaskOrThrow({
    tasks: session.tasks,
    requestedTaskId: args.taskId,
  });

  if (!task) {
    const taskId = randomUUID();
    task = {
      id: taskId,
      title: args.title?.trim() || buildTaskTitleFromPrompt(args.prompt),
      provider,
      updatedAt: buildRecentTimestamp(),
      unread: false,
      archivedAt: null,
      controlMode: "managed",
      controlOwner: "external",
    } satisfies Task;
    session = cacheWorkspaceSession(args.workspaceId, {
      ...session,
      activeTaskId: task.id,
      tasks: [task, ...session.tasks],
      messagesByTask: {
        ...session.messagesByTask,
        [task.id]: session.messagesByTask[task.id] ?? [],
      },
      nativeSessionReadyByTask: {
        ...session.nativeSessionReadyByTask,
        [task.id]: false,
      },
    });
  } else if (
    task.controlMode !== "managed" ||
    task.controlOwner !== "external"
  ) {
    task = {
      ...task,
      controlMode: "managed",
      controlOwner: "external",
      updatedAt: buildRecentTimestamp(),
    } satisfies Task;
    session = cacheWorkspaceSession(args.workspaceId, {
      ...session,
      tasks: session.tasks.map((item) => (item.id === task!.id ? task! : item)),
    });
  }

  if (session.activeTurnIdsByTask[task.id]) {
    throw new Error(`Task already has an active turn: ${task.id}`);
  }

  const turnId = randomUUID();
  const existingHistory = session.messagesByTask[task.id] ?? [];
  const providerSession = session.providerSessionByTask[task.id];
  const conversation = buildCanonicalConversationRequest({
    turnId,
    taskId: task.id,
    workspaceId: args.workspaceId,
    providerId: provider,
    model,
    history: existingHistory,
    userInput: args.prompt,
    mode: "chat",
    nativeSessionId: providerSession?.[provider] ?? null,
    retrievedContextParts: [
      buildCurrentTaskAwarenessRetrievedContext({
        workspaceId: args.workspaceId,
        workspaceName,
        workspacePath,
        workspaceBranch: registration.branch,
        projectName: registration.project.projectName,
        projectPath: registration.project.projectPath,
        taskId: task.id,
        tasks: session.tasks,
        workspaceInformation: session.workspaceInformation,
      }),
    ],
  });
  const pendingState = buildPendingProviderTurnState({
    tasks: session.tasks,
    messagesByTask: session.messagesByTask,
    activeTurnIdsByTask: session.activeTurnIdsByTask,
    taskWorkspaceIdById: {},
    workspaceSnapshotVersion: 0,
    taskId: task.id,
    taskWorkspaceId: args.workspaceId,
    turnId,
    provider,
    activeModel: model,
    content: args.prompt,
  });
  session = cacheWorkspaceSession(args.workspaceId, {
    ...session,
    activeTaskId: task.id,
    tasks: pendingState.tasks,
    messagesByTask: pendingState.messagesByTask,
    activeTurnIdsByTask: pendingState.activeTurnIdsByTask,
  });
  await queueWorkspaceSessionPersist({
    workspaceId: args.workspaceId,
    workspaceName,
    session,
  });

  const store = ensureHostServicePersistenceReady();
  let sequence = 0;
  store.beginTurn({
    id: turnId,
    workspaceId: args.workspaceId,
    taskId: task.id,
    providerId: provider,
  });

  const started = providerRuntime.startTurnStream(
    {
      turnId,
      providerId: provider,
      prompt: args.prompt,
      conversation,
      taskId: task.id,
      workspaceId: args.workspaceId,
      cwd: workspacePath,
      runtimeOptions: {
        ...args.runtimeOptions,
        model,
      },
    },
    {
      onEvent: (event) => {
        sequence += 1;
        void workspaceProviderEventQueue
          .enqueue(args.workspaceId, () =>
            handleProviderEvent({
              workspaceId: args.workspaceId,
              workspaceName,
              taskId: task.id,
              provider,
              model,
              turnId,
              event,
            }),
          )
          .catch((error) => {
            console.error("[stave-mcp] failed to apply provider event", error, {
              workspaceId: args.workspaceId,
              taskId: task.id,
              turnId,
              eventType: event.type,
            });
          });
      },
    },
  );

  if (!started.ok) {
    throw new Error("Failed to start provider turn.");
  }

  return {
    workspaceId: args.workspaceId,
    taskId: task.id,
    taskTitle: task.title,
    turnId,
    provider,
    model,
  } satisfies TaskRunResult;
}

export async function getTaskStatus(args: {
  workspaceId: string;
  taskId: string;
}) {
  const session = await loadWorkspaceSession(args.workspaceId);
  const task = session.tasks.find((item) => item.id === args.taskId);
  if (!task) {
    throw new Error(`Task not found: ${args.taskId}`);
  }

  const store = ensureHostServicePersistenceReady();
  const latestTurn =
    store.listTurns({
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      limit: 1,
    })[0] ?? null;
  const messages = session.messagesByTask[args.taskId] ?? [];
  const latestAssistantText =
    [...messages]
      .reverse()
      .find(
        (message) =>
          message.role === "assistant" && message.content.trim().length > 0,
      )?.content ?? null;

  return {
    workspaceId: args.workspaceId,
    taskId: task.id,
    title: task.title,
    provider: task.provider,
    updatedAt: task.updatedAt,
    activeTurnId: session.activeTurnIdsByTask[task.id] ?? null,
    latestTurnId: latestTurn?.id ?? null,
    latestTurnCompletedAt: latestTurn?.completedAt ?? null,
    messageCount: messages.length,
    latestAssistantText,
    pendingApprovals: findPendingApprovals(messages),
    pendingUserInputs: findPendingUserInputs(messages),
  } satisfies TaskStatusResult;
}

function findApprovalMessage(args: {
  messages: ChatMessage[];
  requestId: string;
}) {
  for (const message of args.messages) {
    const approvalPart = findLatestPendingApprovalPart({ message });
    if (approvalPart?.requestId === args.requestId) {
      return {
        messageId: message.id,
        part: approvalPart,
      };
    }
  }
  return null;
}

function findUserInputMessage(args: {
  messages: ChatMessage[];
  requestId: string;
}) {
  for (const message of args.messages) {
    const userInputPart = findLatestPendingUserInputPart({ message });
    if (userInputPart?.requestId === args.requestId) {
      return {
        messageId: message.id,
        part: userInputPart,
      };
    }
  }
  return null;
}

export async function respondApproval(args: {
  workspaceId: string;
  taskId: string;
  requestId: string;
  approved: boolean;
}) {
  const { projects } = await loadNormalizedProjects();
  const registration = findWorkspaceRegistration({
    projects,
    workspaceId: args.workspaceId,
  });
  if (!registration) {
    throw new Error(`Workspace not found: ${args.workspaceId}`);
  }

  const session = await loadWorkspaceSession(args.workspaceId);
  const activeTurnId = session.activeTurnIdsByTask[args.taskId];
  if (!activeTurnId) {
    throw new Error(`No active turn found for task ${args.taskId}.`);
  }

  const messages = session.messagesByTask[args.taskId] ?? [];
  const approval = findApprovalMessage({
    messages,
    requestId: args.requestId,
  });
  if (!approval) {
    throw new Error(`Pending approval not found: ${args.requestId}`);
  }

  const result = providerRuntime.respondApproval({
    turnId: activeTurnId,
    requestId: args.requestId,
    approved: args.approved,
  });
  if (!result.ok) {
    throw new Error(result.message);
  }

  const nextMessagesState = applyApprovalState({
    messagesByTask: session.messagesByTask,
    workspaceSnapshotVersion: 0,
    taskId: args.taskId,
    messageId: approval.messageId,
    requestId: args.requestId,
    approved: args.approved,
  });
  const nextSession = cacheWorkspaceSession(args.workspaceId, {
    ...session,
    messagesByTask: nextMessagesState.messagesByTask,
  });
  await queueWorkspaceSessionPersist({
    workspaceId: args.workspaceId,
    workspaceName: registration.workspace.name,
    session: nextSession,
  });
  return {
    ok: true,
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    requestId: args.requestId,
    approved: args.approved,
  };
}

export async function respondUserInput(args: {
  workspaceId: string;
  taskId: string;
  requestId: string;
  answers?: Record<string, string>;
  denied?: boolean;
}) {
  const { projects } = await loadNormalizedProjects();
  const registration = findWorkspaceRegistration({
    projects,
    workspaceId: args.workspaceId,
  });
  if (!registration) {
    throw new Error(`Workspace not found: ${args.workspaceId}`);
  }

  const session = await loadWorkspaceSession(args.workspaceId);
  const activeTurnId = session.activeTurnIdsByTask[args.taskId];
  if (!activeTurnId) {
    throw new Error(`No active turn found for task ${args.taskId}.`);
  }

  const messages = session.messagesByTask[args.taskId] ?? [];
  const userInput = findUserInputMessage({
    messages,
    requestId: args.requestId,
  });
  if (!userInput) {
    throw new Error(`Pending user input not found: ${args.requestId}`);
  }

  const result = providerRuntime.respondUserInput({
    turnId: activeTurnId,
    requestId: args.requestId,
    answers: args.answers,
    denied: args.denied,
  });
  if (!result.ok) {
    throw new Error(result.message);
  }

  const nextMessagesState = applyUserInputState({
    messagesByTask: session.messagesByTask,
    workspaceSnapshotVersion: 0,
    taskId: args.taskId,
    messageId: userInput.messageId,
    requestId: args.requestId,
    answers: args.answers,
    denied: args.denied,
  });
  const nextSession = cacheWorkspaceSession(args.workspaceId, {
    ...session,
    messagesByTask: nextMessagesState.messagesByTask,
  });
  await queueWorkspaceSessionPersist({
    workspaceId: args.workspaceId,
    workspaceName: registration.workspace.name,
    session: nextSession,
  });
  return {
    ok: true,
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    requestId: args.requestId,
    denied: args.denied === true,
  };
}

export async function listKnownProjects() {
  const { projects } = await loadNormalizedProjects();
  return projects.map((project) => ({
    projectPath: project.projectPath,
    projectName: project.projectName,
    defaultBranch: project.defaultBranch,
    activeWorkspaceId: project.activeWorkspaceId,
    defaultWorkspaceId: resolveCurrentProjectDefaultWorkspaceId({
      projectPath: project.projectPath,
      workspaces: project.workspaces,
      workspaceDefaultById: project.workspaceDefaultById,
    }),
    workspaces: toWorkspaceList(project),
  }));
}
