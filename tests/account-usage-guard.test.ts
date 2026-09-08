import { describe, expect, test } from "bun:test";
import { guardSendAgainstAccountUsage } from "@/store/account-usage-guard";
import { emptyRateLimitsSnapshot } from "@/lib/providers/account-usage-block";
import type { AppState } from "@/store/app-store.types";

function harness(usedPercent = 20) {
  let refreshes = 0;
  let finishRefresh!: () => void;
  const pending = new Promise<void>((resolve) => {
    finishRefresh = resolve;
  });
  const state = {
    settings: { blockTurnsWhenAccountLimitReached: true },
    rateLimitsUpdatedAtByProvider: { codex: Date.now() },
    rateLimitsSnapshot: {
      ...emptyRateLimitsSnapshot(),
      codex: {
        source: "rpc",
        error: null,
        buckets: [
          {
            limitId: "codex",
            limitName: null,
            planType: null,
            primary: {
              usedPercent,
              windowDurationMins: 300,
              resetsAt: Math.floor(Date.now() / 1000) + 3600,
            },
            secondary: null,
            individualLimit: null,
            credits: null,
          },
        ],
      },
    },
    refreshRateLimits: async () => {
      refreshes += 1;
      await pending;
    },
  } as unknown as AppState;
  return { state, get: () => state, finishRefresh, refreshes: () => refreshes };
}

describe("submit usage-check latency", () => {
  test("a recent snapshot with headroom does not wait for another network request", async () => {
    const h = harness();
    expect(await guardSendAgainstAccountUsage(h.get, "codex")).toBeNull();
    expect(h.refreshes()).toBe(0);
  });

  test("queue admission is immediate even when the snapshot is stale", async () => {
    const h = harness();
    h.state.rateLimitsUpdatedAtByProvider = {};
    expect(
      await guardSendAgainstAccountUsage(h.get, "codex", { cachedOnly: true }),
    ).toBeNull();
    expect(h.refreshes()).toBe(0);
  });

  test("an old cache below 97 percent is used without a refresh", async () => {
    const h = harness(96.9);
    h.state.rateLimitsUpdatedAtByProvider.codex = Date.now() - 600_000;
    expect(await guardSendAgainstAccountUsage(h.get, "codex")).toBeNull();
    expect(h.refreshes()).toBe(0);
  });

  test("unavailable usage refreshes in the background without delaying submission", async () => {
    const h = harness();
    h.state.rateLimitsSnapshot = emptyRateLimitsSnapshot();
    expect(await guardSendAgainstAccountUsage(h.get, "codex")).toBeNull();
    expect(h.refreshes()).toBe(1);
    h.finishRefresh();
  });

  test("97 percent waits for a fresh dispatch check", async () => {
    const h = harness(97);
    let settled = false;
    const result = guardSendAgainstAccountUsage(h.get, "codex").then(
      (value) => {
        settled = true;
        return value;
      },
    );
    await Promise.resolve();
    expect(h.refreshes()).toBe(1);
    expect(settled).toBe(false);
    h.finishRefresh();
    expect(await result).toBeNull();
  });

  test("an exhausted cached account is blocked immediately", async () => {
    const h = harness(100);
    expect(await guardSendAgainstAccountUsage(h.get, "codex")).toMatchObject({
      status: "blocked",
      reason: "account-limit",
    });
    expect(h.refreshes()).toBe(0);
  });

  test("a limit discovered during refresh still blocks dispatch", async () => {
    const h = harness(97);
    const result = guardSendAgainstAccountUsage(h.get, "codex");
    h.state.rateLimitsSnapshot!.codex.buckets[0]!.primary!.usedPercent = 100;
    h.finishRefresh();
    expect(await result).toMatchObject({
      status: "blocked",
      reason: "account-limit",
    });
  });
});
