import { i18n } from "@/i18n";
import { formatRelativeTime } from "@/i18n/format";
import type { FleetAttentionKind } from "@/lib/fleet/attention-projection";
import { formatActivityDuration } from "@/lib/fleet/task-activity-line";
import { formatToolDisplayName } from "@/lib/providers/subagent-identity";
import { describeToolOperationLabel } from "@/lib/providers/tool-activity";
import type { TaskPanelTab } from "@/lib/right-rail-panels";
import type {
  ReturnDecision,
  ReturnStop,
  ReturnSummary,
} from "@/lib/task-context/return-summary";

/** Where a line's link leads: a Task panel tab, the waiting request, a side question or the composer. */
export type ReturnLinkTarget =
  | { kind: "tab"; tab: TaskPanelTab }
  | { kind: "request" }
  | { kind: "side-question" }
  | { kind: "composer" };

export interface ReturnLine {
  id: "decision" | "changes" | "stop" | "next";
  label: string;
  text: string;
  link: { label: string; target: ReturnLinkTarget } | null;
}

function toolLabel(toolName: string) {
  return describeToolOperationLabel(toolName) ?? formatToolDisplayName(toolName) ?? toolName;
}

function describeDecision(decision: ReturnDecision | null): string {
  if (!decision) return i18n.t("session:returnSummary.decisionNone");
  if (decision.kind === "record") return decision.text;
  if (decision.kind === "answer") {
    return i18n.t("session:returnSummary.decisionAnswer", { question: decision.question, answer: decision.answer });
  }
  return decision.approved
    ? i18n.t("session:returnSummary.decisionAllowed", { tool: toolLabel(decision.toolName), description: decision.description })
    : i18n.t("session:returnSummary.decisionDenied", { tool: toolLabel(decision.toolName), description: decision.description });
}

function describeChanges(summary: ReturnSummary): string {
  const { turns, files, steps } = summary.changes;
  const parts = [
    ...(turns > 0 ? [i18n.t("session:returnSummary.changesTurns", { count: turns })] : []),
    ...(files > 0 ? [i18n.t("session:returnSummary.changesFiles", { count: files })] : []),
    ...(steps > 0 ? [i18n.t("session:returnSummary.changesSteps", { count: steps })] : []),
  ];
  return parts.length > 0 ? parts.join(", ") : i18n.t("session:returnSummary.changesNone");
}

const NEED_KEYS: Partial<Record<FleetAttentionKind, { since: string; plain: string }>> = {
  approval: { since: "session:returnSummary.stopApprovalSince", plain: "session:returnSummary.stopApproval" },
  "user-input": { since: "session:returnSummary.stopQuestionSince", plain: "session:returnSummary.stopQuestion" },
  "run-failed": { since: "session:returnSummary.stopFailedSince", plain: "session:returnSummary.stopFailedNeed" },
  "turn-stalled": { since: "session:returnSummary.stopStalledSince", plain: "session:returnSummary.stopStalled" },
  "result-ready": { since: "session:returnSummary.stopResultSince", plain: "session:returnSummary.stopResult" },
  "agent-run-sign-off": { since: "session:returnSummary.stopSignOffSince", plain: "session:returnSummary.stopSignOff" },
  "agent-run-blocked": { since: "session:returnSummary.stopRunBlockedSince", plain: "session:returnSummary.stopRunBlocked" },
  "agent-run-stuck": { since: "session:returnSummary.stopRunStuckSince", plain: "session:returnSummary.stopRunStuck" },
};

