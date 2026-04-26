import { describe, expect, test } from "bun:test";
import { createScriptOutputBuffer } from "../electron/main/workspace-scripts/output-buffer";

const MAX_SCRIPT_OUTPUT_CHUNK_BYTES = 64 * 1024;

function waitForImmediate() {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

describe("createScriptOutputBuffer", () => {
  test("batches multiple chunks pushed in the same tick", async () => {
    const flushed: string[] = [];
    const buffer = createScriptOutputBuffer((output) => flushed.push(output));

    buffer.push("hello");
    buffer.push(" ");
    buffer.push("world");

    expect(flushed).toEqual([]);

    await waitForImmediate();

    expect(flushed).toEqual(["hello world"]);
  });

  test("ignores empty chunks", async () => {
    const flushed: string[] = [];
    const buffer = createScriptOutputBuffer((output) => flushed.push(output));

    buffer.push("");
    await waitForImmediate();

    expect(flushed).toEqual([]);
  });

  test("flush emits pending output immediately", async () => {
    const flushed: string[] = [];
    const buffer = createScriptOutputBuffer((output) => flushed.push(output));

    buffer.push("partial");
    buffer.flush();

    expect(flushed).toEqual(["partial"]);

    await waitForImmediate();

    expect(flushed).toEqual(["partial"]);
  });

  test("splits oversized output into bounded transport chunks", async () => {
    const flushed: string[] = [];
    const buffer = createScriptOutputBuffer((output) => flushed.push(output));
    const hugeChunk = "x".repeat(MAX_SCRIPT_OUTPUT_CHUNK_BYTES + 123);

    buffer.push(hugeChunk);
    await waitForImmediate();

    expect(flushed).toHaveLength(2);
    expect(flushed.join("")).toBe(hugeChunk);
    expect(Buffer.byteLength(flushed[0]!, "utf8")).toBe(MAX_SCRIPT_OUTPUT_CHUNK_BYTES);
    expect(Buffer.byteLength(flushed[1]!, "utf8")).toBe(123);
  });
});
