import { i18n, useTranslation } from "@/i18n";
import { Button } from "@/components/ads/components/Button";
import { StatusDot } from "@/components/ads/components/StatusDot";
import { sx } from "@/components/ads/utils/stylex";
import { showTaskConversation } from "@/components/panes/task-surface-entry";
import { useAppStore } from "@/store/app.store";
import { reviewStyles as styles } from "./review.styles";

export type ReviewTaskStatus = "working" | "approval" | "user_input";

/** What the task is doing while Review shows, or null when it is idle. */
export function resolveReviewTaskStatus(args: {
  running: boolean;
  pendingInteraction: "approval" | "user_input" | null;
}): ReviewTaskStatus | null {
  if (!args.running) return null;
  return args.pendingInteraction ?? "working";
}

const STATUS_KEYS = {
  working: "review:taskStatus.working",
  approval: "review:taskStatus.approval",
  user_input: "review:taskStatus.userInput",
} as const;

/**
 * One line at the top of Review, only while the task runs: what it is doing,
 * and the way to the conversation, where its approval and question cards and
 * its composer are. Review never switches away by itself (D13); this line is
 * how a request made while you review stays in view.
 */
export function ReviewTaskStatusLine(props: { taskId: string }) {
  useTranslation();
  const { taskId } = props;
  const running = useAppStore((state) => Boolean(state.activeTurnIdsByTask[taskId]));
  const pendingInteraction = useAppStore((state) => state.providerTurnActivityByTask[taskId]?.pendingInteraction ?? null);
  const status = resolveReviewTaskStatus({ running, pendingInteraction });
  if (!status) return null;
  const waiting = status !== "working";
  return (
    <div className={sx(styles.taskStatus, waiting && styles.taskStatusWaiting)} role="status" data-testid="review-task-status" data-status={status}>
      <StatusDot tone={waiting ? "warning" : "info"} size="sm" />
      <span className={sx(styles.taskStatusText)}>{i18n.t(STATUS_KEYS[status])}</span>
      {waiting ? (
        <Button variant="primary" size="xs" data-testid="review-respond-in-conversation" onClick={() => showTaskConversation(taskId)}>
          {i18n.t("review:taskStatus.respond")}
        </Button>
      ) : (
        <>
          <Button variant="quiet" size="xs" onClick={() => showTaskConversation(taskId)}>
            {i18n.t("review:taskStatus.watch")}
          </Button>
          <Button variant="outline" size="xs" data-testid="review-stop-turn" onClick={() => useAppStore.getState().abortTaskTurn({ taskId })}>
            {i18n.t("common:actions.stop")}
          </Button>
        </>
      )}
    </div>
  );
}