function describeStop(stop: ReturnStop, now: number): string {
  switch (stop.kind) {
    case "need": {
      const keys = NEED_KEYS[stop.need] ?? {
        since: "session:returnSummary.stopWaitingSince",
        plain: "session:returnSummary.stopWaiting",
      };
      const waitedMs = stop.since ? now - Date.parse(stop.since) : Number.NaN;
      // Told in whole minutes, as Fleet tells the same wait.
      const text = Number.isFinite(waitedMs) && waitedMs >= 60_000
        ? i18n.t(keys.since as "session:returnSummary.stopWaitingSince", {
            duration: formatActivityDuration(Math.floor(waitedMs / 60_000) * 60_000),
          })
        : i18n.t(keys.plain as "session:returnSummary.stopWaiting");
      return stop.detail ? `${text}: ${stop.detail}` : text;
    }
    case "running":
      return i18n.t("session:returnSummary.stopRunning");
    case "finished":
    case "failed":
    case "stopped": {
      const time = stop.at ? formatRelativeTime(stop.at, now) : "";
      const key = stop.kind === "finished"
        ? "session:returnSummary.stopFinished"
        : stop.kind === "failed"
          ? "session:returnSummary.stopFailed"
          : "session:returnSummary.stopStopped";
      return time ? i18n.t(key, { time }) : i18n.t(`${key}Plain` as "session:returnSummary.stopFinishedPlain");
    }
    default:
      return i18n.t("session:returnSummary.stopNone");
  }
}

function stopLink(stop: ReturnStop): ReturnLine["link"] {
  if (stop.kind === "need") {
    if (stop.need === "approval" || stop.need === "user-input") {
      return { label: i18n.t("session:returnSummary.linkShow"), target: { kind: "request" } };
    }
    if (stop.need === "result-ready") return { label: i18n.t("session:returnSummary.linkOutputs"), target: { kind: "tab", tab: "results" } };
    if (stop.need.startsWith("agent-run")) return { label: i18n.t("session:returnSummary.linkProgress"), target: { kind: "tab", tab: "progress" } };
  }
  return { label: i18n.t("session:returnSummary.linkActivity"), target: { kind: "tab", tab: "activity" } };
}

function describeNext(summary: ReturnSummary): Pick<ReturnLine, "text" | "link"> {
  const next = summary.next;
  switch (next.kind) {
    case "answer":
      return { text: i18n.t("session:returnSummary.nextAnswer"), link: { label: i18n.t("session:returnSummary.linkShow"), target: { kind: "request" } } };
    case "review":
      return { text: i18n.t("session:returnSummary.nextReview"), link: { label: i18n.t("session:returnSummary.linkOutputs"), target: { kind: "tab", tab: "results" } } };
    case "inspect-failure":
      return { text: i18n.t("session:returnSummary.nextInspectFailure"), link: { label: i18n.t("session:returnSummary.linkActivity"), target: { kind: "tab", tab: "activity" } } };
    case "check-stall":
      return { text: i18n.t("session:returnSummary.nextCheckStall"), link: { label: i18n.t("session:returnSummary.linkActivity"), target: { kind: "tab", tab: "activity" } } };
    case "open-run":
      return { text: i18n.t("session:returnSummary.nextOpenRun"), link: { label: i18n.t("session:returnSummary.linkProgress"), target: { kind: "tab", tab: "progress" } } };
    case "remaining":
      return { text: next.text, link: { label: i18n.t("session:returnSummary.linkHandoff"), target: { kind: "tab", tab: "handoff" } } };
    case "wait":
      return { text: i18n.t("session:returnSummary.nextWait"), link: { label: i18n.t("session:returnSummary.linkSideQuestion"), target: { kind: "side-question" } } };
    default:
      return { text: i18n.t("session:returnSummary.nextContinue"), link: { label: i18n.t("session:returnSummary.linkComposer"), target: { kind: "composer" } } };
  }
}

/** The summary's four lines in the user's language, each with its link. */
export function describeReturnSummary(summary: ReturnSummary, now: number): ReturnLine[] {
  const next = describeNext(summary);
  return [
    {
      id: "decision",
      label: i18n.t("session:returnSummary.labelDecision"),
      text: describeDecision(summary.decision),
      link: summary.decision?.kind === "record"
        ? { label: i18n.t("session:returnSummary.linkHandoff"), target: { kind: "tab", tab: "handoff" } }
        : null,
    },
    {
      id: "changes",
      label: i18n.t("session:returnSummary.labelChanges"),
      text: describeChanges(summary),
      link: { label: i18n.t("session:returnSummary.linkActivity"), target: { kind: "tab", tab: "activity" } },
    },
    { id: "stop", label: i18n.t("session:returnSummary.labelStop"), text: describeStop(summary.stop, now), link: stopLink(summary.stop) },
    { id: "next", label: i18n.t("session:returnSummary.labelNext"), ...next },
  ];
}
