/**
 * User-facing error formatting for Codex App Server failures.
 *
 * Extracted verbatim from `codex-app-server-runtime.ts` to keep that file within
 * the max-lines ratchet; no behavior changed. `codex-app-server-runtime` still
 * re-exports `formatCodexAppServerErrorMessage` for existing consumers.
 */
import { isRecord, toTrimmedString } from "./codex-app-server-json";

export function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function toCodexUserFacingErrorMessage(args: { message: string }) {
  const message = formatCodexAppServerErrorMessage(args.message);
  const lower = message.toLowerCase();
  if (
    lower.includes("auth") ||
    lower.includes("api key") ||
    lower.includes("login") ||
    lower.includes("unauthorized")
  ) {
    return "Codex authentication failed. Run `codex login` and retry.";
  }
  if (
    lower.includes("rate limit") ||
    lower.includes("quota") ||
    lower.includes("insufficient_quota")
  ) {
    return "Codex rate limit/quota reached. Retry after reset or check account limits.";
  }
  if (lower.includes("billing") || lower.includes("payment")) {
    return "Codex billing/subscription issue detected. Check account payment status.";
  }
  if (
    lower.includes("stream disconnected") ||
    lower.includes("error sending request for url")
  ) {
    return "Codex network/model endpoint is unreachable. Check internet/proxy/firewall and retry.";
  }
  return message;
}

export function formatCodexAppServerErrorMessage(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return "Codex App Server error.";
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
  if (!isRecord(parsed)) {
    return trimmed;
  }

  const error = isRecord(parsed.error) ? parsed.error : null;
  const nestedMessage =
    toTrimmedString(error?.message) ?? toTrimmedString(parsed.message);
  if (!nestedMessage) {
    return trimmed;
  }

  const details = [
    (toTrimmedString(error?.param) ?? toTrimmedString(parsed.param))
      ? `param: ${toTrimmedString(error?.param) ?? toTrimmedString(parsed.param)}`
      : null,
    typeof parsed.status === "number" ? `status: ${parsed.status}` : null,
  ].filter(Boolean);
  return details.length > 0
    ? `${nestedMessage} (${details.join(", ")})`
    : nestedMessage;
}
