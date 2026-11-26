import type { InteractionAnswerOutcome } from "@/store/app-store.types";

/**
 * What the Fleet task panel shows once an answer's outcome is known. The
 * question card turns answered inside the store action, before the outcome
 * returns, so the panel waits for the outcome instead of announcing delivery
 * from the card alone: an answer given again while an earlier one was
 * unconfirmed records the earlier answer (`earlierAnswer`), and saying
 * "delivered" first would tell the user their new answer went out.
 *
 * - `earlier`: the earlier answer went out instead. When the panel no longer
 *   shows this request (it closed as the request left the attention list, or
 *   it moved on to another request or task), it is said as a toast.
 * - `delivered`: this answer went out.
 * - `failed`: the answer was not delivered; `message` says why.
 * - `changed`: skipped, or failed without words: the request changed and
 *   delivery cannot be confirmed.
 * - `none`: the panel no longer shows this request and there is nothing it
 *   must still say; the panel's current controls are left alone.
 */
export type FleetAnswerNotice =
  | { kind: "earlier"; via: "status" | "toast" }
  | { kind: "delivered" }
  | { kind: "failed"; message: string }
  | { kind: "changed" }
  | { kind: "none" };

export function fleetAnswerNotice(outcome: InteractionAnswerOutcome, shownInPanel: boolean): FleetAnswerNotice {
  if (outcome.status === "delivered") {
    if (outcome.earlierAnswer) return { kind: "earlier", via: shownInPanel ? "status" : "toast" };
    return shownInPanel ? { kind: "delivered" } : { kind: "none" };
  }
  if (!shownInPanel) return { kind: "none" };
  return outcome.status === "failed" && outcome.message ? { kind: "failed", message: outcome.message } : { kind: "changed" };
}
