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

/**
 * How long Fleet waits for the first Tars snapshot. A read that never
 * settles must not keep the queue "checking" forever.
 */
export const TARS_SOURCE_WAIT_MS = 10_000;

/**
 * The Tars source's load state. Without a Tars bridge there is nothing to
 * wait for. A snapshot answers it, whatever happened before. Otherwise it is
 * pending until the read fails or the wait runs out, and then not fully
 * checked: never clear.
 */
export function resolveTarsSourceStatus(args: {
  hasBridge: boolean;
  hasSnapshot: boolean;
  failed: boolean;
  waitedOut: boolean;
}): FleetSourceLoadStatus {
  if (!args.hasBridge || args.hasSnapshot) return "ready";
  return args.failed || args.waitedOut ? "error" : "pending";
}

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
  /** The Tars snapshot read; it carries Tars decisions and blocked work. */
  tars?: FleetSourceLoadStatus;
}): FleetQueueStatus {
  if (args.blockingCount > 0) {
    return "next";
  }
  if (args.itemCount > 0) {
    return "review";
  }
  const resultsFailed =
    args.resultReviews.tracked && Boolean(args.resultReviews.error);
  if (resultsFailed || args.notifications === "error" || args.snoozeError || args.tars === "error") {
    return "incomplete";
  }
  const resultsPending =
    args.resultReviews.tracked && !args.resultReviews.loaded;
  if (resultsPending || args.notifications === "pending" || args.tars === "pending") {
    return "checking";
  }
  return "clear";
}
