import type { ChatMessage } from "@/types/chat";

const PROVIDER_ERROR_PREFIX = /^\[error\]\s*/i;

/**
 * Error texts that mean the account ran out of usage, as opposed to a
 * transient per-request throttle. They are the messages the runtimes already
 * emit (`claude-event-mapping.ts`, `codex-app-server-errors.ts`) plus the raw
 * wording the provider CLIs use when a limit ends a turn.
 */
const USAGE_LIMIT_ERROR_PATTERNS: readonly RegExp[] = [
  /\brate limit reached\b/i,
  /\bextra usage credits are exhausted\b/i,
  /\b(?:you'?ve|you have) (?:hit|reached) your (?:usage )?limit\b/i,
  /\busage limit (?:reached|exceeded|has been reached)\b/i,
  /\busage_limit_(?:reached|exceeded)\b/i,
  /\busageLimitExceeded\b/,
];

export function isUsageLimitErrorText(text: string): boolean {
  const normalized = text.replace(PROVIDER_ERROR_PREFIX, "");
  return USAGE_LIMIT_ERROR_PATTERNS.some((pattern) => pattern.test(normalized));
}

export interface UsageLimitStop {
  /** The provider's error line, without the `[error]` prefix. */
  message: string;
}

/**
 * Whether the task's last turn ended because the account hit its usage limit.
 *
 * Reads the finished turn's assistant message: its last usage-limit error
 * must be the last thing the turn said. A limit warning followed by more
 * output (extra usage took over, the turn kept going) is not a stop.
 */
export function findUsageLimitStop(
  messages: readonly ChatMessage[] | undefined,
): UsageLimitStop | null {
  const last = messages?.at(-1);
  if (!last || last.role !== "assistant") {
    return null;
  }
  let stop: UsageLimitStop | null = null;
  for (const part of last.parts) {
    if (part.type === "system_event") {
      const content = part.content.trim();
      if (PROVIDER_ERROR_PREFIX.test(content) && isUsageLimitErrorText(content)) {
        stop = {
          message: content.replace(PROVIDER_ERROR_PREFIX, "").split(/\r?\n/)[0]!.trim(),
        };
      }
      continue;
    }
    if (part.type === "tool_use") {
      // Work after the error means the turn carried on past it.
      stop = null;
      continue;
    }
    if (part.type === "text") {
      const text = part.text.trim();
      // The CLI also writes the limit notice as the reply itself.
      if (text.length > 0 && !isUsageLimitErrorText(text)) {
        stop = null;
      }
    }
  }
  return stop;
}

/**
 * Starts a new turn after a usage limit ended the last one. Like the provider
 * failure continuation, it never replays the original prompt: tools may have
 * finished before the limit stopped the turn.
 */
export function buildUsageLimitContinuationPrompt() {
  return [
    "Continue this task: the previous turn stopped when the account reached its usage limit.",
    "Inspect the current workspace and conversation before acting.",
    "Identify what already completed, then finish only the remaining work.",
    "Do not repeat completed side effects or assume an earlier action failed solely because the turn ended.",
  ].join(" ");
}
