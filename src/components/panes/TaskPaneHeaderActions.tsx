import { i18n, useTranslation } from "@/i18n";
import { MessageCircleQuestion } from "lucide-react";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { sx } from "@/components/ads/utils/stylex";
import { layoutShellStyles } from "@/components/layout/layout-shell.styles";
import { openTaskSideQuestion } from "@/components/panes/task-surface-entry";
import { useShortcutHint } from "@/components/system/ShortcutKeys";
import { isSideChatProvider } from "@/lib/side-chat/side-chat";
import { useAppStore } from "@/store/app.store";

/**
 * Actions on the task a pane group shows, at the right of the group's tab
 * strip, so they stay in reach however the task is shown. The side question
 * lives here, not among the composer's controls, which stay as they are.
 */
export function TaskPaneHeaderActions(props: { taskId: string }) {
  useTranslation();
  const supported = useAppStore((state) =>
    isSideChatProvider(state.tasks.find((task) => task.id === props.taskId)?.provider),
  );
  // The chord as Settings has it now, shown as keycaps in the tooltip.
  const shortcut = useShortcutHint("view.side-question");
  if (!supported) return null;
  return (
    <Tooltip content={i18n.t("panes:taskHeaderActions.sideQuestionHint")} shortcut={shortcut}>
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
  );
}
