import {
  describeReviewCompletionNotification,
  isReviewDelegation,
} from "../../src/lib/reviews/review-task";
import type { Task } from "../../src/types/chat";
import { listDelegatedTaskSummaries } from "./delegated-task-signals";

/**
 * The completion notification of a review the composer started, addressed to
 * the task it reviewed. Null for any other task, which keeps its ordinary
 * "Latest run finished" notification.
 */
export function resolveReviewTurnNotification(args: {
  tasks: readonly Pick<Task, "id" | "title" | "parentTaskId">[];
  taskId: string;
  failed: boolean;
}) {
  const task = args.tasks.find((candidate) => candidate.id === args.taskId);
  const parentTaskId = task?.parentTaskId?.trim();
  if (!task || !parentTaskId) {
    return null;
  }
  const isReview = listDelegatedTaskSummaries({ parentTaskId }).some(
    (child) => child.delegatedTaskId === args.taskId && isReviewDelegation(child),
  );
  if (!isReview) {
    return null;
  }
  return describeReviewCompletionNotification({
    parentTaskId,
    parentTitle:
      args.tasks.find((candidate) => candidate.id === parentTaskId)?.title?.trim() || "Task",
    reviewTitle: task.title?.trim() || "Review",
    failed: args.failed,
  });
}
