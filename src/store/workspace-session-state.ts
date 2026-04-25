import { type PersistedTurnSummary } from "@/lib/db/turns.db";
import {
  type TaskProviderSessionState,
  type WorkspaceShell,
  type WorkspaceSnapshot,
  loadWorkspaceShellLite,
  upsertWorkspace,
} from "@/lib/db/workspaces.db";
import type {
  WorkspaceActiveSurface,
  WorkspaceCliSessionTab,
  WorkspaceTerminalTab,
} from "@/lib/terminal/types";
import { isTaskArchived, normalizeTaskControl } from "@/lib/tasks";
import { normalizeMessagesForSnapshot } from "@/lib/task-context/message-normalization";
import { createEmptyWorkspaceInformation, type WorkspaceInformationState } from "@/lib/workspace-information";
import { interruptPendingToolInteractionsInMessages } from "@/store/provider-message.utils";
import {
  reapColiseumOrphans,
  stripColiseumBranchesFromRecords,
} from "@/store/coliseum.utils";
import type { ChatMessage, ColiseumGroupState, EditorTab, PromptDraft, Task } from "@/types/chat";

export const starterWorkspaceId = "base";
export const defaultWorkspaceName = "Default Workspace";
export const INTERRUPTED_TURN_NOTICE = "Generation interrupted because Stave was closed before this turn completed.";
export const WORKSPACE_SWITCH_TURN_NOTICE = "Generation interrupted because you switched workspaces before this turn completed.";

export interface WorkspaceSessionState {
  activeTaskId: string;
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  messageCountByTask: Record<string, number>;
  promptDraftByTask: Record<string, PromptDraft>;
  workspaceInformation: WorkspaceInformationState;
  editorTabs: EditorTab[];
  activeEditorTabId: string | null;
  terminalTabs: WorkspaceTerminalTab[];
  activeTerminalTabId: string | null;
  terminalDocked: boolean;
  cliSessionTabs: WorkspaceCliSessionTab[];
  activeCliSessionTabId: string | null;
  activeSurface: WorkspaceActiveSurface;
  activeTurnIdsByTask: Record<string, string | undefined>;
  providerSessionByTask: Record<string, TaskProviderSessionState>;
  nativeSessionReadyByTask: Record<string, boolean>;
  /**
   * Runtime-only state for in-flight Coliseums (multi-model parallel turns),
   * keyed by the parent task id. Not persisted — branches are ephemeral child
   * tasks and orphaned branches are reaped on workspace bootstrap if their
   * parent's group is gone.
   */
  activeColiseumsByTask: Record<string, ColiseumGroupState | undefined>;
}

export function createEmptyWorkspaceState() {
  return {
    activeTaskId: "",
    tasks: [] as Task[],
    messagesByTask: {} as Record<string, ChatMessage[]>,
    messageCountByTask: {} as Record<string, number>,
    promptDraftByTask: {} as Record<string, PromptDraft>,
    workspaceInformation: createEmptyWorkspaceInformation(),
    editorTabs: [] as EditorTab[],
    activeEditorTabId: null as string | null,
    terminalTabs: [] as WorkspaceTerminalTab[],
    activeTerminalTabId: null as string | null,
    terminalDocked: false,
    cliSessionTabs: [] as WorkspaceCliSessionTab[],
    activeCliSessionTabId: null as string | null,
    activeSurface: { kind: "task", taskId: "" } as WorkspaceActiveSurface,
    providerSessionByTask: {} as Record<string, TaskProviderSessionState>,
  };
}

function normalizeTerminalState(args: {
  tasks: Task[];
  terminalTabs: WorkspaceTerminalTab[];
  activeTerminalTabId: string | null;
}) {
  const activeTaskIds = new Set(
    args.tasks
      .filter((task) => !isTaskArchived(task))
      .map((task) => task.id),
  );
  const seenTabIds = new Set<string>();
  const terminalTabs = args.terminalTabs.filter((tab) => {
    if (seenTabIds.has(tab.id)) {
      return false;
    }
    seenTabIds.add(tab.id);
    return true;
  }).map((tab) => ({
    ...tab,
    linkedTaskId: tab.linkedTaskId && activeTaskIds.has(tab.linkedTaskId)
      ? tab.linkedTaskId
      : null,
  }));
  const activeTerminalTabId = terminalTabs.some((tab) => tab.id === args.activeTerminalTabId)
    ? args.activeTerminalTabId
    : null;

  return {
    terminalTabs,
    activeTerminalTabId,
  };
}

