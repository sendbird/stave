import { describe, expect, test } from "bun:test";

import {
  diffPromptWords,
  getPromptEnhancementRevealSegments,
} from "@/components/ai-elements/prompt-input.utils";

/** Rebuilds one side of the diff: `previous` drops added runs, `next` drops removed ones. */
function side(diff: ReturnType<typeof diffPromptWords>, which: "previous" | "next") {
  return diff.segments
    .filter((segment) => segment.kind === "same" || segment.kind === (which === "previous" ? "removed" : "added"))
    .map((segment) => segment.text)
    .join("");
}

describe("diffPromptWords", () => {
  test("counts the removed and added words of a rewrite", () => {
    const diff = diffPromptWords("fix the bug in login", "Fix the login redirect bug");
    // Kept in order: "the", "login". Removed: fix, bug, in. Added: Fix, redirect, bug.
    expect(diff.removedWords).toBe(3);
    expect(diff.addedWords).toBe(3);
    expect(diff.segments.filter((segment) => segment.kind === "same").map((segment) => segment.text.trim()).filter(Boolean))
      .toEqual(["the", "login"]);
  });

  test("the new text reads back from the kept and added runs", () => {
    const next = "Fix the login redirect bug.\n\nAdd a regression test.";
    const diff = diffPromptWords("fix the bug in login", next);
    expect(side(diff, "next")).toBe(next);
  });

  test("an unchanged draft has nothing removed or added", () => {
    const diff = diffPromptWords("keep this", "keep this");
    expect(diff).toEqual({ segments: [{ kind: "same", text: "keep this" }], removedWords: 0, addedWords: 0 });
  });

  test("whitespace that changed on its own never draws a mark", () => {
    const diff = diffPromptWords("one two", "one  two");
    expect(diff.removedWords).toBe(0);
    expect(diff.addedWords).toBe(0);
    expect(diff.segments.every((segment) => segment.kind === "same")).toBe(true);
    expect(side(diff, "next")).toBe("one  two");
  });

  test("a wholesale rewrite is all removed then all added", () => {
    const diff = diffPromptWords("alpha beta", "gamma delta");
    expect(diff.removedWords).toBe(2);
    expect(diff.addedWords).toBe(2);
    expect(diff.segments).toEqual([
      { kind: "removed", text: "alpha beta" },
      { kind: "added", text: "gamma delta" },
    ]);
  });

  test("the reveal keeps its own token alignment", () => {
    // The fade aligns words and spaces together; it is unchanged by the diff
    // view, which aligns words alone.
    const changed = getPromptEnhancementRevealSegments({
      previous: "fix the bug in login",
      next: "Fix the login redirect bug",
    })
      .filter((segment) => segment.changed)
      .map((segment) => segment.text.trim());
    expect(changed).toEqual(["Fix", "login", "redirect", "bug"]);
  });
});
