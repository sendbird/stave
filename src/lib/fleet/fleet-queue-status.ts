/**
 * What the Fleet header may claim about the attention queue.
 *
 * "clear" is a promise that nothing is waiting. It is only allowed once every
 * source Fleet reads has actually answered: while notifications or durable
 * result reviews are still loading for the first time the queue is
 * "checking", and when any of them, or the snooze list, failed to load it is
 * "incomplete" rather than clear.
 */
export type FleetQueueStatus =
  | "next"
  | "review"
  | "checking"
  | "incomplete"
  | "clear";

export type FleetSourceLoadStatus = "pending" | "ready" | "error";

export function resolveFleetQueueStatus(args: {
  blockingCount: number;
  itemCount: number;
  resultReviews: {
    /** Whether durable result reviews feed this queue at all. */
    tracked: boolean;
    /** A page for the current query has resolved at least once. */
    loaded: boolean;
    error: string;
  };
  /** The notification history read; it carries cold questions and approvals. */
  notifications?: FleetSourceLoadStatus;
  /** A failed snooze read hides nothing, but the queue was not fully read. */
  snoozeError?: string;
}): FleetQueueStatus {
  if (args.blockingCount > 0) {
    return "next";
  }
  if (args.itemCount > 0) {
    return "review";
  }
  const resultsFailed =
    args.resultReviews.tracked && Boolean(args.resultReviews.error);
  if (resultsFailed || args.notifications === "error" || args.snoozeError) {
    return "incomplete";
  }
  const resultsPending =
    args.resultReviews.tracked && !args.resultReviews.loaded;
  if (resultsPending || args.notifications === "pending") {
    return "checking";
  }
  return "clear";
}
