import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { GitCompareArrows, MessageSquare } from "lucide-react";
import { SegmentedControl } from "@/components/system/SegmentedControl";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { layoutShellStyles } from "@/components/layout/layout-shell.styles";
import { openTaskReview, showTaskConversation } from "@/components/panes/task-surface-entry";
import { useLatestTurnChanges, type TurnChangeSummary } from "@/components/panes/task-review-changes";
import { useShortcutHint } from "@/components/system/ShortcutKeys";
import { useTaskReviewModeStore, type TaskSurfaceMode } from "@/store/task-review-mode-store";

/**
 * The switch between a task's conversation and its Review, at the right of
 * the pane group's tab strip, so it stays in reach however the task is shown
 * and costs the task no row of its own. Review carries what the latest turn
 * changed, the scope it opens on. The side question lives with the composer
 * where a question is asked.
 */
export function TaskPaneHeaderActions(props: {
  taskId: string;
  /**
   * The group is narrow: the switch becomes two icon segments, each named in
   * its tooltip and accessible name, so it never wraps over the tabs.
   */
  compact?: boolean;
}) {
  useTranslation();
  const mode = useTaskReviewModeStore((state) => state.byTask[props.taskId]?.mode ?? "conversation");
  const changes = useLatestTurnChanges(props.taskId);
  // The shortcut as Settings has it now, shown as keycaps in the tooltip.
  const reviewShortcut = useShortcutHint("task.toggle-review");
  const reviewLabel = i18n.t("review:mode.review");
  const toggle = (
    <span
      className={sx(layoutShellStyles.inlineFlex, styles.switch)}
      data-compact={props.compact ? "true" : undefined}
      data-testid="pane-header-mode-switch"
    >
      <SegmentedControl<TaskSurfaceMode>
        aria-label={i18n.t("review:mode.switchLabel")}
        iconOnly={props.compact}
        value={mode}
        options={[
          {
            value: "conversation",
            icon: <MessageSquare aria-hidden />,
            label: i18n.t("review:mode.conversation"),
          },
          {
            value: "review",
            icon: <GitCompareArrows aria-hidden />,
            // Icon-only segments take their name from a string label, so the
            // latest turn's counts move into that name.
            label: props.compact
              ? changes
                ? i18n.t("review:mode.reviewWithChanges", { added: changes.added, removed: changes.removed, count: changes.files })
                : reviewLabel
              : changes ? (
                <span className={sx(styles.reviewLabel)}>
                  {reviewLabel}
                  <ChangeCounts changes={changes} />
                </span>
              ) : reviewLabel,
          },
        ]}
        onValueChange={(target) => {
          if (target === "review") openTaskReview(props.taskId);
          else showTaskConversation(props.taskId);
        }}
      />
    </span>
  );
  // Icon segments carry their own tooltips; a second one around the group
  // would open two bubbles for one hover.
  return props.compact ? toggle : (
    <Tooltip
      content={changes ? describeChanges(changes) : i18n.t("review:mode.switchHint")}
      shortcut={reviewShortcut}
    >
      {toggle}
    </Tooltip>
  );
}

function describeChanges(changes: TurnChangeSummary): string {
  return i18n.t("review:mode.latestTurnChanges", { added: changes.added, removed: changes.removed, count: changes.files });
}

function ChangeCounts(props: { changes: TurnChangeSummary }) {
  return (
    <span className={sx(styles.counts)} data-testid="pane-header-review-changes">
      <span className={sx(styles.added)}>+{props.changes.added}</span>
      <span className={sx(styles.removed)}>−{props.changes.removed}</span>
    </span>
  );
}

const styles = stylex.create({
  // The switch keeps its one line; the tab strip beside it is what yields.
  switch: { flexShrink: 0, whiteSpace: "nowrap" },
  reviewLabel: {
    display: "inline-flex",
    alignItems: "baseline",
    gap: vars["--aui-space-4"],
  },
  counts: {
    display: "inline-flex",
    gap: vars["--aui-space-2"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-medium"],
  },
  added: { color: vars["--aui-color-diff-added-text"] },
  removed: { color: vars["--aui-color-diff-removed-text"] },
});
