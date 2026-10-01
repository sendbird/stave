import { describe, expect, test } from "bun:test";

import {
  FIVE_HOURS_MS,
  listCliConnectedUsageProviders,
  resolveWindowTimeLeftRatio,
} from "../src/components/layout/status-bar-usage.utils";

describe("listCliConnectedUsageProviders", () => {
  test("hides engines whose CLI is reported unavailable", () => {
    expect(
      listCliConnectedUsageProviders({
        "claude-code": true,
        codex: false,
        cursor: false,
        kiro: true,
      }),
    ).toEqual(["claude", "kiro"]);
  });

  test("keeps engines with unknown availability visible", () => {
    expect(listCliConnectedUsageProviders({})).toEqual([
      "claude",
      "codex",
      "cursor",
      "kiro",
    ]);
  });
});

describe("resolveWindowTimeLeftRatio", () => {
  const now = 1_000_000_000_000;
  test("returns remaining fraction of the window", () => {
    const resetsAt = (now + 2 * 3_600_000) / 1000;
    expect(
      resolveWindowTimeLeftRatio({ resetsAt, windowMs: FIVE_HOURS_MS, now }),
    ).toBeCloseTo(0.4);
  });
  test("clamps past resets and over-long windows", () => {
    expect(
      resolveWindowTimeLeftRatio({ resetsAt: now / 1000 - 10, windowMs: FIVE_HOURS_MS, now }),
    ).toBe(0);
    expect(
      resolveWindowTimeLeftRatio({ resetsAt: now / 1000 + 6 * 3600, windowMs: FIVE_HOURS_MS, now }),
    ).toBe(1);
  });
  test("returns null without reset time or window length", () => {
    expect(resolveWindowTimeLeftRatio({ resetsAt: null, windowMs: FIVE_HOURS_MS, now })).toBeNull();
    expect(resolveWindowTimeLeftRatio({ resetsAt: now / 1000, windowMs: null, now })).toBeNull();
  });
});
