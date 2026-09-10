import { beforeEach, describe, expect, test } from "bun:test";
import {
  RATE_LIMITS_ACTIVITY_RECENT_MS,
  RATE_LIMITS_DRIFT_FLOOR_MS,
  RATE_LIMITS_INTERVAL_ACTIVE_MS,
  RATE_LIMITS_INTERVAL_IDLE_MS,
  RATE_LIMITS_INTERVAL_LONG_IDLE_MS,
  RATE_LIMITS_INTERVAL_METER_MS,
  RATE_LIMITS_INTERVAL_WARM_MS,
  RATE_LIMITS_METER_RECENT_MS,
  RATE_LIMITS_PROVIDER_ACTIVITY_MS,
  noteRateLimitsInteraction,
  noteRateLimitsMeterClosed,
  noteRateLimitsMeterOpen,
  noteRateLimitsProviderActivity,
  readRateLimitsInteractionAt,
  readRateLimitsPollInputs,
  resetRateLimitsInteractionForTests,
  resolveRateLimitsPollDecision,
  resolveRateLimitsPollPlan,
  subscribeRateLimitsPollWake,
} from "../src/lib/providers/rate-limits-poll-policy";

const NOW = 10_000_000;

const inputs = (overrides?: {
  meterOpenProviders?: readonly ("claude-code" | "codex" | "cursor" | "kiro")[];
  lastMeterOpenAt?: number;
  lastInteractionAt?: number;
  activityAtByProvider?: Record<string, number>;
}) => ({
  meterOpenProviders: overrides?.meterOpenProviders ?? [],
  lastMeterOpenAt: overrides?.lastMeterOpenAt ?? 0,
  lastInteractionAt: overrides?.lastInteractionAt ?? NOW,
  activityAtByProvider: overrides?.activityAtByProvider ?? {},
});

describe("status-bar rate-limit poll cadence", () => {
  test("a hidden window is the slowest tier and reads nothing", () => {
    const plan = resolveRateLimitsPollPlan({
      now: NOW,
      visible: false,
      inputs: inputs(),
      updatedAtByProvider: {},
    });
    expect(plan.tier).toBe("hidden");
    expect(plan.intervalMs).toBe(RATE_LIMITS_INTERVAL_LONG_IDLE_MS);
    expect(plan.providers).toEqual([]);
  });

  test("only the meter unlocks the fastest tier; window focus does not", () => {
    // Returning to the window is ordinary attention, which is what the
    // interaction timestamp records — it must land in the warm tier, not the
    // 2-minute one, or moving between apps while coding would pin the app to
    // the fastest cadence.
    expect(
      resolveRateLimitsPollDecision({
        now: NOW,
        visible: true,
        lastInteractionAt: NOW,
      }).tier,
    ).toBe("warm");

    expect(
      resolveRateLimitsPollDecision({
        now: NOW,
        visible: true,
        lastInteractionAt: NOW,
        meterOpenProviders: ["codex"],
      }),
    ).toEqual({ tier: "meterOpen", intervalMs: RATE_LIMITS_INTERVAL_METER_MS });
  });

  test("a recently closed meter stays fast, then decays", () => {
    const tierAfterClose = (agoMs: number) =>
      resolveRateLimitsPollDecision({
        now: NOW,
        visible: true,
        lastInteractionAt: NOW - agoMs,
        lastMeterOpenAt: NOW - agoMs,
      }).tier;
    expect(tierAfterClose(RATE_LIMITS_METER_RECENT_MS)).toBe("meterOpen");
    expect(tierAfterClose(RATE_LIMITS_METER_RECENT_MS + 1)).toBe("warm");
  });

  test("a running turn holds the active tier without anyone watching", () => {
    const decision = resolveRateLimitsPollDecision({
      now: NOW,
      visible: true,
      // Nobody has touched the app in hours; only the turn is keeping it warm.
      lastInteractionAt: NOW - 9 * 3_600_000,
      activityAtByProvider: { codex: NOW - 60_000 },
    });
    expect(decision).toEqual({
      tier: "turnActivity",
      intervalMs: RATE_LIMITS_INTERVAL_ACTIVE_MS,
    });
    expect(
      resolveRateLimitsPollDecision({
        now: NOW,
        visible: true,
        lastInteractionAt: NOW - 9 * 3_600_000,
        activityAtByProvider: {
          codex: NOW - RATE_LIMITS_ACTIVITY_RECENT_MS - 1,
        },
      }).tier,
    ).toBe("longIdle");
  });

  test("cadence slows as the last interaction recedes", () => {
    const tierAt = (agoMs: number) =>
      resolveRateLimitsPollDecision({
        now: NOW,
        visible: true,
        lastInteractionAt: NOW - agoMs,
      });
    expect(tierAt(30 * 60_000)).toEqual({
      tier: "warm",
      intervalMs: RATE_LIMITS_INTERVAL_WARM_MS,
    });
    expect(tierAt(2 * 3_600_000)).toEqual({
      tier: "idle",
      intervalMs: RATE_LIMITS_INTERVAL_IDLE_MS,
    });
    expect(tierAt(9 * 3_600_000)).toEqual({
      tier: "longIdle",
      intervalMs: RATE_LIMITS_INTERVAL_LONG_IDLE_MS,
    });
  });

  test("every visible tier stays inside the 2-30 minute band", () => {
    for (const agoMs of [0, 60_000, 20 * 60_000, 3 * 3_600_000, 1e9]) {
      const { intervalMs } = resolveRateLimitsPollDecision({
        now: NOW,
        visible: true,
        lastInteractionAt: NOW - agoMs,
        lastMeterOpenAt: NOW - agoMs,
      });
      expect(intervalMs).toBeGreaterThanOrEqual(2 * 60_000);
      expect(intervalMs).toBeLessThanOrEqual(30 * 60_000);
    }
  });

  test("a future timestamp reads as 'just now', not a huge idle age", () => {
    expect(
      resolveRateLimitsPollDecision({
        now: NOW,
        visible: true,
        lastInteractionAt: NOW + 60_000,
        lastMeterOpenAt: NOW + 60_000,
      }).tier,
    ).toBe("meterOpen");
  });
});

