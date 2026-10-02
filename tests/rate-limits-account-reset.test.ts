import { afterEach, describe, expect, test } from "bun:test";

import { emptyRateLimitsSnapshot } from "../src/lib/providers/account-usage-block";
import { SYSTEM_ACCOUNT_PROFILE_ID } from "../src/lib/providers/provider-accounts";
import type { RateLimitsSnapshotResponse } from "../src/lib/providers/provider.types";
import {
  adjustRateLimitsInFlight,
  isRateLimitsReadPending,
  providersWithChangedAccount,
  resetRateLimitsForProviders,
} from "../src/store/rate-limits-account-reset";

const WORK = "11111111-1111-4111-8111-111111111111";

function readings(): RateLimitsSnapshotResponse {
  return {
    claude: { source: "oauth", session: { usedPercent: 14, resetsAt: null }, weekly: { usedPercent: 83, resetsAt: null }, fableWeekly: null, error: null },
    codex: { source: "rpc", buckets: [{ limitId: "codex", limitName: null, planType: "plus", primary: { usedPercent: 31, resetsAt: null, windowDurationMins: 300 }, secondary: null, individualLimit: null, credits: null }], error: null },
    cursor: { source: "dashboard", planType: "pro", monthly: { usedPercent: 38, resetsAt: null, used: 7.6, limit: 20 }, buckets: [], error: null },
    kiro: { source: "acp", planName: "Pro", monthly: { usedPercent: 64, resetsAt: null, used: 640, limit: 1000 }, buckets: [], overagesEnabled: false, error: null },
  };
}

describe("per-provider usage reset", () => {
  test("only a provider whose account actually changed is reset", () => {
    expect(providersWithChangedAccount({}, { claudeAccountProfileId: WORK })).toEqual(["claude-code"]);
    expect(providersWithChangedAccount({ codexAccountProfileId: WORK }, {})).toEqual(["codex"]);
    // An unset id and System default are the same account.
    expect(providersWithChangedAccount({}, { claudeAccountProfileId: SYSTEM_ACCOUNT_PROFILE_ID })).toEqual([]);
  });

  test("keeps the other providers' readings and freshness", () => {
    const snapshot = readings();
    const reset = resetRateLimitsForProviders(
      { rateLimitsSnapshot: snapshot, rateLimitsUpdatedAtByProvider: { "claude-code": 10, codex: 20, cursor: 30, kiro: 40 } },
      ["claude-code"],
    );
    expect(reset.rateLimitsSnapshot?.claude).toEqual(emptyRateLimitsSnapshot().claude);
    expect(reset.rateLimitsSnapshot?.codex).toBe(snapshot.codex);
    expect(reset.rateLimitsSnapshot?.cursor).toBe(snapshot.cursor);
    expect(reset.rateLimitsSnapshot?.kiro).toBe(snapshot.kiro);
    expect(reset.rateLimitsUpdatedAtByProvider).toEqual({ codex: 20, cursor: 30, kiro: 40 });
  });

  test("counts reads in flight and calls a provider pending only before its first reading", () => {
    let inFlight = adjustRateLimitsInFlight({}, ["claude-code", "codex"], 1);
    inFlight = adjustRateLimitsInFlight(inFlight, ["claude-code"], 1);
    inFlight = adjustRateLimitsInFlight(inFlight, ["claude-code", "codex"], -1);
    expect(inFlight).toEqual({ "claude-code": 1 });
    expect(isRateLimitsReadPending({ rateLimitsUpdatedAtByProvider: {}, rateLimitsInFlightByProvider: inFlight }, "claude-code")).toBe(true);
    expect(isRateLimitsReadPending({ rateLimitsUpdatedAtByProvider: { "claude-code": 5 }, rateLimitsInFlightByProvider: inFlight }, "claude-code")).toBe(false);
    expect(isRateLimitsReadPending({ rateLimitsUpdatedAtByProvider: {}, rateLimitsInFlightByProvider: inFlight }, "codex")).toBe(false);
  });
});

describe("switching an account in the store", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  test("resets and re-reads only that provider, and reports it as reading meanwhile", async () => {
    const values = new Map<string, string>();
    const requests: Array<{ providers?: string[] }> = [];
    let finish!: (snapshot: RateLimitsSnapshotResponse) => void;
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => void values.set(key, value),
        removeItem: (key: string) => void values.delete(key),
        clear: () => values.clear(),
      },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          getRateLimitsSnapshot: (args: { providers?: string[] }) => {
            requests.push(args);
            return new Promise<RateLimitsSnapshotResponse>((resolve) => {
              finish = resolve;
            });
          },
        },
      },
    };
    const { useAppStore } = await import("../src/store/app.store");
    const before = readings();
    useAppStore.setState({
      rateLimitsSnapshot: before,
      rateLimitsUpdatedAtByProvider: { "claude-code": 1, codex: 2, cursor: 3, kiro: 4 },
      rateLimitsInFlightByProvider: {},
    });

    useAppStore.getState().updateSettings({ patch: { claudeAccountProfileId: WORK } });

    const during = useAppStore.getState();
    expect(during.rateLimitsSnapshot?.claude.source).toBe("unavailable");
    expect(during.rateLimitsSnapshot?.codex).toBe(before.codex);
    expect(during.rateLimitsSnapshot?.cursor).toBe(before.cursor);
    expect(during.rateLimitsSnapshot?.kiro).toBe(before.kiro);
    expect(during.rateLimitsUpdatedAtByProvider).toEqual({ codex: 2, cursor: 3, kiro: 4 });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.providers).toEqual(["claude-code"]);
    expect(isRateLimitsReadPending(during, "claude-code")).toBe(true);
    expect(isRateLimitsReadPending(during, "codex")).toBe(false);

    const fresh = readings();
    finish({ ...emptyRateLimitsSnapshot(), claude: { ...fresh.claude, session: { usedPercent: 2, resetsAt: null } } });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const after = useAppStore.getState();
    expect(after.rateLimitsSnapshot?.claude.session?.usedPercent).toBe(2);
    expect(after.rateLimitsSnapshot?.codex).toBe(before.codex);
    expect(after.rateLimitsInFlightByProvider).toEqual({});
    expect(isRateLimitsReadPending(after, "claude-code")).toBe(false);
  });
});
