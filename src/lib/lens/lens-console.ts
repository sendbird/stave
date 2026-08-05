import type { BrowserConsoleEntry } from "@/lib/lens/lens.types";
import {
  LensFixedWindowRateLimiter,
  type LensRateLimitDecision,
} from "@/lib/lens/lens-rate-limit";

export const MAX_LENS_CONSOLE_TEXT_CHARS = 32_768;
export const MAX_LENS_CONSOLE_SOURCE_CHARS = 2_048;
export const LENS_CONSOLE_TRUNCATION_SUFFIX = "… [truncated]";

export const LENS_CONSOLE_RATE_LIMIT = 100;
export const LENS_CONSOLE_RATE_WINDOW_MS = 1_000;

function truncateWithSuffix(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  const prefixLength = Math.max(
    0,
    maxChars - LENS_CONSOLE_TRUNCATION_SUFFIX.length,
  );
  return `${value.slice(0, prefixLength)}${LENS_CONSOLE_TRUNCATION_SUFFIX}`;
}

/**
 * Bounds the untrusted strings carried by a Lens console entry before the
 * entry is retained or forwarded. The suffix is included in each field's
 * maximum character count.
 */
export function truncateLensConsoleEntry(
  entry: BrowserConsoleEntry,
): BrowserConsoleEntry {
  const text = truncateWithSuffix(entry.text, MAX_LENS_CONSOLE_TEXT_CHARS);
  const source =
    entry.source === undefined
      ? undefined
      : truncateWithSuffix(entry.source, MAX_LENS_CONSOLE_SOURCE_CHARS);

  if (text === entry.text && source === entry.source) {
    return entry;
  }

  return {
    ...entry,
    text,
    source,
  };
}

export type LensConsoleRateLimitDecision = LensRateLimitDecision;

/**
 * A fixed-window limiter for high-volume console events. Rejected decisions
 * accumulate silently; the first accepted decision in the next window
 * reports the previous window's total so callers can emit one bounded summary.
 */
export class LensConsoleRateLimiter extends LensFixedWindowRateLimiter {
  constructor(
    limit = LENS_CONSOLE_RATE_LIMIT,
    windowMs = LENS_CONSOLE_RATE_WINDOW_MS,
  ) {
    super(limit, windowMs, "Lens console");
  }
}
