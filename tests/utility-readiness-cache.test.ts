import { describe, expect, test } from "bun:test";
import { createUtilityReadinessCache } from "../electron/providers/utility-readiness-cache";

type Result = { ready: boolean; detail?: string };
function deferred() {
  let resolve!: (value: Result) => void;
  const promise = new Promise<Result>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("utility readiness cache", () => {
  test("successful checks expire, starting the TTL at completion", async () => {
    let now = 1000;
    let checks = 0;
    const pending = deferred();
    const cache = createUtilityReadinessCache({ now: () => now, ttlMs: 100 });
    const check = () => { checks++; return pending.promise; };
    const first = cache.get("codex", check);
    await Promise.resolve();
    now = 1500;
    pending.resolve({ ready: true });
    await first;
    now = 1599;
    await cache.get("codex", check);
    expect(checks).toBe(1);
    now = 1600;
    await cache.get("codex", check);
    expect(checks).toBe(2);
  });

  test("false and rejected checks are retried", async () => {
    const cache = createUtilityReadinessCache();
    let checks = 0;
    const check = async () => ({ ready: false, detail: String(++checks) });
    expect(await cache.get("false", check)).toEqual({ ready: false, detail: "1" });
    expect(await cache.get("false", check)).toEqual({ ready: false, detail: "2" });
    const error = new Error("readiness failed");
    await expect(cache.get("error", async () => { throw error; })).rejects.toBe(error);
    expect(await cache.get("error", async () => ({ ready: true }))).toEqual({ ready: true });
  });

  test("simultaneous checks share one promise", async () => {
    const pending = deferred();
    let checks = 0;
    const cache = createUtilityReadinessCache();
    const check = () => { checks++; return pending.promise; };
    const first = cache.get("codex", check);
    expect(cache.get("codex", check)).toBe(first);
    await Promise.resolve();
    expect(checks).toBe(1);
    pending.resolve({ ready: true });
    await expect(first).resolves.toEqual({ ready: true });
  });

  test("invalidated completion cannot replace or remove a newer pending check", async () => {
    const old = deferred();
    const next = deferred();
    const cache = createUtilityReadinessCache();
    const first = cache.get("codex", () => old.promise);
    cache.invalidate("codex");
    const second = cache.get("codex", () => next.promise);
    old.resolve({ ready: true, detail: "old" });
    await first;
    expect(cache.get("codex", async () => ({ ready: false }))).toBe(second);
    next.resolve({ ready: true, detail: "new" });
    await second;
    expect(await cache.get("codex", async () => ({ ready: false }))).toEqual({ ready: true, detail: "new" });
  });

  test("invalidated completion cannot overwrite a newer cached result", async () => {
    const old = deferred();
    const cache = createUtilityReadinessCache();
    const first = cache.get("codex", () => old.promise);
    cache.invalidate("codex");
    await cache.get("codex", async () => ({ ready: true, detail: "new" }));
    old.resolve({ ready: true, detail: "old" });
    await first;
    expect(await cache.get("codex", async () => ({ ready: false }))).toEqual({ ready: true, detail: "new" });
    cache.invalidate("codex");
    expect(await cache.get("codex", async () => ({ ready: false }))).toEqual({ ready: false });
  });

  test("separates keys and evicts the oldest successful entry", async () => {
    const cache = createUtilityReadinessCache({ maxEntries: 2 });
    const checks = new Map<string, number>();
    const get = (key: string) => cache.get(key, async () => {
      const count = (checks.get(key) ?? 0) + 1;
      checks.set(key, count);
      return { ready: true, detail: `${key}-${count}` };
    });
    await get("a"); await get("b"); await get("c");
    expect((await get("b")).detail).toBe("b-1");
    expect((await get("c")).detail).toBe("c-1");
    expect((await get("a")).detail).toBe("a-2");
    expect(Object.fromEntries(checks)).toEqual({ a: 2, b: 1, c: 1 });
  });
});
