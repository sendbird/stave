import type { ChatMessage, EditorTab, PromptDraft, Task } from "@/types/chat";
import type { ReviewComment } from "@/types/review";
import { normalizeMessagesForSnapshot } from "@/lib/task-context/message-normalization";
import {
  parseWorkspaceShell,
  parseWorkspaceShellLite,
  parseWorkspaceSnapshot,
} from "@/lib/task-context/schemas";
import type {
  PaneDockLayout,
  PaneTabMeta,
  WorkspaceLensTab,
} from "@/lib/panes/types";
import type {
  WorkspaceActiveSurface,
  WorkspaceCliSessionTab,
  WorkspaceTerminalTab,
} from "@/lib/terminal/types";
import type { WorkspaceInformationState } from "@/lib/workspace-information";
export interface WorkspaceSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export interface ProviderSessionCursor {
  nativeSessionId: string;
  syncedThroughMessageId?: string;
}

export type TaskProviderSessionEntry = string | ProviderSessionCursor;

export interface TaskProviderSessionState {
  "claude-code"?: TaskProviderSessionEntry;
  codex?: TaskProviderSessionEntry;
  cursor?: TaskProviderSessionEntry;
  kiro?: TaskProviderSessionEntry;
}

export interface WorkspaceSnapshot {
  activeTaskId: string;
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  promptDraftByTask: Record<string, PromptDraft>;
  reviewCommentsByTask?: Record<string, ReviewComment[] | undefined>;
  providerSessionByTask: Record<string, TaskProviderSessionState>;
  editorTabs?: EditorTab[];
  activeEditorTabId?: string | null;
  terminalTabs?: WorkspaceTerminalTab[];
  activeTerminalTabId?: string | null;
  terminalDocked?: boolean;
  cliSessionTabs?: WorkspaceCliSessionTab[];
  activeCliSessionTabId?: string | null;
  activeSurface?: WorkspaceActiveSurface;
  /** Universal pane/tab model — absent on legacy snapshots (migrated at load). */
  openTaskTabIds?: string[];
  lensTabs?: WorkspaceLensTab[];
  paneTabMeta?: Record<string, PaneTabMeta>;
  dockLayout?: PaneDockLayout | null;
  workspaceInformation: WorkspaceInformationState;
}

export interface WorkspaceShell {
  activeTaskId: string;
  tasks: Task[];
  promptDraftByTask: Record<string, PromptDraft>;
  reviewCommentsByTask?: Record<string, ReviewComment[] | undefined>;
  providerSessionByTask: Record<string, TaskProviderSessionState>;
  editorTabs?: EditorTab[];
  activeEditorTabId?: string | null;
  terminalTabs?: WorkspaceTerminalTab[];
  activeTerminalTabId?: string | null;
  terminalDocked?: boolean;
  cliSessionTabs?: WorkspaceCliSessionTab[];
  activeCliSessionTabId?: string | null;
  activeSurface?: WorkspaceActiveSurface;
  /** Universal pane/tab model — absent on legacy shells (migrated at load). */
  openTaskTabIds?: string[];
  lensTabs?: WorkspaceLensTab[];
  paneTabMeta?: Record<string, PaneTabMeta>;
  dockLayout?: PaneDockLayout | null;
  workspaceInformation: WorkspaceInformationState;
  messageCountByTask: Record<string, number>;
}

export interface WorkspaceEditorTabBody {
  id: string;
  content: string;
  originalContent?: string;
  savedContent?: string;
}

function restoreWorkspaceShellEditorTabContentState(
  contentState: EditorTab["contentState"],
): EditorTab["contentState"] {
  return contentState === "too-large" ? "too-large" : "ready";
}

export interface WorkspaceShellLite {
  activeTaskId: string;
  tasks: Task[];
  promptDraftByTask: Record<string, PromptDraft>;
  reviewCommentsByTask?: Record<string, ReviewComment[] | undefined>;
  providerSessionByTask: Record<string, TaskProviderSessionState>;
  messageCountByTask: Record<string, number>;
}

