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
import {
  CHILD_TASK_LIST_LIMIT,
  isActiveChildTaskPhase,
  toChildTaskSummary,
  type ChildTaskSummary,
} from "../../src/lib/runs/child-task";
import {
  TaskCompletionStatusSchema,
  TASK_HEARTBEAT_LIMITS,
  type TaskCompletionSignal,
} from "../../src/lib/automation/task-supervisor";
import { buildChildTaskReceiptsRetrievedContext } from "../../src/lib/task-context/child-task-receipts";
import { buildCurrentTaskAwarenessRetrievedContextParts } from "../../src/lib/task-context/current-task-awareness";
import { toPersistenceTurnUsage } from "../persistence/turn-usage";
import type { PersistenceTurnUsage } from "../persistence/types";
import type { AppNotificationCreateInput } from "../../src/lib/notifications/notification.types";
import {
  projectLocalMcpTaskTurnActivityEvent,
  type LocalMcpTaskTurnUpdate,
} from "../../src/lib/local-mcp/task-turn-update";
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
  extractCraneIssueReference,
  extractFigmaResourceReference,
  extractJiraIssueReference,
  extractSlackThreadReference,
  extractStorybookResourceReference,
  resolveStorybookResourceAccess,
  shouldAutoFillWorkspaceInformation,
  upsertWorkspaceResourceInState,
  type WorkspaceInfoCustomField,
  type WorkspaceMartinProjectLink,
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
  buildWorkspaceSessionStateFromShell,
  createEmptyWorkspaceState,
  createWorkspaceSnapshot,
  defaultWorkspaceName,
  interruptActiveTaskTurns,
  type WorkspaceSessionState,
} from "../../src/store/workspace-session-state";
import {
  MAX_LOADED_TASK_MESSAGES,
  trimLoadedTaskMessages,
} from "../../src/store/task-message-loading";
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
import {
  MANAGED_TASK_APPROVAL_TIMEOUT_MS,
  resolveManagedTaskRuntimeOptions,
} from "../../src/lib/providers/managed-task-runtime";
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

/** The task supervisor's read of one task. See `getTaskSupervisionSnapshot`. */
export interface TaskSupervisionSnapshot {
  workspaceId: string;
  taskId: string;
  projectPath: string | null;
  exists: boolean;
  archived: boolean;
  providerId: ProviderId | null;
  model: string | null;
  activeTurnId: string | null;
  pendingApprovalCount: number;
  pendingUserInputCount: number;
}

export interface WorkspaceInformationMutationResult {
  workspaceId: string;
  workspaceInformation: WorkspaceInformationState;
}

const workspaceSessionCacheById = new Map<string, WorkspaceSessionState>();
const workspacePersistChainById = new Map<string, Promise<void>>();
const workspaceProviderEventQueue = createKeyedAsyncQueue<string>();
const terminalTurnErrorById = new Map<string, string>();
/**
 * Last `usage` event seen per turn. The agent-driven path handles events one at
 * a time, so the total has to be carried here to reach `completeTurn`, which
 * writes it to the turn row.
 */
const latestTurnUsageById = new Map<string, PersistenceTurnUsage>();
const WORKSPACE_SESSION_CACHE_LIMIT = 32;
const TERMINAL_TURN_ERROR_LIMIT = 500;
const TURN_USAGE_LIMIT = 500;

