import {
  compareFleetAttentionItems,
  type FleetAttentionItem,
  type FleetAttentionKind,
} from "@/lib/fleet/attention-projection";
import { taskAttentionDestination } from "@/lib/fleet/task-attention";

/** Attention that Review settles: a finished turn's result and a stage's sign-off. */
const REVIEW_QUEUE_KINDS: ReadonlySet<FleetAttentionKind> = new Set([
  "result-ready",
  "run-failed",
  "agent-run-sign-off",
]);

/**
 * The reviews waiting on the user, in Fleet's order (urgency, then whatever
 * waited longest): the items Review opens on a turn or a stage. Requests,
 * pull request rows and quiet turns are answered elsewhere and stay out.
 */
export function selectReviewQueue(items: readonly FleetAttentionItem[]): FleetAttentionItem[] {
  return items.filter((item) => {
    if (!item.taskId || !REVIEW_QUEUE_KINDS.has(item.kind)) return false;
    const destination = taskAttentionDestination(item);
    return destination === "reviewTurn" || destination === "reviewStage";
  });
}

export interface ReviewQueueTask {
  workspaceId: string;
  taskId: string;
}

export interface ReviewQueuePosition {
  previous: FleetAttentionItem | null;
  next: FleetAttentionItem | null;
  /** Reviews waiting besides the task under review. */
  remaining: number;
}

function isTask(item: FleetAttentionItem, task: ReviewQueueTask) {
  return item.workspaceId === task.workspaceId && item.taskId === task.taskId;
}

/** The task's own place in the queue: its most urgent review. */
export function findReviewQueueAnchor(
  queue: readonly FleetAttentionItem[],
  task: ReviewQueueTask,
): FleetAttentionItem | null {
  return queue.find((item) => isTask(item, task)) ?? null;
}

/**
 * The reviews before and after the task under review, wrapping at the ends.
 *
 * `anchor` is the task's place in the queue as last seen: once the task is
 * marked reviewed it leaves the queue, and "next" must still be the review
 * that followed it, not the first one. Without an anchor (the task never
 * waited for review) next is the first review and previous the last.
 */
export function locateInReviewQueue(args: {
  queue: readonly FleetAttentionItem[];
  task: ReviewQueueTask;
  anchor: FleetAttentionItem | null;
}): ReviewQueuePosition {
  const others = args.queue.filter((item) => !isTask(item, args.task));
  if (others.length === 0) return { previous: null, next: null, remaining: 0 };
  const anchor = args.anchor;
  if (!anchor) {
    return { previous: others[others.length - 1]!, next: others[0]!, remaining: others.length };
  }
  const after = others.find((item) => compareFleetAttentionItems(anchor, item) < 0);
  const before = [...others].reverse().find((item) => compareFleetAttentionItems(item, anchor) < 0);
  return {
    next: after ?? others[0]!,
    previous: before ?? others[others.length - 1]!,
    remaining: others.length,
  };
}