export interface WorkspaceShellSummary {
  activeTaskId: string;
  tasks: Task[];
  messageCountByTask: Record<string, number>;
  terminalTabCount: number;
  cliSessionTabCount: number;
  /** Absent on legacy/pre-field summaries — "unknown", not "nothing open". */
  openTaskTabIds?: string[];
}

export interface TaskMessagesPage {
  messages: ChatMessage[];
  totalCount: number;
  limit: number;
  offset: number;
  hasMoreOlder: boolean;
}

interface RequiredPersistenceApi {
  listWorkspaces: () => Promise<{
    ok: boolean;
    rows: Array<{ id: string; name: string; updatedAt: string }>;
  }>;
  loadWorkspaceShell?: (args: { workspaceId: string }) => Promise<{
    ok: boolean;
    shell: WorkspaceShell | null;
  }>;
  loadWorkspaceShellForRestore?: (args: { workspaceId: string }) => Promise<{
    ok: boolean;
    shell: WorkspaceShell | null;
  }>;
  loadWorkspaceShellLite?: (args: { workspaceId: string }) => Promise<{
    ok: boolean;
    shellLite: WorkspaceShellLite | null;
  }>;
  loadWorkspaceShellSummary?: (args: { workspaceId: string }) => Promise<{
    ok: boolean;
    summary: WorkspaceShellSummary | null;
  }>;
  loadWorkspace: (args: { workspaceId: string }) => Promise<{
    ok: boolean;
    snapshot: WorkspaceSnapshot | null;
  }>;
  loadTaskMessages?: (args: {
    workspaceId: string;
    taskId: string;
    limit?: number;
    offset?: number;
  }) => Promise<{
    ok: boolean;
    page: TaskMessagesPage | null;
  }>;
  truncateTaskMessagesAfter?: (args: {
    workspaceId: string;
    taskId: string;
    messageId: string;
  }) => Promise<{
    ok: boolean;
    removedCount: number;
  }>;
  loadWorkspaceEditorTabBodies?: (args: {
    workspaceId: string;
    tabIds: string[];
  }) => Promise<{
    ok: boolean;
    bodies: WorkspaceEditorTabBody[];
  }>;
  upsertWorkspace: (args: {
    id: string;
    name: string;
    snapshot: WorkspaceSnapshot;
  }) => Promise<{ ok: boolean }>;
  loadProjectRegistry: () => Promise<{
    ok: boolean;
    projects: unknown[];
    activeProjectPath?: string | null;
  }>;
  saveProjectRegistry: (args: {
    projects: unknown[];
    activeProjectPath?: string | null;
  }) => Promise<{ ok: boolean }>;
  closeWorkspace: (args: { workspaceId: string }) => Promise<{ ok: boolean }>;
}

const fallbackStorageKey = "stave:workspace-fallback:v1";
let memoryFallbackRows: Array<{
  id: string;
  name: string;
  updatedAt: string;
  snapshot: WorkspaceSnapshot;
}> = [];

function hasWindow() {
  return typeof window !== "undefined";
}

function loadFallbackRows() {
  if (!hasWindow()) {
    return memoryFallbackRows;
  }
  try {
    const raw = window.localStorage.getItem(fallbackStorageKey);
    if (!raw) {
      return memoryFallbackRows;
    }
    const parsed = JSON.parse(raw) as Array<{
      id: string;
      name: string;
      updatedAt: string;
      snapshot: WorkspaceSnapshot;
    }>;
    memoryFallbackRows = Array.isArray(parsed) ? parsed : memoryFallbackRows;
    return memoryFallbackRows;
  } catch {
    return memoryFallbackRows;
  }
}

function saveFallbackRows(args: {
  rows: Array<{
    id: string;
    name: string;
    updatedAt: string;
    snapshot: WorkspaceSnapshot;
  }>;
}) {
  if (hasWindow()) {
    // A caller awaiting a save needs durable acknowledgement, including in
    // browser mode. Do not replace the last saved cache after a quota failure.
    window.localStorage.setItem(fallbackStorageKey, JSON.stringify(args.rows));
  }
  memoryFallbackRows = args.rows;
}

