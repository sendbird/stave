import { describe, expect, test } from "bun:test";
import {
  emptyRateLimitsSnapshot,
  resolveAccountUsageBlock,
} from "../src/lib/providers/account-usage-block";
import { mapKiroUsageResponse } from "../electron/providers/rate-limits/kiro-usage-fetcher";
import { mapCodexRateLimitBuckets } from "../electron/providers/codex-snapshot-mappers";
import { isAccountUsageBlockingFromState } from "../src/store/account-usage-guard";
import type { AppState } from "../src/store/app-store.types";

describe("model-scoped account limits", () => {
  test("Fable exhaustion leaves other Claude models and background work available", () => {
    const snapshot = emptyRateLimitsSnapshot();
    snapshot.claude = {
      source: "oauth",
      session: { usedPercent: 20, resetsAt: null },
      weekly: { usedPercent: 30, resetsAt: null },
      fableWeekly: { usedPercent: 100, resetsAt: null },
      error: null,
    };
    const check = (model?: string) => resolveAccountUsageBlock({
      providerId: "claude-code", model, snapshot,
    });
    expect(check("claude-sonnet-4-6")).toBeNull();
    expect(check("claude-opus-5")).toBeNull();
    expect(check("claude-fable-5-1")?.windowLabel).toBe("Model weekly");
    expect(check()?.windowLabel).toBe("Model weekly");
    expect(check("default")?.windowLabel).toBe("Model weekly");
    const state = {
      settings: { blockTurnsWhenAccountLimitReached: true },
      rateLimitsSnapshot: snapshot,
    } as Pick<AppState, "settings" | "rateLimitsSnapshot">;
    expect(isAccountUsageBlockingFromState({
      providerId: "claude-code", model: "claude-haiku-4-5", state,
    })).toBe(false);
    snapshot.claude.weekly!.usedPercent = 100;
    expect(check("claude-sonnet-4-6")?.windowLabel).toBe("Weekly");
    snapshot.claude.weekly!.usedPercent = 30;
    snapshot.claude.session!.usedPercent = 100;
    expect(check("claude-sonnet-4-6")?.windowLabel).toBe("Session");
  });

  test("Codex excludes another named model but retains shared and opaque limits", () => {
    const snapshot = emptyRateLimitsSnapshot();
    snapshot.codex = {
      source: "rpc",
      error: null,
      buckets: mapCodexRateLimitBuckets({
        rateLimitsByLimitId: {
          codex: {
            limitId: "codex",
            limitName: "Codex",
            primary: { usedPercent: 20, resetsAt: null },
          },
          codex_bengalfox: {
            limitId: "codex_bengalfox",
            limitName: "GPT-5.3-Codex-Spark",
            primary: { usedPercent: 100, resetsAt: null },
          },
        },
      }),
    };
    const check = (model?: string) => resolveAccountUsageBlock({
      providerId: "codex", model, snapshot,
    });
    expect(check("gpt-5.4")).toBeNull();
    expect(check("gpt-5.3-codex-spark")?.usedPercent).toBe(100);
    expect(check()?.usedPercent).toBe(100);
    snapshot.codex.buckets[0]!.primary!.usedPercent = 100;
    expect(check("gpt-5.4")?.windowLabel).toBe("Codex primary");
    snapshot.codex.buckets[1]!.primary!.usedPercent = 20;
    expect(check("gpt-5.3-codex-spark")?.windowLabel).toBe("Codex primary");
    snapshot.codex.buckets[0]!.primary!.usedPercent = 20;
    snapshot.codex.buckets[1]!.primary!.usedPercent = 100;
    snapshot.codex.buckets[1]!.limitName = null;
    expect(check("gpt-5.4")?.usedPercent).toBe(100);
    snapshot.codex.buckets[1]!.limitName = "GPT-5";
    expect(check("gpt-5.4")?.usedPercent).toBe(100);
  });

  test("Kiro uses included CREDIT rather than exhausted supplemental resources", () => {
    const snapshot = emptyRateLimitsSnapshot();
    snapshot.kiro = mapKiroUsageResponse({
      success: true,
      data: {
        overagesEnabled: true,
        usageBreakdowns: [
          { resourceType: "CREDIT", displayName: "Credits", used: 20, limit: 100 },
          { resourceType: "bonus", displayName: "Bonus", used: 100, limit: 100 },
        ],
      },
    })!;
    const check = () => resolveAccountUsageBlock({ providerId: "kiro", snapshot });
    expect(snapshot.kiro.monthly?.usedPercent).toBe(20);
    expect(snapshot.kiro.buckets).toHaveLength(2);
    expect(check()).toBeNull();
    // Snapshots cached by older builds have a maximum-derived monthly value.
    snapshot.kiro.monthly!.usedPercent = 100;
    expect(check()).toBeNull();
    snapshot.kiro.buckets[0]!.usedPercent = 100;
    expect(check()?.windowLabel).toBe("Credits");
    // Supplemental balances and overage permission do not waive the stop setting.
    snapshot.kiro.buckets[1]!.usedPercent = 0;
    expect(check()?.usedPercent).toBe(100);
    snapshot.kiro.buckets = [];
    expect(check()?.windowLabel).toBe("Monthly");
  });

  test("Kiro does not infer an included plan limit from an unknown resource", () => {
    const snapshot = emptyRateLimitsSnapshot();
    snapshot.kiro = mapKiroUsageResponse({
      success: true,
      data: {
        usageBreakdowns: [
          { resourceType: "new-resource", displayName: "Resource", used: 100, limit: 100 },
        ],
      },
    })!;
    expect(snapshot.kiro.monthly).toBeNull();
    expect(resolveAccountUsageBlock({ providerId: "kiro", snapshot })).toBeNull();
  });
});
