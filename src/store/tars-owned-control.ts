import { i18n } from "@/i18n/runtime";
import { toast } from "@/lib/notifications/toast";
import type { TarsBridgeApi } from "@/lib/tars/types";
import type { TarsActionRecord, TarsActSource, TarsControlOperation } from "@/lib/tars/conversation";
import { isTarsWorkflowId, resolveTarsOwner, tarsOperationFor, type TarsOwnedIntent, type TarsOwnershipTarget } from "@/lib/tars/ownership";
import { tarsControlFailureKey, tarsControlReasonKey } from "@/lib/tars/control-reasons";
import { publishTarsSnapshot, readTarsSnapshot, tarsBridge, useTarsSnapshotStore } from "@/store/tars-snapshot-store";

/**
 * How an ownership control from another surface settled:
 * - `direct`: Tars does not hold the work; the surface acts as it always has.
 * - `held`: Tars holds the work but this intent needs no Tars control (a stop
 *   of work Tars already paused). Nothing is sent; the run must stay as it is.
 * - `applied` / `rejected`: Tars's control path settled it and recorded it in
 *   the conversation; a refusal carries its translation key.
 * - `failed`: nothing confirmed a change; the key is translated advice.
 *
 * Every outcome but `direct` means the task's run must not be cancelled.
 */
export type TarsOwnedControlOutcome =
  | { kind: "direct" }
  | { kind: "held" }
  | { kind: "applied"; operation: TarsControlOperation; record: TarsActionRecord }
  | { kind: "rejected"; operation: TarsControlOperation; record: TarsActionRecord; reasonKey: ReturnType<typeof tarsControlReasonKey> }
  | { kind: "failed"; reasonKey: ReturnType<typeof tarsControlFailureKey> };

/** What a surface says after Tars settled its control: what changed, or why nothing did. */
export function tarsOwnedOutcomeMessage(outcome: Exclude<TarsOwnedControlOutcome, { kind: "direct" | "held" }>) {
  if (outcome.kind === "applied") {
    const key = outcome.operation === "takeover" ? "shell:tars.owner.tookOver" as const
      : outcome.operation === "resume" ? "shell:tars.owner.resumed" as const : "shell:tars.owner.paused" as const;
    return { tone: "success" as const, key };
  }
  return { tone: "error" as const, key: outcome.reasonKey };
}

/**
 * Tells the user how Tars settled a control a task surface sent: what changed,
 * that only their own turn stopped, or why nothing did. False for `direct`,
 * where the surface acts as it always has.
 */
export function reportTarsOwnedOutcome(outcome: TarsOwnedControlOutcome) {
  if (outcome.kind === "direct") return false;
  if (outcome.kind === "held") {
    toast.info(i18n.t("shell:tars.owner.turnOnly"));
    return true;
  }
  const message = tarsOwnedOutcomeMessage(outcome);
  if (message.tone === "success") toast.success(i18n.t(message.key));
  else toast.error(i18n.t("shell:tars.owner.notApplied"), { description: i18n.t(message.key) });
  return true;
}

/**
 * Whether a stop may still end the in-flight turn after Tars answered. A pause
 * Tars applied (or work it already paused) leaves no automatic turn to keep.
 * When Tars refused or could not be asked, the run goes on, so cutting its
 * automatic turn would only spend its retry; only your own turn stops.
 */
export function tarsStopEndsTurn(outcome: TarsOwnedControlOutcome, userTurn: boolean) {
  return outcome.kind === "direct" || outcome.kind === "held" || outcome.kind === "applied" || userTurn;
}

/**
 * Without a readable snapshot, Tars holds the work when the last snapshot said
 * so or when the task's run itself carries the Tars workflow marker.
 */
function heldWithoutRead(target: TarsOwnershipTarget) {
  return resolveTarsOwner(useTarsSnapshotStore.getState().snapshot, target) !== null || isTarsWorkflowId(target.agentRunWorkflowId);
}

/**
 * Whether an active Tars responsibility holds the task, read fresh. An
 * unreadable ownership counts as held when the last snapshot or the run's own
 * marker says so, so a caller never changes Tars's work behind it.
 */
export async function tarsHoldsTask(target: TarsOwnershipTarget, bridge: TarsBridgeApi | undefined = tarsBridge()) {
  if (!bridge) return false;
  try {
    return resolveTarsOwner(await readTarsSnapshot(bridge), target) !== null;
  } catch {
    return heldWithoutRead(target);
  }
}

/** A retried click keeps its request ID, so a lost acknowledgement cannot apply twice. */
const pendingRequests = new Map<string, string>();

/**
 * Sends a Fleet or task-view stop or take-over through Tars when an active
 * Tars responsibility holds the work. Ownership is read fresh first, so the
 * control names the current revision and never misses newly delegated work.
 * When ownership cannot be read and the last snapshot or the run's own Tars
 * marker says Tars holds the work, the outcome is `failed`: the caller must not
 * cancel the run.
 */
export async function routeTarsOwnedIntent(args: {
  target: TarsOwnershipTarget;
  intent: TarsOwnedIntent;
  source: Exclude<TarsActSource, "click">;
  bridge?: TarsBridgeApi;
}): Promise<TarsOwnedControlOutcome> {
  const bridge = args.bridge ?? tarsBridge();
  if (!bridge) return { kind: "direct" };
  let snapshot;
  try {
    snapshot = await readTarsSnapshot(bridge);
  } catch (cause) {
    return heldWithoutRead(args.target) ? { kind: "failed", reasonKey: tarsControlFailureKey(cause) } : { kind: "direct" };
  }
  const owner = resolveTarsOwner(snapshot, args.target);
  if (!owner) return { kind: "direct" };
  const operation = tarsOperationFor(owner, args.intent);
  // A resume Tars has no part in (the run waits on its own) stays with the run.
  if (!operation) return args.intent === "resume" ? { kind: "direct" } : { kind: "held" };
  const key = `${args.source}:${owner.responsibilityId}:${owner.revision}:${operation}`;
  const requestId = pendingRequests.get(key) ?? `${args.source}:${crypto.randomUUID()}`;
  pendingRequests.set(key, requestId);
  try {
    const result = await bridge.act({ requestId, responsibilityId: owner.responsibilityId, expectedRevision: owner.revision, operation, source: args.source });
    publishTarsSnapshot(result.snapshot);
    // A pending record is still retryable under the same request ID.
    if (result.record.status === "pending") return { kind: "failed", reasonKey: tarsControlFailureKey(null) };
    pendingRequests.delete(key);
    return result.record.status === "rejected"
      ? { kind: "rejected", operation, record: result.record, reasonKey: tarsControlReasonKey(result.record.reason) }
      : { kind: "applied", operation, record: result.record };
  } catch (cause) {
    return { kind: "failed", reasonKey: tarsControlFailureKey(cause) };
  }
}
