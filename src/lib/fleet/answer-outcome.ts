import type { InteractionAnswerOutcome } from "@/store/app-store.types";

/**
 * What the Fleet task panel shows once an answer's outcome is known. The
 * question card turns answered inside the store action, before the outcome
 * returns, so the panel waits for the outcome instead of announcing delivery
 * from the card alone: an answer given again while an earlier one was
 * unconfirmed records the earlier answer (`earlierAnswer`), and saying
 * "delivered" first would tell the user their new answer went out.
 *
 * - `earlier`: the earlier answer went out instead. A panel that closed in
 *   the meantime (the request left the attention list) says it as a toast.
 * - `delivered`: this answer went out.
 * - `failed`: the answer was not delivered; `message` says why.
 * - `changed`: skipped, or failed without words: the request changed and
 *   delivery cannot be confirmed.
 * - `none`: the panel closed and there is nothing it must still say.
 */
export type FleetAnswerNotice =
  | { kind: "earlier"; via: "status" | "toast" }
  | { kind: "delivered" }
  | { kind: "failed"; message: string }
  | { kind: "changed" }
  | { kind: "none" };

export function fleetAnswerNotice(outcome: InteractionAnswerOutcome, panelOpen: boolean): FleetAnswerNotice {
  if (outcome.status === "delivered") {
    if (outcome.earlierAnswer) return { kind: "earlier", via: panelOpen ? "status" : "toast" };
    return panelOpen ? { kind: "delivered" } : { kind: "none" };
  }
  if (!panelOpen) return { kind: "none" };
  return outcome.status === "failed" && outcome.message ? { kind: "failed", message: outcome.message } : { kind: "changed" };
}