function takeTurnUsage(turnId: string) {
  const usage = latestTurnUsageById.get(turnId) ?? null;
  latestTurnUsageById.delete(turnId);
  return usage;
}
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
  | "crane"
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
  /**
   * Only these messages are written, instead of the whole resident window.
   * `upsertWorkspace` upserts `messagesByTask` additively (it never deletes
   * rows it omits), so a delta write is equivalent to a full-window write and
   * keeps a streamed event from re-serializing hundreds of untouched messages.
   */
  changedMessagesByTask?: Record<string, ChatMessage[]>;
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
      messagesByTask: args.changedMessagesByTask ?? args.session.messagesByTask,
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
  changedMessagesByTask?: Record<string, ChatMessage[]>;
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
  const existingShell = store.loadWorkspaceShell({
    workspaceId: defaultWorkspaceId,
  });

  if (!existingShell) {
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
  const shell = store.loadWorkspaceShell({ workspaceId });
  if (!shell) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }
  const latestTurns = store.listActiveTurnsForWorkspace({
    workspaceId,
    limit: 200,
  });
  const session = buildWorkspaceSessionStateFromShell({
    shell: shell as never,
    latestTurns: latestTurns as never,
  });
  return cacheWorkspaceSession(workspaceId, session);
}

/**
 * Make sure the task's resident window holds its most-recent
 * `MAX_LOADED_TASK_MESSAGES` messages, reading a bounded tail page rather than
 * the whole transcript.
 *
 * `loadWorkspaceSession` builds the session from the shell only, so
 * `messagesByTask` starts empty for every task while `messageCountByTask`
 * carries the durable total. Before this bounded read the host called
 * `loadAllTaskMessages` here, which meant a 5,000-message task re-materialized
 * its entire history on every turn *and* on every provider event.
 *
 * `messagesByTask` is only a tail window over the durable `messages` table, so
 * capping it loses nothing: older history stays on disk and the renderer pages
 * it back in on demand. Fresh native provider sessions therefore receive the
 * same bounded history the renderer-driven path already sends.
 */
function ensureResidentTaskMessages(args: {
  workspaceId: string;
  taskId: string;
  session: WorkspaceSessionState;
}) {
  const loadedMessages = args.session.messagesByTask[args.taskId] ?? [];
  const totalCount =
    args.session.messageCountByTask[args.taskId] ?? loadedMessages.length;
  const residentTarget = Math.min(totalCount, MAX_LOADED_TASK_MESSAGES);
  if (loadedMessages.length >= residentTarget) {
    return args.session;
  }
  const page = ensureHostServicePersistenceReady().loadTaskMessagesPage({
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    limit: MAX_LOADED_TASK_MESSAGES,
    offset: 0,
  });
  return cacheWorkspaceSession(args.workspaceId, {
    ...args.session,
    messagesByTask: {
      ...args.session.messagesByTask,
      [args.taskId]: page.messages,
    },
    messageCountByTask: {
      ...args.session.messageCountByTask,
      // The durable total, not the resident length: the window is a tail view
      // and the count is what tells later reads how much history exists.
      [args.taskId]: Math.max(page.totalCount, page.messages.length),
    },
  });
}

/**
 * Message ids whose object identity changed between two resident windows.
 *
 * Drives delta persistence: `upsertWorkspace` treats `messagesByTask`
 * additively, so handing it only the changed rows writes the same result as a
 * full-window rewrite without serializing hundreds of untouched messages.
 */
function collectChangedMessages(args: {
  before: ChatMessage[];
  after: ChatMessage[];
}) {
  const beforeById = new Map(args.before.map((item) => [item.id, item]));
  return args.after.filter((message) => beforeById.get(message.id) !== message);
}

