import { beforeEach, describe, expect, test } from "bun:test";
import {
  CODEX_RATE_LIMITS_ACTIVE_REFRESH_MS,
  clearCodexRateLimitsCache,
  readCodexRateLimitsCache,
  recordCodexRateLimits,
  resolveCodexRateLimitBuckets,
} from "../electron/providers/codex-rate-limits-cache";
import { mapCodexRateLimitBuckets } from "../electron/providers/codex-snapshot-mappers";
import type { CodexRateLimitSnapshot } from "../src/lib/providers/provider.types";

function bucket(usedPercent: number): CodexRateLimitSnapshot {
  return {
    limitId: "codex",
    limitName: null,
    planType: "self_serve_business_prolite",
    primary: { usedPercent, windowDurationMins: 10_080, resetsAt: 1_789_436_002 },
    secondary: null,
    individualLimit: null,
    credits: null,
  };
}

/** Wire shape of the App Server `account/rateLimits/updated` notification. */
const notificationParams = {
  rateLimits: {
    limitId: "codex",
    planType: "self_serve_business_prolite",
    primary: { usedPercent: 27, windowDurationMins: 10_080, resetsAt: 1_789_436_002 },
    secondary: null,
    credits: { hasCredits: true, unlimited: false, balance: null },
  },
};

describe("Codex rate-limit cache", () => {
  beforeEach(() => {
    clearCodexRateLimitsCache();
  });

  test("a push notification is served instead of an active read", async () => {
    const now = 1_000_000;
    recordCodexRateLimits({
      buckets: mapCodexRateLimitBuckets(notificationParams),
      source: "notification",
      now,
    });
    let requests = 0;
    const buckets = await resolveCodexRateLimitBuckets({
      now: now + 60_000,
      request: async () => {
        requests += 1;
        return [bucket(99)];
      },
    });
    expect(requests).toBe(0);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.primary?.usedPercent).toBe(27);
    expect(buckets[0]?.planType).toBe("self_serve_business_prolite");
  });

  test("the active read runs once the cached reading ages out", async () => {
    const now = 1_000_000;
    recordCodexRateLimits({ buckets: [bucket(27)], source: "notification", now });
    let requests = 0;
    const buckets = await resolveCodexRateLimitBuckets({
      now: now + CODEX_RATE_LIMITS_ACTIVE_REFRESH_MS,
      request: async () => {
        requests += 1;
        return [bucket(31)];
      },
    });
    expect(requests).toBe(1);
    expect(buckets[0]?.primary?.usedPercent).toBe(31);
    expect(readCodexRateLimitsCache()).toMatchObject({
      source: "rpc",
      updatedAt: now + CODEX_RATE_LIMITS_ACTIVE_REFRESH_MS,
    });
  });

  test("force bypasses a fresh cache and records the new reading", async () => {
    const now = 1_000_000;
    recordCodexRateLimits({ buckets: [bucket(27)], source: "notification", now });
    let requests = 0;
    const buckets = await resolveCodexRateLimitBuckets({
      now: now + 1_000,
      force: true,
      request: async () => {
        requests += 1;
        return [bucket(28)];
      },
    });
    expect(requests).toBe(1);
    expect(buckets[0]?.primary?.usedPercent).toBe(28);
    expect(readCodexRateLimitsCache()?.source).toBe("rpc");
  });

  test("an empty cache and an empty cached bucket list both trigger a read", async () => {
    let requests = 0;
    const request = async () => {
      requests += 1;
      return [bucket(5)];
    };
    await resolveCodexRateLimitBuckets({ now: 10, request });
    expect(requests).toBe(1);
    recordCodexRateLimits({ buckets: [], source: "notification", now: 20 });
    await resolveCodexRateLimitBuckets({ now: 30, request });
    expect(requests).toBe(2);
  });

  test("a failed active read leaves the previous cache entry intact", async () => {
    recordCodexRateLimits({ buckets: [bucket(27)], source: "rpc", now: 0 });
    await expect(
      resolveCodexRateLimitBuckets({
        now: CODEX_RATE_LIMITS_ACTIVE_REFRESH_MS + 1,
        request: async () => {
          throw new Error("token_revoked");
        },
      }),
    ).rejects.toThrow("token_revoked");
    expect(readCodexRateLimitsCache()?.buckets[0]?.primary?.usedPercent).toBe(
      27,
    );
  });
});
