import { describe, expect, test } from "bun:test";
import { readTeamProviderUsage, summarizeProviderUsage } from "../electron/host-service/supervision/provider-usage-context";
import { PROVIDER_USAGE_CRITICAL_PERCENT, PROVIDER_USAGE_LOW_PERCENT } from "../src/lib/agent-runs/provider-usage";
import { teamLimitsContextPart } from "../electron/host-service/supervision/team-limits-context";
import { mapCodexRateLimitBuckets } from "../electron/providers/codex-snapshot-mappers";
import { AdaptiveRunPolicySchema } from "../src/lib/agent-runs/resources";
import { emptyRateLimitsSnapshot } from "../src/lib/providers/account-usage-block";
import type { RateLimitsSnapshotResponse } from "../src/lib/providers/provider.types";

const NOW = Date.parse("2026-11-01T00:00:00.000Z");
const IN_AN_HOUR = NOW / 1000 + 3600;
const AN_HOUR_AGO = NOW / 1000 - 3600;
const OBSERVED_AT = "2026-10-31T23:58:00.000Z";

function claude(session: number, weekly: number, extra: Partial<RateLimitsSnapshotResponse["claude"]> = {}): RateLimitsSnapshotResponse {
  const snapshot = emptyRateLimitsSnapshot();
  snapshot.claude = {
    source: "oauth",
    session: { usedPercent: session, resetsAt: IN_AN_HOUR },
    weekly: { usedPercent: weekly, resetsAt: IN_AN_HOUR + 86_400 },
    fableWeekly: null,
    error: null,
    ...extra,
  };
  return snapshot;
}

const observed = (snapshot: RateLimitsSnapshotResponse, observedWindowIds?: string[]) =>
  ({ snapshot, metadata: { observedAt: OBSERVED_AT, ...(observedWindowIds ? { observedWindowIds } : {}) } });

const summarize = (snapshot: RateLimitsSnapshotResponse | null, providerId: "claude-code" | "codex" = "claude-code") =>
  summarizeProviderUsage({ providerId, observation: snapshot ? observed(snapshot) : null, now: NOW });

describe("provider usage summary", () => {
  test("no reading is unknown, never headroom", () => {
    expect(summarize(null)).toEqual({ status: "unknown" });
    expect(summarize(emptyRateLimitsSnapshot())).toEqual({ status: "unknown", observedAt: OBSERVED_AT });
  });

  test("the tightest live window decides headroom, low and critical", () => {
    expect(summarize(claude(10, 40))).toMatchObject({ status: "headroom", usedPercent: 40 });
    expect(summarize(claude(PROVIDER_USAGE_LOW_PERCENT, 40))).toMatchObject({ status: "low", usedPercent: PROVIDER_USAGE_LOW_PERCENT });
    expect(summarize(claude(20, PROVIDER_USAGE_CRITICAL_PERCENT))).toEqual({
      status: "critical",
      usedPercent: PROVIDER_USAGE_CRITICAL_PERCENT,
      resetsAt: new Date((IN_AN_HOUR + 86_400) * 1000).toISOString(),
      observedAt: OBSERVED_AT,
    });
  });

  test("an exhausted account window is exhausted until it resets", () => {
    expect(summarize(claude(100, 30))).toEqual({
      status: "exhausted",
      usedPercent: 100,
      resetsAt: new Date(IN_AN_HOUR * 1000).toISOString(),
      observedAt: OBSERVED_AT,
    });
    // The session window already reset: its old percentage no longer counts.
    expect(summarize(claude(100, 30, { session: { usedPercent: 100, resetsAt: AN_HOUR_AGO } }))).toMatchObject({ status: "headroom", usedPercent: 30 });
  });

  test("a model's own window marks that model, not the whole provider", () => {
    const summary = summarize(claude(20, 30, { fableWeekly: { usedPercent: 100, resetsAt: IN_AN_HOUR } }));
    expect(summary).toMatchObject({ status: "headroom", usedPercent: 30, exhaustedModels: ["claude-fable-5-1"] });
  });

  test("Codex buckets read the same way, and a partial reading says so", () => {
    const snapshot = emptyRateLimitsSnapshot();
    snapshot.codex = {
      source: "rpc",
      error: null,
      buckets: mapCodexRateLimitBuckets({
        rateLimitsByLimitId: { codex: { limitId: "codex", limitName: "Codex", primary: { usedPercent: 75, resetsAt: IN_AN_HOUR } } },
      }),
    };
    expect(summarizeProviderUsage({ providerId: "codex", observation: observed(snapshot, ["codex:primary"]), now: NOW }))
      .toMatchObject({ status: "low", usedPercent: 75, partial: true });
  });

  test("each provider is read for the account the run and its helpers use", () => {
    const reads: string[] = [];
    const usage = readTeamProviderUsage({
      accounts: { claudeAccountProfileId: "claude-frozen", codexAccountProfileId: "codex-work" },
      runAccount: { providerId: "claude-code", accountProfileId: "claude-pool-2" },
      now: NOW,
      read: (providerId, accountId) => {
        reads.push(`${providerId}:${accountId}`);
        return { quota: providerId === "claude-code" ? observed(claude(10, 20)) as never : null, catalog: null };
      },
    });
    expect(reads).toEqual(["claude-code:claude-pool-2", "codex:codex-work"]);
    expect(usage["claude-code"].status).toBe("headroom");
    expect(usage.codex).toEqual({ status: "unknown" });
  });
});

describe("Run team limits context", () => {
  const policy = (modelLocked: boolean) => AdaptiveRunPolicySchema.parse({
    version: 2, profile: "balanced", providerId: "claude-code", allowedModels: ["claude-opus-5-5"],
    modelLocked, effortLocked: false, initialEffort: "medium", teamTurns: 60, concurrentHelpers: 3, totalHelpers: 8,
    parentReserve: 1, maxChanges: 2, cooldownTurns: 2,
  });
  const usage = { "claude-code": { status: "low", usedPercent: 72 }, codex: { status: "unknown" } } as const;
  const read = (part: ReturnType<typeof teamLimitsContextPart>) => JSON.parse(part.content) as { providerUsage?: unknown; instruction: string };

  test("carries provider usage and how to route around a scarce provider", () => {
    const context = read(teamLimitsContextPart(policy(false), null, "turn-1", usage));
    expect(context.providerUsage).toEqual(usage);
    expect(context.instruction).toContain("Unknown means no recent reading, not headroom.");
    expect(context.instruction).toContain("send new parallel work to the other one");
  });

  test("a run whose helpers must stay on its provider gets the usage but no advice to switch", () => {
    const context = read(teamLimitsContextPart(policy(true), null, "turn-1", usage));
    expect(context.providerUsage).toEqual(usage);
    expect(context.instruction).toContain("Helpers stay on this run's provider.");
    expect(context.instruction).not.toContain("send new parallel work to the other one");
  });

  test("without usage the context is unchanged", () => {
    const context = read(teamLimitsContextPart(policy(false), null, "turn-1"));
    expect(context.providerUsage).toBeUndefined();
    expect(context.instruction).not.toContain("providerUsage");
  });
});
