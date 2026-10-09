import { formatList, formatRelativeTime } from "@/i18n/format";
import { i18n, type I18nKey } from "@/i18n/runtime";
/**
 * How a pull request watch reads on the Schedules list, its detail pane and
 * the task panel: what it wakes on, which pull request it follows, and what
 * the last check saw. Pure apart from the display language.
 *
 * Used by `src/lib/schedule-rows.ts`, `src/lib/supervision/wake-up-view.ts`
 * and `src/components/layout/automation-center/CheckBackDetail.tsx`.
 */
import {
  normalizePullRequestWatchEvents,
  type PullRequestWatchEvent,
  type PullRequestWatchState,
} from "./pull-request-watch";

const EVENT_LABEL = {
  checks_failed: "automation:pullRequestWatch.eventChecksFailed",
  merge_conflict: "automation:pullRequestWatch.eventMergeConflict",
  review_comments: "automation:pullRequestWatch.eventReviewComments",
} as const satisfies Record<PullRequestWatchEvent, I18nKey>;

export function pullRequestWatchEventLabel(event: PullRequestWatchEvent): string {
  return i18n.t(EVENT_LABEL[event]);
}

/** "Failing checks or merge conflicts". */
export function describePullRequestWatchEvents(events: readonly PullRequestWatchEvent[]) {
  const labels = normalizePullRequestWatchEvents(events).map(pullRequestWatchEventLabel);
  const list = formatList(labels, { type: "disjunction" });
  return i18n.t("automation:pullRequestWatch.wakesOn", { events: list });
}

/** "PR #12 · Fix the flaky upload test", or that it has not seen one yet. */
export function describePullRequestWatchTarget(state: PullRequestWatchState | null) {
  const pr = state?.pullRequest;
  if (!pr) return i18n.t("automation:pullRequestWatch.waitingForPullRequest");
  return pr.title
    ? i18n.t("automation:pullRequestWatch.target", { number: pr.number, title: pr.title })
    : i18n.t("automation:pullRequestWatch.targetNumber", { number: pr.number });
}

export interface PullRequestWatchCheckLine {
  text: string;
  tone: "neutral" | "success" | "warning" | "danger";
  /** When the line is from; null before the first check. */
  at: string | null;
}

/** What the last check saw, in one line, without the time. */
export function describePullRequestWatchLastSeen(
  state: PullRequestWatchState | null,
): PullRequestWatchCheckLine {
  if (!state?.lastCheckedAt) {
    return { text: i18n.t("automation:pullRequestWatch.notCheckedYet"), tone: "neutral", at: null };
  }
  const at = state.lastCheckedAt;
  if (state.lastReadError) {
    return {
      text: i18n.t("automation:pullRequestWatch.readFailed", { error: state.lastReadError }),
      tone: "warning",
      at,
    };
  }
  const seen = state.lastSeen;
  if (!seen) {
    return { text: i18n.t("automation:pullRequestWatch.noPullRequestYet"), tone: "neutral", at };
  }
  if (seen.state === "MERGED") return { text: i18n.t("automation:pullRequestWatch.merged"), tone: "success", at };
  if (seen.state === "CLOSED") return { text: i18n.t("automation:pullRequestWatch.closed"), tone: "neutral", at };
  const problems = [
    ...(seen.failingChecks > 0
      ? [i18n.t("automation:pullRequestWatch.failingChecks", { count: seen.failingChecks })]
      : []),
    ...(seen.conflicting ? [i18n.t("automation:pullRequestWatch.conflicting")] : []),
    ...(seen.reviewComments > 0
      ? [i18n.t("automation:pullRequestWatch.openComments", { count: seen.reviewComments })]
      : []),
  ];
  if (problems.length > 0) return { text: problems.join(" · "), tone: "danger", at };
  if (seen.checksPending) return { text: i18n.t("automation:pullRequestWatch.checksRunning"), tone: "neutral", at };
  return { text: i18n.t("automation:pullRequestWatch.allClear"), tone: "success", at };
}

/** "2 minutes ago · 1 failing check" for the detail pane. */
export function describePullRequestWatchLastCheck(state: PullRequestWatchState | null, now = Date.now()) {
  const line = describePullRequestWatchLastSeen(state);
  return line.at ? `${formatRelativeTime(line.at, now)} · ${line.text}` : line.text;
}
