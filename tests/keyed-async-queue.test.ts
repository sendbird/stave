import { describe, expect, test } from "bun:test";
import { createKeyedAsyncQueue } from "../electron/host-service/keyed-async-queue";

describe("createKeyedAsyncQueue", () => {
  test("serializes tasks with the same key", async () => {
    const queue = createKeyedAsyncQueue<string>();
    const started: string[] = [];
    const releases: Array<() => void> = [];

    const first = queue.enqueue("workspace-1", () =>
      new Promise<string>((resolve) => {
        started.push("first");
        releases.push(() => resolve("first"));
      }),
    );
    const second = queue.enqueue("workspace-1", () =>
      new Promise<string>((resolve) => {
        started.push("second");
        releases.push(() => resolve("second"));
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual(["first"]);

    releases[0]?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(started).toEqual(["first", "second"]);

    releases[1]?.();

    expect(await first).toBe("first");
    expect(await second).toBe("second");
  });

  test("allows different keys to run in parallel", async () => {
    const queue = createKeyedAsyncQueue<string>();
    const started: string[] = [];

    const first = queue.enqueue("workspace-1", async () => {
      started.push("workspace-1");
      return "a";
    });
    const second = queue.enqueue("workspace-2", async () => {
      started.push("workspace-2");
      return "b";
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual(["workspace-1", "workspace-2"]);
    expect(await first).toBe("a");
    expect(await second).toBe("b");
  });
});
