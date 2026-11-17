import { i18n } from "@/i18n";
import { formatDuration } from "@/i18n/format";
import type { FleetAttentionItem, FleetAttentionKind } from "@/lib/fleet/attention-projection";
import { formatToolDisplayName } from "@/lib/providers/subagent-identity";
import { describeToolOperationLabel } from "@/lib/providers/tool-activity";
import type { TaskPanelTab } from "@/lib/right-rail-panels";
import type { WorkState } from "@/components/aui/components/state-vocabulary";
import type {
  ReturnDecision,
  ReturnStop,
  ReturnSummary,
  ReturnTurn,
} from "@/lib/task-context/return-summary";

/**
 * Where a row's action leads: a Task panel tab, the waiting request, the
 * approval or answer you gave (its message and request), a turn's reply in the
 * conversation, a side question or the composer.
 */
export type ReturnLinkTarget =
  | { kind: "tab"; tab: TaskPanelTab }
  | { kind: "request" }
  | { kind: "decision"; messageId: string; requestId: string }
  | { kind: "message"; messageId: string }
  | { kind: "side-question" }
  | { kind: "composer" };

/** How urgent a row is; rows are listed in this order. */
export type ReturnRowKind = "needs-you" | "failed" | "working" | "done" | "info";

const ROW_ORDER: Record<ReturnRowKind, number> = { "needs-you": 0, failed: 1, working: 2, done: 3, info: 4 };

/**
 * One thing the card says: a mark, a title, an optional detail and the one
 * action for it. The mark is a work state, or none for a note (the next step,
 * the last decision).
 */
export interface ReturnRow {
  /** `status`, `running`, `next`, `decision`, or `turn:<id>` for a turn. */
  id: string;
  kind: ReturnRowKind;
  state: WorkState | null;
  title: string;
  detail: string | null;
  action: { label: string; target: ReturnLinkTarget } | null;
  /** The task waits on you: this row's action is the card's primary one. */
  primary: boolean;
}

export interface ReturnView {
  /** Most urgent first: needs you, failed, still working, done, then notes. */
  rows: ReturnRow[];
  /** The task waits on you. */
  needsYou: boolean;
  /** Turns that finished while you were away. */
  turns: number;
}

/** Where the task stands, as `describeStop` and `describeAction` tell it. */
interface ReturnStatus {
  state: WorkState;
  text: string;
  detail: string | null;
  next: string | null;
  action: { label: string; target: ReturnLinkTarget };
}

/** The task's most urgent attention item, from Fleet's shared snapshot. */
export function selectTaskNeed(items: readonly FleetAttentionItem[], workspaceId: string, taskId: string) {
  let need: FleetAttentionItem | null = null;
  for (const item of items) {
    if (item.taskId !== taskId || item.workspaceId !== workspaceId) continue;
    if (!need || item.priority < need.priority) need = item;
  }
  return need;
}

function toolLabel(toolName: string) {
  return describeToolOperationLabel(toolName) ?? formatToolDisplayName(toolName) ?? toolName;
}

function describeDecision(decision: ReturnDecision): string {
  if (decision.kind === "record") return decision.text;
  // The answer is the decision; the question sits in the conversation behind "Show".
  if (decision.kind === "answer") return decision.answer;
  return decision.approved
    ? i18n.t("session:returnSummary.decisionAllowed", { tool: toolLabel(decision.toolName), description: decision.description })
    : i18n.t("session:returnSummary.decisionDenied", { tool: toolLabel(decision.toolName), description: decision.description });
}

function decisionLink(decision: ReturnDecision): NonNullable<ReturnRow["action"]> {
  if (decision.kind === "record") {
    return { label: i18n.t("session:returnSummary.linkHandoff"), target: { kind: "tab", tab: "handoff" } };
  }
  return {
    label: i18n.t("session:returnSummary.linkShow"),
    target: { kind: "decision", messageId: decision.messageId, requestId: decision.requestId },
  };
}

