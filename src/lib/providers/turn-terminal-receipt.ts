import { i18n } from "@/i18n";
import { isProviderTurnContinuationEvent } from "./turn-event-evidence";
import { hasMeaningfulPlanText } from "../plan-text";
import { classifyProviderTurnStopReason, isSuccessfulProviderTurnStopReason } from "./turn-stop-reason";
import type { NormalizedProviderEvent } from "./provider.types";
import { z } from "zod";

export type TurnTerminalOutcome =
  "completed" | "failed" | "cancelled" | "unknown";

/** Observation of one exact turn, independent of transcript/event retention.
 * Output observation does not establish acceptance of a task's deliverables.
 */
export const TurnTerminalReceiptSchema = z.object({
  version: z.literal(1),
  completedAt: z.string().nullable(),
  outcome: z.enum(["completed", "failed", "cancelled", "unknown"]).nullable(),
  outputObserved: z.boolean(),
  error: z.string().nullable(),
  lastError: z.object({
    message: z.string(), recoverable: z.boolean(), continuationObserved: z.boolean().optional(),
  }).nullable(),
  stopReason: z.string().nullable(),
  doneObserved: z.boolean(),
  nativeTurnId: z.string().nullable(),
  responseText: z.string().nullable(),
});
export type TurnTerminalReceipt = z.infer<typeof TurnTerminalReceiptSchema>;

export function createTurnReceipt(): TurnTerminalReceipt {
  return {
    version: 1,
    completedAt: null,
    outcome: null,
    outputObserved: false,
    error: null,
    lastError: null,
    stopReason: null,
    doneObserved: false,
    nativeTurnId: null,
    responseText: null,
  };
}

export function parseTurnReceipt(
  value: string | null,
): TurnTerminalReceipt | null {
  if (!value) return null;
  try {
    const parsed = TurnTerminalReceiptSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function observeTurnEvent(
  receipt: TurnTerminalReceipt,
  event: NormalizedProviderEvent,
  captureResponseText = true,
): TurnTerminalReceipt {
  if (receipt.completedAt) return receipt;
  const next = { ...receipt };
  if (
    event.type === "error" &&
    (!next.lastError || next.lastError.recoverable ||
      next.lastError.continuationObserved || !event.recoverable)
  )
    next.lastError = {
      message: event.message.slice(0, 8192),
      recoverable: !!event.recoverable,
      continuationObserved: false,
    };
  if (next.lastError && isProviderTurnContinuationEvent(event)) {
    next.lastError = { ...next.lastError, continuationObserved: true };
  }
  if (event.type === "done") {
    next.doneObserved = true;
    next.stopReason = event.stop_reason?.trim() || null;
  }
  if (event.type === "provider_turn")
    next.nativeTurnId = event.nativeTurnId.slice(0, 1024);
  if (
    (event.type === "text" && event.text.trim().length > 0) ||
    event.type === "tool" ||
    event.type === "tool_result" ||
    event.type === "diff" ||
    (event.type === "plan_ready" && hasMeaningfulPlanText(event.planText))
  )
    next.outputObserved = true;
  if (event.type === "text" && captureResponseText)
    next.responseText = ((next.responseText ?? "") + event.text).slice(
      0,
      16384,
    );
  return next;
}

export function finishTurnReceipt(
  receipt: TurnTerminalReceipt,
  completedAt: string,
  stopReason?: string,
  observationComplete = true,
): TurnTerminalReceipt {
  if (receipt.completedAt) return receipt;
  const next = {
    ...receipt,
    completedAt,
    stopReason: stopReason ?? receipt.stopReason,
  };
  if (
    classifyProviderTurnStopReason(next.stopReason ?? undefined) === "cancelled"
  ) {
    next.outcome = "cancelled";
    next.error = i18n.t("providers:turnTerminalReceipt.providerTurnWasInterruptedBeforeIt");
  } else if (
    classifyProviderTurnStopReason(next.stopReason ?? undefined) === "failed"
  ) {
    next.outcome = "failed";
    next.error =
      next.lastError?.message || i18n.t("providers:turnTerminalReceipt.providerRuntimeFailedBeforeResponding");
  } else if (
    next.lastError &&
    (!next.lastError.continuationObserved || !next.outputObserved ||
      (!next.lastError.recoverable &&
        !isSuccessfulProviderTurnStopReason(next.stopReason ?? undefined)))
  ) {
    next.outcome = "failed";
    next.error = next.lastError.message;
  } else if (!next.doneObserved) {
    next.outcome = "unknown";
  } else if (!next.outputObserved) {
    next.outcome = observationComplete ? "failed" : "unknown";
    next.error = observationComplete
      ? i18n.t("providers:turnTerminalReceipt.providerTurnEndedWithoutAResponse") : null;
  } else next.outcome = "completed";
  return next;
}

/** Display consumers keep identity and outcome, without duplicating the response excerpt. */
export function displayTurnReceipt(receipt: TurnTerminalReceipt | null): TurnTerminalReceipt | null {
  return receipt ? { ...receipt, responseText: null } : null;
}
