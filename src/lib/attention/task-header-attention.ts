import { countNeedsYouTasks, deriveTaskAttention, mapFleetAttentionKind, type TaskAttentionFacts, type TaskAttentionRequest } from "./derive-task-attention";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import { notificationBelongsToItem, type FleetInboxEntry } from "@/lib/fleet/inbox-model";
import { taskAttentionTarget } from "@/lib/fleet/task-attention";
import { getDelegatedAttentionRoot } from "@/lib/notifications/delegated-attention";
import type { AppNotification } from "@/lib/notifications/notification.types";

function attentionSince(item: FleetAttentionItem) {
  return item.waitingSince ?? item.createdAt;
}

function newest(items: readonly FleetAttentionItem[], kind: FleetAttentionItem["kind"]) {
  return items.reduce<FleetAttentionItem | undefined>((latest, item) =>
    item.kind === kind && (!latest || Date.parse(attentionSince(item)) > Date.parse(attentionSince(latest))) ? item : latest,
  undefined);
}

function requestForItem(item: FleetAttentionItem, delegatedTaskId?: string): TaskAttentionRequest | null {
  const mapping = mapFleetAttentionKind(item.kind);
  if (mapping?.state !== "needs-you" || item.kind === "agent-run-blocked" || item.tarsResult ||
      !taskAttentionTarget(item, Boolean(delegatedTaskId))) return null;
  return {
    id: item.id,
    kind: mapping.reason,
    since: attentionSince(item),
    owner: delegatedTaskId ? { kind: "delegated-child", parentTaskId: delegatedTaskId } : { kind: "host-managed" },
  };
}

function blockFact(item: FleetAttentionItem, seen = false) {
  return { id: item.id, since: attentionSince(item), recoveryAvailable: item.agentRunRecoveryAvailable === true, seen };
}

function tarsFact(item: FleetAttentionItem, seen = false) {
  return item.tarsResult ? { id: item.id, since: attentionSince(item), canAcceptCompletion: item.tarsResult.canAcceptCompletion, seen } : null;
}

/** Both global badges count the tasks that own live response routes. */
export function countFleetNeedsYouTasks(entries: readonly FleetInboxEntry[]) {
  const tasks = new Map<string, ReturnType<typeof deriveTaskAttention>>();
  for (const { item, workspaceId, taskId } of entries) {
    if (!item || !workspaceId || !taskId) continue;
    const request = requestForItem(item, taskId !== item.taskId ? taskId : undefined);
    const attention = deriveTaskAttention({
      pendingRequests: request ? [request] : [],
      agentRunBlock: item.kind === "agent-run-blocked" ? blockFact(item) : null,
      tarsResult: tarsFact(item),
    });
    if (attention.state === "needs-you") tasks.set(JSON.stringify([workspaceId, taskId]), attention);
  }
  return countNeedsYouTasks([...tasks.values()]);
}

export function deriveTaskHeaderAttention(args: {
  taskId: string;
  workspaceId: string;
  activeTurnId?: string;
  agentRunWorking?: boolean;
  liveItems: readonly FleetAttentionItem[];
  fleetItems: readonly FleetAttentionItem[];
  notifications: readonly AppNotification[];
}) {
  const { taskId, workspaceId, activeTurnId, notifications } = args;
  const notificationById = new Map(notifications.map((item) => [item.id, item]));
  const items = new Map(args.liveItems.map((item) => [item.id, item]));
  const delegated = new Set<string>();
  for (const item of args.fleetItems) {
    const notification = item.notificationId ? notificationById.get(item.notificationId) : undefined;
    const root = notification && !notification.resolvedAt ? getDelegatedAttentionRoot(notification) : null;
    if (root) {
      if (root.taskId !== taskId || (root.workspaceId && root.workspaceId !== workspaceId)) continue;
      delegated.add(item.id);
    } else {
      if (item.taskId !== taskId || item.workspaceId !== workspaceId) continue;
      // The visible task can verify its own interactions from the transcript.
      if (item.kind === "approval" || item.kind === "user-input") continue;
    }
    items.set(item.id, item);
  }
  const seen = (item: FleetAttentionItem) => item.agentRunNotificationId
    ? Boolean(notificationById.get(item.agentRunNotificationId)?.readAt)
    : notifications.some((notification) => notification.readAt && notificationBelongsToItem(item, notification));
  const relevant = [...items.values()];
  const pendingRequests: TaskAttentionRequest[] = [];
  for (const item of relevant) {
    const request = requestForItem(item, delegated.has(item.id) ? taskId : undefined);
    if (request) pendingRequests.push(request);
  }
  const block = newest(relevant, "agent-run-blocked");
  const stuck = newest(relevant.filter((item) => !seen(item)), "agent-run-stuck");
  const tarsResults = relevant.filter((item) => item.tarsResult);
  const tars = tarsResults.find((item) => item.tarsResult?.canAcceptCompletion &&
    !pendingRequests.some((request) => items.get(request.id)?.tarsResponsibilityId === item.tarsResponsibilityId)) ??
    tarsResults.find((item) => !item.tarsResult?.canAcceptCompletion && !seen(item));
  const failure = newest(relevant.filter((item) => !seen(item)), "run-failed");
  const stall = newest(relevant, "turn-stalled");
  const result = newest(relevant.filter((item) => !item.tarsResult && !seen(item)), "result-ready");
  const turnFact = (item: FleetAttentionItem | undefined) => {
    const turnId = item?.turnId ?? item?.resultReview?.turnId;
    return item && turnId ? { turnId, since: attentionSince(item) } : null;
  };
  const facts: TaskAttentionFacts = {
    activeTurnId,
    pendingRequests,
    waitingForChild: args.agentRunWorking ? { since: null } : null,
    turnFailure: turnFact(failure),
    turnStall: turnFact(stall),
    agentRunStuckAt: stuck ? attentionSince(stuck) : null,
    agentRunBlock: block ? blockFact(block, seen(block)) : null,
    tarsResult: tars ? tarsFact(tars, seen(tars)) : null,
    lastResultAt: result ? attentionSince(result) : null,
  };
  const attention = deriveTaskAttention(facts);
  const request = attention.requests[0];
  const item = attention.state === "needs-you" && request ? items.get(request.id)
    : attention.state === "problem" ? relevant.find((row) => row.kind === attention.reason && attentionSince(row) === attention.since)
    : undefined;
  return { attention, target: item ? taskAttentionTarget(item, delegated.has(item.id)) : null };
}
