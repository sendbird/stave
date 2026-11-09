import { collectTarsAttention } from "@/lib/tars/attention";
import { tarsConfirmationRequestId } from "@/lib/tars/conversation";
import { tarsControlFailureKey, tarsControlReasonKey } from "@/lib/tars/control-reasons";
import type { TarsBridgeApi } from "@/lib/tars/types";
import { publishTarsSnapshot, readTarsSnapshot } from "@/store/tars-snapshot-store";
import type { FleetAttentionItem } from "./attention-projection";

export type FleetTarsConfirmOutcome =
  | { ok: true }
  | { ok: false; reasonKey: ReturnType<typeof tarsControlReasonKey> | ReturnType<typeof tarsControlFailureKey> };

/**
 * Confirms a Tars decision from its Fleet row. Fleet never acts on the work
 * itself: the confirmation goes through Tars's admitted control path with the
 * proposal's own request id, so a retried click applies once and the Tars
 * conversation records it as Fleet's. The proposal is read afresh first, so a
 * decision another surface settled, or one a newer revision made stale, is
 * never sent. A refusal comes back as its translation key.
 */
export async function confirmFleetTarsDecision(
  item: Pick<FleetAttentionItem, "id" | "tarsResponsibilityId" | "tarsDecision">,
  bridge: TarsBridgeApi | undefined,
): Promise<FleetTarsConfirmOutcome> {
  const decision = item.tarsDecision;
  const responsibilityId = item.tarsResponsibilityId;
  if (!bridge || !decision || !responsibilityId) return { ok: false, reasonKey: tarsControlFailureKey(null) };
  try {
    // A fresh read, never one already in flight: a read that started before
    // a command published this proposal would call it stale. It only checks;
    // publishing it could overwrite a newer push.
    const current = await bridge.get();
    if (!collectTarsAttention(current).some((signal) => signal.id === item.id)) {
      return { ok: false, reasonKey: tarsControlReasonKey("stale") };
    }
    const result = await bridge.act({
      requestId: tarsConfirmationRequestId(decision.messageId, decision.actionIndex),
      responsibilityId,
      expectedRevision: decision.expectedRevision,
      operation: decision.operation,
      source: "fleet",
    });
    publishTarsSnapshot(result.snapshot);
    // Read once more so every surface's rows follow what the host settled.
    void readTarsSnapshot(bridge).catch(() => undefined);
    // A pending record is still retryable under the same request id.
    if (result.record.status === "pending") return { ok: false, reasonKey: tarsControlFailureKey(null) };
    return result.record.status === "rejected"
      ? { ok: false, reasonKey: tarsControlReasonKey(result.record.reason) }
      : { ok: true };
  } catch (cause) {
    return { ok: false, reasonKey: tarsControlFailureKey(cause) };
  }
}