/** Bound a task's resident window after new messages were applied. */
function trimResidentTaskMessages(args: {
  workspaceId: string;
  taskId: string;
  session: WorkspaceSessionState;
}) {
  const messages = args.session.messagesByTask[args.taskId] ?? [];
  const trimmed = trimLoadedTaskMessages({ messages });
  if (trimmed === messages) {
    return args.session;
  }
  return cacheWorkspaceSession(args.workspaceId, {
    ...args.session,
    messagesByTask: {
      ...args.session.messagesByTask,
      [args.taskId]: trimmed,
    },
  });
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
    ensureHostServicePersistenceReady().loadWorkspaceShell({
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
  latestTurnUsageById.clear();
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
    case "crane":
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

export async function setWorkspaceMartinProject(args: {
  workspaceId: string;
  project: WorkspaceMartinProjectLink | null;
}) {
  return updateWorkspaceInformationState({
    workspaceId: args.workspaceId,
    updater: (current) => ({
      ...current,
      martinProject: args.project,
    }),
  });
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
  const requestedKind = normalizeWorkspaceResourceKind(args.kind);
  const url = args.url.trim();
  if (!url) {
    throw new Error("Workspace resource URL is required.");
  }
  // A Crane task URL carries a Jira-shaped issue key, so `kind: "jira"` on one
  // is always a misclassification. Keep the link, file it under Crane.
  const kind =
    requestedKind === "jira" && extractCraneIssueReference(url)
      ? ("crane" as const)
      : requestedKind;
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
    kind,
    resource: resolved.resource,
    deduplicated: resolved.deduplicated,
    ...(kind === requestedKind ? {} : { reroutedFrom: requestedKind }),
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
        case "crane": {
          const craneIssues = (current.craneIssues ?? []).filter(
            (item) => item.id !== args.itemId,
          );
          if (craneIssues.length === (current.craneIssues ?? []).length) {
            throw new Error(`Workspace resource not found: ${args.itemId}`);
          }
          return {
            ...current,
            craneIssues,
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

export async function addWorkspaceCraneIssue(args: {
  workspaceId: string;
  url: string;
  issueKey?: string;
  title?: string;
  status?: string;
  note?: string;
}) {
  const parsed = extractCraneIssueReference(args.url);
  const result = await addWorkspaceResource({
    workspaceId: args.workspaceId,
    kind: "crane",
    url: normalizeWorkspaceInfoString(args.url),
    issueKey:
      normalizeWorkspaceInfoString(args.issueKey) || parsed?.issueKey || "",
    title:
      normalizeWorkspaceInfoString(args.title) ||
      normalizeWorkspaceInfoString(args.issueKey) ||
      parsed?.issueKey ||
      "Crane issue",
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

export async function addWorkspaceJiraIssue(args: {
  workspaceId: string;
  url: string;
  issueKey?: string;
  title?: string;
  status?: string;
  note?: string;
}) {
  // Crane issue keys (`CRN-42`) are shaped exactly like Jira keys, so agents
  // routinely file a Crane link here. Reroute instead of rejecting: the link is
  // worth keeping, just not in the Jira section, where it would be read as the
  // product's tracked issue.
  if (extractCraneIssueReference(args.url)) {
    const rerouted = await addWorkspaceCraneIssue(args);
    return { ...rerouted, reroutedTo: "crane" as const };
  }
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
      // Lets Fleet keep a delegated child's request visible even though the
      // task is externally managed. Carries only the parent's task id.
      parentTaskId: task.parentTaskId ?? null,
    },
    dedupeKey: `task.approval_requested:${args.turnId}:${args.event.requestId}`,
  });
}

/**
 * Pending auto-deny deadlines for approvals raised inside a managed task,
 * keyed by `${turnId}:${requestId}`.
 */
const managedApprovalAutoDenyTimers = new Map<string, NodeJS.Timeout>();

function managedApprovalAutoDenyKey(args: {
  turnId: string;
  requestId: string;
}) {
  return `${args.turnId}:${args.requestId}`;
}

function clearManagedApprovalAutoDeny(args: {
  turnId: string;
  requestId?: string;
}) {
  if (args.requestId) {
    const key = managedApprovalAutoDenyKey({
      turnId: args.turnId,
      requestId: args.requestId,
    });
    const timer = managedApprovalAutoDenyTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      managedApprovalAutoDenyTimers.delete(key);
    }
    return;
  }
  const prefix = `${args.turnId}:`;
  for (const [key, timer] of managedApprovalAutoDenyTimers) {
    if (key.startsWith(prefix)) {
      clearTimeout(timer);
      managedApprovalAutoDenyTimers.delete(key);
    }
  }
}

/**
 * Arms the deadlock guard for a managed task's approval.
 *
 * Managed tasks intentionally raise no approval notification, so a prompt-mode
 * approval can sit unanswered forever and the summoning agent never hears back.
 * Denying after the deadline turns that silent hang into a tool error the
 * running agent can report on.
 */
function scheduleManagedApprovalAutoDeny(args: {
  workspaceId: string;
  taskId: string;
  turnId: string;
  event: Extract<NormalizedProviderEvent, { type: "approval" }>;
  session: WorkspaceSessionState;
}) {
  const task =
    args.session.tasks.find((candidate) => candidate.id === args.taskId) ??
    null;
  if (!task || !isExternallyManagedTask(task)) {
    return;
  }
  const key = managedApprovalAutoDenyKey({
    turnId: args.turnId,
    requestId: args.event.requestId,
  });
  if (managedApprovalAutoDenyTimers.has(key)) {
    return;
  }
  const timer = setTimeout(() => {
    managedApprovalAutoDenyTimers.delete(key);
    console.warn("[stave-mcp] auto-denying unanswered managed approval", {
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      turnId: args.turnId,
      requestId: args.event.requestId,
      toolName: args.event.toolName,
    });
    void respondApproval({
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      requestId: args.event.requestId,
      approved: false,
    }).catch((error) => {
      console.warn("[stave-mcp] managed approval auto-deny failed", error, {
        workspaceId: args.workspaceId,
        taskId: args.taskId,
        requestId: args.event.requestId,
      });
    });
  }, MANAGED_TASK_APPROVAL_TIMEOUT_MS);
  timer.unref?.();
  managedApprovalAutoDenyTimers.set(key, timer);
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
      // Lets Fleet keep a delegated child's request visible even though the
      // task is externally managed. Carries only the parent's task id.
      parentTaskId: task.parentTaskId ?? null,
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
  let session = await loadWorkspaceSession(args.workspaceId);
  if (session.activeTurnIdsByTask[args.taskId] !== args.turnId) {
    if (args.event.type === "done") {
      store.completeTurn({
        id: args.turnId,
        usage: takeTurnUsage(args.turnId),
      });
    }
    return;
  }
  session = ensureResidentTaskMessages({
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    session,
  });
  const residentMessagesBeforeEvent = session.messagesByTask[args.taskId] ?? [];
  localMcpTurnJournal.append({
    turnId: args.turnId,
    sequence: args.sequence,
    event: args.event,
  });
  if (args.event.type === "usage") {
    latestTurnUsageById.delete(args.turnId);
    latestTurnUsageById.set(args.turnId, toPersistenceTurnUsage(args.event));
    while (latestTurnUsageById.size > TURN_USAGE_LIMIT) {
      const oldestTurnId = latestTurnUsageById.keys().next().value;
      if (!oldestTurnId) {
        break;
      }
      latestTurnUsageById.delete(oldestTurnId);
    }
  }
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
  const appliedSession = trimResidentTaskMessages({
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    session: applied.session,
  });
  // Write only what this event touched. The renderer re-reads the durable page
  // when it sees `local-mcp.task-turn-updated`, so the write still has to land
  // before that event is emitted — it is just far smaller now.
  await queueWorkspaceSessionPersist({
    workspaceId: args.workspaceId,
    workspaceName: args.workspaceName,
    session: appliedSession,
    changedMessagesByTask: {
      [args.taskId]: collectChangedMessages({
        before: residentMessagesBeforeEvent,
        after: appliedSession.messagesByTask[args.taskId] ?? [],
      }),
    },
  });

  if (args.event.type === "approval") {
    scheduleManagedApprovalAutoDeny({
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      turnId: args.turnId,
      event: args.event,
      session: appliedSession,
    });
    await persistApprovalNotification({
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      turnId: args.turnId,
      provider: args.provider,
      event: args.event,
      session: appliedSession,
    });
  }
  if (args.event.type === "user_input") {
    await persistUserInputNotification({
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      turnId: args.turnId,
      provider: args.provider,
      event: args.event,
      session: appliedSession,
    });
  }
  if (args.event.type === "done") {
    clearManagedApprovalAutoDeny({ turnId: args.turnId });
    await persistTurnCompletedNotification({
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      turnId: args.turnId,
      provider: args.provider,
      event: args.event,
      session: appliedSession,
    });
    store.completeTurn({
      id: args.turnId,
      usage: takeTurnUsage(args.turnId),
    });
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

/**
 * Child-task receipts for one parent, read straight from the ledger. Returns an
 * empty list rather than throwing: a parent's turn must never fail because its
 * delegation bookkeeping could not be read.
 */
function listChildTaskSummaries(args: {
  parentTaskId: string;
  limit?: number;
}): ChildTaskSummary[] {
  try {
    return ensureHostServicePersistenceReady()
      .listRunAggregatesByOrigin({
        originKind: "task",
        originId: args.parentTaskId,
        limit: args.limit ?? CHILD_TASK_LIST_LIMIT,
      })
      .flatMap((aggregate) => {
        const summary = toChildTaskSummary(aggregate);
        return summary ? [summary] : [];
      });
  } catch (error) {
    console.warn(
      `[stave-mcp] failed to read child task receipts: ${String(error)}`,
    );
    return [];
  }
}

/**
 * How deep the completion feed reads, as opposed to `CHILD_TASK_LIST_LIMIT`,
 * which sizes a panel a human is looking at.
 *
 * These two limits answer different questions. Truncating a *display* list
 * hides rows the user can still go and find; truncating the *completion* feed
 * loses a wake-up permanently, because the supervisor only ever consumes what
 * this read returns.
 *
 * The direction of the safety inequality matters: the supervisor's `fired`-row
 * retention (`minRetainedFiredOccurrences`) must be at least as wide as this
 * window, never the other way around. The retained `fired` rows are the
 * idempotency guard — if this read can still report a completion whose
 * consumed receipt was already pruned, that completion reads as brand new and
 * wakes the task a second time. A completion that ages out of this window
 * unconsumed is lost instead, which is why the window is still generous. The
 * constant lives beside the retention limits so the inequality is pinned by a
 * test rather than re-derived here.
 */
const TASK_COMPLETION_FEED_LIMIT = TASK_HEARTBEAT_LIMITS.maxCompletionFeedRows;

/**
 * The task supervisor's completion feed: delegated runs of one parent that have
 * reached a terminal status.
 *
 * Read-only, and derived from the same ledger rows the child-task surface
 * shows, so a completion wake-up can never disagree with what the user sees.
 * The supervisor decides what to do with these; this only reports them.
 */
export function listTaskCompletionSignals(args: {
  taskId: string;
}): TaskCompletionSignal[] {
  return listChildTaskSummaries({
    parentTaskId: args.taskId,
    limit: TASK_COMPLETION_FEED_LIMIT,
  }).flatMap(
    (summary) => {
      // `waiting` is an active phase, so a detached child that parked open
      // after its turn never appears here: only stopping or detaching the
      // delegation settles it into a terminal status. Documented in
      // docs/features/task-heartbeats.md — a completion heartbeat observes
      // delegations that *end*, not detached children between turns.
      if (isActiveChildTaskPhase(summary.phase)) {
        return [];
      }
      const status = TaskCompletionStatusSchema.safeParse(summary.phase);
      if (!status.success) {
        return [];
      }
      return [
        {
          runId: summary.runId,
          stepId: summary.stepId,
          childTaskId: summary.childTaskId,
          providerId: summary.providerId,
          status: status.data,
          reason: summary.reason
            ? summary.reason.slice(0, TASK_HEARTBEAT_LIMITS.maxReasonChars)
            : null,
          // A terminal step without a `completedAt` is a reconciled one; its
          // `updatedAt` is the instant it settled.
          completedAt: summary.completedAt ?? summary.updatedAt,
          // Part of the signal's identity: a retried attempt that settles
          // again must not be deduped against the first attempt's wake-up.
          attempt: summary.attempt,
        } satisfies TaskCompletionSignal,
      ];
    },
  );
}

export async function runTask(args: {
  workspaceId: string;
  prompt: string;
  taskId?: string;
  title?: string;
  /**
   * Set only by the child-task coordinator. Denormalizes the run-ledger
   * delegation link onto the child task row so listing surfaces can tell a
   * child from a peer task. Ignored when continuing an existing task: the link
   * is frozen at creation.
   */
  parentTaskId?: string;
  provider?: ProviderId;
  runtimeOptions?: ProviderRuntimeOptions;
  unattendedAutomation?: {
    authorizationToken: string;
  };
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

  // A delegation pre-mints its child task id on the run ledger before the
  // child task exists, so the coordinator path (parentTaskId set) may name a
  // task that is not in this workspace yet — it is created below with that
  // exact id so the ledger row and the task row agree on identity. Every
  // other caller passing taskId means "continue this task", where a miss is
  // an error.
  const delegationTaskId =
    args.parentTaskId?.trim() && args.taskId?.trim() ? args.taskId.trim() : null;
  let task = delegationTaskId
    ? (session.tasks.find((candidate) => candidate.id === delegationTaskId) ??
      null)
    : findWorkspaceTaskOrThrow({
        tasks: session.tasks,
        requestedTaskId: args.taskId,
      });

  // An existing task already has a provider, and adding a turn to it must not
  // silently move it to another one: the same conversation would continue under
  // a runtime that never saw it. Only a brand new task falls back to the
  // product default.
  const provider = args.provider ?? task?.provider ?? "claude-code";
  const model =
    args.runtimeOptions?.model?.trim() ||
    getDefaultModelForProvider({
      providerId: provider,
    });

  const requestedControlMode = args.controlMode ?? "managed";
  const requestedControlOwner = args.controlOwner ?? "external";
  const requestedSourceContexts = args.retrievedContextParts ?? [];

  if (!task) {
    const taskId = delegationTaskId ?? randomUUID();
    task = {
      id: taskId,
      title: args.title?.trim() || buildTaskTitleFromPrompt(args.prompt),
      provider,
      updatedAt: buildRecentTimestamp(),
      unread: false,
      archivedAt: null,
      controlMode: requestedControlMode,
      controlOwner: requestedControlOwner,
      ...(args.parentTaskId?.trim()
        ? { parentTaskId: args.parentTaskId.trim() }
        : {}),
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

  session = ensureResidentTaskMessages({
    workspaceId: args.workspaceId,
    taskId: task.id,
    session,
  });
  const residentMessagesBeforeTurn = session.messagesByTask[task.id] ?? [];

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
  // A parent that delegated work sees where its children stand before it takes
  // its next turn — identity, phase and reason, never the child's transcript.
  const childTaskReceiptsPart = buildChildTaskReceiptsRetrievedContext({
    children: listChildTaskSummaries({ parentTaskId: task.id }),
  });
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
      ...buildCurrentTaskAwarenessRetrievedContextParts({
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
      ...(childTaskReceiptsPart ? [childTaskReceiptsPart] : []),
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
  session = trimResidentTaskMessages({
    workspaceId: args.workspaceId,
    taskId: task.id,
    session,
  });
  await queueWorkspaceSessionPersist({
    workspaceId: args.workspaceId,
    workspaceName,
    session,
    // Only the prompt's new user message and the pending assistant row.
    changedMessagesByTask: {
      [task.id]: collectChangedMessages({
        before: residentMessagesBeforeTurn,
        after: session.messagesByTask[task.id] ?? [],
      }),
    },
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
      ...(args.unattendedAutomation
        ? { unattendedAutomation: args.unattendedAutomation }
        : {}),
      runtimeOptions: {
        ...(isExternallyManagedTask(task)
          ? resolveManagedTaskRuntimeOptions({
              providerId: provider,
              ...(args.runtimeOptions
                ? { runtimeOptions: args.runtimeOptions }
                : {}),
            })
          : args.runtimeOptions),
        model,
      },
    },
    {
      onEvent: (event) => {
        sequence += 1;
        const eventSequence = sequence;
        const activityEvent = projectLocalMcpTaskTurnActivityEvent(event);
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
              ...(activityEvent ? { activityEvents: [activityEvent] } : {}),
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
  const messages =
    store.loadTaskMessagesPage({
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      limit: 120,
    })?.messages ?? [];
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

/**
 * Clears the delegation link on a child task so it re-enters ordinary
 * workspace listings. `parentTaskId` is the listing predicate
 * (`isDelegatedChildTask`), so a detached child that kept it would stay hidden
 * from every workspace-level task listing forever — a possibly still-running
 * session nobody can find once its parent is archived. Detach's contract is
 * "the child carries on as an ordinary task", and this is what makes that
 * true in the task listings, not just in the ledger.
 *
 * Idempotent: releasing a task that has no parent link reports
 * `released: false` and changes nothing.
 */
export async function releaseTaskParent(args: {
  workspaceId: string;
  taskId: string;
}): Promise<{ released: boolean }> {
  const { projects } = await loadNormalizedProjects();
  const registration = findWorkspaceRegistration({
    projects,
    workspaceId: args.workspaceId,
  });
  if (!registration) {
    throw new Error(`Workspace not found: ${args.workspaceId}`);
  }
  const session = await loadWorkspaceSession(args.workspaceId);
  const task = session.tasks.find((item) => item.id === args.taskId);
  if (!task) {
    throw new Error(`Task not found: ${args.taskId}`);
  }
  if (!task.parentTaskId) {
    return { released: false };
  }
  const updated = cacheWorkspaceSession(args.workspaceId, {
    ...session,
    tasks: session.tasks.map((item) =>
      item.id === args.taskId ? { ...item, parentTaskId: null } : item,
    ),
  });
  await queueWorkspaceSessionPersist({
    workspaceId: args.workspaceId,
    workspaceName: registration.workspace.name,
    session: updated,
  });
  return { released: true };
}

/**
 * Everything the task supervisor needs to decide whether a heartbeat may fire.
 *
 * Deliberately separate from `getTaskStatus`: that shape is a routine's view of
 * a run it started, while this one answers "is this pre-existing task still the
 * same task, still free, and still on the runtime the heartbeat agreed to".
 * Unlike `getTaskStatus` it reports a missing workspace or task as `exists:
 * false` rather than throwing, because a deleted task is a normal terminal
 * outcome for a heartbeat, not an error.
 *
 * Used by: `electron/host-service/task-supervisor-runtime.ts`.
 */
export async function getTaskSupervisionSnapshot(args: {
  workspaceId: string;
  taskId: string;
}): Promise<TaskSupervisionSnapshot> {
  const missing: TaskSupervisionSnapshot = {
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    projectPath: null,
    exists: false,
    archived: false,
    providerId: null,
    model: null,
    activeTurnId: null,
    pendingApprovalCount: 0,
    pendingUserInputCount: 0,
  };

  const { projects } = await loadNormalizedProjects();
  const registration = findWorkspaceRegistration({
    projects,
    workspaceId: args.workspaceId,
  });
  if (!registration) {
    return missing;
  }

  const session = await loadWorkspaceSession(args.workspaceId);
  const task = session.tasks.find((item) => item.id === args.taskId);
  if (!task) {
    return { ...missing, projectPath: registration.project.projectPath };
  }

  const store = ensureHostServicePersistenceReady();
  const messages =
    store.loadTaskMessagesPage({
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      limit: 40,
    })?.messages ?? [];
  // The model a task actually runs on is only recorded per message. Fall back
  // to the provider default, which is what `runTask` itself would resolve.
  const latestModel = [...messages]
    .reverse()
    .find((message) => Boolean(message.model))?.model;

  return {
    workspaceId: args.workspaceId,
    taskId: task.id,
    projectPath: registration.project.projectPath,
    exists: true,
    archived: Boolean(task.archivedAt),
    providerId: task.provider,
    model:
      latestModel?.trim() ||
      getDefaultModelForProvider({ providerId: task.provider }),
    activeTurnId: session.activeTurnIdsByTask[task.id] ?? null,
    pendingApprovalCount: findPendingApprovals(messages).length,
    pendingUserInputCount: findPendingUserInputs(messages).length,
  };
}

/**
 * A heartbeat turn. Identical to a user turn except that it always targets an
 * existing task and always keeps the task interactive and Stave-owned — waking
 * a task must never quietly hand its control to an external owner.
 *
 * Used by: `electron/host-service/task-supervisor-runtime.ts`.
 */
export async function runHeartbeatTurn(args: {
  workspaceId: string;
  taskId: string;
  prompt: string;
  /**
   * The runtime identity the supervisor validated against live task state on
   * this very tick. Passed explicitly rather than left to `runTask`'s default,
   * because "wake this task" means wake it as itself — a Codex task resumed
   * under the Claude default would be a different agent answering.
   */
  fingerprint?: { providerId: ProviderId; model: string };
  retrievedContextParts?: CanonicalRetrievedContextPart[];
}) {
  return runTask({
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    prompt: args.prompt,
    controlMode: "interactive",
    controlOwner: "stave",
    ...(args.fingerprint
      ? {
          provider: args.fingerprint.providerId,
          runtimeOptions: { model: args.fingerprint.model },
        }
      : {}),
    ...(args.retrievedContextParts
      ? { retrievedContextParts: args.retrievedContextParts }
      : {}),
  });
}

/**
 * The terminal notification half of a heartbeat's contract: a wake-up that
 * consumed its receipt but never reached the task.
 *
 * `task.turn_failed` rather than a new kind — from the user's side that is
 * exactly what happened, and inventing a supervisor-only kind would widen the
 * notification surface for no new decision. The dedupe key is the occurrence's
 * own reason so a repeated failure of the same wake-up collapses into one row.
 */
export async function notifyHeartbeatWakeFailed(args: {
  workspaceId: string;
  taskId: string;
  triggerKind: "schedule" | "completion";
  detail: string;
}) {
  const { projects } = await loadNormalizedProjects();
  const registration = findWorkspaceRegistration({
    projects,
    workspaceId: args.workspaceId,
  });
  const session = await loadWorkspaceSession(args.workspaceId);
  const task =
    session.tasks.find((candidate) => candidate.id === args.taskId) ?? null;
  const taskTitle = task?.title || "Task";
  await persistNotification({
    id: randomUUID(),
    kind: "task.turn_failed",
    title: taskTitle,
    body:
      args.triggerKind === "completion"
        ? `A heartbeat could not report finished delegated work: ${args.detail}`
        : `A scheduled heartbeat turn could not start: ${args.detail}`,
    projectPath: registration?.project.projectPath ?? null,
    projectName: registration?.project.projectName ?? null,
    workspaceId: args.workspaceId,
    workspaceName: registration?.workspace.name ?? null,
    taskId: args.taskId,
    taskTitle,
    turnId: null,
    providerId: task?.provider ?? null,
    action: null,
    payload: {
      source: "task-heartbeat",
      triggerKind: args.triggerKind,
    },
    dedupeKey: `task-heartbeat.wake_failed:${args.taskId}:${args.detail}`,
  });
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
    ensureHostServicePersistenceReady().completeTurn({
      id: activeTurnId,
      usage: takeTurnUsage(activeTurnId),
    });
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

    clearManagedApprovalAutoDeny({
      turnId: activeTurnId,
      requestId: args.requestId,
    });
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
