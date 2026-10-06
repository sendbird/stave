import { beforeEach, describe, expect, test } from "bun:test";
import {
  ACCOUNT_USAGE_READS_DISABLED_ENV,
  getRateLimitsSnapshot,
} from "../electron/providers/rate-limits/rate-limits-snapshot";
import { clearUsageReadState } from "../electron/providers/rate-limits/usage-read-policy";

const calls: string[] = [];

const fetchers = {
  claude: async () => {
    calls.push("claude");
    return { source: "oauth" as const, session: null, weekly: null, fableWeekly: null, error: null };
  },
  codex: async () => {
    calls.push("codex");
    return { source: "rpc" as const, buckets: [], error: null };
  },
  cursor: async () => {
    calls.push("cursor");
    return { source: "unavailable" as const, error: null } as never;
  },
  kiro: async () => {
    calls.push("kiro");
    return { source: "unavailable" as const, error: null } as never;
  },
};

describe("automated launches do not read account usage", () => {
  beforeEach(() => {
    clearUsageReadState();
    calls.length = 0;
  });

  test("the e2e switch answers every provider as unavailable without a request", async () => {
    const env = { [ACCOUNT_USAGE_READS_DISABLED_ENV]: "1" };

    for (const force of [false, true]) {
      const snapshot = await getRateLimitsSnapshot({
        force,
        reason: force ? "dispatch-guard" : undefined,
        fetchers,
        env,
      });
      expect(snapshot.claude.source).toBe("unavailable");
      expect(Object.keys(snapshot.reads ?? {}).sort()).toEqual([
        "claude-code",
        "codex",
        "cursor",
        "kiro",
      ]);
      expect(snapshot.reads?.["claude-code"]?.status).toBe("unavailable");
    }
    const narrowed = await getRateLimitsSnapshot({
      providers: ["claude-code"],
      fetchers,
      env,
    });
    expect(Object.keys(narrowed.reads ?? {})).toEqual(["claude-code"]);
    expect(calls).toEqual([]);
  });

  test("an interactive launch still reads usage", async () => {
    await getRateLimitsSnapshot({ providers: ["claude-code"], fetchers, env: {} });

    expect(calls).toEqual(["claude"]);
  });
});
