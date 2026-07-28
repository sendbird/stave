import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { buildCanonicalConversationRequest } from "../../src/lib/providers/canonical-request";
import { getDefaultModelForProvider } from "../../src/lib/providers/model-catalog";
import { getProviderSessionCursor } from "../../src/lib/providers/provider-sessions";
import type {
  CanonicalRetrievedContextPart,
  NormalizedProviderEvent,
  ProviderId,
  ProviderRuntimeOptions,
} from "../../src/lib/providers/provider.types";
import { buildCurrentTaskAwarenessRetrievedContext } from "../../src/lib/task-context/current-task-awareness";
import type { AppNotificationCreateInput } from "../../src/lib/notifications/notification.types";
import type { LocalMcpTaskTurnUpdate } from "../../src/lib/local-mcp/task-turn-update";
import { workspaceHasActiveTurns } from "../../src/lib/notifications/notification.types";
import {
  applyDetectedWorkspaceResources,
  createWorkspaceInfoCustomField,
  applyWorkspaceTodoStatus,
  createWorkspaceTodoItem,
  type WorkspaceTodoStatus,
  detectWorkspaceResourcesInText,
  extractAmplifyLinkReference,
  extractConfluencePageReference,
  extractFigmaResourceReference,
  extractJiraIssueReference,
  extractSlackThreadReference,
  extractStorybookResourceReference,
  resolveStorybookResourceAccess,
  shouldAutoFillWorkspaceInformation,
  upsertWorkspaceResourceInState,
  type WorkspaceInfoCustomField,
  type WorkspaceInformationState,
  type WorkspaceInfoFieldType,
  type WorkspaceResourceUpsertResult,
} from "../../src/lib/workspace-information";
import {
  formatWorkspaceInformationReferencesContext,
  type WorkspaceInformationReference,
} from "../../src/lib/workspace-information-references";
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
  mergeArchivedWorkspacePaths,
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
  interruptActiveTaskTurns,
  type WorkspaceSessionState,
} from "../../src/store/workspace-session-state";
import { applyProviderEventsToWorkspaceSession } from "../../src/store/workspace-turn-replay";
import {
  findLatestPendingApprovalPart,
  findLatestPendingUserInputPart,
  findPendingApprovalMessageByRequestId,
  findPendingUserInputMessageByRequestId,
} from "../../src/store/provider-message.utils";
import type {
  ChatMessage,
  Task,
  TaskControlMode,
  TaskControlOwner,
} from "../../src/types/chat";
import {
  findWorkspaceTaskOrThrow,
  getTaskControlMode,
  getTaskControlOwner,
  isExternallyManagedTask,
  isTaskManaged,
  MANAGED_TASK_STOP_NOTICE,
  reconcileTasksWithPersistedArchival,
} from "../../src/lib/tasks";
import { ensureHostServicePersistenceReady } from "./persistence";
import { createKeyedAsyncQueue } from "./keyed-async-queue";
import {
  createLocalMcpTurnJournal,
  resolveTargetedTurnError,
} from "./local-mcp-turn-journal";
import { providerRuntime } from "../providers/runtime";
import type { BridgeEvent } from "../providers/types";
import { runCommand, runCommandArgs } from "../main/utils/command";

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
  latestTurnError: string | null;
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
const terminalTurnErrorById = new Map<string, string>();
const WORKSPACE_SESSION_CACHE_LIMIT = 32;
const TERMINAL_TURN_ERROR_LIMIT = 500;
const localMcpTurnJournal = createLocalMcpTurnJournal({
  persistEvents: ({ turnId, events }) => {
    ensureHostServicePersistenceReady().saveStreamEvents({
      turnId,
      events,
    });
  },
  onPersistError: (error, context) => {
    console.warn(
      "[stave-mcp] failed to persist provider events",
      error,
      context,
    );
  },
});
let localMcpEventListener:
  | ((
      event:
        | {
            type: "workspace-information-updated";
            payload: WorkspaceInformationMutationResult;
          }
        | {
            type: "task-turn-updated";
            payload: LocalMcpTaskTurnUpdate;
          },
    ) => void)
  | null = null;