const NEED_KEYS: Partial<Record<FleetAttentionKind, { since: string; plain: string; state: WorkState }>> = {
  approval: { since: "session:returnSummary.stopApprovalSince", plain: "session:returnSummary.stopApproval", state: "approval" },
  "user-input": { since: "session:returnSummary.stopQuestionSince", plain: "session:returnSummary.stopQuestion", state: "needs-you" },
  "run-failed": { since: "session:returnSummary.stopFailedSince", plain: "session:returnSummary.stopFailedNeed", state: "failed" },
  "turn-stalled": { since: "session:returnSummary.stopStalledSince", plain: "session:returnSummary.stopStalled", state: "halted" },
  "result-ready": { since: "session:returnSummary.stopResultSince", plain: "session:returnSummary.stopResult", state: "ready" },
  "agent-run-sign-off": { since: "session:returnSummary.stopSignOffSince", plain: "session:returnSummary.stopSignOff", state: "needs-you" },
  "agent-run-blocked": { since: "session:returnSummary.stopRunBlockedSince", plain: "session:returnSummary.stopRunBlocked", state: "halted" },
  "agent-run-stuck": { since: "session:returnSummary.stopRunStuckSince", plain: "session:returnSummary.stopRunStuck", state: "halted" },
};

const WAITING_KEYS = {
  since: "session:returnSummary.stopWaitingSince",
  plain: "session:returnSummary.stopWaiting",
  state: "needs-you",
} as const;

function describeStop(stop: ReturnStop, now: number): Pick<ReturnStatus, "state" | "text" | "detail"> {
  switch (stop.kind) {
    case "need": {
      const keys = NEED_KEYS[stop.need] ?? WAITING_KEYS;
      const waitedMs = stop.since ? now - Date.parse(stop.since) : Number.NaN;
      // Told in whole minutes, as Fleet tells the same wait.
      const text = Number.isFinite(waitedMs) && waitedMs >= 60_000
        ? i18n.t(keys.since as "session:returnSummary.stopWaitingSince", {
            duration: formatDuration(Math.floor(waitedMs / 60_000) * 60_000),
          })
        : i18n.t(keys.plain as "session:returnSummary.stopWaiting");
      return { state: keys.state, text, detail: stop.detail };
    }
    case "running":
      return { state: "working", text: i18n.t("session:returnSummary.stopRunning"), detail: null };
    case "finished":
    case "failed":
    case "stopped": {
      // The card header already says when you last wrote, so the time is not repeated here.
      const text = stop.kind === "finished"
        ? i18n.t("session:returnSummary.stopFinishedPlain")
        : stop.kind === "failed"
          ? i18n.t("session:returnSummary.stopFailedPlain")
          : i18n.t("session:returnSummary.stopStoppedPlain");
      return {
        state: stop.kind === "finished" ? "ready" : stop.kind,
        text,
        detail: null,
      };
    }
    default:
      return { state: "idle", text: i18n.t("session:returnSummary.stopNone"), detail: null };
  }
}

/** The one thing to do now, named for what it does, and where it goes. */
function describeAction(summary: ReturnSummary): Pick<ReturnStatus, "action" | "next"> {
  const next = summary.next;
  const action = (key: string, target: ReturnLinkTarget) => ({
    label: i18n.t(key as "session:returnSummary.actionRequest"),
    target,
  });
  switch (next.kind) {
    case "answer":
      return { next: null, action: action("session:returnSummary.actionRequest", { kind: "request" }) };
    case "review":
      return { next: null, action: action("session:returnSummary.actionReview", { kind: "tab", tab: "results" }) };
    case "inspect-failure":
      return { next: null, action: action("session:returnSummary.actionFailure", { kind: "tab", tab: "activity" }) };
    case "check-stall":
      return { next: null, action: action("session:returnSummary.actionStall", { kind: "tab", tab: "activity" }) };
    case "open-run":
      return { next: null, action: action("session:returnSummary.actionRun", { kind: "tab", tab: "progress" }) };
    case "remaining":
      return { next: next.text, action: action("session:returnSummary.actionHandoff", { kind: "tab", tab: "handoff" }) };
    case "wait":
      return { next: null, action: action("session:returnSummary.actionSideQuestion", { kind: "side-question" }) };
    default:
      // A wait with no action of its own (a pull request's state) is read in
      // Activity, not answered in the composer.
      return summary.stop.kind === "need"
        ? { next: null, action: action("session:returnSummary.actionStall", { kind: "tab", tab: "activity" }) }
        : { next: null, action: action("session:returnSummary.actionComposer", { kind: "composer" }) };
  }
}

