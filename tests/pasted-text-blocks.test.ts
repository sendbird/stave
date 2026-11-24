import { afterEach, describe, expect, test } from "bun:test";
import {
  PASTED_TEXT_COLLAPSE_MIN_CHARACTERS,
  PASTED_TEXT_COLLAPSE_MIN_LINES,
  countPastedTextLines,
  pastedTextBlockRegistry,
  shouldCollapsePastedText,
  splitPastedTextBlocks,
} from "@/lib/pasted-text-blocks";
import { getPastedTextBlock, queuePastedTextAttachment, restorePastedTextBlock } from "@/components/ai-elements/prompt-input-pasted-text";
import { createClipboardReadQueue } from "@/components/ai-elements/prompt-input.clipboard";
import type { PastedTextAttachment } from "@/types/chat";
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
  test("numbers blocks per scope, preserves original line endings, and reuses identical text", () => {
    const first = pastedTextBlockRegistry.register("task-a", "1\r\n2\r\n3\n\n");
    const second = pastedTextBlockRegistry.register("task-a", "other\ntext");
    const again = pastedTextBlockRegistry.register("task-a", first.text);
    const otherScope = pastedTextBlockRegistry.register("task-b", "x\ny");
    expect(first).toEqual({ id: 1, text: "1\r\n2\r\n3\n\n", lineCount: 4 });
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

describe("composer pasted text conversions", () => {
  const text = "first\r\nsecond\r\nthird\r\nfourth\r\nfifth\r\n";
  const attachment: PastedTextAttachment = {
    kind: "file",
    filePath: ".stave/attachments/a1b2c3d4/pasted-text.txt",
    pastedText: { preview: "first", sizeBytes: new TextEncoder().encode(text).length },
  };

  test("uses the same chip rule on both sides of the retired file thresholds", () => {
    const pastes = [
      ...[39, 40, 41].map((lines) => "row\n".repeat(lines)),
      ...[1999, 2000, 2001].map((length) => "x".repeat(length)),
    ];
    for (const paste of pastes) {
      expect(getPastedTextBlock("task", paste)?.text).toBe(paste);
      expect(getPastedTextBlock(undefined, paste)).toBeUndefined();
    }
    expect(getPastedTextBlock("task", "short paste")).toBeUndefined();
  });

  test("attaches the exact text and removes the chip only after save completes", async () => {
    let block = getPastedTextBlock("task", text);
    const attachments: PastedTextAttachment[] = [];
    const queue = createClipboardReadQueue();
    const operation = queuePastedTextAttachment({
      queue,
      block: block!,
      save: async (savedText) => {
        expect(savedText).toBe(text);
        expect(block?.text).toBe(text);
        return attachment;
      },
      removeBlock: () => {
        block = undefined;
        return true;
      },
      addAttachment: (saved) => attachments.push(saved),
    });
    expect(queue.isPending()).toBe(true);
    await operation;
    expect(queue.isPending()).toBe(false);
    expect(block).toBeUndefined();
    expect(attachments).toEqual([attachment]);
  });

  test("a failed save leaves the chip untouched and makes send available again", async () => {
    const block = getPastedTextBlock("task", text)!;
    const queue = createClipboardReadQueue();
    await expect(queuePastedTextAttachment({
      queue,
      block,
      save: async () => { throw new Error("save failed"); },
      removeBlock: () => { throw new Error("unexpected chip removal"); },
      addAttachment: () => { throw new Error("unexpected attachment"); },
    })).rejects.toThrow("save failed");
    expect(queue.isPending()).toBe(false);
    expect(pastedTextBlockRegistry.get("task")).toEqual([block]);
    expect(block.text).toBe(text);
  });

  test("restores even a short saved file as a chip before clearing the attachment", () => {
    let draft = "";
    const savedText = "original\r\n";
    let attached = true;
    restorePastedTextBlock("task", savedText, (value) => { draft = value; }, () => {
      expect(draft).toBe(savedText);
      attached = false;
    });
    const segments = parsePromptTokenSegments(draft, { pastedTextBlocks: pastedTextBlockRegistry.get("task") });
    expect(segments).toMatchObject([{ type: "token", descriptor: { kind: "pasted", token: savedText } }]);
    expect(attached).toBe(false);
  });
});
