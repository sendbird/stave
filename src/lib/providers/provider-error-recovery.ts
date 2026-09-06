const PROVIDER_ERROR_PREFIX = /^\[error\]\s*/i;
const TERMINAL_FAILURE_STOP_REASONS = new Set([
  "aborted",
  "error",
  "failed",
  "output_overflow",
  "runtime_failure",
]);

export interface ProviderErrorNotice {
  message: string;
  guidance: string;
  capacityFailure: boolean;
}

export function parseProviderErrorNotice(
  content: string,
): ProviderErrorNotice | null {
  const trimmed = content.trim();
  if (!PROVIDER_ERROR_PREFIX.test(trimmed)) {
    return null;
  }
  const lines = trimmed.split(/\r?\n/);
  const message = (lines.shift() ?? "")
    .replace(PROVIDER_ERROR_PREFIX, "")
    .trim();
  const guidance = lines.join("\n").trim();
  const normalized = trimmed.toLowerCase();
  return {
    message: message || "The provider run failed.",
    guidance,
    capacityFailure:
      normalized.includes("server_overloaded") ||
      normalized.includes("at capacity") ||
      normalized.includes("model is overloaded"),
  };
}

/**
 * Starts a new turn instead of replaying the failed turn's original prompt.
 * The provider must reconcile workspace state before attempting remaining
 * work because tools may have completed before the terminal failure arrived.
 */
export function buildProviderFailureContinuationPrompt() {
  return [
    "Continue this task after the provider failure.",
    "Inspect the current workspace and conversation before acting.",
    "Identify what already completed, then finish only the remaining work.",
    "Do not repeat completed side effects or assume an earlier action failed solely because the turn ended.",
  ].join(" ");
}

export function isTerminalProviderFailureStopReason(
  stopReason: string | undefined,
) {
  return TERMINAL_FAILURE_STOP_REASONS.has(
    stopReason?.trim().toLowerCase() ?? "",
  );
}

export function isProviderFailureRecoveryEligible(args: {
  notice: ProviderErrorNotice;
  terminalStopReason?: string;
}) {
  return (
    args.notice.capacityFailure &&
    isTerminalProviderFailureStopReason(args.terminalStopReason)
  );
}

export function isProviderFailureRecoveryScopeCurrent(args: {
  capturedWorkspaceId: string | null;
  currentWorkspaceId: string;
  activeWorkspaceId: string;
  scopedTaskId: string;
  activeTaskId: string;
  messageId: string;
  latestMessageId?: string;
  activeTurnId?: string;
}) {
  return Boolean(
    args.capturedWorkspaceId &&
      args.currentWorkspaceId === args.capturedWorkspaceId &&
      args.activeWorkspaceId === args.capturedWorkspaceId &&
      args.activeTaskId === args.scopedTaskId &&
      args.latestMessageId === args.messageId &&
      !args.activeTurnId,
  );
}