describe("interaction and activity tracking", () => {
  beforeEach(() => {
    resetRateLimitsInteractionForTests(NOW);
  });

  test("interaction only moves forward", () => {
    noteRateLimitsInteraction(NOW - 60_000);
    expect(readRateLimitsInteractionAt()).toBe(NOW);
    noteRateLimitsInteraction(NOW + 60_000);
    expect(readRateLimitsInteractionAt()).toBe(NOW + 60_000);
  });

  test("meter open/close tracks the provider actually on screen", () => {
    noteRateLimitsMeterOpen("codex", NOW);
    expect(readRateLimitsPollInputs().meterOpenProviders).toEqual(["codex"]);
    noteRateLimitsMeterClosed("codex", NOW + 1_000);
    expect(readRateLimitsPollInputs().meterOpenProviders).toEqual([]);
    expect(readRateLimitsPollInputs().lastMeterOpenAt).toBe(NOW + 1_000);
  });

  test("a long turn re-arms the loop once, not on every event", () => {
    let wakes = 0;
    subscribeRateLimitsPollWake(() => {
      wakes += 1;
    });
    noteRateLimitsMeterOpen("codex", NOW);
    expect(wakes).toBe(1);

    // First activity after a quiet stretch changes the tier: wake. The next
    // thousand events inside the same window must not.
    noteRateLimitsProviderActivity("claude-code", NOW + 1_000);
    expect(wakes).toBe(2);
    for (let index = 1; index <= 1_000; index += 1) {
      noteRateLimitsProviderActivity("claude-code", NOW + 1_000 + index);
    }
    expect(wakes).toBe(2);

    // A gap wider than the tier window is a new transition.
    noteRateLimitsProviderActivity(
      "claude-code",
      NOW + 1_000 + RATE_LIMITS_ACTIVITY_RECENT_MS + 10_000,
    );
    expect(wakes).toBe(3);
  });
});

