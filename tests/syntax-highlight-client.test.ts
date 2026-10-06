import { describe, expect, test } from "bun:test";
import {
  createCodeBlockHighlighter,
  type HighlightWorkerLike,
} from "../src/lib/syntax-highlight-client";
import type {
  CodeBlockHighlightRequest,
  CodeBlockHighlightResponse,
} from "../src/lib/syntax-highlight-shared";

class FakeWorker implements HighlightWorkerLike {
  onmessage: HighlightWorkerLike["onmessage"] = null;
  onerror: HighlightWorkerLike["onerror"] = null;
  requests: CodeBlockHighlightRequest[] = [];
  terminated = false;

  postMessage(message: CodeBlockHighlightRequest) {
    this.requests.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  reply(response: CodeBlockHighlightResponse) {
    this.onmessage?.({ data: response } as MessageEvent<CodeBlockHighlightResponse>);
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const fallbackCalls: string[] = [];
  const highlight = createCodeBlockHighlighter({
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    fallback: async (code, lang) => {
      fallbackCalls.push(`${lang}:${code}`);
      return `<pre>main:${code}</pre>`;
    },
  });
  return { highlight, workers, fallbackCalls };
}

describe("code-block highlight routing", () => {
  test("answers each block from one shared worker by request id", async () => {
    const { highlight, workers, fallbackCalls } = setup();
    const first = highlight("const a = 1;", "ts");
    const second = highlight("echo hi", "bash");
    const [worker] = workers;

    worker!.reply({ id: 1, html: "<pre>bash</pre>" });
    worker!.reply({ id: 0, html: "<pre>ts</pre>" });

    expect(await first).toBe("<pre>ts</pre>");
    expect(await second).toBe("<pre>bash</pre>");
    expect(workers).toHaveLength(1);
    expect(fallbackCalls).toEqual([]);
  });

  test("rejects a block whose language the worker does not know", async () => {
    const { highlight, workers } = setup();
    const pending = highlight("x", "cobol");

    workers[0]!.reply({ id: 0, error: "Language `cobol` not found" });

    await expect(pending).rejects.toThrow("Language `cobol` not found");
  });

  test("a worker that cannot start hands every owed block to the main thread", async () => {
    const { highlight, workers, fallbackCalls } = setup();
    const first = highlight("a", "ts");
    const second = highlight("b", "ts");

    workers[0]!.onerror?.(new Event("error"));

    expect(await first).toBe("<pre>main:a</pre>");
    expect(await second).toBe("<pre>main:b</pre>");
    expect(workers[0]!.terminated).toBe(true);
    expect(await highlight("c", "ts")).toBe("<pre>main:c</pre>");
    expect(workers).toHaveLength(1);
    expect(fallbackCalls).toEqual(["ts:a", "ts:b", "ts:c"]);
  });

  test("a highlighter that fails to initialise in the worker also falls back", async () => {
    const { highlight, workers } = setup();
    const owed = highlight("a", "ts");

    workers[0]!.reply({ id: 0, error: "wasm failed", fatal: true });

    expect(await owed).toBe("<pre>main:a</pre>");
    expect(await highlight("b", "ts")).toBe("<pre>main:b</pre>");
  });

  test("uses the main thread when workers are unavailable", async () => {
    const highlight = createCodeBlockHighlighter({
      createWorker: null,
      fallback: async (code) => `<pre>${code}</pre>`,
    });

    expect(await highlight("x", "ts")).toBe("<pre>x</pre>");
  });
});
