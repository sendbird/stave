import { expect, test } from "bun:test";
import { createClipboardReadQueue } from "../src/components/ai-elements/prompt-input.clipboard";

test("commits overlapping paste batches in order against the latest attachment state", async () => {
  const queue = createClipboardReadQueue();
  let release!: (value: string[]) => void;
  let attachments = ["removed"];
  const first = queue.enqueue(
    () => new Promise<string[]>((resolve) => { release = resolve; }),
    (images) => { attachments = [...attachments, ...images]; },
  );
  const second = queue.enqueue(
    async () => ["second", "third"],
    (images) => { attachments = [...attachments, ...images]; },
  );
  expect(queue.isPending()).toBe(true);
  await Promise.resolve();
  attachments = ["new file"];
  release(["first"]);
  await Promise.all([first, second]);
  expect(attachments).toEqual(["new file", "first", "second", "third"]);
  expect(queue.isPending()).toBe(false);
});

test("task changes discard unfinished reads and do not block a new task", async () => {
  const queue = createClipboardReadQueue();
  const committed: string[] = [];
  let release!: (value: string) => void;
  const old = queue.enqueue(
    () => new Promise<string>((resolve) => { release = resolve; }),
    (value) => committed.push(value),
  );
  await Promise.resolve();
  queue.cancel();
  expect(queue.isPending()).toBe(false);
  await queue.enqueue(async () => "new task", (value) => committed.push(value));
  release("old task");
  await old;
  expect(committed).toEqual(["new task"]);
});

test("reports read failures and allows subsequent pastes", async () => {
  const queue = createClipboardReadQueue();
  const committed: string[] = [];
  const failed = queue.enqueue(async () => { throw new Error("read failed"); }, () => {});
  const next = queue.enqueue(async () => "next", (value) => committed.push(value));
  await expect(failed).rejects.toThrow("read failed");
  await next;
  expect(committed).toEqual(["next"]);
  expect(queue.isPending()).toBe(false);
});

test("image read errors and oversized results reject instead of leaving paste pending", async () => {
  const { readClipboardImage } = await import("../src/components/ai-elements/prompt-input.clipboard");
  const original = Object.getOwnPropertyDescriptor(globalThis, "FileReader");
  let mode: "error" | "abort" | "large" = "error";
  class FakeReader {
    result: string | null = null;
    onerror?: () => void;
    onabort?: () => void;
    onload?: () => void;
    readAsDataURL() {
      if (mode === "error") this.onerror?.();
      else if (mode === "abort") this.onabort?.();
      else {
        this.result = "data:image/png;base64," + "A".repeat(10_000_000);
        this.onload?.();
      }
    }
  }
  Object.defineProperty(globalThis, "FileReader", { configurable: true, value: FakeReader });
  try {
    const file = new File(["image"], "broken.png", { type: "image/png" });
    await expect(readClipboardImage(file)).rejects.toThrow("Could not read image");
    mode = "abort";
    await expect(readClipboardImage(file)).rejects.toThrow("Could not read image");
    mode = "large";
    await expect(readClipboardImage(file)).rejects.toThrow("Image is too large");
  } finally {
    if (original) Object.defineProperty(globalThis, "FileReader", original);
    else Reflect.deleteProperty(globalThis, "FileReader");
  }
});
