import { i18n } from "@/i18n";
import { formatDuration, formatTimeAgo } from "@/i18n/format";
import type { FleetAttentionKind } from "@/lib/fleet/attention-projection";
import { formatToolDisplayName } from "@/lib/providers/subagent-identity";
import { describeToolOperationLabel } from "@/lib/providers/tool-activity";
import type { TaskPanelTab } from "@/lib/right-rail-panels";
import type { WorkState } from "@/components/ads/components/state-vocabulary";
import type {
  ReturnDecision,
  ReturnStop,
  ReturnSummary,
} from "@/lib/task-context/return-summary";

/**
 * Where a line's link leads: a Task panel tab, the waiting request, the
 * approval or answer you gave (its message and request), a side question or
 * the composer.
 */
export type ReturnLinkTarget =
  | { kind: "tab"; tab: TaskPanelTab }
  | { kind: "request" }
  | { kind: "decision"; messageId: string; requestId: string }
  | { kind: "side-question" }
  | { kind: "composer" };

/** A fact under the status: what changed while you were away, or the last decision. */
export interface ReturnLine {
  id: "decision" | "changes";
  label: string;
  text: string;
  link: { label: string; target: ReturnLinkTarget } | null;
}

/** Where the task stands, in one line, with the one thing to do about it. */
export interface ReturnStatus {
  /** The work state its mark is drawn in, from the shared state vocabulary. */
  state: WorkState;
  text: string;
  /** What the task waits on (the request's description), when it says. */
  detail: string | null;
  /** The handoff record's next remaining step, when there is one. */
  next: string | null;
  action: { label: string; target: ReturnLinkTarget };
  /** The task waits on you: the action is the card's primary one. */
  urgent: boolean;
}

export interface ReturnView {
  status: ReturnStatus;
  /** Only the facts that have something to say. */
  facts: ReturnLine[];
}

function toolLabel(toolName: string) {
  return describeToolOperationLabel(toolName) ?? formatToolDisplayName(toolName) ?? toolName;
}

function describeDecision(decision: ReturnDecision): string {
  if (decision.kind === "record") return decision.text;
  if (decision.kind === "answer") {
    return i18n.t("session:returnSummary.decisionAnswer", { question: decision.question, answer: decision.answer });
  }
  return decision.approved
    ? i18n.t("session:returnSummary.decisionAllowed", { tool: toolLabel(decision.toolName), description: decision.description })
    : i18n.t("session:returnSummary.decisionDenied", { tool: toolLabel(decision.toolName), description: decision.description });
}

function decisionLink(decision: ReturnDecision): NonNullable<ReturnLine["link"]> {
  if (decision.kind === "record") {
    return { label: i18n.t("session:returnSummary.linkHandoff"), target: { kind: "tab", tab: "handoff" } };
  }
  return {
    label: i18n.t("session:returnSummary.linkShow"),
    target: { kind: "decision", messageId: decision.messageId, requestId: decision.requestId },
  };
}

/** The changes since the visit, or null when nothing changed. */
function describeChanges(summary: ReturnSummary): string | null {
  const { turns, files, steps } = summary.changes;
  const parts = [
    ...(turns > 0 ? [i18n.t("session:returnSummary.changesTurns", { count: turns })] : []),
    ...(files > 0 ? [i18n.t("session:returnSummary.changesFiles", { count: files })] : []),
    ...(steps > 0 ? [i18n.t("session:returnSummary.changesSteps", { count: steps })] : []),
  ];
  return parts.length > 0 ? parts.join(" · ") : null;
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
      const time = stop.at ? formatTimeAgo(stop.at, now) : "";
      const key = stop.kind === "finished"
        ? "session:returnSummary.stopFinished"
        : stop.kind === "failed"
          ? "session:returnSummary.stopFailed"
          : "session:returnSummary.stopStopped";
      return {
        state: stop.kind === "finished" ? "ready" : stop.kind,
        text: time ? i18n.t(key, { time }) : i18n.t(`${key}Plain` as "session:returnSummary.stopFinishedPlain"),
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

/**
 * The summary in the user's language: where the task stands with the one
 * action that moves it on, then what changed while you were away and the last
 * decision, each with where it comes from. A fact with nothing to say is left
 * out.
 */
export function describeReturnSummary(summary: ReturnSummary, now: number): ReturnView {
  const facts: ReturnLine[] = [];
  const changes = describeChanges(summary);
  if (changes) {
    facts.push({
      id: "changes",
      label: i18n.t("session:returnSummary.labelChanges"),
      text: changes,
      link: { label: i18n.t("session:returnSummary.linkActivity"), target: { kind: "tab", tab: "activity" } },
    });
  }
  if (summary.decision) {
    facts.push({
      id: "decision",
      label: i18n.t("session:returnSummary.labelDecision"),
      text: describeDecision(summary.decision),
      link: decisionLink(summary.decision),
    });
  }
  return {
    status: { ...describeStop(summary.stop, now), ...describeAction(summary), urgent: summary.stop.kind === "need" },
    facts,
  };
}