describe("per-provider read reasons", () => {
  beforeEach(() => {
    resetRateLimitsInteractionForTests(NOW);
  });

  test("providers without a reading are all read on the first visible tick", () => {
    const plan = resolveRateLimitsPollPlan({
      now: NOW,
      visible: true,
      inputs: inputs(),
      updatedAtByProvider: {},
    });
    expect(plan.providers).toContain("codex");
    expect(plan.providers).toContain("claude-code");
    expect(plan.reasonByProvider.codex).toBe("initial");
  });

  test("a provider nothing has spent is left alone until the drift floor", () => {
    const plan = (agoMs: number) =>
      resolveRateLimitsPollPlan({
        now: NOW,
        visible: true,
        inputs: inputs(),
        updatedAtByProvider: { cursor: NOW - agoMs },
        providers: ["cursor"],
      });
    // No turn has touched Cursor and nobody has opened its meter, so a
    // ten-minute-old reading is not re-read: the number cannot have moved.
    expect(plan(10 * 60_000).providers).toEqual([]);
    expect(plan(RATE_LIMITS_DRIFT_FLOOR_MS).providers).toEqual(["cursor"]);
    expect(plan(RATE_LIMITS_DRIFT_FLOOR_MS).reasonByProvider.cursor).toBe(
      "drift",
    );
  });

  test("turn activity is what makes a provider worth re-reading", () => {
    const plan = resolveRateLimitsPollPlan({
      now: NOW,
      visible: true,
      inputs: inputs({ activityAtByProvider: { codex: NOW - 60_000 } }),
      updatedAtByProvider: {
        codex: NOW - RATE_LIMITS_INTERVAL_ACTIVE_MS,
        cursor: NOW - RATE_LIMITS_INTERVAL_ACTIVE_MS,
      },
      providers: ["codex", "cursor"],
    });
    // Only the provider that actually spent quota is read; the other three
    // accounts are unrelated and their numbers did not change.
    expect(plan.providers).toEqual(["codex"]);
    expect(plan.reasonByProvider.codex).toBe("turnActivity");
  });

  test("activity keeps a provider eligible past the fast tier's own window", () => {
    const activityAt = NOW - RATE_LIMITS_ACTIVITY_RECENT_MS - 60_000;
    const plan = resolveRateLimitsPollPlan({
      now: NOW,
      visible: true,
      inputs: inputs({ activityAtByProvider: { codex: activityAt } }),
      updatedAtByProvider: { codex: NOW - 10 * 60_000 },
      providers: ["codex"],
    });
    expect(plan.tier).toBe("warm");
    expect(plan.reasonByProvider.codex).toBe("turnActivity");

    const stale = resolveRateLimitsPollPlan({
      now: NOW,
      visible: true,
      inputs: inputs({
        activityAtByProvider: {
          codex: NOW - RATE_LIMITS_PROVIDER_ACTIVITY_MS - 1,
        },
      }),
      updatedAtByProvider: { codex: NOW - 10 * 60_000 },
      providers: ["codex"],
    });
    expect(stale.providers).toEqual([]);
  });

  test("a window that has rolled over since the last read is re-read", () => {
    const resetAt = NOW - 60_000;
    const plan = resolveRateLimitsPollPlan({
      now: NOW,
      visible: true,
      inputs: inputs(),
      updatedAtByProvider: { "claude-code": NOW - 20 * 60_000 },
      resetsAtMsByProvider: { "claude-code": resetAt },
      providers: ["claude-code"],
    });
    expect(plan.providers).toEqual(["claude-code"]);
    expect(plan.reasonByProvider["claude-code"]).toBe("windowReset");

    // A boundary the last reading already covers is not a reason to re-read.
    expect(
      resolveRateLimitsPollPlan({
        now: NOW,
        visible: true,
        inputs: inputs(),
        updatedAtByProvider: { "claude-code": resetAt + 1_000 },
        resetsAtMsByProvider: { "claude-code": resetAt },
        providers: ["claude-code"],
      }).providers,
    ).toEqual([]);
  });

  test("an abandoned app stops reading entirely", () => {
    const plan = resolveRateLimitsPollPlan({
      now: NOW,
      visible: true,
      inputs: inputs({ lastInteractionAt: NOW - 9 * 3_600_000 }),
      updatedAtByProvider: {
        "claude-code": NOW - 8 * 3_600_000,
        codex: NOW - 8 * 3_600_000,
        cursor: NOW - 8 * 3_600_000,
        kiro: NOW - 8 * 3_600_000,
      },
    });
    expect(plan.tier).toBe("longIdle");
    expect(plan.providers).toEqual([]);
  });

  test("the tier is a floor on every reason, so the meter cannot out-run it", () => {
    // Meter open asks for 2-minute freshness, and the tier agrees, so a
    // reading younger than that is never re-read no matter who is looking.
    expect(
      resolveRateLimitsPollPlan({
        now: NOW,
        visible: true,
        inputs: inputs({ meterOpenProviders: ["codex"] }),
        updatedAtByProvider: { codex: NOW - 30_000 },
        providers: ["codex"],
      }).providers,
    ).toEqual([]);
    expect(
      resolveRateLimitsPollPlan({
        now: NOW,
        visible: true,
        inputs: inputs({ meterOpenProviders: ["codex"] }),
        updatedAtByProvider: { codex: NOW - RATE_LIMITS_INTERVAL_METER_MS },
        providers: ["codex"],
      }).reasonByProvider.codex,
    ).toBe("meterOpen");
  });
});
