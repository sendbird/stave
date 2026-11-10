import { useState } from "react";
import { i18n, useTranslation } from "@/i18n";
import { Button } from "@/components/aui/components/Button";
import { toast } from "@/components/ui";
import { useAppStore } from "@/store/app.store";

/** Only the newest completed reply in a fork offers its result to the source. */
export function ForkReturnAction(props: { taskId: string; messageId: string }) {
  useTranslation();
  const parent = useAppStore((state) => state.tasks.find((task) => task.id === props.taskId)?.forkParent);
  const latest = useAppStore((state) => state.messagesByTask[props.taskId]?.findLast((message) => message.role === "assistant"));
  const running = useAppStore((state) => Boolean(state.activeTurnIdsByTask[props.taskId]));
  const [pending, setPending] = useState(false);
  if (!parent || latest?.id !== props.messageId || latest.isStreaming) return null;
  return (
    <Button
      variant="quiet"
      size="sm"
      disabled={pending || running}
      data-testid="fork-return"
      onClick={async () => {
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
      {i18n.t("session:forkReturn.sendResult")}
    </Button>
  );
}
