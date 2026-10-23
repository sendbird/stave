import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { GitCompareArrows, MessageCircleQuestion } from "lucide-react";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { Toggle } from "@/components/ads/components/Toggle";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { layoutShellStyles } from "@/components/layout/layout-shell.styles";
import { openTaskSideQuestion, toggleTaskReview } from "@/components/panes/task-surface-entry";
import { useShortcutHint } from "@/components/system/ShortcutKeys";
import { isSideChatProvider } from "@/lib/side-chat/side-chat";
import { useAppStore } from "@/store/app.store";
import { useTaskReviewModeStore } from "@/store/task-review-mode-store";

/**
 * Actions on the task a pane group shows, at the right of the group's tab
 * strip, so they stay in reach however the task is shown and cost the task
 * no row of its own: the side question, and the switch between the
 * conversation and Review, pressed while Review shows. The composer's
 * controls stay as they are.
 */
export function TaskPaneHeaderActions(props: { taskId: string }) {
  useTranslation();
  const sideQuestionSupported = useAppStore((state) =>
    isSideChatProvider(state.tasks.find((task) => task.id === props.taskId)?.provider),
  );
  const reviewShown = useTaskReviewModeStore((state) => state.byTask[props.taskId]?.mode === "review");
  // The shortcuts as Settings have them now, shown as keycaps in the tooltips.
  const sideQuestionShortcut = useShortcutHint("view.side-question");
  const reviewShortcut = useShortcutHint("task.toggle-review");
  return (
    <>
      {sideQuestionSupported ? (
        <Tooltip content={i18n.t("panes:taskHeaderActions.sideQuestionHint")} shortcut={sideQuestionShortcut}>
          <span className={sx(layoutShellStyles.inlineFlex)}>
            <AdsButton
              variant="quiet"
              size="xs"
              data-testid="pane-header-side-question"
              onClick={() => openTaskSideQuestion(props.taskId)}
            >
              <MessageCircleQuestion aria-hidden />
              {i18n.t("panes:taskHeaderActions.sideQuestion")}
            </AdsButton>
          </span>
        </Tooltip>
      ) : null}
      <Tooltip
        content={reviewShown ? i18n.t("review:mode.backToConversation") : i18n.t("review:mode.openReview")}
        shortcut={reviewShortcut}
      >
        <span className={sx(layoutShellStyles.inlineFlex)}>
          <Toggle
            size="xs"
            pressed={reviewShown}
            onPressedChange={() => toggleTaskReview(props.taskId)}
            icon={<GitCompareArrows aria-hidden className={sx(styles.toggleIcon)} />}
            xstyle={styles.toggle}
            data-testid="pane-header-review"
          >
            {i18n.t("review:mode.review")}
          </Toggle>
        </span>
      </Tooltip>
    </>
  );
}

// The Toggle keeps body type at every height; in the header it matches the
// extra-small buttons beside it (caption type, 14px glyph).
const styles = stylex.create({
  toggle: {
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-8"],
  },
  toggleIcon: {
    width: vars["--ads-control-icon-size-sm"],
    height: vars["--ads-control-icon-size-sm"],
  },
});
