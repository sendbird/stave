import { describe, expect, test } from "bun:test";
import { Utf8LineBuffer } from "../electron/shared/utf8-line-buffer";

describe("Utf8LineBuffer", () => {
  test("parses split newline-delimited chunks", () => {
    const buffer = new Utf8LineBuffer({
      label: "test",
      maxBufferBytes: 1024,
      maxLineBytes: 1024,
    });

    expect(buffer.append("alpha")).toEqual([]);
    expect(buffer.append("\nbeta\n")).toEqual(["alpha", "beta"]);
  });

  test("throws when the buffered input exceeds the byte cap", () => {
    const buffer = new Utf8LineBuffer({
      label: "test",
      maxBufferBytes: 8,
      maxLineBytes: 1024,
    });

    expect(() => buffer.append("123456789")).toThrow(
      "[test] protocol overflow: buffer exceeded 8 bytes",
    );
  });

  test("throws when a single parsed line exceeds the byte cap", () => {
    const buffer = new Utf8LineBuffer({
      label: "test",
      maxBufferBytes: 1024,
      maxLineBytes: 4,
    });

    expect(() => buffer.append("12345\n")).toThrow(
      "[test] protocol overflow: line exceeded 4 bytes",
    );
  });

  test("throws when a partial line exceeds the byte cap before newline arrival", () => {
    const buffer = new Utf8LineBuffer({
      label: "test",
      maxBufferBytes: 1024,
      maxLineBytes: 4,
    });

    expect(() => buffer.append("12345")).toThrow(
      "[test] protocol overflow: line exceeded 4 bytes",
    );
  });

  describe("oversized-line drop mode", () => {
    test("drops a complete oversized line, reports it, and keeps parsing", () => {
      const dropped: Array<{ lineBytes: number; linePrefix: string }> = [];
      const buffer = new Utf8LineBuffer({
        label: "test",
        maxBufferBytes: 1024,
        maxLineBytes: 4,
        onOversizedLine: (info) => dropped.push(info),
      });

      expect(buffer.append("ok\n123456\nfin\n")).toEqual(["ok", "fin"]);
      expect(dropped).toEqual([{ lineBytes: 6, linePrefix: "123456" }]);
    });

    test("resyncs at the next newline when an oversized line streams across chunks", () => {
      const dropped: Array<{ lineBytes: number; linePrefix: string }> = [];
      const buffer = new Utf8LineBuffer({
        label: "test",
        maxBufferBytes: 1024,
        maxLineBytes: 8,
        onOversizedLine: (info) => dropped.push(info),
      });

      expect(buffer.append("123456789")).toEqual([]);
      expect(buffer.append("abcdef")).toEqual([]);
      expect(dropped).toEqual([]);
      expect(buffer.append("gh\nnext\n")).toEqual(["next"]);
      expect(dropped).toEqual([
        { lineBytes: 17, linePrefix: "123456789" },
      ]);
    });

    test("counts multi-byte characters by UTF-8 bytes while discarding", () => {
      const dropped: Array<{ lineBytes: number; linePrefix: string }> = [];
      const buffer = new Utf8LineBuffer({
        label: "test",
        maxBufferBytes: 1024,
        maxLineBytes: 4,
        onOversizedLine: (info) => dropped.push(info),
      });

      // "한글" is 6 UTF-8 bytes.
      expect(buffer.append("한글")).toEqual([]);
      expect(buffer.append("어\nok\n")).toEqual(["ok"]);
      expect(dropped).toEqual([{ lineBytes: 9, linePrefix: "한글" }]);
    });

    test("drops consecutive oversized lines independently", () => {
      const dropped: number[] = [];
      const buffer = new Utf8LineBuffer({
        label: "test",
        maxBufferBytes: 1024,
        maxLineBytes: 4,
        onOversizedLine: (info) => dropped.push(info.lineBytes),
      });

      expect(buffer.append("11111\n222222\nok\n")).toEqual(["ok"]);
      expect(dropped).toEqual([5, 6]);
    });

    test("clear() exits discard mode", () => {
      const dropped: number[] = [];
      const buffer = new Utf8LineBuffer({
        label: "test",
        maxBufferBytes: 1024,
        maxLineBytes: 4,
        onOversizedLine: (info) => dropped.push(info.lineBytes),
      });

      expect(buffer.append("123456789")).toEqual([]);
      buffer.clear();
      expect(buffer.append("ok\n")).toEqual(["ok"]);
      expect(dropped).toEqual([]);
    });

    test("still throws on buffer overflow without a pending newline growth path", () => {
      const buffer = new Utf8LineBuffer({
        label: "test",
        maxBufferBytes: 8,
        maxLineBytes: 16,
        onOversizedLine: () => {},
      });

      expect(() => buffer.append("123456789")).toThrow(
        "[test] protocol overflow: buffer exceeded 8 bytes",
      );
    });

    test("survives a JSON-RPC notification line larger than the cap (codex overflow regression)", () => {
      const dropped: Array<{ lineBytes: number; linePrefix: string }> = [];
      const buffer = new Utf8LineBuffer({
        label: "codex-app-server stdout",
        maxBufferBytes: 4096,
        maxLineBytes: 256,
        onOversizedLine: (info) => dropped.push(info),
      });

      const oversized = JSON.stringify({
        jsonrpc: "2.0",
        method: "item/completed",
        params: {
          item: {
            id: "item_1",
            type: "commandExecution",
            aggregatedOutput: "x".repeat(512),
          },
        },
      });
      const followUp = JSON.stringify({
        jsonrpc: "2.0",
        method: "turn/completed",
        params: {},
      });

      const lines = buffer.append(`${oversized}\n${followUp}\n`);
      expect(lines).toEqual([followUp]);
      expect(dropped).toHaveLength(1);
      expect(dropped[0]!.linePrefix).toContain('"method":"item/completed"');
    });
  });
});
