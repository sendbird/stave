import { describe, expect, test } from "bun:test";
import { stripAnsiControlSequences } from "../src/lib/workspace-scripts/ansi";

const ESC = "\x1b";

describe("stripAnsiControlSequences", () => {
  test("removes SGR color codes", () => {
    expect(stripAnsiControlSequences(`${ESC}[32mgreen${ESC}[0m text`)).toBe("green text");
  });

  test("removes cursor movement / erase CSI sequences", () => {
    expect(stripAnsiControlSequences(`a${ESC}[2Kb${ESC}[1Gc`)).toBe("abc");
  });

  test("removes OSC title and hyperlink sequences", () => {
    expect(stripAnsiControlSequences(`${ESC}]0;title\x07hello`)).toBe("hello");
    expect(stripAnsiControlSequences(`${ESC}]8;;http://x${ESC}\\link`)).toBe("link");
  });

  test("collapses carriage-return progress rewrites to the final segment", () => {
    expect(stripAnsiControlSequences("10%\r50%\r100%")).toBe("100%");
  });

  test("preserves newlines and normalizes CRLF", () => {
    expect(stripAnsiControlSequences("line1\r\nline2")).toBe("line1\nline2");
  });

  test("keeps tabs but strips other control chars", () => {
    expect(stripAnsiControlSequences("a\tb\x08c")).toBe("a\tbc");
  });

  test("returns empty input unchanged", () => {
    expect(stripAnsiControlSequences("")).toBe("");
  });
});
