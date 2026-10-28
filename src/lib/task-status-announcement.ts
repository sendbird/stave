import type { I18nKey } from "@/i18n/runtime";
import { classifyTaskStatus } from "@/lib/fleet/task-status";
import { classifyProviderTurnStopReason } from "@/lib/providers/turn-status";
import type { ChatMessage } from "@/types/chat";

/**
 * What a screen reader hears about the open task. `idle` (nothing has run, or
 * the last turn's end is unknown) is never spoken.
 */
export type TaskAnnouncementState =
  | "working"
  | "needsInput"
  | "needsApproval"
  | "done"
  | "failed"
  | "stopped"
  | "idle";

export const TASK_ANNOUNCEMENT_KEYS = {
  working: "shell:taskStatusAnnouncer.working",
  needsInput: "shell:taskStatusAnnouncer.needsInput",
  needsApproval: "shell:taskStatusAnnouncer.needsApproval",
  done: "shell:taskStatusAnnouncer.done",
  failed: "shell:taskStatusAnnouncer.failed",
  stopped: "shell:taskStatusAnnouncer.stopped",
} as const satisfies Record<Exclude<TaskAnnouncementState, "idle">, I18nKey>;

/** States a turn is in while it runs; a turn's end is spoken only after one. */
const IN_TURN_STATES = new Set<TaskAnnouncementState>([
  "working",
  "needsInput",
  "needsApproval",
]);

/** How the last turn ended, from its receipt or its stop reason. */
function resolveSettledState(messages: readonly ChatMessage[]): TaskAnnouncementState {
  const latest = messages.at(-1);
  if (latest?.role !== "assistant") {
    return "idle";
  }
  const receipt = latest.terminalReceipt;
  if (receipt?.completedAt) {
    switch (receipt.outcome) {
      case "completed":
        return "done";
      case "cancelled":
        return "stopped";
      case "failed":
        return "failed";
      default:
        return "idle";
    }
  }
  const stopReason = latest.terminalStopReason?.trim();
  if (!stopReason) {
    return "idle";
  }
  const outcome = classifyProviderTurnStopReason(stopReason);
  return outcome === "cancelled" ? "stopped" : outcome === "failed" ? "failed" : "done";
}

/**
 * The open task's state in the announcement vocabulary. It reads the same
 * classification Fleet and the sidebar use, so every surface agrees.
 */
export function resolveTaskAnnouncementState(args: {
  messages: readonly ChatMessage[];
  activeTurnId?: string | null;
  archived?: boolean;
}): TaskAnnouncementState {
  const status = classifyTaskStatus({
    task: { id: "", archivedAt: args.archived ? "archived" : null, updatedAt: "" },
    messages: args.messages as ChatMessage[],
    activeTurnId: args.activeTurnId ?? null,
  });
  switch (status) {
    case "waiting-input":
      return "needsInput";
    case "waiting-approval":
      return "needsApproval";
    case "error":
      // An error while the turn still runs is one the provider may recover
      // from (it retries); only a turn that ended on it has failed.
      return args.activeTurnId ? "working" : "failed";
    case "running":
    case "stalled":
      return "working";
    case "idle":
      return args.archived ? "idle" : resolveSettledState(args.messages);
  }
}

export interface TaskAnnouncementBaseline {
  taskId: string;
  /** `null` while the task's transcript is still loading. */
  state: TaskAnnouncementState | null;
}

/**
 * The next announcement, once per transition of the open task. Opening or
 * switching to a task is silent: its first known state is the baseline. A
 * turn's end (Done, Failed, Stopped) is spoken only after the task was seen
 * in a turn, so a transcript that finishes loading never sounds like news.
 */
export function advanceTaskAnnouncement(
  previous: TaskAnnouncementBaseline | null,
  next: TaskAnnouncementBaseline,
): { baseline: TaskAnnouncementBaseline; announce: TaskAnnouncementState | null } {
  if (
    !previous ||
    previous.taskId !== next.taskId ||
    previous.state === null ||
    next.state === null ||
    previous.state === next.state ||
    next.state === "idle"
  ) {
    return { baseline: next, announce: null };
  }
  if (!IN_TURN_STATES.has(next.state) && !IN_TURN_STATES.has(previous.state)) {
    return { baseline: next, announce: null };
  }
  return { baseline: next, announce: next.state };
}

/* ─── Store read ───────────────────────────────────────────────── */

interface CachedState {
  activeTurnId: string | null;
  archived: boolean;
  state: TaskAnnouncementState;
}

// Store selectors run on every store update; the transcript is classified
// again only when the task's message list or turn changes.
const stateByMessages = new WeakMap<readonly ChatMessage[], CachedState>();

export function selectTaskAnnouncementState(args: {
  messages: readonly ChatMessage[] | undefined;
  activeTurnId: string | null | undefined;
  archived: boolean;
  loading: boolean;
}): TaskAnnouncementState | null {
  if (args.loading) {
    return null;
  }
  const messages = args.messages ?? [];
  const activeTurnId = args.activeTurnId ?? null;
  const cached = args.messages ? stateByMessages.get(args.messages) : undefined;
  if (cached && cached.activeTurnId === activeTurnId && cached.archived === args.archived) {
    return cached.state;
  }
  const state = resolveTaskAnnouncementState({
    messages,
    activeTurnId,
    archived: args.archived,
  });
  if (args.messages) {
    stateByMessages.set(args.messages, { activeTurnId, archived: args.archived, state });
  }
  return state;
}
