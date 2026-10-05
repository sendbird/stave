import { i18n } from "@/i18n/runtime";
import type { WorkState } from "@/components/ads/components/state-vocabulary";

/**
 * What a Task panel tab carries beside its label. A state wears the shared
 * work-state glyph, so "running" and "waiting on you" differ by shape and not
 * only by colour (several themes paint accent and warning the same hue); a
 * quantity is a count. The panel draws a mark at a fixed size outside the
 * tab's layout, so a mark arriving or leaving never moves a label.
 */
export type TaskTabMark =
  | { kind: "state"; state: WorkState; label: string }
  | { kind: "count"; count: number; text: string; label: string };

/** Counts read literally to 99; past that the slot says `99+`. */
export function formatTaskTabCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/** Activity: what the live turn is waiting on, or that it is running. */
export function resolveActivityTabMark(args: {
  running: boolean;
  pendingInteraction: string | null;
}): TaskTabMark | null {
  if (args.pendingInteraction === "approval") {
    return { kind: "state", state: "approval", label: i18n.t("session:taskPanelMarks.label") };
  }
  if (args.pendingInteraction === "user_input") {
    return { kind: "state", state: "needs-you", label: i18n.t("session:taskPanelMarks.label2") };
  }
  if (args.running) {
    return { kind: "state", state: "working", label: i18n.t("session:taskPanelMarks.label3") };
  }
  return null;
}

/**
 * Progress: only an active agent run or agent run that needs attention. A
 * healthy run says nothing here; its stage track is one click away.
 */
export function resolveProgressTabMark(
  badge: { tone: string; label: string } | null,
): TaskTabMark | null {
  if (!badge) return null;
  if (badge.tone === "warning") {
    return { kind: "state", state: "needs-you", label: badge.label };
  }
  if (badge.tone === "danger") {
    return { kind: "state", state: "failed", label: badge.label };
  }
  return null;
}

/** Subagents: how many agents are running now. */
export function resolveSubagentsTabMark(runningCount: number): TaskTabMark | null {
  if (runningCount <= 0) return null;
  return {
    kind: "count",
    count: runningCount,
    text: formatTaskTabCount(runningCount),
    label: i18n.t("session:remaining.presentationCopy374", { v1: runningCount }),
  };
}

/** Results: how many runs wait for a review. */
export function resolveResultsTabMark(pendingReviews: number): TaskTabMark | null {
  if (pendingReviews <= 0) return null;
  return {
    kind: "count",
    count: pendingReviews,
    text: formatTaskTabCount(pendingReviews),
    label: i18n.t("session:taskPanelMarks.label4", { value1: pendingReviews }),
  };
}
