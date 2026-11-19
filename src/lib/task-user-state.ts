import { i18n } from "@/i18n/runtime";
import type { WorkState } from "@/components/aui/components/state-vocabulary";
import type { AgentRunStatus } from "@/lib/agent-runs/agent-run-status";
import {
  classifyProviderTurnStopReason,
  type ProviderTurnActivitySnapshot,
  type RetainedTurnActivity,
} from "@/lib/providers/turn-status";
import type { ChatMessage } from "@/types/chat";

/**
 * Where a task stands for the person who gave it, in five states and no more:
 *
 * - `working`: something is running and nothing waits on the user;
 * - `waiting`: a question, an approval or a stage sign-off waits on the user;
 * - `blocked`: nothing runs and it cannot go on until someone acts (a halted
 *   or paused agent run);
 * - `finished`: the last work ended well, with what it produced;
 * - `stopped`: the last work failed or was stopped, with why.
 *
 * One pure function decides it from facts the surfaces already hold, so two
 * surfaces never disagree about the same task. The Task panel reads only this;
 * other surfaces (the Tars card, Fleet) can adopt it without a new vocabulary.
 */
export const TASK_USER_STATES = ["working", "waiting", "blocked", "finished", "stopped"] as const;
export type TaskUserState = (typeof TASK_USER_STATES)[number];

/** What waits on the user while the task is `waiting`. */
export type TaskWaitingOn = "question" | "approval" | "sign-off";

/** How one turn ended, as its receipt or saved record tells it. */
export type TaskTurnEnding = "completed" | "failed" | "cancelled" | "unknown";

/** A pull request the work opened or the workspace has. */
export interface TaskResultPullRequest {
  url: string;
  number?: number;
  title?: string;
}

/** What the work produced; every part is optional. */
export interface TaskResult {
  pullRequest: TaskResultPullRequest | null;
  /** Files the work changed. */
  changedFiles: number;
  /** The reply that answers the request, to jump to in the conversation. */
  answerMessageId: string | null;
}

export interface TaskStateFacts {
  /** The live turn, while one runs. */
  liveTurn: { pendingInteraction: string | null } | null;
  /** A question or approval the task's messages hold unanswered, async questions included. */
  pendingDecision: "question" | "approval" | null;
  /** The task's agent run as `describeAgentRunStatus` words it, and when it last changed. */
  agentRun: (Pick<AgentRunStatus, "badge" | "reason"> & { updatedAt: string | null }) | null;
  /** How the latest turn ended, once it has. */
  lastTurn: { ending: TaskTurnEnding; error: string | null; endedAt: string | null } | null;
  /** What the work produced, shown once it finished. */
  result: TaskResult | null;
}

export interface TaskUserStatus {
  state: TaskUserState;
  /** Set only while `waiting`. */
  waitingOn: TaskWaitingOn | null;
  /** Why it is `blocked` or `stopped`, when known. */
  reason: string | null;
  /** Set only once `finished`, and only when it produced something. */
  result: TaskResult | null;
}

function status(
  state: TaskUserState,
  extra: Partial<Pick<TaskUserStatus, "waitingOn" | "reason" | "result">> = {},
): TaskUserStatus {
  return {
    state,
    waitingOn: extra.waitingOn ?? null,
    reason: extra.reason ?? null,
    result: extra.result ?? null,
  };
}

function hasResult(result: TaskResult | null): result is TaskResult {
  return Boolean(result && (result.pullRequest || result.changedFiles > 0 || result.answerMessageId));
}

function laterOrEqual(left: string | null, right: string | null) {
  if (!left || !right) return Boolean(left) || !right;
  return Date.parse(left) >= Date.parse(right);
}

/**
 * The task's state from its facts; `null` while it has never run. What waits
 * on the user comes first, then live work, then whichever of the agent run
 * and the last turn changed last.
 */
