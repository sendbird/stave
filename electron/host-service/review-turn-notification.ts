import {
  describeReviewCompletionNotification,
  isReviewDelegation,
} from "../../src/lib/reviews/review-task";
import {
  describeReviewFindingsSummary,
  parseReviewFindings,
  summarizeReviewFindings,
} from "../../src/lib/reviews/review-findings";
import type { ChatMessage, Task } from "../../src/types/chat";
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
  /** The review task's messages, for a findings count in the body. */
  messages?: readonly Pick<ChatMessage, "role" | "content">[];
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
    findingsSummary: args.failed ? null : summarizeLatestReply(args.messages ?? []),
  });
}

function summarizeLatestReply(messages: readonly Pick<ChatMessage, "role" | "content">[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== "assistant" || !message.content.trim()) continue;
    const parsed = parseReviewFindings(message.content);
    return parsed.ok ? describeReviewFindingsSummary(summarizeReviewFindings(parsed.report)) : null;
  }
  return null;
}
