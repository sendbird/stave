import { describe, expect, test } from "bun:test";
import {
  emptyRateLimitsSnapshot,
  isAccountUsageWindowExhausted,
  mergeRateLimitsSnapshots,
  resolveAccountUsageBlock,
} from "../src/lib/providers/account-usage-block";
import type { RateLimitsSnapshotResponse } from "../src/lib/providers/provider.types";

const NOW_MS = 1_788_220_800_000;
const FUTURE = Math.floor((NOW_MS + 3_600_000) / 1000);
const PAST = Math.floor((NOW_MS - 3_600_000) / 1000);

function snapshot(
  patch: Partial<RateLimitsSnapshotResponse> = {},
): RateLimitsSnapshotResponse {
  return {
    ...emptyRateLimitsSnapshot(),
    ...patch,
  };
}

describe("isAccountUsageWindowExhausted", () => {
  test("requires 100% and a reset that has not already passed", () => {
    expect(
      isAccountUsageWindowExhausted({
        usedPercent: 99.9,
        resetsAt: FUTURE,
        now: NOW_MS,
      }),
    ).toBe(false);
    expect(
      isAccountUsageWindowExhausted({
        usedPercent: 100,
        resetsAt: FUTURE,
        now: NOW_MS,
      }),
    ).toBe(true);
    expect(
      isAccountUsageWindowExhausted({
        usedPercent: 100,
        resetsAt: PAST,
        now: NOW_MS,
      }),
    ).toBe(false);
    expect(
      isAccountUsageWindowExhausted({
        usedPercent: 100,
        resetsAt: null,
        now: NOW_MS,
      }),
    ).toBe(true);
  });
});

