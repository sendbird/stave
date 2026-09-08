import { describe, expect, test } from "bun:test";
import {
  CodexThreadLifetime,
  CODEX_THREAD_IDLE_MS,
} from "../electron/providers/codex-thread-lifetime";

function harness(unload: (id: string) => Promise<void> = async () => {}) {
  const timers = new Set<() => void>();
  const unloaded: string[] = [];
  let errors = 0;
  const lifetime = new CodexThreadLifetime(
    async (id) => {
      unloaded.push(id);
      await unload(id);
    },
    () => {
      errors++;
    },
    (callback, ms) => {
      expect(ms).toBe(CODEX_THREAD_IDLE_MS);
      timers.add(callback);
      return () => {
        timers.delete(callback);
      };
    },
  );
  return {
    lifetime,
    unloaded,
    timers,
    errors: () => errors,
    expire: () => {
      const pending = [...timers];
      timers.clear();
      pending.forEach((cb) => cb());
    },
  };
}

describe("Codex idle thread ownership", () => {
  test("repeated completed tasks are released while an active approval remains pinned", async () => {
    const h = harness();
    const active = await h.lifetime.acquire("approval");
    for (let i = 0; i < 100; i++) (await h.lifetime.acquire(`task-${i}`))();
    h.expire();
    await Bun.sleep(0);
    expect(h.unloaded).toHaveLength(100);
    expect(h.unloaded).not.toContain("approval");
    expect(h.timers.size).toBe(0);
    active();
    h.lifetime.clear();
  });

  test("resuming cancels pending retirement and overlapping turns share a pin", async () => {
    const h = harness();
    const first = await h.lifetime.acquire("thread");
    first();
    first();
    const second = await h.lifetime.acquire("thread");
    const third = await h.lifetime.acquire("thread");
    h.expire();
    second();
    expect(h.timers.size).toBe(0);
    third();
    h.expire();
    await Bun.sleep(0);
    expect(h.unloaded).toEqual(["thread"]);
  });

  test("resume waits for an already dispatched unsubscribe", async () => {
    let finish!: () => void;
    const h = harness(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    (await h.lifetime.acquire("thread"))();
    h.expire();
    let acquired = false;
    const next = h.lifetime.acquire("thread").then((release) => {
      acquired = true;
      return release;
    });
    await Bun.sleep(0);
    expect(acquired).toBe(false);
    finish();
    const release = await next;
    expect(acquired).toBe(true);
    release();
    h.lifetime.clear();
  });

  test("unsupported cleanup reports failure but does not prevent resume", async () => {
    const h = harness(async () => {
      throw new Error("Method not found");
    });
    (await h.lifetime.acquire("thread"))();
    h.expire();
    const release = await h.lifetime.acquire("thread");
    expect(h.errors()).toBe(1);
    release();
    h.lifetime.clear();
    expect(h.timers.size).toBe(0);
  });

  test("process teardown cancels old timers and invalidates old releases", async () => {
    const h = harness();
    const old = await h.lifetime.acquire("thread");
    h.lifetime.clear();
    const next = await h.lifetime.acquire("thread");
    old();
    h.expire();
    expect(h.unloaded).toEqual([]);
    next();
    h.lifetime.clear();
    expect(h.timers.size).toBe(0);
  });
});
