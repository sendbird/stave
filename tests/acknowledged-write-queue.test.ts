import { describe, expect, test } from "bun:test";
import { createAcknowledgedWriteQueue } from "@/lib/acknowledged-write-queue";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("acknowledged write queue", () => {
  test("coalesces pending saves and a direct save supersedes an old timer", async () => {
    const writes: string[] = [];
    const queue = createAcknowledgedWriteQueue<string, string>({
      write: async (_key, value) => { writes.push(value); },
      delayMs: 10_000,
      onFailure: () => {},
    });
    queue.schedule("a", "old");
    queue.schedule("a", "intermediate");
    await queue.save("a", "current");
    await queue.flushAll();
    expect(writes).toEqual(["current"]);
  });

  test("flush waits for in-flight writes and saves the latest edit afterward", async () => {
    const gate = deferred();
    const writes: string[] = [];
    const queue = createAcknowledgedWriteQueue<string, string>({
      write: async (_key, value) => {
        writes.push(value);
        if (value === "first") await gate.promise;
      },
      delayMs: 10_000,
      onFailure: () => {},
    });
    const first = queue.save("a", "first");
    await Promise.resolve();
    queue.schedule("a", "discarded");
    queue.schedule("a", "latest");
    let flushed = false;
    const flush = queue.flushAll().then(() => { flushed = true; });
    await Promise.resolve();
    expect(flushed).toBe(false);
    expect(writes).toEqual(["first"]);
    gate.resolve();
    await Promise.all([first, flush]);
    expect(writes).toEqual(["first", "latest"]);
    expect(flushed).toBe(true);
  });

  test("a failed automatic write remains retryable and has no unhandled rejection", async () => {
    const failed = deferred();
    let unavailable = true;
    const writes: string[] = [];
    const queue = createAcknowledgedWriteQueue<string, string>({
      write: async (_key, value) => {
        if (unavailable) throw new Error("Disk full");
        writes.push(value);
      },
      delayMs: 0,
      onFailure: () => failed.resolve(),
    });
    queue.schedule("a", "retained");
    await failed.promise;
    await expect(queue.flushAll()).rejects.toThrow("Some workspace changes");
    unavailable = false;
    await queue.flushAll();
    expect(writes).toEqual(["retained"]);
  });

  test("a failed older write cannot replace an edit made during that write", async () => {
    const gate = deferred();
    const writes: string[] = [];
    const queue = createAcknowledgedWriteQueue<string, string>({
      write: async (_key, value) => {
        if (value === "old") await gate.promise;
        writes.push(value);
      },
      delayMs: 10_000,
      onFailure: () => {},
    });
    const old = queue.save("a", "old");
    const outcome = old.catch((error: unknown) => error);
    queue.schedule("a", "new");
    gate.reject(new Error("Disk full"));
    expect(await outcome).toEqual(new Error("Disk full"));
    await queue.flushAll();
    expect(writes).toEqual(["new"]);
  });

  test("flush attempts other workspaces even when one cannot be saved", async () => {
    const writes: string[] = [];
    const queue = createAcknowledgedWriteQueue<string, string>({
      write: async (key, value) => {
        if (key === "unavailable") throw new Error("Disk unavailable");
        writes.push(value);
      },
      delayMs: 10_000,
      onFailure: () => {},
    });
    queue.schedule("unavailable", "one");
    queue.schedule("available", "two");
    await expect(queue.flushAll()).rejects.toThrow("Some workspace changes");
    expect(writes).toEqual(["two"]);
  });
});
