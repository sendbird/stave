import { getFleetAttentionTier, type FleetAttentionItem } from "./attention-projection";
import { getDelegatedAttentionRoot } from "@/lib/notifications/delegated-attention";
import type { AppNotification } from "@/lib/notifications/notification.types";

export type TaskAttentionItem = FleetAttentionItem & { acknowledged?: boolean };
export function getTaskAttentionTier(item: TaskAttentionItem) {
  return item.acknowledged ? "review" : getFleetAttentionTier(item.kind);
}

/** Routine results and passive status stay in Review/Fleet, outside the task's action summary. */
export function selectTaskAttention(
  items: readonly FleetAttentionItem[],
  workspaceId: string,
  taskId: string,
  notifications: readonly AppNotification[] = [],
) {
  return items.filter((item) => {
    const notification = notifications.find((notification) => notification.id === item.notificationId);
    const root = notification ? getDelegatedAttentionRoot(notification) : null;
    const belongs = root
      ? root.taskId === taskId && (!root.workspaceId || root.workspaceId === workspaceId)
      : item.workspaceId === workspaceId &&
        (item.taskId === taskId || (!item.taskId && item.source === "pr"));
    return belongs && (getFleetAttentionTier(item.kind) === "blocking" ||
      item.kind === "pr-changes-requested" || item.kind === "pr-checks-failed" ||
      item.kind === "pr-merge-conflict");
  });
}

export function taskAttentionDestination(item: FleetAttentionItem) {
  if (item.source === "pr") return "pr";
  if (item.agentRunStage) return item.kind === "agent-run-sign-off" ? "reviewStage" : "progress";
  if (item.requestId && item.messageId) return "request";
  if (item.kind === "approval" || item.kind === "user-input") return "pendingRequest";
  return item.turnId ? "reviewTurn" : "progress";
}

/** Reading a failure clears global reminders, but its cause stays discoverable inside the task. */
export function mergeTaskAttention(args: {
  items: readonly FleetAttentionItem[];
  localItems: readonly FleetAttentionItem[];
  snoozedItems: readonly FleetAttentionItem[];
  supervised: boolean;
}) {
  const items: TaskAttentionItem[] = [...args.items];
  for (const item of args.localItems) {
    if (item.kind !== "run-failed" || args.supervised ||
      items.some((current) => current.id === item.id) ||
      args.snoozedItems.some((current) => current.id === item.id)) continue;
    items.push({ ...item, acknowledged: true });
  }
  return items;
}
