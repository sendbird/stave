import { i18n } from "@/i18n/runtime";
import type { NormalizedProviderEvent } from "./provider.types";
import { classifyProviderTurnStopReason } from "./turn-stop-reason";
import { isUsageLimitErrorText } from "./usage-limit-stop";
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
  transportFailure: boolean;
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
    message: message || i18n.t("providers:providerErrorRecovery.theProviderRunFailed"),
    guidance,
    capacityFailure:
      normalized.includes("server_overloaded") ||
      normalized.includes("at capacity") ||
      normalized.includes("model is overloaded") ||
      normalized.includes("resource_exhausted") ||
      normalized.includes("service limit"),
    transportFailure:
      normalized.includes("ping timed out") ||
      normalized.includes("keepalive") ||
      normalized.includes("nghttp2") ||
      normalized.includes("network drop") ||
      normalized.includes("stream lost") ||
      normalized.includes("stream closed") ||
      normalized.includes("stream dropped") ||
      normalized.includes("retriable backend"),
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

/**
 * Failures that pass on their own: an overloaded or unreachable service, a
 * dropped connection or a timeout. A usage limit is not one of them; it has
 * its own wait (`usage-limit-stop.ts`).
 */
const TRANSIENT_FAILURE_PATTERNS: readonly RegExp[] = [
  /\btimed out\b/i,
  /\btime-?out\b/i,
  /\b(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|EPIPE|ENETUNREACH)\b/,
  /\bsocket hang up\b/i,
  /\bfetch failed\b/i,
  /\bnetwork (?:error|drop|is unreachable)\b/i,
  /\bconnection (?:reset|refused|closed|lost|error)\b/i,
  /\b(?:service|server) (?:is )?(?:temporarily )?unavailable\b/i,
  /\btemporarily unavailable\b/i,
  /\b(?:bad gateway|gateway timeout|internal server error)\b/i,
  /\b(?:HTTP |status )?50[0234]\b/,
  /\boverloaded\b/i,
];

/** Whether a provider error says a failure that a later retry can get past. */
export function isTransientProviderFailureText(text: string) {
  const notice = parseProviderErrorNotice(PROVIDER_ERROR_PREFIX.test(text.trim()) ? text : `[error] ${text}`);
  if (!notice) return false;
  if (isUsageLimitErrorText(notice.message)) return false;
  return notice.capacityFailure || notice.transportFailure || TRANSIENT_FAILURE_PATTERNS.some((pattern) => pattern.test(notice.message));
}

/**
 * The transient provider failure that ended a turn: the turn ended in failure
 * (not a cancel) and its last error says a failure that passes. Null for a
 * completed or cancelled turn, a usage limit, or any other error.
 */
export function findTransientTurnFailure(events: readonly NormalizedProviderEvent[]): { message: string } | null {
  const reversedEnd = [...events].reverse().findIndex((event) => event.type === "done");
  const end = reversedEnd < 0 ? -1 : events.length - 1 - reversedEnd;
  const done = events[end];
  if (done?.type !== "done" || classifyProviderTurnStopReason(done.stop_reason) !== "failed") return null;
  const error = events.slice(0, end).reverse().find((event) => event.type === "error");
  if (error?.type !== "error" || !isTransientProviderFailureText(error.message)) return null;
  return { message: error.message.replace(PROVIDER_ERROR_PREFIX, "").split(/\r?\n/)[0]!.trim().slice(0, 300) };
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
    (args.notice.capacityFailure || args.notice.transportFailure) &&
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
