import { describe, expect, test } from "bun:test";
import {
  createInlineRenderPreviewSlots,
  InlineRenderPreviewBusyError,
  InlineRenderPreviewTimeoutError,
  runWithInlineRenderPreviewDeadline,
} from "../electron/main/inline-render/inline-render-preview-queue";

/** Timers the test fires by hand. */
function manualTimers() {
  const pending = new Map<number, { callback: () => void; ms: number }>();
  let next = 1;
  return {
    timers: {
      setTimeout(callback: () => void, ms: number) {
        const handle = next++;
        pending.set(handle, { callback, ms });
        return handle;
      },
      clearTimeout(handle: unknown) {
        pending.delete(handle as number);
      },
    },
    pendingDelays: () => [...pending.values()].map((entry) => entry.ms),
    fireAll() {
      const due = [...pending.values()];
      pending.clear();
      for (const entry of due) entry.callback();
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("preview slots", () => {
  test("hands out at most `size` slots, then queues callers in order", async () => {
    const clock = manualTimers();
    const slots = createInlineRenderPreviewSlots({ size: 2, maxWaiting: 4, waitTimeoutMs: 1_000, timers: clock.timers });
    const first = await slots.acquire();
    const second = await slots.acquire();
    expect([first.index, second.index]).toEqual([0, 1]);

    const order: number[] = [];
    const third = slots.acquire().then((slot) => {
      order.push(3);
      return slot;
    });
    const fourth = slots.acquire().then((slot) => {
      order.push(4);
      return slot;
    });
    await flush();
    expect(order).toEqual([]);
    expect(slots.stats()).toEqual({ free: 0, waiting: 2 });

    second.release();
    expect((await third).index).toBe(1);
    first.release();
    expect((await fourth).index).toBe(0);
    expect(order).toEqual([3, 4]);
    // The waiters' timers were cancelled when they got a slot.
    expect(clock.pendingDelays()).toEqual([]);
  });

  test("release is idempotent and returns the slot once", async () => {
    const slots = createInlineRenderPreviewSlots({ size: 1, maxWaiting: 1, waitTimeoutMs: 1_000 });
    const slot = await slots.acquire();
    slot.release();
    slot.release();
    expect(slots.stats()).toEqual({ free: 1, waiting: 0 });
  });

  test("refuses at once when too many callers are already waiting", async () => {
    const slots = createInlineRenderPreviewSlots({ size: 1, maxWaiting: 1, waitTimeoutMs: 1_000, timers: manualTimers().timers });
    await slots.acquire();
    void slots.acquire();
    await expect(slots.acquire()).rejects.toBeInstanceOf(InlineRenderPreviewBusyError);
  });

  test("a waiter gives up when no slot comes free in time, and leaves the queue", async () => {
    const clock = manualTimers();
    const slots = createInlineRenderPreviewSlots({ size: 1, maxWaiting: 2, waitTimeoutMs: 15_000, timers: clock.timers });
    const held = await slots.acquire();
    const waiting = slots.acquire();
    expect(clock.pendingDelays()).toEqual([15_000]);
    clock.fireAll();
    await expect(waiting).rejects.toThrow("within 15 s");
    expect(slots.stats()).toEqual({ free: 0, waiting: 0 });
    held.release();
    expect(slots.stats()).toEqual({ free: 1, waiting: 0 });
  });
});

describe("preview deadline", () => {
  test("returns the task's result and clears its timer", async () => {
    const clock = manualTimers();
    const value = await runWithInlineRenderPreviewDeadline(async () => 42, {
      timeoutMs: 15_000,
      message: () => "late",
      timers: clock.timers,
    });
    expect(value).toBe(42);
    expect(clock.pendingDelays()).toEqual([]);
  });

  test("passes the task's own error through", async () => {
    await expect(
      runWithInlineRenderPreviewDeadline(
        async () => {
          throw new Error("load failed");
        },
        { timeoutMs: 15_000, message: () => "late", timers: manualTimers().timers },
      ),
    ).rejects.toThrow("load failed");
  });

  test("on expiry rejects at once, aborts the task, and drops its late result", async () => {
    const clock = manualTimers();
    let signal: AbortSignal | null = null;
    let finish: (value: string) => void = () => {};
    const running = runWithInlineRenderPreviewDeadline(
      (taskSignal) => {
        signal = taskSignal;
        return new Promise<string>((resolve) => {
          finish = resolve;
        });
      },
      { timeoutMs: 15_000, message: () => "did not finish", timers: clock.timers },
    );
    const aborted: string[] = [];
    signal!.addEventListener("abort", () => aborted.push("abort"));
    clock.fireAll();
    await expect(running).rejects.toBeInstanceOf(InlineRenderPreviewTimeoutError);
    await expect(running).rejects.toThrow("did not finish");
    expect(aborted).toEqual(["abort"]);
    finish("too late");
    await flush();
  });

  test("a task that throws synchronously still rejects", async () => {
    await expect(
      runWithInlineRenderPreviewDeadline(
        () => {
          throw new Error("sync");
        },
        { timeoutMs: 15_000, message: () => "late", timers: manualTimers().timers },
      ),
    ).rejects.toThrow("sync");
  });
});
