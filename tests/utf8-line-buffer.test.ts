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
});
