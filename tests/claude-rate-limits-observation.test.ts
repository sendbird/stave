import { beforeEach, describe, expect, test } from "bun:test";
import {
  applyClaudeRateLimitObservation,
  recordClaudeRateLimitObservation,
  resolveClaudeObservedWindow,
} from "../electron/providers/rate-limits/claude-rate-limits-observation";
import {
  clearUsageReadState,
  readProviderUsage,
  readUsageReadState,
} from "../electron/providers/rate-limits/usage-read-policy";
import type { ClaudeUsageSnapshot } from "../src/lib/providers/provider.types";

const NOW = 7_000_000;

const snapshot = (
  overrides?: Partial<ClaudeUsageSnapshot>,
): ClaudeUsageSnapshot => ({
  source: "oauth",
  session: { usedPercent: 40, resetsAt: 1_800 },
  weekly: { usedPercent: 12, resetsAt: 9_000 },
  fableWeekly: null,
  error: null,
  ...overrides,
});

describe("claude turn-time rate-limit observations", () => {
  test("window mapping only names windows the snapshot models", () => {
    expect(resolveClaudeObservedWindow("five_hour")).toBe("session");
    expect(resolveClaudeObservedWindow("seven_day")).toBe("weekly");
    expect(resolveClaudeObservedWindow("seven_day_overage_included")).toBe(
      "weekly",
    );
    // Model-scoped weekly limits and the credit budget are not `fableWeekly`,
    // and writing them there would mislabel the meter.
    expect(resolveClaudeObservedWindow("seven_day_opus")).toBeNull();
    expect(resolveClaudeObservedWindow("seven_day_sonnet")).toBeNull();
    expect(resolveClaudeObservedWindow("overage")).toBeNull();
    expect(resolveClaudeObservedWindow(undefined)).toBeNull();
  });

  test("the event's 0..1 utilization is scaled to the snapshot's 0..100", () => {
    const next = applyClaudeRateLimitObservation({
      snapshot: snapshot(),
      observation: { rateLimitType: "five_hour", utilization: 0.62 },
    });
    expect(next?.session).toEqual({ usedPercent: 62, resetsAt: 1_800 });
    // The untouched window keeps its polled value.
    expect(next?.weekly).toEqual({ usedPercent: 12, resetsAt: 9_000 });
  });

  test("utilization past the cap clamps instead of overflowing the meter", () => {
    expect(
      applyClaudeRateLimitObservation({
        snapshot: snapshot(),
        observation: { rateLimitType: "five_hour", utilization: 1.4 },
      })?.session?.usedPercent,
    ).toBe(100);
  });

  test("a fresh reset time replaces the polled one", () => {
    expect(
      applyClaudeRateLimitObservation({
        snapshot: snapshot(),
        observation: {
          rateLimitType: "seven_day",
          utilization: 0.2,
          resetsAt: 12_345,
        },
      })?.weekly,
    ).toEqual({ usedPercent: 20, resetsAt: 12_345 });
  });

  test("nothing to apply reports no change rather than a fake refresh", () => {
    expect(
      applyClaudeRateLimitObservation({
        snapshot: snapshot(),
        observation: { rateLimitType: "five_hour" },
      }),
    ).toBeNull();
    expect(
      applyClaudeRateLimitObservation({
        snapshot: snapshot(),
        observation: { rateLimitType: "five_hour", utilization: 0.4 },
      }),
    ).toBeNull();
    expect(
      applyClaudeRateLimitObservation({
        snapshot: snapshot({ source: "unavailable" }),
        observation: { rateLimitType: "five_hour", utilization: 0.9 },
      }),
    ).toBeNull();
  });
});

describe("observations folded into the shared read cache", () => {
  beforeEach(() => {
    clearUsageReadState();
  });

  test("an observation is ignored until a real read established a snapshot", () => {
    expect(
      recordClaudeRateLimitObservation({
        observation: { rateLimitType: "five_hour", utilization: 0.5 },
        now: NOW,
      }),
    ).toBe(false);
  });

  test("an observation updates the cache and suppresses the next read", async () => {
    let calls = 0;
    const request = async () => {
      calls += 1;
      return snapshot();
    };
    const read = (now: number) =>
      readProviderUsage({
        key: "claude-code",
        request,
        classify: () => "ok" as const,
        now,
      });

    expect((await read(NOW)).session?.usedPercent).toBe(40);
    expect(calls).toBe(1);

    // A turn reports the binding window five minutes later. The next poll,
    // well past the two-minute cache floor, must see the pushed number and
    // must not have cost a request.
    expect(
      recordClaudeRateLimitObservation({
        observation: { rateLimitType: "five_hour", utilization: 0.71 },
        now: NOW + 5 * 60_000,
      }),
    ).toBe(true);
    expect(readUsageReadState("claude-code")?.updatedAt).toBe(
      NOW + 5 * 60_000,
    );
    expect((await read(NOW + 6 * 60_000)).session?.usedPercent).toBe(71);
    expect(calls).toBe(1);
  });

  test("an observation clears a failure backoff", async () => {
    let calls = 0;
    const responses: ClaudeUsageSnapshot[] = [
      snapshot(),
      snapshot({ source: "unavailable", error: "nope" }),
    ];
    const request = async () => {
      const value = responses[Math.min(calls, responses.length - 1)];
      calls += 1;
      return value as ClaudeUsageSnapshot;
    };
    const read = (now: number) =>
      readProviderUsage({
        key: "claude-code",
        request,
        classify: (value) =>
          value.source === "unavailable" ? ("failed" as const) : ("ok" as const),
        now,
      });

    await read(NOW);
    await read(NOW + 3 * 60_000);
    expect(readUsageReadState("claude-code")?.consecutiveFailures).toBe(1);

    recordClaudeRateLimitObservation({
      observation: { rateLimitType: "five_hour", utilization: 0.3 },
      now: NOW + 4 * 60_000,
    });
    const state = readUsageReadState("claude-code");
    expect(state?.consecutiveFailures).toBe(0);
    expect(state?.nextAttemptAt).toBe(0);
  });
});
