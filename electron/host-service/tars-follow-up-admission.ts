import { TARS_CONFIRMED_OPERATIONS, type TarsControlOperation, type TarsDecisionAction, type TarsMessageOrigin } from "../../src/lib/tars/conversation";
import type { TarsStore } from "../persistence/tars-store";

type FollowUpOrigin = Extract<TarsMessageOrigin, { kind: "followUp" }>;
/** The user holds or ended this work: an automatic follow-up proposes nothing about it. */
const OUT_OF_REACH = new Set(["paused", "takenOver", "cancelled", "completed"]);

/**
 * Why an automatic follow-up may not propose this action, or null. It has no
 * user mandate of its own and its context quotes untrusted run output, so it
 * never starts work: new work is suggested as an ask with a reply option, and
 * only the user's answer can lead to a delegation. It may ask, show and
 * propose resume or cancel, which wait for the user's Confirm. It never
 * reprioritizes: a priority change applies at once, so it needs the user's words.
 * It never proposes publishing, which needs the user's own words.
 * It never pauses, takes over or hands back (those apply at once or return
 * authority), never proposes acceptCompletion or cancel where Stave's own
 * unverified-completion card already asks it, and never touches work the user
 * paused or took over, or work that ended.
 */
export function tarsFollowUpRefusal(action: TarsDecisionAction, _origin: FollowUpOrigin, responsibilities: Pick<TarsStore, "get">): string | null {
  if (action.kind === "delegate") return "An automatic follow-up cannot start work; it can ask whether the user wants it.";
  if (action.kind === "reprioritize") return "An automatic follow-up cannot change a priority; it can ask whether the user wants it.";
  // Publishing needs the user's own words; a follow-up may only ask whether they want it.
  if (action.kind === "publish") return "An automatic follow-up cannot propose publishing; only the user's own request can.";
  const row = (id: string) => responsibilities.get(id);
  const outOfReach = (id: string) => OUT_OF_REACH.has(row(id)?.state ?? "cancelled");
  // Stave's unverified-completion card already offers accept and cancel for this work.
  const staveAsks = (id: string, operation: TarsControlOperation) => (operation === "acceptCompletion" || operation === "cancel")
    && row(id)?.state === "blocked" && row(id)?.detailCode === "unverifiedCompletion";
  const refused = (id: string, operation: TarsControlOperation) => outOfReach(id) || staveAsks(id, operation)
    || !TARS_CONFIRMED_OPERATIONS.has(operation) || operation === "handBack" || operation === "acceptCompletion";
  if (action.kind === "control" && refused(action.responsibilityId, action.operation))
    return "An automatic follow-up cannot propose this control: only the user starts it, or the work is held by the user or ended.";
  if (action.kind === "show" && outOfReach(action.responsibilityId))
    return "An automatic follow-up proposes nothing about work the user paused, took over or that ended.";
  // An option applies only when the user chooses it, but it may still not offer what the follow-up could not propose.
  if (action.kind === "ask" && action.options.some((option) => option.effect.kind === "control"
    && (outOfReach(option.effect.responsibilityId) || staveAsks(option.effect.responsibilityId, option.effect.operation)
      || option.effect.operation === "handBack" || option.effect.operation === "acceptCompletion")))
    return "An automatic follow-up cannot offer to continue or settle work the user holds, that ended, or that Stave already asks about.";
  return null;
}
