import { useMemo, useState } from "react";
import { openTaskAttention } from "@/components/session/TaskAttentionSummary";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import {
  findReviewQueueAnchor,
  locateInReviewQueue,
  selectReviewQueue,
  type ReviewQueuePosition,
} from "@/lib/review/review-queue";
import { useAppStore } from "@/store/app.store";
import { useFleetAttention } from "@/store/fleet-attention-store";

/**
 * Where the task under review sits among the reviews waiting on the user:
 * Fleet's own attention snapshot, read in Fleet's order. The task's place is
 * remembered once it leaves the queue (after Mark reviewed), so "next" stays
 * the review that followed it.
 */
export function useReviewQueue(args: { workspaceId: string; taskId: string }): ReviewQueuePosition {
  const items = useFleetAttention((snapshot) => snapshot.items);
  const queue = useMemo(() => selectReviewQueue(items), [items]);
  const task = useMemo(() => ({ workspaceId: args.workspaceId, taskId: args.taskId }), [args.workspaceId, args.taskId]);
  const current = useMemo(() => findReviewQueueAnchor(queue, task), [queue, task]);
  // Derived state, updated during render: the last place the task held.
  const [remembered, setRemembered] = useState<FleetAttentionItem | null>(null);
  if (current && current !== remembered) setRemembered(current);
  const anchor = current ?? (remembered && remembered.workspaceId === task.workspaceId && remembered.taskId === task.taskId ? remembered : null);
  return useMemo(() => locateInReviewQueue({ queue, task, anchor }), [queue, task, anchor]);
}

/**
 * Opens a waiting review where it lives: its repository, workspace and task
 * first, then the turn or stage it asks about, exactly as the task's own
 * attention summary opens it.
 */
export async function openReviewQueueItem(item: FleetAttentionItem) {
  const taskId = item.taskId;
  if (!taskId) return;
  await useAppStore.getState().focusTaskAttention({
    repositoryPath: item.repositoryPath,
    workspaceId: item.workspaceId,
    taskId,
  });
  openTaskAttention(item, taskId);
}
