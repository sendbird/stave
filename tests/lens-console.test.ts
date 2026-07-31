import { describe, expect, test } from "bun:test";
import {
  LensConsoleRateLimiter,
  LENS_CONSOLE_RATE_LIMIT,
  LENS_CONSOLE_RATE_WINDOW_MS,
  LENS_CONSOLE_TRUNCATION_SUFFIX,
  MAX_LENS_CONSOLE_SOURCE_CHARS,
  MAX_LENS_CONSOLE_TEXT_CHARS,
  truncateLensConsoleEntry,
} from "@/lib/lens/lens-console";
import type { BrowserConsoleEntry } from "@/lib/lens/lens.types";

function consoleEntry(
  patch: Partial<BrowserConsoleEntry> = {},
): BrowserConsoleEntry {
  return {
    id: "entry-1",
    level: "log",
    text: "message",
    timestamp: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

describe("Lens console entry bounds", () => {
  test("preserves text and source at their exact limits", () => {
    const entry = consoleEntry({
      text: "t".repeat(MAX_LENS_CONSOLE_TEXT_CHARS),
      source: "s".repeat(MAX_LENS_CONSOLE_SOURCE_CHARS),
    });

    expect(truncateLensConsoleEntry(entry)).toBe(entry);
  });

  test("truncates text and source with suffixes inside their limits", () => {
    const result = truncateLensConsoleEntry(
      consoleEntry({
        text: "t".repeat(MAX_LENS_CONSOLE_TEXT_CHARS + 1),
        source: "s".repeat(MAX_LENS_CONSOLE_SOURCE_CHARS + 1),
      }),
    );

    expect(result.text).toHaveLength(MAX_LENS_CONSOLE_TEXT_CHARS);
    expect(result.text.endsWith(LENS_CONSOLE_TRUNCATION_SUFFIX)).toBe(true);
    expect(result.source).toHaveLength(MAX_LENS_CONSOLE_SOURCE_CHARS);
    expect(result.source?.endsWith(LENS_CONSOLE_TRUNCATION_SUFFIX)).toBe(true);
  });
});

describe("Lens console rate limiting", () => {
  test("accepts the default limit and drops entries beyond it", () => {
    const limiter = new LensConsoleRateLimiter();

    for (let index = 0; index < LENS_CONSOLE_RATE_LIMIT; index += 1) {
      expect(limiter.accept(10).accepted).toBe(true);
    }

    expect(limiter.accept(10)).toEqual({ accepted: false, droppedCount: 0 });
    expect(limiter.accept(10 + LENS_CONSOLE_RATE_WINDOW_MS - 1)).toEqual({
      accepted: false,
      droppedCount: 0,
    });
  });

  test("resets at the window boundary and reports prior drops once", () => {
    const limiter = new LensConsoleRateLimiter(2, 1_000);

    expect(limiter.accept(5_000)).toEqual({ accepted: true, droppedCount: 0 });
    expect(limiter.accept(5_100)).toEqual({ accepted: true, droppedCount: 0 });
    expect(limiter.accept(5_200)).toEqual({ accepted: false, droppedCount: 0 });
    expect(limiter.accept(5_300)).toEqual({ accepted: false, droppedCount: 0 });

    expect(limiter.accept(6_000)).toEqual({ accepted: true, droppedCount: 2 });
    expect(limiter.accept(6_001)).toEqual({ accepted: true, droppedCount: 0 });
  });

  test("treats a clock rollback as a new window", () => {
    const limiter = new LensConsoleRateLimiter(1, 1_000);

    expect(limiter.accept(5_000)).toEqual({ accepted: true, droppedCount: 0 });
    expect(limiter.accept(5_100)).toEqual({ accepted: false, droppedCount: 0 });
    expect(limiter.accept(4_999)).toEqual({ accepted: true, droppedCount: 1 });
    expect(limiter.accept(4_999)).toEqual({ accepted: false, droppedCount: 0 });
  });
});
