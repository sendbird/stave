import { useId, useMemo } from "react";
import * as stylex from "@stylexjs/stylex";
import { useShallow } from "zustand/react/shallow";
import { i18n, useTranslation } from "@/i18n";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { Button } from "@/components/ui";
import { collectFleetLiveAttentionItems, type FleetAttentionItem } from "@/lib/fleet/attention-projection";
import { isSupervisedTaskTurn } from "@/lib/fleet/agent-run-attention";
import { isExternallyManagedTask } from "@/lib/tasks";
import { FLEET_ATTENTION_KIND_LABEL } from "@/lib/fleet/fleet-vocabulary";
import { getTaskAttentionTier, mergeTaskAttention, selectTaskAttention, taskAttentionDestination } from "@/lib/fleet/task-attention";
import { getDelegatedAttentionRoot } from "@/lib/notifications/delegated-attention";
import { toast } from "@/lib/notifications/toast";
import { useAppStore } from "@/store/app.store";
import { useFleetAttention } from "@/store/fleet-attention-store";
import { useFleetAgentRunsStore } from "@/store/fleet-agent-runs-store";
import { useTaskReviewModeStore } from "@/store/task-review-mode-store";
import { openTaskInspection } from "./task-inspection-navigation";

/** Every action names its exact request, turn or stage; reading never approves it. */
export function openTaskAttention(item: FleetAttentionItem, taskId: string) {
  const state = useAppStore.getState();
  const notification = state.notifications.find((notification) => notification.id === item.notificationId);
  const root = notification ? getDelegatedAttentionRoot(notification) : null;
  const workspaceId = root?.workspaceId ?? (root?.taskId === taskId ? state.activeWorkspaceId : item.workspaceId);
  if (state.activeWorkspaceId !== workspaceId || !state.tasks.some((task) => task.id === taskId)) return;
  const review = useTaskReviewModeStore.getState();
  if (root) {
    if (root.taskId !== taskId || !notification) return;
    review.showConversation(taskId);
    void state.openNotificationContext({ notificationId: notification.id, targetSurface: "task" }).then(() => {
      window.requestAnimationFrame(() => {
        const current = useAppStore.getState();
        if (current.activeWorkspaceId !== workspaceId || current.activeTaskId !== taskId || !item.requestId) return;
        const slot = document.querySelector<HTMLElement>(`[data-delegated-request-id="${CSS.escape(item.requestId)}"]`);
        slot?.scrollIntoView({ block: "nearest" });
        slot?.querySelector<HTMLElement>("button, input, textarea")?.focus({ preventScroll: true });
      });
    }).catch(() => toast.error(i18n.t("fleet:taskAttention.openFailed")));
    return;
  }
  if (item.taskId && item.taskId !== taskId) return;
  switch (taskAttentionDestination(item)) {
    case "pr":
      if (item.prUrl) void window.api?.shell?.openExternal?.({ url: item.prUrl });
      else openTaskInspection(item.workspaceId, taskId, "progress");
      break;
    case "reviewStage":
      review.openReview(taskId, { kind: "stage", ...item.agentRunStage! });
      break;
    case "reviewTurn":
      review.openReview(taskId, { kind: "turn", taskId, turnId: item.turnId! });
      break;
    case "request":
      review.showConversation(taskId);
      state.focusTranscriptDecision({ taskId, messageId: item.messageId!, requestId: item.requestId! });
      break;
    case "pendingRequest":
      review.showConversation(taskId);
      void state.focusTaskAttention({ workspaceId: item.workspaceId, taskId });
      break;
    case "progress":
      openTaskInspection(item.workspaceId, taskId, "progress");
      break;
  }
}

export function TaskAttentionSummary(props: { taskId: string }) {
  const { t } = useTranslation("fleet");
  const id = useId();
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const [task, messages, activeTurnId, activity, repositoryPath] = useAppStore(useShallow((state) => [
    state.tasks.find((task) => task.id === props.taskId), state.messagesByTask[props.taskId],
    state.activeTurnIdsByTask[props.taskId], state.providerTurnActivityByTask[props.taskId], state.repositoryPath,
  ] as const));
  const allItems = useFleetAttention((snapshot) => snapshot.items);
  const notifications = useAppStore((state) => state.notifications);
  const snoozedItems = useFleetAttention((snapshot) => snapshot.snoozedItems);
  const lastTurnId = messages?.at(-1)?.turnId;
  const supervised = useFleetAgentRunsStore((state) => Boolean(lastTurnId && Object.values(state.details).some((detail) =>
    detail.agentRun.workspaceId === workspaceId && isSupervisedTaskTurn(detail, props.taskId, lastTurnId))));
  const localItems = useMemo(() => task && !isExternallyManagedTask(task) && !activeTurnId && !supervised ? collectFleetLiveAttentionItems([{
    repositoryPath: repositoryPath ?? "", repositoryName: "", workspaceId, workspaceName: "",
    tasks: [task], messagesByTask: { [task.id]: messages ?? [] },
    activeTurnIdsByTask: { [task.id]: activeTurnId }, providerTurnActivityByTask: { [task.id]: activity },
  }]) : [], [task, activeTurnId, supervised, repositoryPath, workspaceId, messages, activity]);
  const items = useMemo(() => mergeTaskAttention({
    items: selectTaskAttention(allItems, workspaceId, props.taskId, notifications), localItems, snoozedItems, supervised,
  }), [allItems, workspaceId, props.taskId, notifications, localItems, snoozedItems, supervised]);
  if (items.length === 0) return null;
  const blocking = items.some((item) => getTaskAttentionTier(item) === "blocking");
  return (
    <details key={`${workspaceId}:${props.taskId}:${blocking}`} open={blocking} className={sx(styles.root)}>
      <summary id={id} className={sx(styles.summary)}>
        {t(blocking ? "taskAttention.actionRequired" : items.every((item) => item.acknowledged)
          ? "taskAttention.recentFailure" : "taskAttention.forReview", { count: items.length })}
      </summary>
      <ul className={sx(styles.list)} aria-labelledby={id}>
        {items.map((item) => (
          <li key={item.id} className={sx(styles.row)}>
            <div className={sx(styles.copy)}>
              <p className={sx(styles.title)}>{FLEET_ATTENTION_KIND_LABEL[item.kind]}</p>
              {item.detail ? <p className={sx(styles.detail)}>{item.detail}</p> : null}
              <p className={sx(styles.detail)}>{t(`taskAttention.hint.${taskAttentionDestination(item)}`)}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => openTaskAttention(item, props.taskId)}>
              {t(`taskAttention.action.${taskAttentionDestination(item)}`)}
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}

const styles = stylex.create({
  root: {
    flexShrink: 0,
    maxHeight: "35%",
    overflowY: "auto",
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: vars["--ads-color-border-subtle"],
  },
  summary: {
    cursor: "pointer",
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  list: { listStyle: "none", margin: 0, padding: 0 },
  row: {
    display: "flex", alignItems: "start", flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-8"], paddingInline: vars["--ads-space-12"],
  },
  copy: { flex: "1 1 16rem", minWidth: 0, overflowWrap: "anywhere" },
  title: {
    margin: 0, fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text"], fontWeight: vars["--ads-font-weight-medium"],
  },
  detail: {
    margin: 0, marginTop: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-muted"],
  },
});