describe("resolveAccountUsageBlock", () => {
  test("keeps named model pools independent in both directions", () => {
    const limits = snapshot({
      cursor: {
        source: "dashboard",
        planType: "pro",
        monthly: { usedPercent: 100, resetsAt: FUTURE, used: 20, limit: 20 },
        buckets: [
          { id: "cursor-models", label: "Cursor models", usedPercent: 20, resetsAt: FUTURE, used: null, limit: null, unit: null },
          { id: "other-models", label: "Other models", usedPercent: 100, resetsAt: FUTURE, used: null, limit: null, unit: null },
        ],
        error: null,
      },
    });
    const check = (model?: string) => resolveAccountUsageBlock({
      providerId: "cursor", model, snapshot: limits, now: NOW_MS,
    });
    for (const model of ["grok-4.5", "grok-4.6[reasoning=high]", "composer-2.5", "composer-2-5-fast[fast=true]"]) {
      expect(check(model)).toBeNull();
    }
    for (const model of ["claude-opus-5", "gpt-5", "grok-4"]) {
      expect(check(model)?.windowLabel).toBe("Other models");
    }
    // Routing and provider-level indicators still consider every window.
    for (const model of [undefined, "", "auto", "auto-smart[optimize_for=balanced]"]) {
      expect(check(model)).not.toBeNull();
    }
    limits.cursor.buckets[0]!.usedPercent = 100;
    limits.cursor.buckets[1]!.usedPercent = 20;
    expect(check("grok-4.6")?.windowLabel).toBe("Cursor models");
    expect(check("claude-opus-5")).toBeNull();
    limits.cursor.buckets[0]!.resetsAt = PAST;
    expect(check("grok-4.6")).toBeNull();
    // Older and partial snapshots must not silently disable the limit guard.
    limits.cursor.buckets = [];
    expect(check("grok-4.6")?.windowLabel).toBe("Monthly");
  });

  test("does not block when usage data is unavailable", () => {
    expect(
      resolveAccountUsageBlock({
        providerId: "claude-code",
        snapshot: emptyRateLimitsSnapshot(),
        now: NOW_MS,
      }),
    ).toBeNull();
    expect(
      resolveAccountUsageBlock({
        providerId: "cursor",
        snapshot: null,
        now: NOW_MS,
      }),
    ).toBeNull();
  });

  test("blocks Claude when any included window is at 100%", () => {
    const block = resolveAccountUsageBlock({
      providerId: "claude-code",
      snapshot: snapshot({
        claude: {
          source: "oauth",
          session: { usedPercent: 100, resetsAt: FUTURE },
          weekly: { usedPercent: 40, resetsAt: FUTURE },
          fableWeekly: null,
          error: null,
        },
      }),
      now: NOW_MS,
    });
    expect(block?.windowLabel).toBe("Session");
    expect(block?.message).toContain("Claude");
    expect(block?.message).toContain("100%");
  });

  test("blocks Codex, Cursor, and Kiro on their tightest exhausted window", () => {
    const limits = snapshot({
      codex: {
        source: "rpc",
        buckets: [
          {
            limitId: "plan",
            limitName: "Plan",
            planType: "pro",
            primary: { usedPercent: 80, windowDurationMins: 300, resetsAt: FUTURE },
            secondary: {
              usedPercent: 100,
              windowDurationMins: 10_080,
              resetsAt: FUTURE,
            },
            individualLimit: null,
            credits: null,
          },
        ],
        error: null,
      },
      cursor: {
        source: "dashboard",
        planType: "pro",
        monthly: { usedPercent: 100, resetsAt: FUTURE, used: 20, limit: 20 },
        buckets: [],
        error: null,
      },
      kiro: {
        source: "acp",
        planName: "Pro",
        monthly: { usedPercent: 100, resetsAt: FUTURE, used: 1000, limit: 1000 },
        buckets: [
          {
            id: "credits",
            label: "Credits",
            unit: null,
            usedPercent: 100,
            resetsAt: FUTURE,
            used: 1000,
            limit: 1000,
          },
        ],
        overagesEnabled: true,
        error: null,
      },
    });

    expect(
      resolveAccountUsageBlock({
        providerId: "codex",
        snapshot: limits,
        now: NOW_MS,
      })?.windowLabel,
    ).toBe("Plan secondary");
    expect(
      resolveAccountUsageBlock({
        providerId: "cursor",
        snapshot: limits,
        now: NOW_MS,
      })?.windowLabel,
    ).toBe("Monthly");
    expect(
      resolveAccountUsageBlock({
        providerId: "kiro",
        snapshot: limits,
        now: NOW_MS,
      })?.providerLabel,
    ).toBe("Kiro");
  });

  test("does not block leftover extra usage when included windows are open", () => {
    expect(
      resolveAccountUsageBlock({
        providerId: "claude-code",
        snapshot: snapshot({
          claude: {
            source: "oauth",
            session: { usedPercent: 12, resetsAt: FUTURE },
            weekly: { usedPercent: 40, resetsAt: FUTURE },
            fableWeekly: null,
            error: null,
          },
        }),
        now: NOW_MS,
      }),
    ).toBeNull();
  });
});

describe("mergeRateLimitsSnapshots", () => {
  test("replaces the whole snapshot when no provider filter is set", () => {
    const incoming = snapshot({
      claude: {
        source: "oauth",
        session: { usedPercent: 10, resetsAt: null },
        weekly: null,
        fableWeekly: null,
        error: null,
      },
    });
    expect(
      mergeRateLimitsSnapshots({
        current: emptyRateLimitsSnapshot(),
        incoming,
      }),
    ).toBe(incoming);
  });

  test("overlays only the requested provider", () => {
    const current = snapshot({
      claude: {
        source: "oauth",
        session: { usedPercent: 10, resetsAt: null },
        weekly: null,
        fableWeekly: null,
        error: null,
      },
    });
    const incoming = snapshot({
      cursor: {
        source: "dashboard",
        planType: "pro",
        monthly: { usedPercent: 88, resetsAt: null, used: 8, limit: 20 },
        buckets: [],
        error: null,
      },
    });
    const merged = mergeRateLimitsSnapshots({
      current,
      incoming,
      providers: ["cursor"],
    });
    expect(merged.claude.session?.usedPercent).toBe(10);
    expect(merged.cursor.monthly?.usedPercent).toBe(88);
  });
});
