import {
  listResultReviews,
  setResultMarkedReviewed,
  setResultReviewed,
} from "./result-review-client";
import { resultReviewKey, type ResultReview } from "./result-review";

export interface ResultReviewUndoOperations {
  read: (scope: ResultReview) => Promise<ResultReview | null>;
  setMarkedReviewed: typeof setResultMarkedReviewed;
  setReviewed: typeof setResultReviewed;
}

const defaultOperations: ResultReviewUndoOperations = {
  read: async (scope) => {
    const page = await listResultReviews({
      workspaceId: scope.workspaceId,
      taskId: scope.taskId,
      turnId: scope.turnId,
      limit: 1,
      includeEvidence: false,
    });
    return page.results.find((row) => resultReviewKey(row) === resultReviewKey(scope)) ?? null;
  },
  setMarkedReviewed: setResultMarkedReviewed,
  setReviewed: setResultReviewed,
};

export type ResultReviewUndoOutcome = "undone" | "changed-elsewhere";

/**
 * Takes back one "Mark reviewed" through the same result-review writers,
 * restoring what the result was before: not marked, and unread again when
 * the mark is what made it read.
 *
 * Only the mark this decision wrote is taken back. Another surface may have
 * marked, unmarked or read the result since (Fleet's bulk review, a second
 * window), and Undo must never erase that: when the stored mark is no longer
 * the one `saved` returned, nothing is written. The check and the writes are
 * separate calls, so a write landing between them is not caught.
 */
export async function undoResultMarkedReviewed(args: {
  /** The result as Review read it before the decision. */
  before: Pick<ResultReview, "reviewedAt">;
  /** What the decision's write returned. */
  saved: ResultReview;
  operations?: ResultReviewUndoOperations;
}): Promise<ResultReviewUndoOutcome> {
  const operations = args.operations ?? defaultOperations;
  const { saved } = args;
  const current = await operations.read(saved);
  if (!current || !saved.markedReviewedAt || current.markedReviewedAt !== saved.markedReviewedAt) {
    return "changed-elsewhere";
  }
  const scope = {
    repositoryPath: saved.repositoryPath,
    workspaceId: saved.workspaceId,
    taskId: saved.taskId,
    turnId: saved.turnId,
  };
  await operations.setMarkedReviewed({ ...scope, markedReviewed: false });
  // The mark also read the result when it was unread; that read goes back too,
  // unless someone read it again since.
  const markReadIt = !args.before.reviewedAt && saved.reviewedAt !== null;
  if (markReadIt && current.reviewedAt === saved.reviewedAt) {
    await operations.setReviewed({ ...scope, reviewed: false });
  }
  return "undone";
}