function normalizeCliSessionState(args: {
  tasks: Task[];
  cliSessionTabs: WorkspaceCliSessionTab[];
  activeCliSessionTabId: string | null;
}) {
  const activeTaskIds = new Set(
    args.tasks
      .filter((task) => !isTaskArchived(task))
      .map((task) => task.id),
  );
  const seenTabIds = new Set<string>();
  const cliSessionTabs = args.cliSessionTabs.filter((tab) => {
    if (seenTabIds.has(tab.id)) {
      return false;
    }
    seenTabIds.add(tab.id);
    return true;
  }).map((tab) => ({
    ...tab,
    linkedTaskId: tab.linkedTaskId && activeTaskIds.has(tab.linkedTaskId)
      ? tab.linkedTaskId
      : null,
  }));
  const activeCliSessionTabId = cliSessionTabs.some((tab) => tab.id === args.activeCliSessionTabId)
    ? args.activeCliSessionTabId
    : null;

  return {
    cliSessionTabs,
    activeCliSessionTabId,
  };
}

function resolveActiveSurface(args: {
  tasks: Task[];
  activeTaskId: string;
  cliSessionTabs: WorkspaceCliSessionTab[];
  activeCliSessionTabId: string | null;
  activeSurface: WorkspaceActiveSurface;
}) {
  const hasTask = (taskId: string) => args.tasks.some((task) => task.id === taskId && !isTaskArchived(task));
  const hasCliSession = (cliSessionTabId: string) =>
    args.cliSessionTabs.some((tab) => tab.id === cliSessionTabId);

  if (args.activeSurface.kind === "task" && hasTask(args.activeSurface.taskId)) {
    return args.activeSurface;
  }
  if (args.activeSurface.kind === "cli-session" && hasCliSession(args.activeSurface.cliSessionTabId)) {
    return args.activeSurface;
  }

  if (hasTask(args.activeTaskId)) {
    return { kind: "task", taskId: args.activeTaskId } satisfies WorkspaceActiveSurface;
  }

  if (args.activeCliSessionTabId && hasCliSession(args.activeCliSessionTabId)) {
    return { kind: "cli-session", cliSessionTabId: args.activeCliSessionTabId } satisfies WorkspaceActiveSurface;
  }

  const fallbackTaskId = args.tasks.find((task) => !isTaskArchived(task))?.id ?? "";
  if (fallbackTaskId) {
    return { kind: "task", taskId: fallbackTaskId } satisfies WorkspaceActiveSurface;
  }

  const fallbackCliSessionId = args.cliSessionTabs[0]?.id ?? "";
  if (fallbackCliSessionId) {
    return { kind: "cli-session", cliSessionTabId: fallbackCliSessionId } satisfies WorkspaceActiveSurface;
  }

  return { kind: "task", taskId: "" } satisfies WorkspaceActiveSurface;
}

function resolveActiveTaskId(args: {
  tasks: Task[];
  activeTaskId: string;
}) {
  const selectedTask = args.tasks.find((task) => task.id === args.activeTaskId && !isTaskArchived(task)) ?? null;
  if (selectedTask) {
    return selectedTask.id;
  }

  return args.tasks.find((task) => !isTaskArchived(task))?.id ?? "";
}

export function buildNativeSessionReadyByTask(args: {
  tasks: Task[];
  providerSessionByTask: Record<string, TaskProviderSessionState>;
}) {
  const next: Record<string, boolean> = {};

  for (const task of args.tasks) {
    const providerSession = args.providerSessionByTask[task.id];
    // stave has no native conversation of its own; treat as not ready
    next[task.id] = task.provider !== "stave" && Boolean(providerSession?.[task.provider]?.trim());
  }

  return next;
}

