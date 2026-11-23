import { afterEach, describe, expect, test } from "bun:test";
import {
  PASTED_TEXT_COLLAPSE_MIN_CHARACTERS,
  PASTED_TEXT_COLLAPSE_MIN_LINES,
  countPastedTextLines,
  pastedTextBlockRegistry,
  shouldCollapsePastedText,
  splitPastedTextBlocks,
} from "@/lib/pasted-text-blocks";
import { parsePromptTokenSegments } from "@/lib/prompt-token-chips";

afterEach(() => pastedTextBlockRegistry.clear());

describe("shouldCollapsePastedText", () => {
  test("keeps short pastes inline and collapses at either boundary", () => {
    expect(shouldCollapsePastedText("one line")).toBe(false);
    expect(shouldCollapsePastedText("a\n".repeat(PASTED_TEXT_COLLAPSE_MIN_LINES - 1))).toBe(false);
    expect(shouldCollapsePastedText("a\n".repeat(PASTED_TEXT_COLLAPSE_MIN_LINES))).toBe(true);
    expect(shouldCollapsePastedText("x".repeat(PASTED_TEXT_COLLAPSE_MIN_CHARACTERS - 1))).toBe(false);
    expect(shouldCollapsePastedText("x".repeat(PASTED_TEXT_COLLAPSE_MIN_CHARACTERS))).toBe(true);
    expect(shouldCollapsePastedText(" \n".repeat(20))).toBe(false);
  });

  test("counts lines without a trailing newline", () => {
    expect(countPastedTextLines("a\nb\nc\n")).toBe(3);
    expect(countPastedTextLines("a\r\nb")).toBe(2);
  });
});

describe("pastedTextBlockRegistry", () => {
  test("numbers blocks per scope, normalizes newlines, and reuses equal text", () => {
    const first = pastedTextBlockRegistry.register("task-a", "1\r\n2\r\n3\n\n");
    const second = pastedTextBlockRegistry.register("task-a", "other\ntext");
    const again = pastedTextBlockRegistry.register("task-a", "1\n2\n3");
    const otherScope = pastedTextBlockRegistry.register("task-b", "x\ny");
    expect(first).toEqual({ id: 1, text: "1\n2\n3", lineCount: 3 });
    expect(second.id).toBe(2);
    expect(again).toBe(first);
    expect(otherScope.id).toBe(1);
    expect(pastedTextBlockRegistry.get("task-a")).toHaveLength(2);
  });
});

describe("splitPastedTextBlocks", () => {
  test("splits every occurrence and prefers the longer block at one index", () => {
    const short = { id: 1, text: "ab", lineCount: 1 };
    const long = { id: 2, text: "abc", lineCount: 1 };
    expect(splitPastedTextBlocks("x abc y ab", [short, long])).toEqual([
      { type: "text", text: "x " },
      { type: "pasted", block: long },
      { type: "text", text: " y " },
      { type: "pasted", block: short },
    ]);
    expect(splitPastedTextBlocks("plain", [])).toEqual([{ type: "text", text: "plain" }]);
  });
});

describe("parsePromptTokenSegments with pasted text", () => {
  test("shows the pasted block as one token and keeps the original text in it", () => {
    const pasted = "line /review\nhttps://github.com/a/b/pull/1\n3\n4\n5";
    const block = pastedTextBlockRegistry.register("task", pasted);
    const segments = parsePromptTokenSegments(`Read this: ${pasted} please`, {
      pastedTextBlocks: [block],
      allowGenericCommandTokens: true,
    });
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ type: "text", text: "Read this: " });
    const token = segments[1];
    expect(token?.type).toBe("token");
    if (token?.type !== "token") throw new Error("expected token");
    expect(token.descriptor.kind).toBe("pasted");
    expect(token.descriptor.token).toBe(pasted);
    expect(token.descriptor.label).toContain("#1");
    expect(token.descriptor.label).toContain("5");
    expect(segments[2]).toEqual({ type: "text", text: " please" });
  });

  test("parses other tokens outside the pasted block", () => {
    const block = pastedTextBlockRegistry.register("task", "a\nb\nc\nd\ne");
    const segments = parsePromptTokenSegments("/review a\nb\nc\nd\ne", {
      pastedTextBlocks: [block],
      allowGenericCommandTokens: true,
    });
    expect(segments.map((segment) => segment.type === "token" ? segment.descriptor.kind : "text"))
      .toEqual(["command", "text", "pasted"]);
  });
});