function preserveUnloadedFallbackTaskMessages(args: {
  existingSnapshot: WorkspaceSnapshot;
  nextSnapshot: WorkspaceSnapshot;
}): WorkspaceSnapshot {
  const retainedTaskIds = new Set(
    args.nextSnapshot.tasks.map((task) => task.id),
  );
  const retainedMessages = Object.fromEntries(
    Object.entries(args.existingSnapshot.messagesByTask).filter(
      ([taskId]) =>
        retainedTaskIds.has(taskId) &&
        !Object.prototype.hasOwnProperty.call(
          args.nextSnapshot.messagesByTask,
          taskId,
        ),
    ),
  );
  if (Object.keys(retainedMessages).length === 0) {
    return args.nextSnapshot;
  }
  return {
    ...args.nextSnapshot,
    messagesByTask: {
      ...retainedMessages,
      ...args.nextSnapshot.messagesByTask,
    },
  };
}

function getPersistenceApi() {
  const api = window.api?.persistence;
  if (!api?.listWorkspaces || !api?.loadWorkspace || !api?.upsertWorkspace) {
    return null;
  }
  return api as RequiredPersistenceApi;
}

function buildShellFromSnapshot(snapshot: WorkspaceSnapshot): WorkspaceShell {
  return {
    activeTaskId: snapshot.activeTaskId,
    tasks: snapshot.tasks,
    promptDraftByTask: snapshot.promptDraftByTask,
    reviewCommentsByTask: snapshot.reviewCommentsByTask,
    providerSessionByTask: snapshot.providerSessionByTask,
    editorTabs: snapshot.editorTabs,
    activeEditorTabId: snapshot.activeEditorTabId,
    terminalTabs: snapshot.terminalTabs,
    activeTerminalTabId: snapshot.activeTerminalTabId,
    terminalDocked: snapshot.terminalDocked,
    cliSessionTabs: snapshot.cliSessionTabs,
    activeCliSessionTabId: snapshot.activeCliSessionTabId,
    activeSurface: snapshot.activeSurface,
    openTaskTabIds: snapshot.openTaskTabIds,
    lensTabs: snapshot.lensTabs,
    paneTabMeta: snapshot.paneTabMeta,
    dockLayout: snapshot.dockLayout,
    workspaceInformation: snapshot.workspaceInformation,
    messageCountByTask: Object.fromEntries(
      Object.entries(snapshot.messagesByTask).map(
        ([taskId, messages]) => [taskId, messages.length] as const,
      ),
    ),
  };
}

function buildShellSummaryFromSnapshot(
  snapshot: WorkspaceSnapshot,
): WorkspaceShellSummary {
  return {
    activeTaskId: snapshot.activeTaskId,
    tasks: snapshot.tasks,
    messageCountByTask: Object.fromEntries(
      Object.entries(snapshot.messagesByTask).map(
        ([taskId, messages]) => [taskId, messages.length] as const,
      ),
    ),
    terminalTabCount: snapshot.terminalTabs?.length ?? 0,
    cliSessionTabCount: snapshot.cliSessionTabs?.length ?? 0,
    openTaskTabIds: snapshot.openTaskTabIds,
  };
}

function buildShellLiteFromShell(shell: WorkspaceShell): WorkspaceShellLite {
  return {
    activeTaskId: shell.activeTaskId,
    tasks: shell.tasks,
    promptDraftByTask: shell.promptDraftByTask,
    reviewCommentsByTask: shell.reviewCommentsByTask,
    providerSessionByTask: shell.providerSessionByTask,
    messageCountByTask: shell.messageCountByTask,
  };
}

function buildShellLiteFromSnapshot(
  snapshot: WorkspaceSnapshot,
): WorkspaceShellLite {
  return buildShellLiteFromShell(buildShellFromSnapshot(snapshot));
}