function buildMessageId(args: { taskId: string; count: number }) {
  return `${args.taskId}-m-${args.count + 1}`;
}

function buildRecentTimestamp() {
  return new Date().toISOString();
}

function hasInterruptedTurnNotice(messages: ChatMessage[]) {
  return messages.some((message) =>
    message.role === "assistant"
    && message.parts.some((part) => part.type === "system_event" && part.content === INTERRUPTED_TURN_NOTICE)
  );
}

function createInterruptedTurnNoticeMessage(args: { taskId: string; count: number }): ChatMessage {
  const timestamp = buildRecentTimestamp();
  return {
    id: buildMessageId({ taskId: args.taskId, count: args.count }),
    role: "assistant",
    model: "system",
    providerId: "user",
    content: INTERRUPTED_TURN_NOTICE,
    startedAt: timestamp,
    completedAt: timestamp,
    isStreaming: false,
    parts: [{
      type: "system_event",
      content: INTERRUPTED_TURN_NOTICE,
    }],
  };
}

export function appendInterruptedTurnNotices(args: {
  messagesByTask: Record<string, ChatMessage[]>;
  latestTurns?: PersistedTurnSummary[];
}) {
  const latestTurns = args.latestTurns ?? [];
  if (latestTurns.length === 0) {
    return args.messagesByTask;
  }

  let changed = false;
  const nextMessagesByTask = { ...args.messagesByTask };

  for (const turn of latestTurns) {
    if (turn.completedAt !== null) {
      continue;
    }

    const currentMessages = nextMessagesByTask[turn.taskId] ?? [];
    const interruptedMessages = interruptPendingToolInteractionsInMessages({
      messages: currentMessages,
    });
    const alreadyInterrupted = hasInterruptedTurnNotice(interruptedMessages);
    if (alreadyInterrupted && interruptedMessages === currentMessages) {
      continue;
    }

    nextMessagesByTask[turn.taskId] = alreadyInterrupted
      ? interruptedMessages
      : [
          ...interruptedMessages,
          createInterruptedTurnNoticeMessage({
            taskId: turn.taskId,
            count: interruptedMessages.length,
          }),
        ];
    changed = true;
  }

  return changed ? nextMessagesByTask : args.messagesByTask;
}

function hasSystemNotice(args: { messages: ChatMessage[]; notice: string }) {
  return args.messages.some((message) =>
    message.role === "assistant"
    && message.parts.some((part) => part.type === "system_event" && part.content === args.notice)
  );
}

function createSystemNoticeMessage(args: { taskId: string; count: number; notice: string }): ChatMessage {
  return {
    id: buildMessageId({ taskId: args.taskId, count: args.count }),
    role: "assistant",
    model: "system",
    providerId: "user",
    content: args.notice,
    isStreaming: false,
    parts: [{
      type: "system_event",
      content: args.notice,
    }],
  };
}

export function interruptActiveTaskTurns(args: {
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  activeTurnIdsByTask: Record<string, string | undefined>;
  notice: string;
}) {
  const interruptedTaskIds: string[] = [];
  let messagesChanged = false;
  let turnsChanged = false;
  const nextMessagesByTask = { ...args.messagesByTask };
  const nextActiveTurnIdsByTask = { ...args.activeTurnIdsByTask };

  for (const task of args.tasks) {
    if (!args.activeTurnIdsByTask[task.id]) {
      continue;
    }

    interruptedTaskIds.push(task.id);
    if (nextActiveTurnIdsByTask[task.id] !== undefined) {
      nextActiveTurnIdsByTask[task.id] = undefined;
      turnsChanged = true;
    }

    const currentMessages = nextMessagesByTask[task.id] ?? [];
    const interruptedMessages = interruptPendingToolInteractionsInMessages({
      messages: currentMessages,
    });
    let taskMessagesChanged = interruptedMessages !== currentMessages;
    const finalizedMessages = interruptedMessages.map((message) => (
        message.isStreaming
          ? { ...message, completedAt: message.completedAt ?? buildRecentTimestamp(), isStreaming: false }
          : message
      ));
    if (finalizedMessages.some((message, index) => message !== interruptedMessages[index])) {
      taskMessagesChanged = true;
    }

    const hasNotice = hasSystemNotice({ messages: finalizedMessages, notice: args.notice });
    const nextMessages = hasNotice
      ? finalizedMessages
      : [
          ...finalizedMessages,
          createSystemNoticeMessage({
            taskId: task.id,
            count: finalizedMessages.length,
            notice: args.notice,
          }),
        ];

    if (!hasNotice || taskMessagesChanged) {
      nextMessagesByTask[task.id] = nextMessages;
      messagesChanged = true;
    }
  }

  return {
    interruptedTaskIds,
    messagesByTask: messagesChanged ? nextMessagesByTask : args.messagesByTask,
    activeTurnIdsByTask: turnsChanged ? nextActiveTurnIdsByTask : args.activeTurnIdsByTask,
  };
}

