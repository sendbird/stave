import { TARS_CONFIRMED_OPERATIONS, type TarsControlOperation, type TarsDecisionAction, type TarsMessageOrigin } from "../../src/lib/tars/conversation";
import type { TarsStore } from "../persistence/tars-store";

type FollowUpOrigin = Extract<TarsMessageOrigin, { kind: "followUp" }>;
/** The user holds or ended this work: an automatic follow-up proposes nothing about it. */
const OUT_OF_REACH = new Set(["paused", "takenOver", "cancelled", "completed"]);

/** Automatic follow-ups may continue their own admitted work and offer a verified draft PR.
 * They never delegate, reorder, speak for the user or reclaim user-held work.
 */
export function tarsFollowUpRefusal(action: TarsDecisionAction, origin: FollowUpOrigin, responsibilities: Pick<TarsStore, "get">): string | null {
  if (action.kind === "open") return "Only the user can request navigation to another screen.";
  if (action.kind === "workspace") return "An automatic follow-up cannot edit workspace information; only the user can request it.";
  if (action.kind === "delegate") return "An automatic follow-up cannot start work; it can ask whether the user wants it.";
  if (action.kind === "reprioritize") return "An automatic follow-up cannot change a priority; it can ask whether the user wants it.";
  if ("responsibilityId" in action && action.responsibilityId !== origin.responsibilityId)
    return "An automatic follow-up can only act on its own responsibility.";
  // Host publication admission checks verification, revision and branch; autonomy decides auto versus confirmation.
  if (action.kind === "publish") return null;
  // Clearing hides what the user may want to read; only their own words propose it.
  if (action.kind === "clear") return "An automatic follow-up cannot propose clearing; only the user's own request can.";
  // A schedule makes work start by itself later; only the user's own words set one up, change one or list them.
  if (action.kind === "schedule") return "An automatic follow-up cannot propose or change a schedule; only the user's own request can.";
  const ci = origin.reason === "ciFailed" && responsibilities.get(origin.responsibilityId)?.publication?.checks?.state === "failed";
  if (ci && action.kind === "control") {
    const target = responsibilities.get(action.responsibilityId);
    return origin.responsibilityId === target?.id && action.operation === "message" && (target?.state === "completed" || target?.state === "resultReady")
      && (target.publication?.watch?.fixRounds ?? 0) >= 1 && (target.publication?.watch?.fixRounds ?? 0) <= 2 ? null : "A CI follow-up can only continue the published work once, on its existing branch.";
  }
  const row = (id: string) => responsibilities.get(id);
  const outOfReach = (id: string) => OUT_OF_REACH.has(row(id)?.state ?? "cancelled");
  // Stave's unverified-completion card already offers accept and cancel for this work.
  const staveAsks = (id: string, operation: TarsControlOperation) => (operation === "acceptCompletion" || operation === "cancel")
    && row(id)?.state === "blocked" && row(id)?.detailCode === "unverifiedCompletion";
  const refused = (id: string, operation: TarsControlOperation) => outOfReach(id) || staveAsks(id, operation)
    || !TARS_CONFIRMED_OPERATIONS.has(operation) || operation === "handBack" || operation === "acceptCompletion"
    // Skipping a stage cannot be undone and drops work the run planned: only the user's own words propose it.
    || operation === "skipStage"
    // Approval and answers speak for the user. Instructions to the owned run do not.
    || operation === "approve" || operation === "deny" || operation === "answer";
  if (action.kind === "control" && refused(action.responsibilityId, action.operation))
    return "An automatic follow-up cannot propose this control: only the user starts it, or the work is held by the user or ended.";
  if (action.kind === "show" && outOfReach(action.responsibilityId))
    return "An automatic follow-up proposes nothing about work the user paused, took over or that ended.";
  // An option applies only when the user chooses it, but it may still not offer what the follow-up could not propose.
  if (action.kind === "ask" && action.options.some((option) => option.effect.kind === "control"
    && (outOfReach(option.effect.responsibilityId) || staveAsks(option.effect.responsibilityId, option.effect.operation)
      || option.effect.operation === "handBack" || option.effect.operation === "acceptCompletion" || option.effect.operation === "startNow" || option.effect.operation === "skipStage"
      // Approve or deny are the user's own click on an option; words written for them (answer, message, changes) are not.
      || option.effect.operation === "answer" || option.effect.operation === "message" || option.effect.operation === "requestChanges")))
    return "An automatic follow-up cannot offer to continue or settle work the user holds, that ended, or that Stave already asks about.";
  return null;
}