export async function listWorkspaceSummaries(): Promise<WorkspaceSummary[]> {
  const persistence = getPersistenceApi();
  if (!persistence) {
    return loadFallbackRows()
      .map((row) => ({ id: row.id, name: row.name, updatedAt: row.updatedAt }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
  const response = await persistence.listWorkspaces();
  if (!response.ok) {
    throw new Error("Failed to list workspaces from persistence bridge.");
  }
  return response.rows;
}

export async function loadWorkspaceSnapshot(args: {
  workspaceId: string;
}): Promise<WorkspaceSnapshot | null> {
  const persistence = getPersistenceApi();
  if (!persistence) {
    const row = loadFallbackRows().find((item) => item.id === args.workspaceId);
    if (!row) {
      return null;
    }
    const parsed = parseWorkspaceSnapshot({ payload: row.snapshot });
    if (!parsed) {
      return null;
    }
    return {
      ...parsed,
      messagesByTask: normalizeMessagesForSnapshot({
        messagesByTask: parsed.messagesByTask,
      }),
    };
  }
  const response = await persistence.loadWorkspace({
    workspaceId: args.workspaceId,
  });
  if (!response.ok) {
    throw new Error(`Failed to load workspace snapshot: ${args.workspaceId}`);
  }
  if (!response.snapshot) {
    return null;
  }
  const parsed = parseWorkspaceSnapshot({ payload: response.snapshot });
  if (!parsed) {
    return null;
  }
  return {
    ...parsed,
    messagesByTask: normalizeMessagesForSnapshot({
      messagesByTask: parsed.messagesByTask,
    }),
  };
}

export async function loadWorkspaceShell(args: {
  workspaceId: string;
}): Promise<WorkspaceShell | null> {
  const persistence = getPersistenceApi();
  if (!persistence) {
    const row = loadFallbackRows().find((item) => item.id === args.workspaceId);
    if (!row) {
      return null;
    }
    const parsed = parseWorkspaceSnapshot({ payload: row.snapshot });
    if (!parsed) {
      return null;
    }
    return buildShellFromSnapshot({
      ...parsed,
      messagesByTask: normalizeMessagesForSnapshot({
        messagesByTask: parsed.messagesByTask,
      }),
    });
  }

  if (!persistence.loadWorkspaceShell) {
    const snapshot = await loadWorkspaceSnapshot(args);
    return snapshot ? buildShellFromSnapshot(snapshot) : null;
  }

  const response = await persistence.loadWorkspaceShell({
    workspaceId: args.workspaceId,
  });
  if (!response.ok) {
    throw new Error(`Failed to load workspace shell: ${args.workspaceId}`);
  }
  if (!response.shell) {
    return null;
  }
  const parsed = parseWorkspaceShell({ payload: response.shell });
  return parsed;
}

export async function loadWorkspaceShellForRestore(args: {
  workspaceId: string;
}): Promise<WorkspaceShell | null> {
  const persistence = getPersistenceApi();
  if (!persistence) {
    const shell = await loadWorkspaceShell(args);
    return shell
      ? {
          ...shell,
          editorTabs: shell.editorTabs?.map((tab) => ({
            ...tab,
            contentState: restoreWorkspaceShellEditorTabContentState(
              tab.contentState,
            ),
          })),
        }
      : null;
  }

  if (!persistence.loadWorkspaceShellForRestore) {
    const shell = await loadWorkspaceShell(args);
    return shell
      ? {
          ...shell,
          editorTabs: shell.editorTabs?.map((tab) => ({
            ...tab,
            contentState: restoreWorkspaceShellEditorTabContentState(
              tab.contentState,
            ),
          })),
        }
      : null;
  }

  const response = await persistence.loadWorkspaceShellForRestore({
    workspaceId: args.workspaceId,
  });
  if (!response.ok) {
    throw new Error(
      `Failed to load workspace shell for restore: ${args.workspaceId}`,
    );
  }
  if (!response.shell) {
    return null;
  }
  return parseWorkspaceShell({ payload: response.shell });
}

export async function loadWorkspaceShellLite(args: {
  workspaceId: string;
}): Promise<WorkspaceShellLite | null> {
  const persistence = getPersistenceApi();
  if (!persistence) {
    const row = loadFallbackRows().find((item) => item.id === args.workspaceId);
    const parsed = row?.snapshot
      ? parseWorkspaceSnapshot({ payload: row.snapshot })
      : null;
    return parsed ? buildShellLiteFromSnapshot(parsed) : null;
  }

  if (!persistence.loadWorkspaceShellLite) {
    const shell = await loadWorkspaceShell(args);
    return shell ? buildShellLiteFromShell(shell) : null;
  }

  const response = await persistence.loadWorkspaceShellLite({
    workspaceId: args.workspaceId,
  });
  if (!response.ok) {
    throw new Error(`Failed to load workspace shell lite: ${args.workspaceId}`);
  }

  return response.shellLite
    ? parseWorkspaceShellLite({ payload: response.shellLite })
    : null;
}

export async function loadWorkspaceShellSummary(args: {
  workspaceId: string;
}): Promise<WorkspaceShellSummary | null> {
  const persistence = getPersistenceApi();
  if (!persistence) {
    const row = loadFallbackRows().find((item) => item.id === args.workspaceId);
    const snapshot = row?.snapshot
      ? parseWorkspaceSnapshot({ payload: row.snapshot })
      : null;
    return snapshot ? buildShellSummaryFromSnapshot(snapshot) : null;
  }

  if (!persistence.loadWorkspaceShellSummary) {
    const shell = await loadWorkspaceShell(args);
    if (!shell) {
      return null;
    }
    return {
      activeTaskId: shell.activeTaskId,
      tasks: shell.tasks,
      messageCountByTask: shell.messageCountByTask,
      terminalTabCount: shell.terminalTabs?.length ?? 0,
      cliSessionTabCount: shell.cliSessionTabs?.length ?? 0,
      openTaskTabIds: shell.openTaskTabIds,
    };
  }

  const response = await persistence.loadWorkspaceShellSummary({
    workspaceId: args.workspaceId,
  });
  if (!response.ok) {
    throw new Error(
      `Failed to load workspace shell summary: ${args.workspaceId}`,
    );
  }

  return response.summary
    ? {
        activeTaskId: response.summary.activeTaskId,
        tasks: response.summary.tasks,
        messageCountByTask: response.summary.messageCountByTask ?? {},
        terminalTabCount: response.summary.terminalTabCount ?? 0,
        cliSessionTabCount: response.summary.cliSessionTabCount ?? 0,
        openTaskTabIds: response.summary.openTaskTabIds,
      }
    : null;
}

export async function loadTaskMessagesPage(args: {
  workspaceId: string;
  taskId: string;
  limit?: number;
  offset?: number;
}): Promise<TaskMessagesPage> {
  const limit = Math.max(1, Math.min(500, args.limit ?? 120));
  const offset = Math.max(0, args.offset ?? 0);
  const persistence = getPersistenceApi();
  if (!persistence) {
    const row = loadFallbackRows().find((item) => item.id === args.workspaceId);
    const snapshot = row?.snapshot
      ? parseWorkspaceSnapshot({ payload: row.snapshot })
      : null;
    const messages =
      normalizeMessagesForSnapshot({
        messagesByTask: snapshot?.messagesByTask ?? {},
      })[args.taskId] ?? [];
    const start = Math.max(messages.length - offset - limit, 0);
    const end = Math.max(messages.length - offset, 0);
    const pageMessages = messages.slice(start, end);
    return {
      messages: pageMessages,
      totalCount: messages.length,
      limit,
      offset,
      hasMoreOlder: start > 0,
    };
  }

  if (!persistence.loadTaskMessages) {
    const snapshot = await loadWorkspaceSnapshot({
      workspaceId: args.workspaceId,
    });
    const messages = snapshot?.messagesByTask[args.taskId] ?? [];
    const start = Math.max(messages.length - offset - limit, 0);
    const end = Math.max(messages.length - offset, 0);
    const pageMessages = messages.slice(start, end);
    return {
      messages: pageMessages,
      totalCount: messages.length,
      limit,
      offset,
      hasMoreOlder: start > 0,
    };
  }

  const response = await persistence.loadTaskMessages({
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    limit,
    offset,
  });
  if (!response.ok || !response.page) {
    throw new Error(
      `Failed to load task messages: ${args.workspaceId}/${args.taskId}`,
    );
  }
  return {
    messages:
      normalizeMessagesForSnapshot({
        messagesByTask: { [args.taskId]: response.page.messages },
      })[args.taskId] ?? [],
    totalCount: response.page.totalCount,
    limit: response.page.limit,
    offset: response.page.offset,
    hasMoreOlder: response.page.hasMoreOlder,
  };
}

export async function loadAllTaskMessages(args: {
  workspaceId: string;
  taskId: string;
}): Promise<ChatMessage[]> {
  const pageSize = 500;
  let offset = 0;
  const pages: ChatMessage[][] = [];

  while (true) {
    const page = await loadTaskMessagesPage({
      ...args,
      limit: pageSize,
      offset,
    });
    pages.push(page.messages);
    if (!page.hasMoreOlder || page.messages.length === 0) {
      return pages.reverse().flat();
    }
    offset += page.messages.length;
  }
}

export async function truncateTaskMessagesAfter(args: {
  workspaceId: string;
  taskId: string;
  messageId: string;
}): Promise<number> {
  const persistence = getPersistenceApi();
  if (!persistence) {
    const rows = loadFallbackRows();
    let removedCount = 0;
    const nextRows = rows.map((row) => {
      if (row.id !== args.workspaceId) {
        return row;
      }
      const messages = row.snapshot.messagesByTask[args.taskId] ?? [];
      const targetIndex = messages.findIndex(
        (message) => message.id === args.messageId,
      );
      if (targetIndex < 0) {
        return row;
      }
      removedCount = messages.length - targetIndex - 1;
      return {
        ...row,
        snapshot: {
          ...row.snapshot,
          messagesByTask: {
            ...row.snapshot.messagesByTask,
            [args.taskId]: messages.slice(0, targetIndex + 1),
          },
        },
      };
    });
    saveFallbackRows({ rows: nextRows });
    return removedCount;
  }
  if (!persistence.truncateTaskMessagesAfter) {
    throw new Error(
      "The persistence bridge does not support conversation rollback.",
    );
  }

  const response = await persistence.truncateTaskMessagesAfter(args);
  if (!response.ok) {
    throw new Error(
      `Failed to truncate task messages: ${args.workspaceId}/${args.taskId}/${args.messageId}`,
    );
  }
  return response.removedCount;
}

export async function loadWorkspaceEditorTabBodies(args: {
  workspaceId: string;
  tabIds: string[];
}): Promise<WorkspaceEditorTabBody[]> {
  if (args.tabIds.length === 0) {
    return [];
  }

  const persistence = getPersistenceApi();
  if (!persistence) {
    const snapshot = await loadWorkspaceSnapshot({
      workspaceId: args.workspaceId,
    });
    const requestedIds = new Set(args.tabIds);
    return (snapshot?.editorTabs ?? [])
      .filter((tab) => requestedIds.has(tab.id))
      .map((tab) => ({
        id: tab.id,
        content: tab.content ?? "",
        ...(tab.originalContent !== undefined
          ? { originalContent: tab.originalContent }
          : {}),
        ...(tab.savedContent !== undefined
          ? { savedContent: tab.savedContent }
          : {}),
      }));
  }

  if (!persistence.loadWorkspaceEditorTabBodies) {
    const shell = await loadWorkspaceShell({ workspaceId: args.workspaceId });
    const requestedIds = new Set(args.tabIds);
    return (shell?.editorTabs ?? [])
      .filter((tab) => requestedIds.has(tab.id))
      .map((tab) => ({
        id: tab.id,
        content: tab.content ?? "",
        ...(tab.originalContent !== undefined
          ? { originalContent: tab.originalContent }
          : {}),
        ...(tab.savedContent !== undefined
          ? { savedContent: tab.savedContent }
          : {}),
      }));
  }

  const response = await persistence.loadWorkspaceEditorTabBodies({
    workspaceId: args.workspaceId,
    tabIds: args.tabIds,
  });
  if (!response.ok) {
    throw new Error(
      `Failed to load workspace editor tab bodies: ${args.workspaceId}`,
    );
  }
  return response.bodies;
}

export async function closeWorkspacePersistence(args: {
  workspaceId: string;
}): Promise<void> {
  const persistence = getPersistenceApi();
  if (!persistence) {
    const rows = loadFallbackRows().filter(
      (row) => row.id !== args.workspaceId,
    );
    saveFallbackRows({ rows });
    return;
  }
  await window.api?.persistence?.closeWorkspace?.({
    workspaceId: args.workspaceId,
  });
}

export async function loadProjectRegistrySnapshot(): Promise<unknown[]> {
  return (await loadProjectRegistryState()).projects;
}

export async function loadProjectRegistryState(): Promise<{ projects: unknown[]; activeProjectPath?: string | null }> {
  const persistence = getPersistenceApi();
  if (!persistence?.loadProjectRegistry) {
    return { projects: [] };
  }
  const response = await persistence.loadProjectRegistry();
  if (!response.ok) {
    throw new Error("Failed to load project registry from persistence bridge.");
  }
  return { projects: Array.isArray(response.projects) ? response.projects : [], activeProjectPath: response.activeProjectPath };
}

export async function saveProjectRegistrySnapshot(args: {
  projects: unknown[];
  activeProjectPath?: string | null;
}): Promise<void> {
  const persistence = getPersistenceApi();
  if (!persistence?.saveProjectRegistry) {
    return;
  }
  const response = await persistence.saveProjectRegistry({
    projects: args.projects,
    activeProjectPath: args.activeProjectPath,
  });
  if (!response.ok) {
    throw new Error("Failed to save project registry via persistence bridge.");
  }
}

export async function upsertWorkspace(args: {
  id: string;
  name: string;
  snapshot: WorkspaceSnapshot;
}): Promise<void> {
  const validated = parseWorkspaceSnapshot({ payload: args.snapshot });
  if (!validated) {
    throw new Error(`Invalid workspace snapshot for upsert: ${args.id}`);
  }
  const normalized: WorkspaceSnapshot = {
    ...validated,
    messagesByTask: normalizeMessagesForSnapshot({
      messagesByTask: validated.messagesByTask,
    }),
  };
  const persistence = getPersistenceApi();
  if (!persistence) {
    const rows = loadFallbackRows();
    const nextUpdatedAt = new Date().toISOString();
    const nextRows = (() => {
      const existingIndex = rows.findIndex((row) => row.id === args.id);
      if (existingIndex < 0) {
        return [
          ...rows,
          {
            id: args.id,
            name: args.name,
            updatedAt: nextUpdatedAt,
            snapshot: normalized,
          },
        ];
      }
      return rows.map((row, index) =>
        index === existingIndex
          ? {
              id: args.id,
              name: args.name,
              updatedAt: nextUpdatedAt,
              // Browser fallback snapshots share the desktop store's
              // paged-message contract: an omitted task is unloaded, not
              // empty. Keep its durable messages until the task itself is
              // removed or an explicit array replaces them.
              snapshot: preserveUnloadedFallbackTaskMessages({
                existingSnapshot: row.snapshot,
                nextSnapshot: normalized,
              }),
            }
          : row,
      );
    })();
    saveFallbackRows({ rows: nextRows });
    return;
  }
  const response = await persistence.upsertWorkspace({
    id: args.id,
    name: args.name,
    snapshot: normalized,
  });
  if (!response.ok) {
    throw new Error(`Failed to upsert workspace snapshot: ${args.id}`);
  }
}
