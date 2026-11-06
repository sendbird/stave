import { describe, expect, test } from "bun:test";
import {
  findMatchingMessageIndexes,
  stepFindPosition,
} from "@/components/session/conversation-find-matching";

const message = (content: string, parts: Array<{ type: string; text?: string }> = []) => ({
  content,
  parts,
});

describe("findMatchingMessageIndexes", () => {
  test("matches message text case-insensitively and ignores surrounding spaces", () => {
    const messages = [message("Check the layout"), message("Nothing here"), message("CHECK again")];
    expect(findMatchingMessageIndexes(messages, "  check ")).toEqual([0, 2]);
  });

  test("an empty query matches nothing", () => {
    expect(findMatchingMessageIndexes([message("anything")], "   ")).toEqual([]);
  });

  test("searches text parts, not tool or thinking parts, when a message has them", () => {
    const messages = [
      message("fallback content mentions needle", [
        { type: "thinking", text: "needle in thought" },
        { type: "text", text: "visible answer" },
      ]),
      message("", [{ type: "tool_use", text: "needle in a tool" }]),
      message("", [{ type: "text", text: "a visible needle" }]),
    ];
    expect(findMatchingMessageIndexes(messages, "needle")).toEqual([2]);
  });
});

describe("stepFindPosition", () => {
  test("the first step goes to the first or, backward, the last match", () => {
    expect(stepFindPosition(-1, 3, false)).toBe(0);
    expect(stepFindPosition(-1, 3, true)).toBe(2);
  });

  test("wraps at both ends", () => {
    expect(stepFindPosition(2, 3, false)).toBe(0);
    expect(stepFindPosition(0, 3, true)).toBe(2);
    expect(stepFindPosition(1, 3, false)).toBe(2);
  });

  test("a stale position past the end restarts, and no matches gives none", () => {
    expect(stepFindPosition(5, 2, false)).toBe(0);
    expect(stepFindPosition(0, 0, false)).toBe(-1);
  });
});