export function resolveTaskUserState(facts: TaskStateFacts): TaskUserStatus | null {
  const run = facts.agentRun;
  // A paused or halted run holds the task whatever card it left open; only a
  // live turn's own prompt still asks.
  const runHolds = run?.badge === "paused" || run?.badge === "halted";
  const live = facts.liveTurn?.pendingInteraction;
  const pending = live === "approval"
    ? "approval"
    : live === "user_input"
      ? "question"
      : runHolds ? null : facts.pendingDecision;
  if (pending) return status("waiting", { waitingOn: pending });
  if (run?.badge === "needs-answer") return status("waiting", { waitingOn: "sign-off" });
  if (facts.liveTurn) return status("working");
  const result = hasResult(facts.result) ? facts.result : null;
  const turn = facts.lastTurn;
  const runActive = run && (run.badge === "running" || run.badge === "halted" || run.badge === "paused");
  if (run && (runActive || !turn || laterOrEqual(run.updatedAt, turn.endedAt))) {
    switch (run.badge) {
      case "running":
        return status("working");
      case "halted":
      case "paused":
        return status("blocked", { reason: run.reason });
      case "completed":
        return status("finished", { result });
      case "stopped":
        return status("stopped", { reason: run.reason });
    }
  }
  if (!turn) return null;
  switch (turn.ending) {
    case "failed":
      return status("stopped", { reason: turn.error });
    case "cancelled":
      return status("stopped", { reason: i18n.t("session:taskState.stoppedByYou") });
    // An ending nobody reported is not a failure: Fleet reads it as idle too.
    case "completed":
    case "unknown":
      return status("finished", { result });
  }
}

/**
 * How one turn ended, read in this order: its saved receipt, the outcome kept
 * when it retired, the live snapshot's error, then the provider's stop reason.
 * Null while it runs or when nothing says.
 */
export function resolveTurnEnding(args: {
  message: Pick<ChatMessage, "terminalReceipt" | "terminalStopReason"> | null;
  retained: RetainedTurnActivity | null;
  activity: Pick<ProviderTurnActivitySnapshot, "completedAt" | "turnError"> | null;
}): { ending: TaskTurnEnding; error: string | null } | null {
  const receipt = args.message?.terminalReceipt ?? args.retained?.snapshot.terminalReceipt;
  const snapshotError = args.retained?.snapshot.turnError ?? args.activity?.turnError ?? null;
  if (receipt?.completedAt && receipt.outcome) {
    return {
      ending: receipt.outcome,
      error: receipt.outcome === "failed" ? (receipt.error ?? receipt.lastError?.message ?? snapshotError) : null,
    };
  }
  if ((args.activity?.completedAt && args.activity.turnError) || args.retained?.outcome === "failed") {
    return { ending: "failed", error: snapshotError };
  }
  const stopReason = args.message?.terminalStopReason?.trim().toLowerCase() ?? "";
  if (stopReason) {
    const kind = classifyProviderTurnStopReason(stopReason);
    if (kind === "failed") return { ending: "failed", error: snapshotError };
    if (kind === "cancelled") return { ending: "cancelled", error: null };
    return { ending: stopReason === "completed" || stopReason === "end_turn" ? "completed" : "unknown", error: null };
  }
  if (args.retained?.outcome === "stopped") return { ending: "cancelled", error: null };
  if (args.retained?.outcome === "completed") return { ending: "completed", error: null };
  if (args.message || args.retained) return { ending: "unknown", error: null };
  return null;
}

/** Each state's word. */
export const TASK_USER_STATE_LABELS: Record<TaskUserState, string> = {
  get working() { return i18n.t("session:taskState.working"); },
  get waiting() { return i18n.t("session:taskState.waiting"); },
  get blocked() { return i18n.t("session:taskState.blocked"); },
  get finished() { return i18n.t("session:taskState.finished"); },
  get stopped() { return i18n.t("session:taskState.stopped"); },
};

/** Each state as the shared work-state glyph; an approval wears its own. */
export function taskUserStateToWorkState(value: Pick<TaskUserStatus, "state" | "waitingOn">): WorkState {
  switch (value.state) {
    case "working":
      return "working";
    case "waiting":
      return value.waitingOn === "question" ? "needs-you" : "approval";
    case "blocked":
      return "halted";
    case "finished":
      return "ready";
    case "stopped":
      return "stopped";
  }
}
