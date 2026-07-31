import type { BrowserConsoleEntry } from "@/lib/lens/lens.types";

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

export interface LensConsoleRateLimitDecision {
  accepted: boolean;
  /** Drops from the completed window, reported once on its successor. */
  droppedCount: number;
}

/**
 * A fixed-window limiter for high-volume console events. Rejected decisions
 * accumulate silently; the first accepted decision in the next window
 * reports the previous window's total so callers can emit one bounded summary.
 */
export class LensConsoleRateLimiter {
  private windowStartedAt: number | undefined;
  private acceptedCount = 0;
  private droppedCount = 0;

  constructor(
    private readonly limit = LENS_CONSOLE_RATE_LIMIT,
    private readonly windowMs = LENS_CONSOLE_RATE_WINDOW_MS,
  ) {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new RangeError(
        "Lens console rate limit must be a positive integer",
      );
    }
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      throw new RangeError("Lens console rate window must be positive");
    }
  }

  accept(now = Date.now()): LensConsoleRateLimitDecision {
    const startsNewWindow =
      this.windowStartedAt === undefined ||
      now < this.windowStartedAt ||
      now - this.windowStartedAt >= this.windowMs;

    let completedWindowDrops = 0;
    if (startsNewWindow) {
      completedWindowDrops = this.droppedCount;
      this.windowStartedAt = now;
      this.acceptedCount = 0;
      this.droppedCount = 0;
    }

    if (this.acceptedCount < this.limit) {
      this.acceptedCount += 1;
      return {
        accepted: true,
        droppedCount: completedWindowDrops,
      };
    }

    this.droppedCount += 1;
    return { accepted: false, droppedCount: 0 };
  }
}
