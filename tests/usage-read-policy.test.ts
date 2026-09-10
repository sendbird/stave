import { beforeEach, describe, expect, test } from "bun:test";
import {
  USAGE_READ_BACKOFF_MAX_MS,
  USAGE_READ_FORCE_FLOOR_MS,
  USAGE_READ_TTL_MS,
  clearUsageReadState,
  readProviderUsage,
  readUsageReadState,
  usageReadBackoffMs,
} from "../electron/providers/rate-limits/usage-read-policy";

type Snapshot = { source: string; tag: string };

const ok = (tag: string): Snapshot => ({ source: "oauth", tag });
const failed = (tag: string): Snapshot => ({ source: "unavailable", tag });
const classify = (value: Snapshot) =>
  value.source === "unavailable" ? ("failed" as const) : ("ok" as const);

const NOW = 5_000_000;

describe("provider usage read policy", () => {
  beforeEach(() => {
    clearUsageReadState();
  });

  test("a second read inside the TTL is served from cache", async () => {
    let calls = 0;
    const request = async () => {
      calls += 1;
      return ok(`call-${calls}`);
    };

    expect(
      await readProviderUsage({ key: "p", request, classify, now: NOW }),
    ).toEqual(ok("call-1"));
    expect(
      await readProviderUsage({
        key: "p",
        request,
        classify,
        now: NOW + USAGE_READ_TTL_MS - 1,
      }),
    ).toEqual(ok("call-1"));
    expect(calls).toBe(1);

    expect(
      await readProviderUsage({
        key: "p",
        request,
        classify,
        now: NOW + USAGE_READ_TTL_MS,
      }),
    ).toEqual(ok("call-2"));
    expect(calls).toBe(2);
  });

  test("force bypasses the TTL but not the force floor", async () => {
    let calls = 0;
    const request = async () => {
      calls += 1;
      return ok(`call-${calls}`);
    };

    await readProviderUsage({ key: "p", request, classify, now: NOW });
    // Inside the floor: still the cached reading, even though force was asked.
    await readProviderUsage({
      key: "p",
      request,
      classify,
      now: NOW + USAGE_READ_FORCE_FLOOR_MS - 1,
      force: true,
    });
    expect(calls).toBe(1);

    await readProviderUsage({
      key: "p",
      request,
      classify,
      now: NOW + USAGE_READ_FORCE_FLOOR_MS,
      force: true,
    });
    expect(calls).toBe(2);
  });

  test("consecutive failures back off geometrically and cap", () => {
    expect(usageReadBackoffMs(0)).toBe(0);
    expect(usageReadBackoffMs(1)).toBe(5 * 60_000);
    expect(usageReadBackoffMs(2)).toBe(10 * 60_000);
    expect(usageReadBackoffMs(3)).toBe(20 * 60_000);
    expect(usageReadBackoffMs(50)).toBe(USAGE_READ_BACKOFF_MAX_MS);
  });

  test("a failing provider is not re-read on every background tick", async () => {
    let calls = 0;
    const request = async () => {
      calls += 1;
      return failed(`call-${calls}`);
    };

    await readProviderUsage({ key: "p", request, classify, now: NOW });
    expect(calls).toBe(1);
    expect(readUsageReadState("p")?.consecutiveFailures).toBe(1);

    // TTL has expired but the backoff has not: no second request.
    await readProviderUsage({
      key: "p",
      request,
      classify,
      now: NOW + USAGE_READ_TTL_MS + 1,
    });
    expect(calls).toBe(1);

    await readProviderUsage({
      key: "p",
      request,
      classify,
      now: NOW + usageReadBackoffMs(1),
    });
    expect(calls).toBe(2);
    expect(readUsageReadState("p")?.consecutiveFailures).toBe(2);
  });

  test("the last successful reading is served while a provider is backing off", async () => {
    let result = ok("good");
    const request = async () => result;

    await readProviderUsage({ key: "p", request, classify, now: NOW });
    result = failed("bad");
    const afterFailure = await readProviderUsage({
      key: "p",
      request,
      classify,
      now: NOW + USAGE_READ_TTL_MS,
    });
    expect(afterFailure).toEqual(failed("bad"));

    // Inside the backoff window the meter keeps the last real numbers rather
    // than issuing another request that is expected to fail.
    expect(
      await readProviderUsage({
        key: "p",
        request,
        classify,
        now: NOW + USAGE_READ_TTL_MS + usageReadBackoffMs(1) - 1,
      }),
    ).toEqual(ok("good"));
  });

  test("force retries a backing-off provider once the floor has passed", async () => {
    const request = async () => failed("bad");
    await readProviderUsage({ key: "p", request, classify, now: NOW });

    let calls = 0;
    const retry = async () => {
      calls += 1;
      return ok("recovered");
    };
    expect(
      await readProviderUsage({
        key: "p",
        request: retry,
        classify,
        now: NOW + USAGE_READ_FORCE_FLOOR_MS,
        force: true,
      }),
    ).toEqual(ok("recovered"));
    expect(calls).toBe(1);
    expect(readUsageReadState("p")?.consecutiveFailures).toBe(0);
  });

  test("a success resets the backoff", async () => {
    let result: Snapshot = failed("bad");
    const request = async () => result;
    await readProviderUsage({ key: "p", request, classify, now: NOW });
    expect(readUsageReadState("p")?.consecutiveFailures).toBe(1);

    result = ok("good");
    await readProviderUsage({
      key: "p",
      request,
      classify,
      now: NOW + usageReadBackoffMs(1),
    });
    expect(readUsageReadState("p")?.consecutiveFailures).toBe(0);
    expect(readUsageReadState("p")?.nextAttemptAt).toBe(
      NOW + usageReadBackoffMs(1),
    );
  });

  test("concurrent reads of one provider issue a single request", async () => {
    let calls = 0;
    const request = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return ok(`call-${calls}`);
    };

    const [first, second] = await Promise.all([
      readProviderUsage({ key: "p", request, classify, now: NOW }),
      readProviderUsage({ key: "p", request, classify, now: NOW }),
    ]);
    expect(calls).toBe(1);
    expect(first).toEqual(second);
  });

  test("providers are cached independently", async () => {
    let calls = 0;
    const request = async () => {
      calls += 1;
      return ok(`call-${calls}`);
    };
    await readProviderUsage({ key: "a", request, classify, now: NOW });
    await readProviderUsage({ key: "b", request, classify, now: NOW });
    expect(calls).toBe(2);
  });

  test("a thrown request counts as a failure instead of retrying every tick", async () => {
    await readProviderUsage({
      key: "p",
      request: async () => failed("bad"),
      classify,
      now: NOW,
    });

    let calls = 0;
    await expect(
      readProviderUsage({
        key: "p",
        request: async () => {
          calls += 1;
          throw new Error("boom");
        },
        classify,
        now: NOW + usageReadBackoffMs(1),
      }),
    ).rejects.toThrow("boom");
    expect(calls).toBe(1);
    expect(readUsageReadState("p")?.consecutiveFailures).toBe(2);
  });
  test("a first-ever read that throws still starts the backoff", async () => {
    let calls = 0;
    const request = async () => {
      calls += 1;
      throw new Error("boom");
    };

    await expect(
      readProviderUsage({ key: "p", request, classify, now: NOW }),
    ).rejects.toThrow("boom");
    expect(readUsageReadState("p")?.consecutiveFailures).toBe(1);

    // Without an entry there was nothing to back off from, so a provider that
    // threw on every call was retried on every single tick forever.
    await expect(
      readProviderUsage({ key: "p", request, classify, now: NOW + 1_000 }),
    ).rejects.toThrow("boom");
    expect(calls).toBe(1);
  });

  test("a backed-off provider with no snapshot yet reports the failure", async () => {
    await expect(
      readProviderUsage({
        key: "p",
        request: async () => {
          throw new Error("no credential");
        },
        classify,
        now: NOW,
      }),
    ).rejects.toThrow("no credential");

    // There is no cached snapshot to serve, so returning `undefined` as if it
    // were one would hand the caller a hole. Replay the real failure instead.
    await expect(
      readProviderUsage({
        key: "p",
        request: async () => ok("never-called"),
        classify,
        now: NOW + 1_000,
      }),
    ).rejects.toThrow("no credential");
  });

  test("a forced read can be unfloored for the pre-send check", async () => {
    let calls = 0;
    const request = async () => {
      calls += 1;
      return ok(`call-${calls}`);
    };
    await readProviderUsage({ key: "p", request, classify, now: NOW, force: true });
    // A manual refresh is floored; the dispatch guard passes 0 because its
    // whole job is to be right at the instant a turn is sent.
    await readProviderUsage({ key: "p", request, classify, now: NOW, force: true });
    expect(calls).toBe(1);
    await readProviderUsage({
      key: "p",
      request,
      classify,
      now: NOW,
      force: true,
      forceFloorMs: 0,
    });
    expect(calls).toBe(2);
  });
});
