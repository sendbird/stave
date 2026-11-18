import { useState } from "react";
import { Reply } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { transition } from "@/components/aui/recipes/transition";
import { sx } from "@/components/aui/utils/stylex";
import { MessageAction } from "@/components/ai-elements";
import { toast } from "@/components/ui";
import { conversationTurnActionsStyles as styles } from "./conversation-turn-actions.styles";
import { useAppStore } from "@/store/app.store";

/** Only the newest completed reply in a fork offers its result to the source. */
export function ForkReturnAction(props: { taskId: string; messageId: string; variant?: "inline" | "preview" }) {
  useTranslation();
  const parent = useAppStore((state) => state.tasks.find((task) => task.id === props.taskId)?.forkParent);
  const latest = useAppStore((state) => state.messagesByTask[props.taskId]?.findLast((message) => message.role === "assistant"));
  const running = useAppStore((state) => Boolean(state.activeTurnIdsByTask[props.taskId]));
  const [pending, setPending] = useState(false);
  if (!parent || latest?.id !== props.messageId || latest.isStreaming) return null;
  return (
    <MessageAction
      aria-disabled={pending || running}
      data-testid="fork-return"
      className={sx(
        props.variant === "preview" ? styles.actionPreview : styles.actionInline,
        (pending || running) && styles.actionDisabled,
        transition.control,
      )}
      onClick={async () => {
        if (pending || running) return;
        setPending(true);
        try {
          const result = await useAppStore.getState().sendForkResultToOriginal({ taskId: props.taskId });
          if (!result.ok) toast.error(result.detail);
        } catch {
          toast.error(i18n.t("app:forkReturn.failed"));
        } finally {
          setPending(false);
        }
      }}
    >
      <Reply aria-hidden className={sx(styles.iconSm)} />
      {i18n.t("session:forkReturn.sendResult")}
    </MessageAction>
  );
}
