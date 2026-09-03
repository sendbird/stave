import type {
  TrackerSourceAvailability,
  TrackerSourceId,
  TrackerTask,
  TrackerTaskDetail,
} from "./types";

/**
 * What a tracker can do beyond listing.
 *
 * Read as a runtime value rather than inferred from the source id so the
 * renderer can hide an action the connector cannot perform (a Crane write-back
 * switch on a Jira ticket) without hardcoding a source list in the UI.
 */
export interface TrackerSourceCapabilities {
  /** The source can record the Stave run back onto the ticket. */
  kickoffWriteBack: boolean;
  /** The source can return a description and comments for one ticket. */
  detail: boolean;
}

export interface TrackerSourceListResult {
  tasks: TrackerTask[];
  /** The source had more rows than the page budget allowed. */
  truncated: boolean;
}

/**
 * The single seam every tracker plugs into.
 *
 * Deliberately narrow: everything scheduling, caching, backoff and kickoff
 * related lives in `TrackerTasksRuntime`, so adding a tracker means writing a
 * fetch and a mapper, not another poller.
 */
export interface TrackerSourceAdapter {
  readonly sourceId: TrackerSourceId;
  readonly capabilities: TrackerSourceCapabilities;
  /**
   * Whether the source can be queried right now, and if not, why. Cheap and
   * synchronous-ish: it reads configuration and credential presence, never the
   * network.
   */
  availability(): Promise<TrackerSourceAvailability>;
  listTasks(args: { signal: AbortSignal }): Promise<TrackerSourceListResult>;
  getTask(args: {
    ref: string;
    signal: AbortSignal;
  }): Promise<TrackerTaskDetail>;
}

/**
 * Whether a source in this state is worth polling.
 *
 * Anything other than `ready` is a setup problem the user has to resolve in
 * Settings, so retrying on a timer would only burn requests and produce error
 * banners for a situation that will not change on its own.
 */
export function isTrackerSourceReady(
  availability: TrackerSourceAvailability,
): boolean {
  return availability === "ready";
}
