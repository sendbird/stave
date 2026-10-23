import { i18n, useTranslation } from "@/i18n";
import { MessageCircleQuestion } from "lucide-react";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { openTaskSideQuestion } from "@/components/panes/task-surface-entry";
import { isSideChatProvider } from "@/lib/side-chat/side-chat";
import { useAppStore } from "@/store/app.store";

/** Activity's way into a side question about the task it shows. */
export function SideChatActivityButton(props: { taskId: string }) {
  useTranslation();
  const supported = useAppStore((state) =>
    isSideChatProvider(state.tasks.find((task) => task.id === props.taskId)?.provider),
  );
  if (!supported) return null;
  const label = i18n.t("session:sideChat.activityButton");
  return (
    <AdsButton
      variant="quiet"
      size="xs"
      iconOnly
      aria-label={label}
      title={label}
      data-testid="side-chat-activity-button"
      onClick={() => openTaskSideQuestion(props.taskId)}
    >
      <MessageCircleQuestion aria-hidden />
    </AdsButton>
  );
}