type WorkspaceInformationResourceKind =
  | "jira"
  | "pull_request"
  | "confluence"
  | "figma"
  | "storybook"
  | "slack"
  | "amplify";

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
  // Task archive/restore lifecycle is owned by the renderer and durably held in
  // the `tasks` table. The host's cached session copy can be stale, so re-read
  // the authoritative archived state right before writing — otherwise a stale
  // host persist would revive a task the renderer just archived (it would come
  // back to life on the next restart).
  const reconciledTasks = reconcileTasksWithPersistedArchival({
    tasks: args.session.tasks,
    persistedTasks: store.listWorkspaceTasks({ workspaceId: args.workspaceId }),
  });
  store.upsertWorkspace({
    id: args.workspaceId,
    name: args.workspaceName,
    snapshot: createWorkspaceSnapshot({
      activeTaskId: args.session.activeTaskId,
      tasks: reconciledTasks,
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

function refreshWorkspaceInformationFromPersistence(args: {
  workspaceId: string;
  session: WorkspaceSessionState;
}) {
  const persistedWorkspaceInformation =
    ensureHostServicePersistenceReady().loadWorkspaceSnapshot({
      workspaceId: args.workspaceId,
    })?.workspaceInformation;
  if (!persistedWorkspaceInformation) {
    return args.session;
  }
  return cacheWorkspaceSession(args.workspaceId, {
    ...args.session,
    workspaceInformation: persistedWorkspaceInformation,
  });
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
  localMcpTurnJournal.flushAll();
  const pendingPersists = [...workspacePersistChainById.values()];
  workspacePersistChainById.clear();
  await Promise.allSettled(pendingPersists);
  workspaceSessionCacheById.clear();
  terminalTurnErrorById.clear();
}

function emitWorkspaceInformationUpdate(
  payload: WorkspaceInformationMutationResult,
) {
  localMcpEventListener?.({
    type: "workspace-information-updated",
    payload,
  });
}

function emitTaskTurnUpdate(payload: LocalMcpTaskTurnUpdate) {
  localMcpEventListener?.({
    type: "task-turn-updated",
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
    case "storybook":
    case "slack":
    case "amplify":
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
  const session = refreshWorkspaceInformationFromPersistence({
    workspaceId: args.workspaceId,
    session: await loadWorkspaceSession(args.workspaceId),
  });
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
  const session = refreshWorkspaceInformationFromPersistence({
    workspaceId: args.workspaceId,
    session: await loadWorkspaceSession(args.workspaceId),
  });
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
  status?: WorkspaceTodoStatus;
}) {
  if (
    args.text === undefined &&
    args.completed === undefined &&
    args.status === undefined
  ) {
    throw new Error(
      "Workspace todo update requires text, status, or completed.",
    );
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
        const withText =
          args.text !== undefined ? { ...todo, text: args.text.trim() } : todo;
        // `status` is the source of truth; a legacy `completed` flag maps to
        // true -> "completed", false -> "pending".
        const nextStatus: WorkspaceTodoStatus | undefined =
          args.status ??
          (args.completed !== undefined
            ? args.completed
              ? "completed"
              : "pending"
            : undefined);
        return nextStatus !== undefined
          ? applyWorkspaceTodoStatus(withText, nextStatus)
          : withText;
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
  storybookAccessKind?: string;
  storybookExternalRepo?: string;
  storybookReadableVia?: string;
  storybookSourceHint?: string;
}) {
  const kind = normalizeWorkspaceResourceKind(args.kind);
  const url = args.url.trim();
  if (!url) {
    throw new Error("Workspace resource URL is required.");
  }
  // Upsert instead of blind append — duplicate registrations of the same
  // canonical entity (e.g. one Jira issue key across URL variants) merge
  // into the existing Information panel entry.
  let upserted: WorkspaceResourceUpsertResult | null = null;
  const result = await updateWorkspaceInformationState({
    workspaceId: args.workspaceId,
    updater: (current) => {
      upserted = upsertWorkspaceResourceInState({
        current,
        input: {
          kind,
          url,
          title: args.title,
          issueKey: args.issueKey,
          status: args.status,
          note: args.note,
          nodeId: args.nodeId,
          channelName: args.channelName,
          spaceKey: args.spaceKey,
          storybookAccessKind: args.storybookAccessKind,
          storybookExternalRepo: args.storybookExternalRepo,
          storybookReadableVia: args.storybookReadableVia,
          storybookSourceHint: args.storybookSourceHint,
        },
      });
      return upserted.state;
    },
  });
  if (!upserted) {
    throw new Error("Workspace resource upsert did not run.");
  }
  const resolved = upserted as WorkspaceResourceUpsertResult;
  return {
    ...result,
    resource: resolved.resource,
    deduplicated: resolved.deduplicated,
  };
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
        case "storybook": {
          const storybookResources = (current.storybookResources ?? []).filter(
            (item) => item.id !== args.itemId,
          );
          if (
            storybookResources.length ===
            (current.storybookResources ?? []).length
          ) {
            throw new Error(`Workspace resource not found: ${args.itemId}`);
          }
          return {
            ...current,
            storybookResources,
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
        case "amplify": {
          const amplifyLinks = (current.amplifyLinks ?? []).filter(
            (item) => item.id !== args.itemId,
          );
          if (amplifyLinks.length === (current.amplifyLinks ?? []).length) {
            throw new Error(`Workspace resource not found: ${args.itemId}`);
          }
          return {
            ...current,
            amplifyLinks,
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
  const result = await addWorkspaceResource({
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
    workspaceId: result.workspaceId,
    added: result.resource,
    deduplicated: result.deduplicated,
    workspaceInformation: result.workspaceInformation,
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
  const result = await addWorkspaceResource({
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
    workspaceId: result.workspaceId,
    added: result.resource,
    deduplicated: result.deduplicated,
    workspaceInformation: result.workspaceInformation,
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
  const result = await addWorkspaceResource({
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
    workspaceId: result.workspaceId,
    added: result.resource,
    deduplicated: result.deduplicated,
    workspaceInformation: result.workspaceInformation,
  };
}

export async function addWorkspaceStorybookResource(args: {
  workspaceId: string;
  url: string;
  title?: string;
  note?: string;
  accessKind?: string;
  externalRepo?: string;
  readableVia?: string;
  sourceHint?: string;
}) {
  const parsed = extractStorybookResourceReference(args.url);
  const result = await addWorkspaceResource({
    workspaceId: args.workspaceId,
    kind: "storybook",
    url: normalizeWorkspaceInfoString(args.url),
    title:
      normalizeWorkspaceInfoString(args.title) ||
      parsed?.title ||
      parsed?.storyPath ||
      "Storybook resource",
    note: normalizeWorkspaceInfoString(args.note),
    storybookAccessKind: args.accessKind,
    storybookExternalRepo: args.externalRepo,
    storybookReadableVia: args.readableVia,
    storybookSourceHint: args.sourceHint,
  });
  return {
    workspaceId: result.workspaceId,
    added: result.resource,
    deduplicated: result.deduplicated,
    workspaceInformation: result.workspaceInformation,
  };
}

export async function updateWorkspaceStorybookResourceAccess(args: {
  workspaceId: string;
  resourceId?: string;
  url?: string;
  accessKind?: string;
  externalRepo?: string;
  readableVia?: string;
  sourceHint?: string;
}) {
  return updateWorkspaceInformationState({
    workspaceId: args.workspaceId,
    updater: (current) => {
      const resourceId = normalizeWorkspaceInfoString(args.resourceId);
      const url = normalizeWorkspaceInfoString(args.url);
      let found = false;
      const storybookResources = (current.storybookResources ?? []).map(
        (resource) => {
          const matchesResourceId = resourceId && resource.id === resourceId;
          const matchesUrl = url && resource.url === url;
          if (!matchesResourceId && !matchesUrl) {
            return resource;
          }

          found = true;
          return {
            ...resource,
            access: resolveStorybookResourceAccess({
              url: resource.url,
              accessKind: args.accessKind,
              externalRepo: args.externalRepo,
              readableVia: args.readableVia,
              sourceHint: args.sourceHint,
            }),
          };
        },
      );

      if (!found) {
        throw new Error("Workspace Storybook resource not found.");
      }

      return {
        ...current,
        storybookResources,
      };
    },
  });
}

export async function addWorkspaceSlackThread(args: {
  workspaceId: string;
  url: string;
  channelName?: string;
  note?: string;
}) {
  const parsed = extractSlackThreadReference(args.url);
  const result = await addWorkspaceResource({
    workspaceId: args.workspaceId,
    kind: "slack",
    url: normalizeWorkspaceInfoString(args.url),
    channelName:
      normalizeWorkspaceInfoString(args.channelName) || parsed?.channelId || "",
    note: normalizeWorkspaceInfoString(args.note),
  });
  return {
    workspaceId: result.workspaceId,
    added: result.resource,
    deduplicated: result.deduplicated,
    workspaceInformation: result.workspaceInformation,
  };
}

export async function addWorkspaceAmplifyLink(args: {
  workspaceId: string;
  url: string;
  label?: string;
  note?: string;
}) {
  const parsed = extractAmplifyLinkReference(args.url);
  const result = await addWorkspaceResource({
    workspaceId: args.workspaceId,
    kind: "amplify",
    url: normalizeWorkspaceInfoString(args.url),
    title: normalizeWorkspaceInfoString(args.label) || parsed?.branch || "",
    note: normalizeWorkspaceInfoString(args.note),
  });
  return {
    workspaceId: result.workspaceId,
    added: result.resource,
    deduplicated: result.deduplicated,
    workspaceInformation: result.workspaceInformation,
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
  const task =
    args.session.tasks.find((candidate) => candidate.id === args.taskId) ??
    null;
  if (!task || isExternallyManagedTask(task)) {
    return;
  }
  const taskTitle = task.title || "Task";
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
      controlMode: getTaskControlMode(task),
      controlOwner: getTaskControlOwner(task),
    },
    dedupeKey: `task.approval_requested:${args.turnId}:${args.event.requestId}`,
  });
}

async function persistUserInputNotification(args: {
  workspaceId: string;
  taskId: string;
  turnId: string;
  provider: ProviderId;
  event: Extract<NormalizedProviderEvent, { type: "user_input" }>;
  session: WorkspaceSessionState;
}) {
  const task =
    args.session.tasks.find((candidate) => candidate.id === args.taskId) ??
    null;
  if (!task || isExternallyManagedTask(task)) {
    return;
  }
  const location = findPendingUserInputMessageByRequestId({
    messages: args.session.messagesByTask[args.taskId] ?? [],
    requestId: args.event.requestId,
  });
  if (!location) {
    return;
  }
  const { projects } = await loadNormalizedProjects();
  const registration = findWorkspaceRegistration({
    projects,
    workspaceId: args.workspaceId,
  });
  const firstQuestion = args.event.questions[0];
  const question =
    firstQuestion?.header.trim() ||
    firstQuestion?.question.trim() ||
    (args.event.questions.length > 1
      ? `${args.event.questions.length} questions`
      : "User input requested");

  await persistNotification({
    id: randomUUID(),
    kind: "task.user_input_requested",
    title: task.title || "Task",
    body: `${args.event.toolName}: ${question}`,
    projectPath: registration?.project.projectPath ?? null,
    projectName: registration?.project.projectName ?? null,
    workspaceId: args.workspaceId,
    workspaceName: registration?.workspace.name ?? null,
    taskId: args.taskId,
    taskTitle: task.title || "Task",
    turnId: args.turnId,
    providerId: args.provider,
    action: null,
    payload: {
      toolName: args.event.toolName,
      question,
      questionCount: args.event.questions.length,
      requestId: args.event.requestId,
      messageId: location.messageId,
      controlMode: getTaskControlMode(task),
      controlOwner: getTaskControlOwner(task),
    },
    dedupeKey: `task.user_input_requested:${args.turnId}:${args.event.requestId}`,
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
  sequence: number;
  event: BridgeEvent;
}) {
  const store = ensureHostServicePersistenceReady();
  const session = await loadWorkspaceSession(args.workspaceId);
  if (session.activeTurnIdsByTask[args.taskId] !== args.turnId) {
    if (args.event.type === "done") {
      store.completeTurn({ id: args.turnId });
    }
    return;
  }
  localMcpTurnJournal.append({
    turnId: args.turnId,
    sequence: args.sequence,
    event: args.event,
  });
  if (args.event.type === "error" && !args.event.recoverable) {
    terminalTurnErrorById.delete(args.turnId);
    terminalTurnErrorById.set(args.turnId, args.event.message);
    while (terminalTurnErrorById.size > TERMINAL_TURN_ERROR_LIMIT) {
      const oldestTurnId = terminalTurnErrorById.keys().next().value;
      if (!oldestTurnId) {
        break;
      }
      terminalTurnErrorById.delete(oldestTurnId);
    }
  }
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
  if (args.event.type === "user_input") {
    await persistUserInputNotification({
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
              await runCommandArgs({
                cwd: projectPath,
                command: "git",
                commandArgs: ["show-ref", "--verify", "--quiet", ref],
              })
            ).ok,
        })
      : null;
  if (remoteTarget) {
    const fetchResult = await runCommandArgs({
      cwd: projectPath,
      command: "git",
      commandArgs: ["fetch", remoteTarget.remoteName, "--prune"],
    });
    if (!fetchResult.ok) {
      const localBranchProbe = await runCommandArgs({
        cwd: projectPath,
        command: "git",
        commandArgs: [
          "show-ref",
          "--verify",
          "--quiet",
          `refs/heads/${remoteTarget.localBranch}`,
        ],
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
  const addResult = await runCommandArgs({
    cwd: projectPath,
    command: "git",
    commandArgs:
      args.mode === "clean"
        ? ["worktree", "add", "-b", branchName, workspacePath]
        : ["worktree", "add", "-b", branchName, workspacePath, baseBranch],
  });
  if (!addResult.ok) {
    const fallbackResult = await runCommandArgs({
      cwd: projectPath,
      command: "git",
      commandArgs: ["worktree", "add", workspacePath, branchName],
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
    archivedWorkspacePaths: mergeArchivedWorkspacePaths({
      current: project.archivedWorkspacePaths,
      remove: [workspacePath],
    }),
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
  informationReferences?: WorkspaceInformationReference[];
  controlMode?: TaskControlMode;
  controlOwner?: TaskControlOwner;
  retrievedContextParts?: CanonicalRetrievedContextPart[];
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
  let session = refreshWorkspaceInformationFromPersistence({
    workspaceId: args.workspaceId,
    session: await loadWorkspaceSession(args.workspaceId),
  });

  // Auto-fill the Information panel from the prompt: register any Jira/PR/
  // Confluence/Figma/Slack/Storybook/Amplify URLs before the turn context is
  // built so this turn's task-awareness context already includes them.
  if (
    shouldAutoFillWorkspaceInformation({
      workspaceId: args.workspaceId,
      workspaceDefaultById: registration.project.workspaceDefaultById,
    })
  ) {
    const detectedPromptResources = detectWorkspaceResourcesInText(args.prompt);
    if (detectedPromptResources.length > 0) {
      const autofillPreview = applyDetectedWorkspaceResources({
        current: session.workspaceInformation,
        detected: detectedPromptResources,
      });
      if (autofillPreview.state !== session.workspaceInformation) {
        await updateWorkspaceInformationState({
          workspaceId: args.workspaceId,
          updater: (current) =>
            applyDetectedWorkspaceResources({
              current,
              detected: detectedPromptResources,
            }).state,
        });
        session = await loadWorkspaceSession(args.workspaceId);
      }
    }
  }

  const provider = args.provider ?? "claude-code";
  const model =
    args.runtimeOptions?.model?.trim() ||
    getDefaultModelForProvider({
      providerId: provider,
    });

  let task = findWorkspaceTaskOrThrow({
    tasks: session.tasks,
    requestedTaskId: args.taskId,
  });

  const requestedControlMode = args.controlMode ?? "managed";
  const requestedControlOwner = args.controlOwner ?? "external";
  const requestedSourceContexts = args.retrievedContextParts ?? [];

  if (!task) {
    const taskId = randomUUID();
    task = {
      id: taskId,
      title: args.title?.trim() || buildTaskTitleFromPrompt(args.prompt),
      provider,
      updatedAt: buildRecentTimestamp(),
      unread: false,
      archivedAt: null,
      controlMode: requestedControlMode,
      controlOwner: requestedControlOwner,
      ...(requestedSourceContexts.length > 0
        ? { sourceContexts: requestedSourceContexts }
        : {}),
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
  } else {
    const sourceContextsById = new Map(
      (task.sourceContexts ?? []).map((part) => [part.sourceId, part]),
    );
    for (const part of requestedSourceContexts) {
      sourceContextsById.set(part.sourceId, part);
    }
    const sourceContexts = [...sourceContextsById.values()];
    const sourceContextsChanged =
      JSON.stringify(sourceContexts) !==
      JSON.stringify(task.sourceContexts ?? []);
    if (
      task.controlMode === requestedControlMode &&
      task.controlOwner === requestedControlOwner &&
      !sourceContextsChanged
    ) {
      // Keep the current task object when no durable metadata changed.
    } else {
      task = {
        ...task,
        controlMode: requestedControlMode,
        controlOwner: requestedControlOwner,
        ...(sourceContexts.length > 0 ? { sourceContexts } : {}),
        updatedAt: buildRecentTimestamp(),
      } satisfies Task;
      session = cacheWorkspaceSession(args.workspaceId, {
        ...session,
        tasks: session.tasks.map((item) =>
          item.id === task!.id ? task! : item,
        ),
      });
    }
  }

  if (session.activeTurnIdsByTask[task.id]) {
    throw new Error(`Task already has an active turn: ${task.id}`);
  }

  const turnId = randomUUID();
  const existingHistory = session.messagesByTask[task.id] ?? [];
  const providerSession = session.providerSessionByTask[task.id];
  const providerSessionCursor = getProviderSessionCursor({
    sessions: providerSession,
    providerId: provider,
  });
  const informationReferencesContext =
    args.informationReferences && args.informationReferences.length > 0
      ? formatWorkspaceInformationReferencesContext({
          info: session.workspaceInformation,
          references: args.informationReferences,
        })
      : "";
  const informationReferencesPart: CanonicalRetrievedContextPart | null =
    informationReferencesContext
      ? {
          type: "retrieved_context",
          sourceId: "stave:routine-information-references",
          title: "Routine Information References",
          content: [
            "The routine explicitly attached these Information panel entries.",
            "Treat section references as the full current section and item references as the specific current item.",
            "",
            informationReferencesContext,
          ].join("\n"),
        }
      : null;
  const conversation = buildCanonicalConversationRequest({
    turnId,
    taskId: task.id,
    workspaceId: args.workspaceId,
    providerId: provider,
    model,
    history: existingHistory,
    userInput: args.prompt,
    mode: "chat",
    nativeSessionId: providerSessionCursor?.nativeSessionId ?? null,
    syncedThroughMessageId:
      providerSessionCursor?.syncedThroughMessageId ?? null,
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
      ...(informationReferencesPart ? [informationReferencesPart] : []),
      ...(args.retrievedContextParts ?? []),
    ],
  });
  const pendingState = buildPendingProviderTurnState({
    tasks: session.tasks,
    messagesByTask: session.messagesByTask,
    messageCountByTask: session.messageCountByTask,
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
        const eventSequence = sequence;
        void workspaceProviderEventQueue
          .enqueue(args.workspaceId, async () => {
            await handleProviderEvent({
              workspaceId: args.workspaceId,
              workspaceName,
              taskId: task.id,
              provider,
              model,
              turnId,
              sequence: eventSequence,
              event,
            });
            emitTaskTurnUpdate({
              workspaceId: args.workspaceId,
              taskId: task.id,
              turnId,
              providerId: provider,
              model,
              sequence: eventSequence,
              eventType: event.type,
              done: event.type === "done",
            });
          })
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

  emitTaskTurnUpdate({
    workspaceId: args.workspaceId,
    taskId: task.id,
    turnId,
    providerId: provider,
    model,
    sequence: 0,
    eventType: "started",
    done: false,
  });

  return {
    workspaceId: args.workspaceId,
    taskId: task.id,
    taskTitle: task.title,
    turnId,
    provider,
    model,
  } satisfies TaskRunResult;
}

/**
 * Trusted Crane dispatch starts as an ordinary Stave task. The connector keeps
 * tracking the returned first turn, while the user retains task-level control
 * for approvals, questions, steering, and follow-up turns from the beginning.
 */
export async function runLocallyApprovedCraneKickoff(
  args: Omit<Parameters<typeof runTask>[0], "controlMode" | "controlOwner">,
) {
  return runTask({
    ...args,
    controlMode: "interactive",
    controlOwner: "stave",
  });
}

export async function getTaskStatus(args: {
  workspaceId: string;
  taskId: string;
  turnId?: string;
}) {
  const session = await loadWorkspaceSession(args.workspaceId);
  const task = session.tasks.find((item) => item.id === args.taskId);
  if (!task) {
    throw new Error(`Task not found: ${args.taskId}`);
  }

  const store = ensureHostServicePersistenceReady();
  const recentTurns = store.listTurns({
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    limit: 1,
    turnId: args.turnId,
  });
  const latestTurn = recentTurns[0] ?? null;
  const targetedTurnError =
    args.turnId && latestTurn
      ? resolveTargetedTurnError({
          completedAt: latestTurn.completedAt,
          events: store.getStreamEvents({ turnId: latestTurn.id }),
        })
      : null;
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
    latestTurnError: latestTurn
      ? (terminalTurnErrorById.get(latestTurn.id) ?? targetedTurnError ?? null)
      : null,
    messageCount: messages.length,
    latestAssistantText,
    pendingApprovals: findPendingApprovals(messages),
    pendingUserInputs: findPendingUserInputs(messages),
  } satisfies TaskStatusResult;
}

async function releaseManagedTaskControl(args: {
  workspaceId: string;
  taskId: string;
  requiredOwner?: TaskControlOwner;
  sourceContexts?: CanonicalRetrievedContextPart[];
}) {
  const { projects } = await loadNormalizedProjects();
  const registration = findWorkspaceRegistration({
    projects,
    workspaceId: args.workspaceId,
  });
  if (!registration) {
    throw new Error(`Workspace not found: ${args.workspaceId}`);
  }
  let session = await loadWorkspaceSession(args.workspaceId);
  const task =
    session.tasks.find((candidate) => candidate.id === args.taskId) ?? null;
  if (!task) {
    throw new Error(`Task not found: ${args.taskId}`);
  }
  if (session.activeTurnIdsByTask[task.id]) {
    throw new Error(`Task still has an active turn: ${task.id}`);
  }
  const sourceContextsById = new Map(
    (task.sourceContexts ?? []).map((part) => [part.sourceId, part]),
  );
  for (const part of args.sourceContexts ?? []) {
    sourceContextsById.set(part.sourceId, part);
  }
  const sourceContexts = [...sourceContextsById.values()];
  const sourceContextsChanged =
    JSON.stringify(sourceContexts) !==
    JSON.stringify(task.sourceContexts ?? []);
  const canRelease =
    task.controlMode === "managed" &&
    (!args.requiredOwner || task.controlOwner === args.requiredOwner);
  if (!canRelease && !sourceContextsChanged) {
    return {
      workspaceId: args.workspaceId,
      taskId: task.id,
      released: false,
    };
  }
  const releasedTask: Task = {
    ...task,
    ...(canRelease
      ? {
          controlMode: "interactive" as const,
          controlOwner: "stave" as const,
        }
      : {}),
    ...(sourceContexts.length > 0 ? { sourceContexts } : {}),
    updatedAt: buildRecentTimestamp(),
  };
  session = cacheWorkspaceSession(args.workspaceId, {
    ...session,
    tasks: session.tasks.map((candidate) =>
      candidate.id === task.id ? releasedTask : candidate,
    ),
  });
  await queueWorkspaceSessionPersist({
    workspaceId: args.workspaceId,
    workspaceName: registration.workspace.name,
    session,
  });
  return {
    workspaceId: args.workspaceId,
    taskId: task.id,
    released: canRelease,
  };
}

export function releaseLocallyManagedTaskControl(args: {
  workspaceId: string;
  taskId: string;
  sourceContexts?: CanonicalRetrievedContextPart[];
}) {
  return releaseManagedTaskControl({
    ...args,
    requiredOwner: "stave",
  });
}

export async function stopManagedTaskTurn(args: {
  workspaceId: string;
  taskId: string;
}) {
  const { projects } = await loadNormalizedProjects();
  const registration = findWorkspaceRegistration({
    projects,
    workspaceId: args.workspaceId,
  });
  if (!registration) {
    throw new Error(`Workspace not found: ${args.workspaceId}`);
  }

  return workspaceProviderEventQueue.enqueue(args.workspaceId, async () => {
    let session = await loadWorkspaceSession(args.workspaceId);
    const task =
      session.tasks.find((candidate) => candidate.id === args.taskId) ?? null;
    if (!task) {
      throw new Error(`Task not found: ${args.taskId}`);
    }
    if (!isTaskManaged(task)) {
      return {
        workspaceId: args.workspaceId,
        taskId: task.id,
        stopped: false,
      };
    }

    const activeTurnId = session.activeTurnIdsByTask[task.id];
    if (!activeTurnId) {
      return {
        workspaceId: args.workspaceId,
        taskId: task.id,
        stopped: false,
      };
    }

    providerRuntime.abortTurn({ turnId: activeTurnId });
    providerRuntime.cleanupTask({ taskId: task.id });

    const interrupted = interruptActiveTaskTurns({
      tasks: [task],
      messagesByTask: session.messagesByTask,
      messageCountByTask: session.messageCountByTask,
      activeTurnIdsByTask: session.activeTurnIdsByTask,
      notice: MANAGED_TASK_STOP_NOTICE,
    });
    const providerSessionByTask = { ...session.providerSessionByTask };
    const providerGoalByTask = { ...session.providerGoalByTask };
    delete providerSessionByTask[task.id];
    delete providerGoalByTask[task.id];
    session = cacheWorkspaceSession(args.workspaceId, {
      ...session,
      messagesByTask: interrupted.messagesByTask,
      activeTurnIdsByTask: interrupted.activeTurnIdsByTask,
      providerSessionByTask,
      providerGoalByTask,
      nativeSessionReadyByTask: {
        ...session.nativeSessionReadyByTask,
        [task.id]: false,
      },
    });
    terminalTurnErrorById.set(activeTurnId, MANAGED_TASK_STOP_NOTICE);
    ensureHostServicePersistenceReady().completeTurn({ id: activeTurnId });
    await queueWorkspaceSessionPersist({
      workspaceId: args.workspaceId,
      workspaceName: registration.workspace.name,
      session,
    });

    return {
      workspaceId: args.workspaceId,
      taskId: task.id,
      stopped: true,
      turnId: activeTurnId,
    };
  });
}

export async function takeOverManagedTaskControl(args: {
  workspaceId: string;
  taskId: string;
  sourceContexts?: CanonicalRetrievedContextPart[];
}) {
  await stopManagedTaskTurn(args);
  return releaseManagedTaskControl(args);
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

  return workspaceProviderEventQueue.enqueue(args.workspaceId, async () => {
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

    const result = await providerRuntime.respondApproval({
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
  });
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

  return workspaceProviderEventQueue.enqueue(args.workspaceId, async () => {
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

    const result = await providerRuntime.respondUserInput({
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
  });
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