function describeTurn(turn: ReturnTurn): ReturnRow {
  const outcome = turn.outcome === "failed"
    ? i18n.t("session:returnSummary.turnFailed")
    : turn.outcome === "stopped"
      ? i18n.t("session:returnSummary.turnStopped")
      : i18n.t("session:returnSummary.turnFinished");
  const files = turn.files > 0 ? i18n.t("session:returnSummary.changesFiles", { count: turn.files }) : null;
  return {
    id: `turn:${turn.id}`,
    kind: turn.outcome === "failed" ? "failed" : "done",
    state: turn.outcome === "finished" ? "ready" : turn.outcome,
    title: turn.prompt || i18n.t("session:returnSummary.turnUntitled"),
    detail: files ? `${outcome} · ${files}` : outcome,
    action: { label: i18n.t("session:returnSummary.linkShow"), target: { kind: "message", messageId: turn.messageId } },
    primary: false,
  };
}

function statusRow(status: ReturnStatus, primary: boolean): ReturnRow {
  return {
    id: "status",
    kind: status.state === "failed" ? "failed" : primary ? "needs-you" : status.state === "working" ? "working" : "done",
    state: status.state,
    title: status.text,
    detail: status.detail,
    action: status.action,
    primary,
  };
}

/**
 * The summary in the user's language, as rows, most urgent first: what waits
 * on you, then each turn that finished while you were away (failed ones
 * first), whether it still works, then the next step and the last decision.
 * Where it stands is always told: when nothing waits, works or finished, the
 * one row says how its last turn ended, with the action that moves it on.
 */
export function describeReturnSummary(summary: ReturnSummary, now: number): ReturnView {
  const status: ReturnStatus = { ...describeStop(summary.stop, now), ...describeAction(summary) };
  const needsYou = summary.stop.kind === "need";
  const rows: ReturnRow[] = [];
  if (needsYou) rows.push(statusRow(status, true));
  rows.push(...summary.turns.map(describeTurn));
  if (!needsYou && summary.stop.kind === "running") rows.push({ ...statusRow(status, false), id: "running" });
  if (rows.length === 0) {
    // Where it stands, with the action for it; its next step is that action's detail.
    rows.push({ ...statusRow(status, false), detail: status.next ? i18n.t("session:returnSummary.nextRemaining", { text: status.next }) : null });
  } else if (summary.next.kind === "remaining") {
    rows.push({
      id: "next",
      kind: "info",
      state: null,
      title: i18n.t("session:returnSummary.labelNext"),
      detail: summary.next.text,
      action: { label: i18n.t("session:returnSummary.actionHandoff"), target: { kind: "tab", tab: "handoff" } },
      primary: false,
    });
  }
  if (summary.decision) {
    rows.push({
      id: "decision",
      kind: "info",
      state: null,
      title: i18n.t("session:returnSummary.labelDecision"),
      detail: describeDecision(summary.decision),
      action: decisionLink(summary.decision),
      primary: false,
    });
  }
  rows.sort((left, right) => ROW_ORDER[left.kind] - ROW_ORDER[right.kind]);
  return { rows, needsYou, turns: summary.turns.length };
}
