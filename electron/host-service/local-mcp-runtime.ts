import { currentProviderAccountId } from "../provider-accounts/runtime-scope";
import { capSpawnedTurnOptions } from "../../src/lib/policy/turn-policy";
import { taskControlGate } from "./task-control-gate";
import { attachTurnReceiptToSession } from "./local-mcp-turn-receipt-projection";
import { displayTurnReceipt } from "../../src/lib/providers/turn-terminal-receipt";
import { ChatMessageSchema } from "../../src/lib/task-context/schemas";
import { mergeDurableSourceContexts, withoutTurnScopedContexts } from "../../src/lib/task-context/turn-scoped-context";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { buildCanonicalConversationRequest } from "../../src/lib/providers/canonical-request";
import { getDefaultModelForProvider } from "../../src/lib/providers/model-catalog";
import { addIdleTask, resolveTaskModel } from "./idle-task";
import { resolveTurnModelInfo } from "../../src/lib/providers/turn-model-info";
import { getProviderSessionCursor } from "../../src/lib/providers/provider-sessions";
import type {
  CanonicalRetrievedContextPart,
  NormalizedProviderEvent,
  ProviderId,
  ProviderRuntimeOptions,
} from "../../src/lib/providers/provider.types";
import { listDelegatedTaskSummaries } from "./delegated-task-signals";
import { resolveReviewTurnNotification } from "./review-turn-notification";
import {
  describeInteractionAttribution,
  publishesInteractionNotifications,
} from "./delegated-attention";
import { buildDelegatedTaskReceiptsRetrievedContext } from "../../src/lib/task-context/delegated-task-receipts";
import { buildCurrentTaskAwarenessRetrievedContextParts } from "../../src/lib/task-context/current-task-awareness";
import { toPersistenceTurnUsage } from "../persistence/turn-usage";
import type { PersistenceTurnUsage } from "../persistence/types";
import type { AppNotificationCreateInput } from "../../src/lib/notifications/notification.types";
import {
  repositoryLocalMcpTaskTurnActivityEvent,
  type LocalMcpTaskTurnUpdate,
} from "../../src/lib/local-mcp/task-turn-update";
import {
  applyDetectedWorkspaceResources,
  detectWorkspaceResourcesInText,
  shouldAutoFillWorkspaceInformation,
  type WorkspaceInformationState,
} from "../../src/lib/workspace-information";
import {
  createLocalMcpWorkspaceInformation,
  type WorkspaceInformationMutationResult,
} from "./local-mcp-workspace-information";
export type { WorkspaceInformationMutationResult } from "./local-mcp-workspace-information";
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
  normalizeProviderTimeoutMs,
} from "../../src/store/editor.utils";
import {
  buildRepositoryDefaultWorkspaceId,
  buildImportedWorktreeWorkspaceId,
  buildWorkspaceCreationNotice,
  buildWorkspaceRootNodeModulesSymlinkCommand,
  mergeArchivedWorkspacePaths,
  normalizeRepositoryDisplayName,
  normalizeRepositoryWorkspaceRootNodeModulesSymlinkPreference,
  normalizeRecentRepositoryStates,
  normalizeWorkspaceInitCommand,
  resolveCurrentRepositoryDefaultWorkspaceId,
  resolveRepositoryNameFromPath,
  resolveRepositoryWorkspaceInitCommand,
  resolveRepositoryWorkspaceRootNodeModulesSymlinkPreference,
  resolveWorkspaceRemoteBaseBranchTarget,
  sanitizeBranchName,
  summarizeTerminalCommandDetail,
  summarizeWorkspaceInitCommand,
  toWorkspaceFolderName,
  upsertRecentRepositoryState,
  type RecentRepositoryState,
} from "../../src/store/repository.utils";
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
import { trimPersistedMessageWindow } from "../../src/store/resident-message-budget";
import { captureResultEvidence } from "../../src/lib/reviews/result-evidence";
import { applyProviderEventsToWorkspaceSession } from "../../src/store/workspace-turn-replay";
import {
  findLatestPendingApprovalPart,
  findLatestPendingUserInputPart,
  findPendingApprovalMessageByRequestId,
  findPendingUserInputMessageByRequestId,
} from "../../src/store/provider-message.utils";
import { findPendingApprovals, findPendingUserInputs } from "./local-mcp-pending";
import type {
  ChatMessage,
  Task,
  TaskControlMode,
  TaskControlOwner,
} from "../../src/types/chat";
import {
  findWorkspaceTaskOrThrow,
  isExternallyManagedTask,
  isTaskManaged,
  MANAGED_TASK_STOP_NOTICE,
  reconcileTasksWithPersistedArchival,
} from "../../src/lib/tasks";
import {
  MANAGED_TASK_APPROVAL_TIMEOUT_MS,
  resolveManagedTaskRuntimeOptions,
  userSettingsPermissionOptions,
} from "../../src/lib/providers/managed-task-runtime";
import { ensureHostServicePersistenceReady } from "./persistence";
import {
  RepositoryMemoryContentSchema,
  RepositoryMemoryKindSchema,
  resolveRepositoryMemoryConfidence,
  type RepositoryMemory,
  type RepositoryMemoryKind,
} from "../../src/lib/repository-memory";
import {
  buildRepositoryMemoryRetrievedContextPart,
  resolveRepositoryMemoryRecallQuery,
} from "../../src/lib/task-context/repository-memory";
import { createKeyedAsyncQueue } from "./keyed-async-queue";
import {
  createLocalMcpTurnJournal,
  projectTurnStatus,
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

export interface RegisteredRepositoryInfo {
  repositoryPath: string;
  repositoryName: string;
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
  repositoryPath: string;
  repositoryName: string;
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
  latestTurnOutcome?:
    import("../persistence/turn-terminal-receipt").TurnTerminalOutcome | null;
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

/** The supervisor's read of one task. See `getTaskSupervisionSnapshot`. */
export interface TaskSupervisionSnapshot {
  workspaceId: string;
  taskId: string;
  repositoryPath: string | null;
  exists: boolean;
  archived: boolean;
  providerId: ProviderId | null;
  model: string | null;
  activeTurnId: string | null;
  pendingApprovalCount: number;
  pendingUserInputCount: number;
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

function normalizeRepositoryPath(repositoryPath: string) {
  return path.resolve(repositoryPath.trim());
}

async function assertDirectoryExists(repositoryPath: string) {
  const stat = await fs.stat(repositoryPath);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${repositoryPath}`);
  }
}

async function detectDefaultBranch(repositoryPath: string) {
  const branchResult = await runCommand({
    cwd: repositoryPath,
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
  return createWorkspaceSnapshot(createEmptyWorkspaceState());
}

function decodeTaskMessages(messages: unknown[]): ChatMessage[] {
  return messages.map((message) => {
    const parsed = ChatMessageSchema.safeParse(message);
    if (!parsed.success) throw new Error("Saved task history could not be decoded. The original data remains on disk.");
    return parsed.data;
  });
}

function toWorkspaceList(
  repository: RecentRepositoryState,
): RegisteredWorkspaceInfo[] {
  return repository.workspaces.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    updatedAt: workspace.updatedAt,
    path: repository.workspacePathById[workspace.id] ?? repository.repositoryPath,
    branch: repository.workspaceBranchById[workspace.id] ?? repository.defaultBranch,
    isDefault: Boolean(repository.workspaceDefaultById[workspace.id]),
  }));
}

async function persistWorkspaceSession(args: {
  workspaceId: string;
  workspaceName: string;
  session: WorkspaceSessionState;
  /**
   * The task whose turn produced this write. Present for the streaming path,
   * which then takes the field-scoped `persistTaskTurnDelta` route instead of
   * a whole-workspace snapshot write.
   */
  taskId?: string;
  /**
   * Only these messages are written, instead of the whole resident window.
   * `upsertWorkspace` upserts `messagesByTask` additively (it never deletes
   * rows it omits), so a delta write is equivalent to a full-window write and
   * keeps a streamed event from re-serializing hundreds of untouched messages.
   */
  changedMessagesByTask?: Record<string, ChatMessage[]>;
}) {
  const store = ensureHostServicePersistenceReady();

  // Preferred path: write only this task's turn progress and leave every
  // renderer-owned field (drafts, tabs, layout, information) exactly as the
  // renderer last persisted it. The host's cached session copy of those fields
  // can be minutes stale, so writing them back is how a streamed event used to
  // resurrect state the user had already changed.
  if (args.taskId) {
    const task = args.session.tasks.find((item) => item.id === args.taskId);
    const delta = store.persistTaskTurnDelta({
      workspaceId: args.workspaceId,
      workspaceName: args.workspaceName,
      taskId: args.taskId,
      ...(task ? { task: task as never } : {}),
      messages: (args.changedMessagesByTask?.[args.taskId] ??
        args.session.messagesByTask[args.taskId] ??
        []) as never,
      ...(!task?.parentTaskId && args.session.activeTaskId === args.taskId
        ? { activeTaskId: args.taskId }
        : {}),
      ...(args.session.providerSessionByTask[args.taskId]
        ? {
            providerSession: args.session.providerSessionByTask[
              args.taskId
            ] as never,
          }
        : {}),
    });
    if (delta.ok) {
      return;
    }
    // Legacy inline-message payload (or a workspace row that does not exist
    // yet): fall through to the whole-snapshot write, which migrates it.
  }

  // Archival belongs to the renderer's durable tasks table. Re-read it before
  // writing, since stale host metadata could otherwise restore a task the user
  // already archived.
  const reconciledTasks = reconcileTasksWithPersistedArchival({
    tasks: args.session.tasks,
    persistedTasks: store.listWorkspaceTasks({ workspaceId: args.workspaceId }),
  });
  const delegatedShell = args.taskId && args.session.tasks.find(task => task.id === args.taskId)?.parentTaskId
    ? store.loadWorkspaceShell({ workspaceId: args.workspaceId }) : null;
  store.upsertWorkspace({
    id: args.workspaceId,
    name: args.workspaceName,
    snapshot: createWorkspaceSnapshot({
      // Delegated progress never owns foreground selection, including legacy fallback writes.
      activeTaskId: delegatedShell ? delegatedShell.activeTaskId : args.session.activeTaskId,
      tasks: reconciledTasks,
      messagesByTask: args.changedMessagesByTask ?? args.session.messagesByTask,
      promptDraftByTask: args.session.promptDraftByTask,
      workspaceInformation: args.session.workspaceInformation,
      editorTabs: args.session.editorTabs,
      activeEditorTabId: args.session.activeEditorTabId,
      terminalTabs: args.session.terminalTabs,
      activeTerminalTabId: args.session.activeTerminalTabId,
      terminalDocked: args.session.terminalDocked,
      cliSessionTabs: args.session.cliSessionTabs,
      activeCliSessionTabId: args.session.activeCliSessionTabId,
      activeSurface: args.session.activeSurface,
      providerSessionByTask: args.session.providerSessionByTask,
    }) as never,
  });
}

function queueWorkspaceSessionPersist(args: {
  workspaceId: string;
  workspaceName: string;
  session: WorkspaceSessionState;
  taskId?: string;
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

async function loadNormalizedRepositories() {
  const store = ensureHostServicePersistenceReady();
  return {
    store,
    repositories: normalizeRecentRepositoryStates({
      repositories: store.loadRepositoryRegistry() as RecentRepositoryState[],
    }),
  };
}

async function saveNormalizedRepositories(repositories: RecentRepositoryState[]) {
  const store = ensureHostServicePersistenceReady();
  store.saveRepositoryRegistry({
    repositories: normalizeRecentRepositoryStates({ repositories }) as never[],
  });
}

function findRepositoryByPath(
  repositories: RecentRepositoryState[],
  repositoryPath: string,
) {
  return (
    repositories.find((repository) => repository.repositoryPath === repositoryPath) ?? null
  );
}

function findWorkspaceRegistration(args: {
  repositories: RecentRepositoryState[];
  workspaceId: string;
}) {
  for (const repository of args.repositories) {
    const workspace =
      repository.workspaces.find((item) => item.id === args.workspaceId) ?? null;
    if (!workspace) {
      continue;
    }
    return {
      project: repository,
      workspace,
      workspacePath:
        repository.workspacePathById[workspace.id] ?? repository.repositoryPath,
      branch:
        repository.workspaceBranchById[workspace.id] ?? repository.defaultBranch,
    };
  }
  return null;
}

async function ensureRepositoryRegistryEntry(args: {
  repositoryPath: string;
  repositoryName?: string;
  defaultBranch?: string;
}) {
  const repositoryPath = normalizeRepositoryPath(args.repositoryPath);
  await assertDirectoryExists(repositoryPath);
  const resolvedRepositoryName = normalizeRepositoryDisplayName({
    repositoryPath,
    repositoryName:
      args.repositoryName?.trim() || resolveRepositoryNameFromPath({ repositoryPath }),
  });
  const defaultBranch =
    args.defaultBranch?.trim() || (await detectDefaultBranch(repositoryPath));
  const now = new Date().toISOString();

  const { store, repositories } = await loadNormalizedRepositories();
  const existingRepository = findRepositoryByPath(repositories, repositoryPath);
  const defaultWorkspaceId = existingRepository
    ? resolveCurrentRepositoryDefaultWorkspaceId({
        repositoryPath,
        workspaces: existingRepository.workspaces,
        workspaceDefaultById: existingRepository.workspaceDefaultById,
      })
    : buildRepositoryDefaultWorkspaceId({ repositoryPath });
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

  const nextRepository: RecentRepositoryState = existingRepository
    ? {
        ...existingRepository,
        repositoryName: resolvedRepositoryName,
        defaultBranch,
        lastOpenedAt: now,
        activeWorkspaceId:
          existingRepository.activeWorkspaceId || defaultWorkspaceId,
        workspaceBranchById: {
          ...existingRepository.workspaceBranchById,
          [defaultWorkspaceId]:
            existingRepository.workspaceBranchById[defaultWorkspaceId] ||
            defaultBranch,
        },
        workspacePathById: {
          ...existingRepository.workspacePathById,
          [defaultWorkspaceId]:
            existingRepository.workspacePathById[defaultWorkspaceId] ||
            repositoryPath,
        },
        workspaceDefaultById: {
          ...existingRepository.workspaceDefaultById,
          [defaultWorkspaceId]: true,
        },
        workspaces: existingRepository.workspaces.some(
          (workspace) => workspace.id === defaultWorkspaceId,
        )
          ? existingRepository.workspaces
          : [
              {
                id: defaultWorkspaceId,
                name: defaultWorkspaceName,
                updatedAt: now,
              },
              ...existingRepository.workspaces,
            ],
      }
    : {
        repositoryPath,
        repositoryName: resolvedRepositoryName,
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
        workspacePathById: { [defaultWorkspaceId]: repositoryPath },
        workspaceDefaultById: { [defaultWorkspaceId]: true },
        repositoryBasePrompt: "",
        newWorkspaceInitCommand: "",
        newWorkspaceUseRootNodeModulesSymlink: false,
      };

  const nextRepositories = upsertRecentRepositoryState({
    repositories,
    repository: nextRepository,
  });
  await saveNormalizedRepositories(nextRepositories);

  return {
    projectPath: repositoryPath,
    repositoryName: resolvedRepositoryName,
    defaultBranch,
    repository: nextRepository,
    defaultWorkspaceId,
  };
}

async function loadWorkspaceSession(workspaceId: string, refresh = false) {
  const cached = workspaceSessionCacheById.get(workspaceId);
  if (cached && !refresh) {
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
    // Refresh task metadata without dropping bounded resident message windows.
    ...(cached ? { messagesByTask: cached.messagesByTask } : {}),
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
const loadedResidentMessageWindows = new WeakSet<ChatMessage[]>();

function ensureResidentTaskMessages(args: {
  workspaceId: string;
  taskId: string;
  session: WorkspaceSessionState;
}) {
  const loadedMessages = args.session.messagesByTask[args.taskId] ?? [];
  const totalCount =
    args.session.messageCountByTask[args.taskId] ?? loadedMessages.length;
  const residentTarget = Math.min(totalCount, MAX_LOADED_TASK_MESSAGES);
  if (loadedResidentMessageWindows.has(loadedMessages) || loadedMessages.length >= residentTarget) {
    return args.session;
  }
  const page = ensureHostServicePersistenceReady().loadTaskMessagesPage({
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    limit: MAX_LOADED_TASK_MESSAGES,
    offset: 0,
  });
  if (!page) throw new Error("Task history is unavailable. Reopen the task before continuing.");
  const messages = trimPersistedMessageWindow({ messages: decodeTaskMessages(page.messages) });
  loadedResidentMessageWindows.add(messages);
  return cacheWorkspaceSession(args.workspaceId, {
    ...args.session,
    messagesByTask: {
      ...args.session.messagesByTask,
      [args.taskId]: messages,
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
  persisted?: boolean;
}) {
  const messages = args.session.messagesByTask[args.taskId] ?? [];
  const trimmed = args.persisted
    ? trimPersistedMessageWindow({ messages })
    : trimLoadedTaskMessages({ messages });
  // A byte-bounded tail is intentionally smaller than the count target.
  // Remember the loaded window so every streamed event does not read it again.
  if (args.persisted) loadedResidentMessageWindows.add(trimmed);
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

async function updateWorkspaceInformationState(args: {
  workspaceId: string;
  updater: (current: WorkspaceInformationState) => WorkspaceInformationState;
}) {
  const session = refreshWorkspaceInformationFromPersistence({
    workspaceId: args.workspaceId,
    session: await loadWorkspaceSession(args.workspaceId),
  });
  const { repositories } = await loadNormalizedRepositories();
  const registration = findWorkspaceRegistration({
    repositories,
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

export const {
  setWorkspaceMartinProject,
  replaceWorkspaceNotes,
  appendWorkspaceNotes,
  clearWorkspaceNotes,
  addWorkspaceTodo,
  updateWorkspaceTodo,
  removeWorkspaceTodo,
  addWorkspaceResource,
  removeWorkspaceResource,
  addWorkspaceCustomField,
  setWorkspaceCustomField,
  removeWorkspaceCustomField,
  addWorkspaceCraneIssue,
  addWorkspaceJiraIssue,
  addWorkspaceConfluencePage,
  addWorkspaceFigmaResource,
  addWorkspaceStorybookResource,
  updateWorkspaceStorybookResourceAccess,
  addWorkspaceSlackThread,
  addWorkspaceAmplifyLink,
} = createLocalMcpWorkspaceInformation({
  getWorkspaceInformation,
  updateWorkspaceInformationState,
});

export interface RepositoryMemoryRememberToolResult {
  repositoryPath: string;
  outcome: "inserted" | "confirmed" | "updated" | "rejected";
  memory: RepositoryMemory | null;
}

export interface RepositoryMemoryForgetToolResult {
  repositoryPath: string;
  memoryId: string;
  forgotten: boolean;
}

async function resolveRepositoryPathForWorkspace(workspaceId: string) {
  const { repositories } = await loadNormalizedRepositories();
  const registration = findWorkspaceRegistration({ repositories, workspaceId });
  if (!registration) {
    throw new Error(`Workspace is not registered to a project: ${workspaceId}`);
  }
  return registration.project.repositoryPath;
}

/**
 * `stave_remember`: store one repository-scoped fact for every future task of the
 * workspace's repository. Scope comes from the workspace registration, never from
 * the caller, so a tool call cannot write into another repository's memory.
 */
export async function rememberRepositoryMemory(args: {
  workspaceId: string;
  kind: RepositoryMemoryKind;
  content: string;
  memoryId?: string;
  recallMode?: "contextual" | "core";
  taskId?: string;
}): Promise<RepositoryMemoryRememberToolResult> {
  const kind = RepositoryMemoryKindSchema.parse(args.kind);
  const content = RepositoryMemoryContentSchema.parse(args.content);
  const repositoryPath = await resolveRepositoryPathForWorkspace(args.workspaceId);
  const store = ensureHostServicePersistenceReady();
  if (args.memoryId) {
    const memory = store.updateRepositoryMemory({
      id: args.memoryId,
      repositoryPath,
      kind,
      content,
      recallMode: args.recallMode ?? "contextual",
    });
    if (!memory) throw new Error("Project memory not found in this project.");
    return { repositoryPath, outcome: "updated", memory };
  }
  const result = store.rememberRepositoryMemory({
    repositoryPath,
    kind,
    content,
    recallMode: args.recallMode,
    confidence: resolveRepositoryMemoryConfidence("explicit"),
    sourceTaskId: args.taskId ?? null,
  });
  if (!result) {
    // Collection is disabled or the user previously removed this fact.
    return { repositoryPath, outcome: "rejected", memory: null };
  }
  return { repositoryPath, outcome: result.outcome, memory: result.memory };
}

/** `stave_list_repository_memories`: ids + content, so `stave_forget` has something to target. */
export async function listRepositoryMemories(args: { workspaceId: string } & import("../../src/lib/repository-memory").RepositoryMemorySearchOptions) {
  const repositoryPath = await resolveRepositoryPathForWorkspace(args.workspaceId);
  const store = ensureHostServicePersistenceReady();
  const { workspaceId: _workspaceId, ...options } = args;
  const result = store.searchRepositoryMemories({ repositoryPath, ...options });
  return {
    projectPath: repositoryPath,
    nextOffset: result.nextOffset,
    memories: result.memories
      .map(({ id, kind, content, recallMode, lastConfirmedAt }) => ({
        id,
        kind,
        content,
        recallMode,
        lastConfirmedAt,
      })),
  };
}

/** `stave_forget`: soft-delete a memory that belongs to the workspace's repository. */
export async function forgetRepositoryMemory(args: {
  workspaceId: string;
  memoryId: string;
}): Promise<RepositoryMemoryForgetToolResult> {
  const repositoryPath = await resolveRepositoryPathForWorkspace(args.workspaceId);
  const store = ensureHostServicePersistenceReady();
  const memory = store.getRepositoryMemory(args.memoryId);
  if (!memory || memory.repositoryPath !== repositoryPath) {
    throw new Error(
      `Project memory not found in this project: ${args.memoryId}`,
    );
  }
  return {
    repositoryPath,
    memoryId: args.memoryId,
    forgotten: store.deleteRepositoryMemory(args.memoryId),
  };
}

/**
 * The `stave:repository-memory` block for a host-initiated turn. Memory is a
 * best-effort aid: a store without the method (test doubles) or a failing
 * query yields no block rather than a failed turn.
 */
function buildRepositoryMemoryPartForTurn(args: {
  repositoryPath: string;
  history: ChatMessage[];
  prompt: string;
}): CanonicalRetrievedContextPart | null {
  try {
    const store = ensureHostServicePersistenceReady() as {
      recallRepositoryMemories?: (input: {
        repositoryPath: string;
        query?: string | null;
      }) => RepositoryMemory[];
    };
    if (typeof store.recallRepositoryMemories !== "function") {
      return null;
    }
    const memories = store.recallRepositoryMemories({
      repositoryPath: args.repositoryPath,
      query: resolveRepositoryMemoryRecallQuery({
        history: args.history,
        prompt: args.prompt,
      }),
    });
    return buildRepositoryMemoryRetrievedContextPart({ memories });
  } catch (error) {
    console.warn("[stave-mcp] project memory recall failed", error);
    return null;
  }
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
  const { repositories } = await loadNormalizedRepositories();
  const registration = findWorkspaceRegistration({
    repositories,
    workspaceId: args.workspaceId,
  });
  const task =
    args.session.tasks.find((candidate) => candidate.id === args.taskId) ??
    null;
  if (!task || !publishesInteractionNotifications(task)) {
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
  const attribution = describeInteractionAttribution({
    task, workspaceId: args.workspaceId, sessionTasks: args.session.tasks, repository: registration?.project ?? null,
  });
  await persistNotification({
    id: randomUUID(),
    kind: "task.approval_requested",
    title: attribution.title ?? taskTitle,
    body: `${args.event.toolName}: ${args.event.description}`,
    repositoryPath: registration?.project.repositoryPath ?? null,
    repositoryName: registration?.project.repositoryName ?? null,
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
      ...attribution.payload,
    },
    dedupeKey: `task.approval_requested:${args.turnId}:${args.event.requestId}`,
  });
}

/** Pending managed approval deadlines, keyed by turn and request identity. */
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

/** A managed approval expires if neither the user nor controller answers. */
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
  if (!task || !publishesInteractionNotifications(task)) {
    return;
  }
  const location = findPendingUserInputMessageByRequestId({
    messages: args.session.messagesByTask[args.taskId] ?? [],
    requestId: args.event.requestId,
  });
  if (!location) {
    return;
  }
  const { repositories } = await loadNormalizedRepositories();
  const registration = findWorkspaceRegistration({
    repositories,
    workspaceId: args.workspaceId,
  });
  const firstQuestion = args.event.questions[0];
  const question =
    firstQuestion?.header.trim() ||
    firstQuestion?.question.trim() ||
    (args.event.questions.length > 1
      ? `${args.event.questions.length} questions`
      : "User input requested");
  const attribution = describeInteractionAttribution({
    task, workspaceId: args.workspaceId, sessionTasks: args.session.tasks, repository: registration?.project ?? null,
  });
  await persistNotification({
    id: randomUUID(),
    kind: "task.user_input_requested",
    title: attribution.title ?? (task.title || "Task"),
    body: `${args.event.toolName}: ${question}`,
    repositoryPath: registration?.project.repositoryPath ?? null,
    repositoryName: registration?.project.repositoryName ?? null,
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
      ...attribution.payload,
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
  if (args.session.activeTurnIdsByTask[args.taskId]) {
    return;
  }
  const outcome = ensureHostServicePersistenceReady()
    .getTurnReceipt(args.turnId)?.outcome ?? "unknown";
  if (outcome === "unknown") return;
  if (outcome === "cancelled") return;

  const { repositories } = await loadNormalizedRepositories();
  const registration = findWorkspaceRegistration({
    repositories,
    workspaceId: args.workspaceId,
  });
  const taskTitle =
    args.session.tasks.find((task) => task.id === args.taskId)?.title ?? "Task";
  const review = resolveReviewTurnNotification({ tasks: args.session.tasks, taskId: args.taskId, failed: outcome === "failed", messages: args.session.messagesByTask[args.taskId] });

  await persistNotification({
    id: randomUUID(),
    kind: outcome === "failed" ? "task.turn_failed" : "task.turn_completed",
    title: review?.title ?? taskTitle,
    body: review?.body ?? `Latest run ${outcome === "failed" ? "failed" : "finished"} in ${registration?.workspace.name ?? args.workspaceId}.`,
    repositoryPath: registration?.project.repositoryPath ?? null,
    repositoryName: registration?.project.repositoryName ?? null,
    workspaceId: args.workspaceId,
    workspaceName: registration?.workspace.name ?? null,
    taskId: args.taskId,
    taskTitle,
    turnId: args.turnId,
    providerId: args.provider,
    action: null,
    payload: {
      stopReason: args.event.stop_reason ?? null,
      resultEvidence: captureResultEvidence(args.session.messagesByTask[args.taskId] ?? [], args.turnId),
      ...review?.payload,
    },
    dedupeKey: `task.turn_${outcome}:${args.turnId}`,
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
  if (args.event.type === "done") {
    store.completeTurn({ id: args.turnId, usage: takeTurnUsage(args.turnId) });
  }
  const applied = applyProviderEventsToWorkspaceSession({
    session,
    taskId: args.taskId,
    events: [args.event as NormalizedProviderEvent],
    provider: args.provider,
    model: args.model,
    turnId: args.turnId,
  });
  if (args.event.type === "done") {
    applied.session = attachTurnReceiptToSession(
      applied.session, args.taskId, args.turnId, store.getTurnReceipt(args.turnId),
    );
  }
  cacheWorkspaceSession(args.workspaceId, applied.session);
  let appliedSession = trimResidentTaskMessages({
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
    taskId: args.taskId,
    changedMessagesByTask: {
      [args.taskId]: collectChangedMessages({
        before: residentMessagesBeforeEvent,
        after: appliedSession.messagesByTask[args.taskId] ?? [],
      }),
    },
  });
  appliedSession = trimResidentTaskMessages({
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    session: appliedSession,
    persisted: true,
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
  }
}

export async function registerRepository(args: {
  repositoryPath: string;
  repositoryName?: string;
  defaultBranch?: string;
}) {
  const ensured = await ensureRepositoryRegistryEntry(args);
  return {
    repositoryPath: ensured.projectPath,
    repositoryName: ensured.repository.repositoryName,
    defaultBranch: ensured.repository.defaultBranch,
    activeWorkspaceId: ensured.repository.activeWorkspaceId,
    defaultWorkspaceId: ensured.defaultWorkspaceId,
    workspaces: toWorkspaceList(ensured.repository),
  } satisfies RegisteredRepositoryInfo;
}

export async function createWorkspace(args: {
  repositoryPath: string;
  name: string;
  /** Human-facing sidebar label. Falls back to the derived branch name. */
  label?: string;
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

  const ensured = await ensureRepositoryRegistryEntry({
    repositoryPath: args.repositoryPath,
  });
  const repositoryPath = ensured.projectPath;
  const repository = ensured.repository;
  const branchName = sanitizeBranchName({ value: trimmedName });
  if (!branchName) {
    throw new Error("Workspace branch name is invalid.");
  }
  const workspaceDisplayName = args.label?.trim() || branchName;

  const existingWorkspace =
    toWorkspaceList(repository).find(
      (workspace) =>
        workspace.branch === branchName ||
        workspace.name === branchName ||
        workspace.path ===
          `${repositoryPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: branchName, unique: true })}`,
    ) ?? null;
  if (existingWorkspace) {
    return {
      workspaceId: existingWorkspace.id,
      workspaceName: existingWorkspace.name,
      workspacePath: existingWorkspace.path,
      branch: existingWorkspace.branch,
      repositoryPath,
      repositoryName: repository.repositoryName,
      message: "Workspace already exists.",
      noticeLevel: "warning",
    } satisfies CreatedWorkspaceInfo;
  }

  const workspacePath = `${repositoryPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: branchName, unique: true })}`;
  const workspaceId = buildImportedWorktreeWorkspaceId({
    repositoryPath,
    worktreePath: workspacePath,
  });
  let baseBranch =
    args.fromBranch?.trim() ||
    repository.defaultBranch ||
    ensured.defaultBranch ||
    "main";
  const initCommand = normalizeWorkspaceInitCommand({
    value:
      args.initCommand ??
      resolveRepositoryWorkspaceInitCommand({
        repositoryPath,
        recentRepositories: [repository],
      }),
  });
  const useRootNodeModulesSymlink =
    args.useRootNodeModulesSymlink === undefined
      ? resolveRepositoryWorkspaceRootNodeModulesSymlinkPreference({
          repositoryPath,
          recentRepositories: [repository],
        })
      : normalizeRepositoryWorkspaceRootNodeModulesSymlinkPreference({
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
                cwd: repositoryPath,
                command: "git",
                commandArgs: ["show-ref", "--verify", "--quiet", ref],
              })
            ).ok,
        })
      : null;
  if (remoteTarget) {
    const fetchResult = await runCommandArgs({
      cwd: repositoryPath,
      command: "git",
      commandArgs: ["fetch", remoteTarget.remoteName, "--prune"],
    });
    if (!fetchResult.ok) {
      const localBranchProbe = await runCommandArgs({
        cwd: repositoryPath,
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
    cwd: repositoryPath,
    command: "mkdir -p .stave/workspaces",
  });
  const addResult = await runCommandArgs({
    cwd: repositoryPath,
    command: "git",
    commandArgs:
      args.mode === "clean"
        ? ["worktree", "add", "-b", branchName, workspacePath]
        : ["worktree", "add", "-b", branchName, workspacePath, baseBranch],
  });
  if (!addResult.ok) {
    const fallbackResult = await runCommandArgs({
      cwd: repositoryPath,
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
      command: buildWorkspaceRootNodeModulesSymlinkCommand({ repositoryPath }),
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
    name: workspaceDisplayName,
    snapshot: snapshot as never,
  });
  cacheWorkspaceSession(
    workspaceId,
    buildWorkspaceSessionState({ snapshot: snapshot as never }),
  );

  const now = new Date().toISOString();
  const nextRepository: RecentRepositoryState = {
    ...repository,
    lastOpenedAt: now,
    activeWorkspaceId: workspaceId,
    workspaces: [
      ...repository.workspaces,
      { id: workspaceId, name: workspaceDisplayName, updatedAt: now },
    ],
    workspaceBranchById: {
      ...repository.workspaceBranchById,
      [workspaceId]: branchName,
    },
    workspacePathById: {
      ...repository.workspacePathById,
      [workspaceId]: workspacePath,
    },
    workspaceDefaultById: {
      ...repository.workspaceDefaultById,
      [workspaceId]: false,
    },
    archivedWorkspacePaths: mergeArchivedWorkspacePaths({
      current: repository.archivedWorkspacePaths,
      remove: [workspacePath],
    }),
  };
  const { repositories } = await loadNormalizedRepositories();
  await saveNormalizedRepositories(
    upsertRecentRepositoryState({
      repositories,
      repository: nextRepository,
    }),
  );

  const notice = buildWorkspaceCreationNotice({ notices });
  return {
    workspaceId,
    workspaceName: workspaceDisplayName,
    workspacePath,
    branch: branchName,
    repositoryPath,
    repositoryName: repository.repositoryName,
    ...(notice ?? {}),
  } satisfies CreatedWorkspaceInfo;
}

export async function runTask(args: Parameters<typeof runTaskImpl>[0]) {
  const release = taskControlGate.acquireStart(args.taskId);
  try { return await runTaskImpl(args); } finally { release(); }
}

async function runTaskImpl(args: {
  workspaceId: string;
  prompt: string;
  taskId?: string;
  title?: string;
  /**
   * Set only by the delegated-task coordinator. Denormalizes the run-ledger
   * delegation link onto the delegated task row so listing surfaces can tell a
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
  /** Set only by the agent run supervisor; the provider runtime mints the grant. */
  agentRunStage?: import("../../src/lib/agent-runs/domain").AgentRunStageIdentity;
  agentRunPrompt?: import("../../src/types/chat").AgentRunPromptProvenance; // agent run supervisor only: marks the user row
  spawnedBy?: { taskId: string; autonomy: import("../../src/lib/policy/turn-policy").Autonomy | null; agentMode?: boolean }; // the calling turn caps this one
}) {
  const controlGeneration = taskControlGate.capture(args.taskId);
  const { repositories } = await loadNormalizedRepositories();
  const registration = findWorkspaceRegistration({
    repositories,
    workspaceId: args.workspaceId,
  });
  if (!registration) {
    throw new Error(`Workspace not found: ${args.workspaceId}`);
  }

  const workspacePath = registration.workspacePath;
  const workspaceName = registration.workspace.name;
  let session = refreshWorkspaceInformationFromPersistence({
    workspaceId: args.workspaceId,
    session: await loadWorkspaceSession(args.workspaceId, true),
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

  // Delegations pre-mint a child id; other task ids must already exist.
  const delegationTaskId =
    args.parentTaskId?.trim() && args.taskId?.trim()
      ? args.taskId.trim()
      : null;
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

  if (task && args.parentTaskId && !isTaskManaged(task)) {
    throw new Error("The delegated task was taken over; its controller cannot reclaim it.");
  }
  if (task) taskControlGate.assertCurrent(task.id, controlGeneration);
  const requestedControlMode = args.controlMode ?? "managed";
  const requestedControlOwner = args.controlOwner ?? "external";
  // Only durable sources (a ticket, a PR log) stay on the task; a part that
  // describes this one turn (an agent run stage, a wake-up) still reaches this
  // turn below, but must not be re-sent with the user's later turns.
  const requestedSourceContexts = withoutTurnScopedContexts(args.retrievedContextParts ?? []);

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
      activeTaskId: args.parentTaskId?.trim() ? session.activeTaskId : task.id,
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
    const sourceContexts = mergeDurableSourceContexts(task.sourceContexts, requestedSourceContexts);
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
      const { sourceContexts: _previous, ...rest } = task;
      task = {
        ...rest,
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
          sourceId: "stave:automation-information-references",
          title: "Automation Information References",
          content: [
            "The automation explicitly attached these Information panel entries.",
            "Treat section references as the full current section and item references as the specific current item.",
            "",
            informationReferencesContext,
          ].join("\n"),
        }
      : null;
  // Subagent states and the answers that arrived since this task's last turn began.
  const delegatedTaskReceiptsPart = buildDelegatedTaskReceiptsRetrievedContext({
    children: listDelegatedTaskSummaries({ parentTaskId: task.id }),
    resultsSince: ensureHostServicePersistenceReady().listTurns({ workspaceId: args.workspaceId, taskId: task.id, limit: 1 })[0]?.createdAt ?? null,
  });
  const repositoryMemoryPart = buildRepositoryMemoryPartForTurn({
    repositoryPath: registration.project.repositoryPath,
    history: existingHistory,
    prompt: args.prompt,
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
        repositoryName: registration.project.repositoryName,
        repositoryPath: registration.project.repositoryPath,
        taskId: task.id,
        tasks: session.tasks,
        workspaceInformation: session.workspaceInformation,
      }),
      ...(repositoryMemoryPart ? [repositoryMemoryPart] : []),
      ...(delegatedTaskReceiptsPart ? [delegatedTaskReceiptsPart] : []),
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
    // Same chip facts a composer turn records: effort, Fast, and the
    // catalog name that peels `1M` off a `[1m]` model id. Host-owned turns
    // reload from this persisted row, so omitting it left the footer on the
    // model name alone.
    ...(args.runtimeOptions
      ? { modelInfo: resolveTurnModelInfo({ providerId: provider, runtimeOptions: args.runtimeOptions }) }
      : {}),
    content: args.prompt,
    ...(args.agentRunPrompt ? { agentRunPrompt: args.agentRunPrompt } : {}),
  });
  session = cacheWorkspaceSession(args.workspaceId, {
    ...session,
    activeTaskId: args.parentTaskId?.trim() ? session.activeTaskId : task.id,
    tasks: pendingState.tasks,
    messagesByTask: pendingState.messagesByTask,
    messageCountByTask: pendingState.messageCountByTask,
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
    taskId: task.id,
    // Only the prompt's new user message and the pending assistant row.
    changedMessagesByTask: {
      [task.id]: collectChangedMessages({
        before: residentMessagesBeforeTurn,
        after: session.messagesByTask[task.id] ?? [],
      }),
    },
  });

  session = trimResidentTaskMessages({
    workspaceId: args.workspaceId,
    taskId: task.id,
    session,
    persisted: true,
  });

  const store = ensureHostServicePersistenceReady();
  let sequence = 0;
  store.beginTurn({
    id: turnId,
    workspaceId: args.workspaceId,
    taskId: task.id,
    providerId: provider,
    accountProfileId: provider === "claude-code" || provider === "codex"
      ? (provider === "codex" ? args.runtimeOptions?.codexAccountProfileId : args.runtimeOptions?.claudeAccountProfileId) ?? currentProviderAccountId(provider) : "system-default",
    modelId: model,
  });

  taskControlGate.assertCurrent(task.id, controlGeneration);
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
      ...(args.agentRunStage ? { agentRunStage: args.agentRunStage } : {}),
      runtimeOptions: capSpawnedTurnOptions({ providerId: provider, root: workspacePath, spawnedBy: args.spawnedBy, options: {
        ...(isExternallyManagedTask(task)
          ? resolveManagedTaskRuntimeOptions({
              providerId: provider,
              defaultPermissionOptions: userSettingsPermissionOptions(provider, store.delegationPolicies?.loadSettings()),
              ...(args.runtimeOptions
                ? { runtimeOptions: args.runtimeOptions }
                : {}),
              defaultProviderTimeoutMs: normalizeProviderTimeoutMs({
                value: store.loadAutomationProviderTimeoutMs(),
              }),
            })
          : args.runtimeOptions),
        model,
      } }),
    },
    {
      onEvent: (event) => {
        sequence += 1;
        const eventSequence = sequence;
        const activityEvent = repositoryLocalMcpTaskTurnActivityEvent(event);
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
              ...(event.type === "done"
                ? { terminalReceipt: displayTurnReceipt(store.getTurnReceipt(turnId)) }
                : {}),
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
  const messages = decodeTaskMessages(
    store.loadTaskMessagesPage({
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      limit: 120,
    })?.messages ?? session.messagesByTask[args.taskId] ?? []);

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
    ...projectTurnStatus({
      turn: latestTurn, messages, targeted: !!args.turnId,
      memoryError: latestTurn ? terminalTurnErrorById.get(latestTurn.id) ?? null : null,
      readEvents: (turnId) => store.getStreamEvents({ turnId }),
    }),
    pendingApprovals: findPendingApprovals(messages),
    pendingUserInputs: findPendingUserInputs(messages),
  } satisfies TaskStatusResult;
}

/**
 * Clears the delegation link on a delegated task so it re-enters ordinary
 * workspace listings. `parentTaskId` is the listing predicate
 * (`isDelegatedTask`), so a detached child that kept it would stay hidden
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
  const { repositories } = await loadNormalizedRepositories();
  const registration = findWorkspaceRegistration({
    repositories,
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
 * Everything the supervisor needs to decide whether a wake-up may fire.
 *
 * Deliberately separate from `getTaskStatus`: that shape is an automation's view of
 * a run it started, while this one answers "is this pre-existing task still the
 * same task, still free, and still on the runtime the wake-up agreed to".
 * Unlike `getTaskStatus` it reports a missing workspace or task as `exists:
 * false` rather than throwing, because a deleted task is a normal terminal
 * outcome for a wake-up, not an error.
 *
 * Used by: `electron/host-service/wake-up-runtime.ts`.
 */
export async function getTaskSupervisionSnapshot(args: {
  workspaceId: string;
  taskId: string;
}): Promise<TaskSupervisionSnapshot> {
  const missing: TaskSupervisionSnapshot = {
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    repositoryPath: null,
    exists: false,
    archived: false,
    providerId: null,
    model: null,
    activeTurnId: null,
    pendingApprovalCount: 0,
    pendingUserInputCount: 0,
  };

  const { repositories } = await loadNormalizedRepositories();
  const registration = findWorkspaceRegistration({
    repositories,
    workspaceId: args.workspaceId,
  });
  if (!registration) {
    return missing;
  }

  const session = await loadWorkspaceSession(args.workspaceId, true);
  const task = session.tasks.find((item) => item.id === args.taskId);
  if (!task) {
    return { ...missing, repositoryPath: registration.project.repositoryPath };
  }

  const store = ensureHostServicePersistenceReady();
  const messages = decodeTaskMessages(
    store.loadTaskMessagesPage({
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      limit: 40,
    })?.messages ?? session.messagesByTask[args.taskId] ?? []);

  return {
    workspaceId: args.workspaceId,
    taskId: task.id,
    repositoryPath: registration.project.repositoryPath,
    exists: true,
    archived: Boolean(task.archivedAt),
    providerId: task.provider,
    model: resolveTaskModel({ messages, draft: session.promptDraftByTask[task.id], providerId: task.provider }),
    activeTurnId: session.activeTurnIdsByTask[task.id] ?? null,
    pendingApprovalCount: findPendingApprovals(messages).length,
    pendingUserInputCount: findPendingUserInputs(messages).length,
  };
}

/**
 * A supervisor turn that never reached its task: a wake-up that consumed its
 * receipt, or an agent run turn that could not start.
 *
 * `task.turn_failed` rather than a new kind — from the user's side that is
 * exactly what happened, and inventing a supervisor-only kind would widen the
 * notification surface for no new decision. The dedupe key carries the reason
 * so a repeated failure of the same kind collapses into one row.
 */
/**
 * Adds a task to a workspace without starting a turn, for a supervisor that
 * starts the first turn itself (a project starting an agent run on a new task).
 */
export async function createIdleTask(args: { workspaceId: string; title: string; provider: ProviderId; model?: string | null }) {
  const { repositories } = await loadNormalizedRepositories();
  const registration = findWorkspaceRegistration({ repositories, workspaceId: args.workspaceId });
  if (!registration) throw new Error(`Workspace not found: ${args.workspaceId}`);
  const added = addIdleTask(await loadWorkspaceSession(args.workspaceId), args);
  const next = cacheWorkspaceSession(args.workspaceId, added.session);
  await queueWorkspaceSessionPersist({ workspaceId: args.workspaceId, workspaceName: registration.workspace.name, session: next });
  return { taskId: added.taskId };
}

export async function notifySupervisorProblem(args: {
  workspaceId: string;
  taskId: string;
  body: string;
  payload: Record<string, unknown>;
  dedupeKey: string;
}) {
  const { repositories } = await loadNormalizedRepositories();
  const registration = findWorkspaceRegistration({
    repositories,
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
    body: args.body,
    repositoryPath: registration?.project.repositoryPath ?? null,
    repositoryName: registration?.project.repositoryName ?? null,
    workspaceId: args.workspaceId,
    workspaceName: registration?.workspace.name ?? null,
    taskId: args.taskId,
    taskTitle,
    turnId: null,
    providerId: task?.provider ?? null,
    action: null,
    payload: args.payload,
    dedupeKey: args.dedupeKey,
  });
}

export async function notifyWakeUpFailed(args: {
  workspaceId: string;
  taskId: string;
  triggerKind: "schedule" | "completion";
  detail: string;
}) {
  await notifySupervisorProblem({
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    body:
      args.triggerKind === "completion"
        ? `A wake-up could not report finished delegated work: ${args.detail}`
        : `A scheduled wake-up turn could not start: ${args.detail}`,
    payload: { source: "wake-up", triggerKind: args.triggerKind },
    dedupeKey: `wake-up.wake_failed:${args.taskId}:${args.detail}`,
  });
}

async function releaseManagedTaskControl(args: {
  workspaceId: string;
  taskId: string;
  requiredOwner?: TaskControlOwner;
  sourceContexts?: CanonicalRetrievedContextPart[];
}) {
  const { repositories } = await loadNormalizedRepositories();
  const registration = findWorkspaceRegistration({
    repositories,
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
  const sourceContexts = mergeDurableSourceContexts(task.sourceContexts, args.sourceContexts ?? []);
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
  const { sourceContexts: _previous, ...taskWithoutSources } = task;
  const releasedTask: Task = {
    ...taskWithoutSources,
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
  const { repositories } = await loadNormalizedRepositories();
  const registration = findWorkspaceRegistration({
    repositories,
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
    localMcpTurnJournal.flush(activeTurnId);
    ensureHostServicePersistenceReady().completeTurn({
      id: activeTurnId,
      usage: takeTurnUsage(activeTurnId),
      stopReason: "user_abort",
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
  const finish = taskControlGate.beginTakeover(args.taskId);
  try {
    await taskControlGate.waitForStart(args.taskId);
    await stopManagedTaskTurn(args);
    return await releaseManagedTaskControl(args);
  } finally { finish(); }
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
  const { repositories } = await loadNormalizedRepositories();
  const registration = findWorkspaceRegistration({
    repositories,
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
  const { repositories } = await loadNormalizedRepositories();
  const registration = findWorkspaceRegistration({
    repositories,
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

export async function listKnownRepositories() {
  const { repositories } = await loadNormalizedRepositories();
  return repositories.map((repository) => ({
    repositoryPath: repository.repositoryPath,
    repositoryName: repository.repositoryName,
    defaultBranch: repository.defaultBranch,
    activeWorkspaceId: repository.activeWorkspaceId,
    defaultWorkspaceId: resolveCurrentRepositoryDefaultWorkspaceId({
      repositoryPath: repository.repositoryPath,
      workspaces: repository.workspaces,
      workspaceDefaultById: repository.workspaceDefaultById,
    }),
    workspaces: toWorkspaceList(repository),
  }));
}