export function buildWorkspaceSessionState(args: {
  snapshot: WorkspaceSnapshot | null;
  latestTurns?: PersistedTurnSummary[];
  appendInterruptedNotices?: boolean;
}): WorkspaceSessionState {
  const empty = createEmptyWorkspaceState();
  const rawTasks = (args.snapshot?.tasks ?? empty.tasks).map(normalizeTaskControl);
  // Coliseum branch tasks are runtime-only — if any survived the snapshot
  // (process crash mid-contest), drop them here since there's no live group
  // state on bootstrap.
  const { tasks, orphanedBranchTaskIds } = reapColiseumOrphans({
    tasks: rawTasks,
    activeColiseumsByTask: {},
  });
  const rawProviderSessionByTask =
    args.snapshot?.providerSessionByTask ?? empty.providerSessionByTask;
  const providerSessionByTask = stripColiseumBranchesFromRecords(
    rawProviderSessionByTask,
    orphanedBranchTaskIds,
  );
  const rawMessagesByTask = args.appendInterruptedNotices
    ? appendInterruptedTurnNotices({
        messagesByTask: args.snapshot?.messagesByTask ?? empty.messagesByTask,
        latestTurns: args.latestTurns,
      })
    : (args.snapshot?.messagesByTask ?? empty.messagesByTask);
  const messagesByTask = stripColiseumBranchesFromRecords(
    rawMessagesByTask,
    orphanedBranchTaskIds,
  );
  const messageCountByTask = Object.fromEntries(
    Object.entries(messagesByTask).map(([taskId, messages]) => [taskId, messages.length] as const),
  ) as Record<string, number>;
  const editorTabs = args.snapshot?.editorTabs ?? empty.editorTabs;
  const requestedActiveEditorTabId = args.snapshot?.activeEditorTabId ?? empty.activeEditorTabId;
  const activeEditorTabId = editorTabs.some((tab) => tab.id === requestedActiveEditorTabId)
    ? requestedActiveEditorTabId
    : (editorTabs[0]?.id ?? null);
  const normalizedTerminalState = normalizeTerminalState({
    tasks,
    terminalTabs: args.snapshot?.terminalTabs ?? empty.terminalTabs,
    activeTerminalTabId: args.snapshot?.activeTerminalTabId ?? empty.activeTerminalTabId,
  });
  const normalizedCliSessionState = normalizeCliSessionState({
    tasks,
    cliSessionTabs: args.snapshot?.cliSessionTabs ?? empty.cliSessionTabs,
    activeCliSessionTabId: args.snapshot?.activeCliSessionTabId ?? empty.activeCliSessionTabId,
  });
  const activeTurnIdsByTask = Object.fromEntries(
    (args.latestTurns ?? [])
      .filter((turn) => !turn.completedAt)
      .map((turn) => [turn.taskId, turn.id] as const)
  ) as Record<string, string | undefined>;
  const activeTaskId = resolveActiveTaskId({
    tasks,
    activeTaskId: args.snapshot?.activeTaskId ?? empty.activeTaskId,
  });
  const activeSurface = resolveActiveSurface({
    tasks,
    activeTaskId,
    cliSessionTabs: normalizedCliSessionState.cliSessionTabs,
    activeCliSessionTabId: normalizedCliSessionState.activeCliSessionTabId,
    activeSurface: args.snapshot?.activeSurface ?? { kind: "task", taskId: activeTaskId },
  });

  return {
    activeTaskId,
    tasks,
    messagesByTask,
    messageCountByTask,
    promptDraftByTask: stripColiseumBranchesFromRecords(
      args.snapshot?.promptDraftByTask ?? empty.promptDraftByTask,
      orphanedBranchTaskIds,
    ),
    workspaceInformation: args.snapshot?.workspaceInformation ?? empty.workspaceInformation,
    editorTabs,
    activeEditorTabId,
    terminalTabs: normalizedTerminalState.terminalTabs,
    activeTerminalTabId: normalizedTerminalState.activeTerminalTabId,
    terminalDocked: args.snapshot?.terminalDocked ?? false,
    cliSessionTabs: normalizedCliSessionState.cliSessionTabs,
    activeCliSessionTabId: normalizedCliSessionState.activeCliSessionTabId,
    activeSurface,
    activeTurnIdsByTask: stripColiseumBranchesFromRecords(
      activeTurnIdsByTask,
      orphanedBranchTaskIds,
    ),
    providerSessionByTask,
    nativeSessionReadyByTask: buildNativeSessionReadyByTask({
      tasks,
      providerSessionByTask,
    }),
    activeColiseumsByTask: {} as Record<string, ColiseumGroupState | undefined>,
  };
}

