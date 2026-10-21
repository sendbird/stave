/**
 * What the Fleet header may claim about the attention queue.
 *
 * "clear" is a promise that nothing is waiting. It is only allowed once every
 * tracked source has actually answered: while durable result reviews are
 * still loading for the first time the queue is "checking", and when they
 * failed to load it is "incomplete" rather than clear.
 */
export type FleetQueueStatus =
  | "next"
  | "review"
  | "checking"
  | "incomplete"
  | "clear";

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
}): FleetQueueStatus {
  if (args.blockingCount > 0) {
    return "next";
  }
  if (args.itemCount > 0) {
    return "review";
  }
  if (args.resultReviews.tracked) {
    if (args.resultReviews.error) {
      return "incomplete";
    }
    if (!args.resultReviews.loaded) {
      return "checking";
    }
  }
  return "clear";
}
