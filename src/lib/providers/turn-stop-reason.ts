const PROVIDER_TURN_FAILURE_STOP_REASONS = new Set([
  "aborted",
  "error",
  "failed",
  "max_tokens",
  "output_overflow",
  "runtime_failure",
]);

const PROVIDER_TURN_CANCEL_STOP_REASONS = new Set([
  "canceled",
  "cancelled",
  "interrupted",
  "user_abort",
]);

/** Shared interpretation for outcome records and visible completion state. */
export function classifyProviderTurnStopReason(reason?: string) {
  const normalized = reason?.trim().toLowerCase();
  if (normalized && PROVIDER_TURN_CANCEL_STOP_REASONS.has(normalized)) return "cancelled";
  if (normalized && PROVIDER_TURN_FAILURE_STOP_REASONS.has(normalized)) return "failed";
  return "completed";
}


/** A hard error needs an explicit successful terminal signal after recovery. */
export function isSuccessfulProviderTurnStopReason(reason?: string) {
  return ["completed", "end_turn"].includes(reason?.trim().toLowerCase() ?? "");
}