export function buildWorkspaceSessionStateFromShell(args: {
  shell: WorkspaceShell | null;
  messagesByTask?: Record<string, ChatMessage[]>;
  messageCountByTaskOverrides?: Record<string, number>;
  latestTurns?: PersistedTurnSummary[];
  appendInterruptedNotices?: boolean;
}): WorkspaceSessionState {
  const empty = createEmptyWorkspaceState();
  const rawTasks = (args.shell?.tasks ?? empty.tasks).map(normalizeTaskControl);
  // Reap orphan Coliseum branches — no live group state at bootstrap.
  const { tasks, orphanedBranchTaskIds } = reapColiseumOrphans({
    tasks: rawTasks,
    activeColiseumsByTask: {},
  });
  const providerSessionByTask = stripColiseumBranchesFromRecords(
    args.shell?.providerSessionByTask ?? empty.providerSessionByTask,
    orphanedBranchTaskIds,
  );
  const loadedMessagesByTask = args.messagesByTask ?? empty.messagesByTask;
  const rawMessagesByTask = args.appendInterruptedNotices
    ? appendInterruptedTurnNotices({
        messagesByTask: loadedMessagesByTask,
        latestTurns: args.latestTurns,
      })
    : loadedMessagesByTask;
  const messagesByTask = stripColiseumBranchesFromRecords(
    rawMessagesByTask,
    orphanedBranchTaskIds,
  );
  const messageCountByTask = stripColiseumBranchesFromRecords(
    {
      ...(args.shell?.messageCountByTask ?? empty.messageCountByTask),
      ...(args.messageCountByTaskOverrides ?? {}),
    },
    orphanedBranchTaskIds,
  );
  for (const [taskId, messages] of Object.entries(messagesByTask)) {
    messageCountByTask[taskId] = Math.max(messageCountByTask[taskId] ?? 0, messages.length);
  }
  const editorTabs = args.shell?.editorTabs ?? empty.editorTabs;
  const requestedActiveEditorTabId = args.shell?.activeEditorTabId ?? empty.activeEditorTabId;
  const activeEditorTabId = editorTabs.some((tab) => tab.id === requestedActiveEditorTabId)
    ? requestedActiveEditorTabId
    : (editorTabs[0]?.id ?? null);
  const normalizedTerminalState = normalizeTerminalState({
    tasks,
    terminalTabs: args.shell?.terminalTabs ?? empty.terminalTabs,
    activeTerminalTabId: args.shell?.activeTerminalTabId ?? empty.activeTerminalTabId,
  });
  const normalizedCliSessionState = normalizeCliSessionState({
    tasks,
    cliSessionTabs: args.shell?.cliSessionTabs ?? empty.cliSessionTabs,
    activeCliSessionTabId: args.shell?.activeCliSessionTabId ?? empty.activeCliSessionTabId,
  });
  const activeTurnIdsByTask = Object.fromEntries(
    (args.latestTurns ?? [])
      .filter((turn) => !turn.completedAt)
      .map((turn) => [turn.taskId, turn.id] as const)
  ) as Record<string, string | undefined>;
  const activeTaskId = resolveActiveTaskId({
    tasks,
    activeTaskId: args.shell?.activeTaskId ?? empty.activeTaskId,
  });
  const activeSurface = resolveActiveSurface({
    tasks,
    activeTaskId,
    cliSessionTabs: normalizedCliSessionState.cliSessionTabs,
    activeCliSessionTabId: normalizedCliSessionState.activeCliSessionTabId,
    activeSurface: args.shell?.activeSurface ?? { kind: "task", taskId: activeTaskId },
  });

  return {
    activeTaskId,
    tasks,
    messagesByTask,
    messageCountByTask,
    promptDraftByTask: stripColiseumBranchesFromRecords(
      args.shell?.promptDraftByTask ?? empty.promptDraftByTask,
      orphanedBranchTaskIds,
    ),
    workspaceInformation: args.shell?.workspaceInformation ?? empty.workspaceInformation,
    editorTabs,
    activeEditorTabId,
    terminalTabs: normalizedTerminalState.terminalTabs,
    activeTerminalTabId: normalizedTerminalState.activeTerminalTabId,
    terminalDocked: args.shell?.terminalDocked ?? false,
    cliSessionTabs: normalizedCliSessionState.cliSessionTabs,
    activeCliSessionTabId: normalizedCliSessionState.activeCliSessionTabId,
    activeSurface,
    activeTurnIdsByTask: stripColiseumBranchesFromRecords(
      activeTurnIdsByTask,
      orphanedBranchTaskIds,
    ),
    providerSessionByTask,
    nativeSessionReadyByTask: buildNativeSessionReadyByTask({
      tasks,
      providerSessionByTask,
    }),
    activeColiseumsByTask: {} as Record<string, ColiseumGroupState | undefined>,
  };
}

