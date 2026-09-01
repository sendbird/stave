import type {
  ProviderSteerTurnRequest,
  ProviderSteerTurnResponse,
} from "@/lib/providers/provider.types";
import type { QueuedTurnAutoDispatchHold } from "@/store/queued-task-turn-dispatch";
import { submitSteerWithDeadline } from "@/store/steer-submit";

/**
 * Why a queued item needs to sit out the queue for a while.
 *
 * - `in-flight`: a steer for it is waiting on the provider's acknowledgement.
 *   Nothing may dispatch it — the provider may be about to accept the steer,
 *   so any other send would run the same prompt twice.
 * - `unconfirmed`: the acknowledgement never arrived (see
 *   `RENDERER_STEER_ACK_TIMEOUT_MS`). The provider may or may not have taken
 *   the text, so the item is held back from AUTOMATIC dispatch only. The user
 *   was told delivery is unconfirmed and can still send or re-steer it by hand.
 */
export type SteerQueueHoldReason = "in-flight" | "unconfirmed";

export interface SteerQueueReservationTarget {
  taskId: string;
  queuedTurnId: string;
}

function buildHoldKey(target: SteerQueueReservationTarget) {
  return `${target.taskId}::${target.queuedTurnId}`;
}

/**
 * Keeps a queued prompt from being dispatched while its steer is in flight.
 *
 * Steering a staged queue item awaits the provider's acknowledgement, which
 * can take up to `RENDERER_STEER_ACK_TIMEOUT_MS`. The running turn can easily
 * finish inside that window, and turn completion drains the queue — so without
 * a reservation the very item being steered gets started as a fresh turn while
 * the provider is still accepting it into the old one, running the prompt
 * twice. Reserving the item before the await closes that window.
 *
 * Holds are in-memory only and keyed by the queued item's UUID: a reload drops
 * them along with the turn they were ambiguous about, and a stale key for an
 * item that has since left the queue can never match a different item.
 */
export function createSteerQueueReservations() {
  const holdsByKey = new Map<string, SteerQueueHoldReason>();

  function getHold(target: SteerQueueReservationTarget) {
    return holdsByKey.get(buildHoldKey(target));
  }

  return {
    /** True while no path at all may dispatch the item. */
    blocksDispatch(target: SteerQueueReservationTarget) {
      return getHold(target) === "in-flight";
    },
    /**
     * How turn-completion queue draining must treat the item.
     *
     * An in-flight steer resolves on a deadline, so the queue waits in place
     * and keeps FIFO order. An unconfirmed steer only clears when the user
     * acts, so draining moves past it instead of stalling the whole queue.
     */
    getAutoDispatchHold(
      target: SteerQueueReservationTarget,
    ): QueuedTurnAutoDispatchHold | undefined {
      const hold = getHold(target);
      if (hold === "in-flight") {
        return "wait";
      }
      return hold === "unconfirmed" ? "skip" : undefined;
    },
    /**
     * Submit a steer, reserving `queuedTurnId` (when the payload came from the
     * queue) for exactly as long as delivery is undecided.
     */
    async submitSteer(args: {
      taskId: string;
      queuedTurnId?: string;
      request: ProviderSteerTurnRequest;
      send: (
        request: ProviderSteerTurnRequest,
      ) => Promise<ProviderSteerTurnResponse>;
    }): Promise<ProviderSteerTurnResponse> {
      const key = args.queuedTurnId
        ? buildHoldKey({ taskId: args.taskId, queuedTurnId: args.queuedTurnId })
        : null;
      if (key) {
        holdsByKey.set(key, "in-flight");
      }
      const result = await submitSteerWithDeadline({
        request: args.request,
        send: args.send,
      });
      if (key) {
        // Accepted: the caller drops the item from the queue in the same tick.
        // Rejected: the provider definitively did not take it, so it goes back
        // to waiting for its normal turn. Unknown: keep it out of automatic
        // dispatch, since a duplicate run is worse than a prompt the user has
        // to send again deliberately.
        if (result.ok || result.delivery !== "unknown") {
          holdsByKey.delete(key);
        } else {
          holdsByKey.set(key, "unconfirmed");
        }
      }
      return result;
    },
  };
}

export type SteerQueueReservations = ReturnType<
  typeof createSteerQueueReservations
>;
