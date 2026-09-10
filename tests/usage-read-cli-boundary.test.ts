import { beforeEach, describe, expect, test } from "bun:test";
import { getRateLimitsSnapshot } from "../electron/providers/rate-limits/rate-limits-snapshot";
import { clearUsageReadState } from "../electron/providers/rate-limits/usage-read-policy";

/**
 * The status bar's background timer must never launch a provider CLI to read
 * usage. Only `force` — a manual refresh, or the near-limit check a user's
 * dispatch is waiting on — may pay that cost. This is the boundary that keeps
 * an expired credential from turning a background poll into a process spawn on
 * every tick.
 */

const claudeCalls: (boolean | undefined)[] = [];
const codexCalls: (boolean | undefined)[] = [];

const fetchers = {
  claude: async (args?: { allowCliFallback?: boolean }) => {
    claudeCalls.push(args?.allowCliFallback);
    return {
      source: "oauth" as const,
      session: null,
      weekly: null,
      fableWeekly: null,
      error: null,
    };
  },
  codex: async (args: { force?: boolean }) => {
    codexCalls.push(args.force);
    return { source: "rpc" as const, buckets: [], error: null };
  },
};

describe("usage read CLI boundary", () => {
  beforeEach(() => {
    clearUsageReadState();
    claudeCalls.length = 0;
    codexCalls.length = 0;
  });

  test("a background read does not allow the Claude CLI fallback", async () => {
    await getRateLimitsSnapshot({ providers: ["claude-code"], fetchers });
    expect(claudeCalls).toEqual([false]);
  });

  test("a forced read allows the CLI fallback", async () => {
    await getRateLimitsSnapshot({
      providers: ["claude-code"],
      force: true,
      fetchers,
    });
    expect(claudeCalls).toEqual([true]);
  });

  test("force is passed through to the Codex push-cache bypass", async () => {
    await getRateLimitsSnapshot({ providers: ["codex"], fetchers });
    expect(codexCalls[0]).toBeFalsy();

    clearUsageReadState();
    await getRateLimitsSnapshot({
      providers: ["codex"],
      force: true,
      fetchers,
    });
    expect(codexCalls[1]).toBe(true);
  });

  test("the force floor suppresses a second immediate forced read", async () => {
    await getRateLimitsSnapshot({ providers: ["codex"], force: true, fetchers });
    await getRateLimitsSnapshot({ providers: ["codex"], force: true, fetchers });
    // Two dispatches in the same instant must not produce two account reads.
    expect(codexCalls).toEqual([true]);
  });

  test("a second background read inside the cache window reads nothing", async () => {
    await getRateLimitsSnapshot({ providers: ["claude-code"], fetchers });
    await getRateLimitsSnapshot({ providers: ["claude-code"], fetchers });
    expect(claudeCalls).toEqual([false]);
  });

  test("only the requested provider is read", async () => {
    await getRateLimitsSnapshot({ providers: ["claude-code"], fetchers });
    expect(codexCalls).toEqual([]);
  });

  test("the pre-send guard is not floored, so a second send re-checks", async () => {
    await getRateLimitsSnapshot({
      providers: ["codex"],
      force: true,
      reason: "dispatch-guard",
      fetchers,
    });
    await getRateLimitsSnapshot({
      providers: ["codex"],
      force: true,
      reason: "dispatch-guard",
      fetchers,
    });
    // At 97% a floored guard would wave the second send through on the same
    // reading it had already decided was too close to call.
    expect(codexCalls).toEqual([true, true]);
  });

  test("a manual refresh stays floored", async () => {
    await getRateLimitsSnapshot({
      providers: ["codex"],
      force: true,
      reason: "manual",
      fetchers,
    });
    await getRateLimitsSnapshot({
      providers: ["codex"],
      force: true,
      reason: "manual",
      fetchers,
    });
    expect(codexCalls).toEqual([true]);
  });

  test("one provider throwing does not blank the other three", async () => {
    const snapshot = await getRateLimitsSnapshot({
      fetchers: {
        ...fetchers,
        cursor: async () => {
          throw new Error("token database is locked");
        },
      },
    });
    expect(snapshot.cursor.source).toBe("unavailable");
    expect(snapshot.claude.source).toBe("oauth");
    expect(snapshot.codex.source).toBe("rpc");
  });
});