export function createWorkspaceSnapshot(args: {
  activeTaskId: string;
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  promptDraftByTask: Record<string, PromptDraft>;
  workspaceInformation?: WorkspaceInformationState;
  editorTabs: EditorTab[];
  activeEditorTabId: string | null;
  terminalTabs: WorkspaceTerminalTab[];
  activeTerminalTabId: string | null;
  terminalDocked: boolean;
  cliSessionTabs: WorkspaceCliSessionTab[];
  activeCliSessionTabId: string | null;
  activeSurface: WorkspaceActiveSurface;
  providerSessionByTask: Record<string, TaskProviderSessionState>;
}) {
  return {
    activeTaskId: args.activeTaskId,
    tasks: args.tasks,
    messagesByTask: normalizeMessagesForSnapshot({ messagesByTask: args.messagesByTask }),
    promptDraftByTask: args.promptDraftByTask,
    workspaceInformation: args.workspaceInformation ?? createEmptyWorkspaceInformation(),
    editorTabs: args.editorTabs,
    activeEditorTabId: args.activeEditorTabId,
    terminalTabs: args.terminalTabs,
    activeTerminalTabId: args.activeTerminalTabId,
    terminalDocked: args.terminalDocked,
    cliSessionTabs: args.cliSessionTabs,
    activeCliSessionTabId: args.activeCliSessionTabId,
    activeSurface: args.activeSurface,
    providerSessionByTask: args.providerSessionByTask,
  };
}

