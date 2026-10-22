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

export interface FleetAttentionSnapshot extends FleetAttentionProjection {
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
  items: EMPTY_ITEMS,
  count: 0,
  blockingItems: EMPTY_ITEMS,
  reviewItems: EMPTY_ITEMS,
  snoozedItems: EMPTY_ITEMS,
  highestAttentionByWorkspaceId: {},
  attentionItemsByWorkspaceId: {},
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

export function publishFleetAttention(snapshot: FleetAttentionSnapshot) {
  if (useFleetAttentionStore.getState().snapshot !== snapshot) {
    useFleetAttentionStore.setState({ snapshot });
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
