/**
 * Fleet's attention projection, computed once for the whole app.
 *
 * The top bar, the sidebar Work queue and Fleet View used to run the same
 * projection hook three times, each subscribing to streamed task state and
 * reading result reviews on its own. One producer
 * (`FleetAttentionProducer`, mounted in the shell) now publishes the result
 * here, and every entry point reads the same snapshot with its own selector,
 * so they can never disagree about what waits on the user.
 */
import { create } from "zustand";
import type {
  FleetAttentionItem,
  FleetAttentionProjection,
} from "@/lib/fleet/attention-projection";
import type { FleetQueueStatus } from "@/lib/fleet/fleet-queue-status";
import { shareFleetAttentionSnapshot } from "@/lib/fleet/attention-sharing";
import { EMPTY_FLEET_INBOX, type FleetInbox } from "@/lib/fleet/inbox-model";

export interface FleetAttentionSnapshot extends FleetAttentionProjection {
  /** Active persisted ids, including episodes whose run is no longer cached. */
  snoozedAttentionIds: readonly string[];
  /** The items with the notifications that speak for them, for Fleet and the bell. */
  inbox: FleetInbox;
  /** What the Fleet header may claim; never "clear" before every source answered. */
  queueStatus: FleetQueueStatus;
  resultReviewError: string;
  resultReviewTracked: boolean;
  resultReviewLoaded: boolean;
  resultReviewTotal: number;
  resultReviewHasMore: boolean;
  snoozeError: string;
  refreshResultReviews: () => void;
  refreshSnoozes: () => void;
}

const EMPTY_ITEMS: FleetAttentionItem[] = [];
const noop = () => {};

/** Before the producer publishes, nothing has been read: "checking", not "clear". */
export const EMPTY_FLEET_ATTENTION: FleetAttentionSnapshot = {
  snoozedAttentionIds: [],
  items: EMPTY_ITEMS,
  count: 0,
  blockingItems: EMPTY_ITEMS,
  reviewItems: EMPTY_ITEMS,
  snoozedItems: EMPTY_ITEMS,
  highestAttentionByWorkspaceId: {},
  attentionItemsByWorkspaceId: {},
  inbox: EMPTY_FLEET_INBOX,
  queueStatus: "checking",
  resultReviewError: "",
  resultReviewTracked: false,
  resultReviewLoaded: false,
  resultReviewTotal: 0,
  resultReviewHasMore: false,
  snoozeError: "",
  refreshResultReviews: noop,
  refreshSnoozes: noop,
};

export const useFleetAttentionStore = create<{
  snapshot: FleetAttentionSnapshot;
}>(() => ({ snapshot: EMPTY_FLEET_ATTENTION }));

/**
 * Publishes a pass of the producer. Slices equal to the published ones keep
 * their references, so a streamed chunk that changes nothing a reader shows
 * publishes nothing, and a change re-renders only the readers of its slice.
 */
export function publishFleetAttention(snapshot: FleetAttentionSnapshot) {
  const previous = useFleetAttentionStore.getState().snapshot;
  const shared = shareFleetAttentionSnapshot(previous, snapshot);
  if (shared !== previous) {
    useFleetAttentionStore.setState({ snapshot: shared });
  }
}

/**
 * Reads one slice of the shared snapshot. Selectors must return a value the
 * snapshot already holds (or a primitive), never a fresh container.
 */
export function useFleetAttention<T>(
  selector: (snapshot: FleetAttentionSnapshot) => T,
): T {
  return useFleetAttentionStore((state) => selector(state.snapshot));
}