export async function persistWorkspaceSnapshot(args: {
  workspaceId: string;
  workspaceName: string;
  activeTaskId: string;
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  promptDraftByTask: Record<string, PromptDraft>;
  workspaceInformation?: WorkspaceInformationState;
  editorTabs: EditorTab[];
  activeEditorTabId: string | null;
  terminalTabs: WorkspaceTerminalTab[];
  activeTerminalTabId: string | null;
  terminalDocked: boolean;
  cliSessionTabs: WorkspaceCliSessionTab[];
  activeCliSessionTabId: string | null;
  activeSurface: WorkspaceActiveSurface;
  providerSessionByTask: Record<string, TaskProviderSessionState>;
}) {
  const persistedShell = await loadWorkspaceShellLite({ workspaceId: args.workspaceId });
  const nextTaskIds = new Set(args.tasks.map((task) => task.id));
  const preservedTasks = (persistedShell?.tasks ?? []).filter((task) => !nextTaskIds.has(task.id));
  const mergedTasks = preservedTasks.length > 0
    ? [...args.tasks, ...preservedTasks]
    : args.tasks;
  const mergedTaskIds = new Set(mergedTasks.map((task) => task.id));
  const mergedActiveTaskId = mergedTaskIds.has(args.activeTaskId)
    ? args.activeTaskId
    : (
      persistedShell?.activeTaskId && mergedTaskIds.has(persistedShell.activeTaskId)
        ? persistedShell.activeTaskId
        : (mergedTasks[0]?.id ?? "")
    );
  const mergedPromptDraftByTask = {
    ...(persistedShell?.promptDraftByTask ?? {}),
    ...args.promptDraftByTask,
  };
  const mergedProviderSessionByTask = {
    ...(persistedShell?.providerSessionByTask ?? {}),
    ...args.providerSessionByTask,
  };

  if (preservedTasks.length > 0) {
    console.warn("[persistence] shrink guard preserved missing tasks during workspace snapshot persist", {
      workspaceId: args.workspaceId,
      taskIds: preservedTasks.map((task) => task.id),
    });
  }

  await upsertWorkspace({
    id: args.workspaceId,
    name: args.workspaceName,
    snapshot: createWorkspaceSnapshot({
      activeTaskId: mergedActiveTaskId,
      tasks: mergedTasks,
      messagesByTask: args.messagesByTask,
      promptDraftByTask: mergedPromptDraftByTask,
      workspaceInformation: args.workspaceInformation,
      editorTabs: args.editorTabs,
      activeEditorTabId: args.activeEditorTabId,
      terminalTabs: args.terminalTabs,
      activeTerminalTabId: args.activeTerminalTabId,
      terminalDocked: args.terminalDocked,
      cliSessionTabs: args.cliSessionTabs,
      activeCliSessionTabId: args.activeCliSessionTabId,
      activeSurface: args.activeSurface,
      providerSessionByTask: mergedProviderSessionByTask,
    }),
  });
}

/**
 * Trailing-edge debounce for fire-and-forget `persistWorkspaceSnapshot` calls.
 * Groups by workspaceId — rapid calls for the same workspace are coalesced so
 * only the last snapshot is persisted after a short quiet period.
 */
const pendingSnapshots = new Map<
  string,
  {
    timer: ReturnType<typeof setTimeout>;
    args: Parameters<typeof persistWorkspaceSnapshot>[0];
  }
>();
const SNAPSHOT_DEBOUNCE_MS = 400;

export function scheduleWorkspaceSnapshotPersist(
  args: Parameters<typeof persistWorkspaceSnapshot>[0],
) {
  const existing = pendingSnapshots.get(args.workspaceId);
  if (existing) {
    clearTimeout(existing.timer);
  }
  pendingSnapshots.set(args.workspaceId, {
    timer: setTimeout(() => {
      pendingSnapshots.delete(args.workspaceId);
      void persistWorkspaceSnapshot(args);
    }, SNAPSHOT_DEBOUNCE_MS),
    args,
  });
}

/** Immediately execute all pending debounced snapshot persists. */
export async function flushPendingSnapshotPersists() {
  const entries = Array.from(pendingSnapshots.entries());
  for (const [workspaceId, entry] of entries) {
    clearTimeout(entry.timer);
    pendingSnapshots.delete(workspaceId);
    await persistWorkspaceSnapshot(entry.args);
  }
}
