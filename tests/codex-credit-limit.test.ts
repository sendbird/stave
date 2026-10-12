import { expect, test } from "bun:test";
import { mapCodexRateLimitBuckets } from "../electron/providers/codex-snapshot-mappers";
import { emptyRateLimitsSnapshot, resolveAccountUsageBlock } from "../src/lib/providers/account-usage-block";
import { quotaObservations } from "../src/lib/providers/usage-statistics";

const NOW = "2026-10-12T07:00:00.000Z";
const RESET = 1_793_491_200;

function snapshot(individualLimit: unknown, byLimitId = false) {
  const bucket = {
    limitId: "codex",
    primary: { usedPercent: 20, windowDurationMins: 10_080, resetsAt: RESET },
    individualLimit,
    credits: { hasCredits: true, unlimited: false, balance: null },
    spendControlReached: true,
  };
  return {
    ...emptyRateLimitsSnapshot(),
    codex: {
      source: "rpc" as const,
      error: null,
      buckets: mapCodexRateLimitBuckets(byLimitId
        ? { ordinaryUsageAllowed: true, rateLimitsByLimitId: { codex: bucket } }
        : { rateLimits: bucket }),
    },
  };
}

test("zero credit budgets do not become exhausted usage in reads or notifications", () => {
  for (const byLimitId of [false, true]) {
    const value = snapshot({ limit: "0", used: "0.0", remainingPercent: 0, resetsAt: RESET }, byLimitId);
    expect(value.codex.buckets[0]?.individualLimit).toBeNull();
    expect(value.codex.buckets[0]?.credits?.hasCredits).toBe(true);
    expect(resolveAccountUsageBlock({ providerId: "codex", snapshot: value, now: Date.parse(NOW) })).toBeNull();
    expect(quotaObservations(value, "codex", "account-a", NOW).map((row) => [row.windowId, row.usedPercent]))
      .toEqual([["codex:primary", 20]]);
  }
});

test("positive credit budgets preserve unused, partial and exhausted readings", () => {
  for (const [used, remainingPercent, expected] of [[0, 100, 0], [25, 75, 25], [100, 0, 100], [125, 0, 125]]) {
    const value = snapshot({ limit: "100", used: String(used), remainingPercent, resetsAt: RESET });
    expect(value.codex.buckets[0]?.individualLimit?.usedPercent).toBe(expected);
    const block = resolveAccountUsageBlock({ providerId: "codex", snapshot: value, now: Date.parse(NOW) });
    expect(block !== null).toBe(expected >= 100);
  }
});

test("remaining percent is usable without amounts but never overrides an invalid explicit limit", () => {
  expect(snapshot({ remainingPercent: 30 }).codex.buckets[0]?.individualLimit?.usedPercent).toBe(70);
  expect(snapshot({ remainingPercent: 0 }).codex.buckets[0]?.individualLimit?.usedPercent).toBe(100);
  for (const raw of [
    { limit: -1, remainingPercent: 0 },
    { limit: "invalid", remainingPercent: 0 },
    { remainingPercent: -1 },
    { remainingPercent: 101 },
    { limit: 100, used: -1 },
  ]) {
    expect(snapshot(raw).codex.buckets[0]?.individualLimit).toBeNull();
  }
});
