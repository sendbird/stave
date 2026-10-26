import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { GitCompareArrows, MessageSquare } from "lucide-react";
import { ToggleGroup } from "@/components/ads/components/ToggleGroup";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
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
 * and in Review's scope bar, where a question is asked.
 */
export function TaskPaneHeaderActions(props: { taskId: string }) {
  useTranslation();
  const mode = useTaskReviewModeStore((state) => state.byTask[props.taskId]?.mode ?? "conversation");
  const changes = useLatestTurnChanges(props.taskId);
  // The shortcut as Settings has it now, shown as keycaps in the tooltip.
  const reviewShortcut = useShortcutHint("task.toggle-review");
  const reviewLabel = i18n.t("review:mode.review");
  return (
    <Tooltip
      content={changes ? describeChanges(changes) : i18n.t("review:mode.switchHint")}
      shortcut={reviewShortcut}
    >
      <span className={sx(layoutShellStyles.inlineFlex)} data-testid="pane-header-mode-switch">
        <ToggleGroup
          aria-label={i18n.t("review:mode.switchLabel")}
          density="compact"
          value={[mode]}
          items={[
            {
              value: "conversation",
              icon: <MessageSquare aria-hidden />,
              label: i18n.t("review:mode.conversation"),
            },
            {
              value: "review",
              icon: <GitCompareArrows aria-hidden />,
              label: changes ? (
                <span className={sx(styles.reviewLabel)}>
                  {reviewLabel}
                  <ChangeCounts changes={changes} />
                </span>
              ) : reviewLabel,
            },
          ]}
          onValueChange={(next) => {
            const target = next[0] as TaskSurfaceMode | undefined;
            // Pressing the shown mode again keeps it: a switch is never empty.
            if (!target || target === mode) return;
            if (target === "review") openTaskReview(props.taskId);
            else showTaskConversation(props.taskId);
          }}
        />
      </span>
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
  reviewLabel: {
    display: "inline-flex",
    alignItems: "baseline",
    gap: vars["--ads-space-4"],
  },
  counts: {
    display: "inline-flex",
    gap: vars["--ads-space-2"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-medium"],
  },
  added: { color: vars["--ads-color-diff-added-text"] },
  removed: { color: vars["--ads-color-diff-removed-text"] },
});
