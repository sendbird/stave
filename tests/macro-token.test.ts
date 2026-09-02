import { describe, expect, test } from "bun:test";
import {
  applyMacroInsert,
  filterMacroEntries,
  getActiveMacroTokenMatch,
} from "@/lib/macros/token";
import type { Macro } from "@/lib/macros/types";

function createMacro(overrides: Partial<Macro> = {}): Macro {
  return {
    id: "macro_test",
    label: "Snippet",
    slug: "snippet",
    body: "Insert a saved prompt.",
    insertMode: "replace",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("getActiveMacroTokenMatch", () => {
  test("tracks the active ! token at the caret", () => {
    const value = "please !com";
    const match = getActiveMacroTokenMatch({
      value,
      caretIndex: value.length,
    });

    expect(match).not.toBeNull();
    expect(match?.query).toBe("com");
    expect(match?.token).toBe("!com");
    expect(match?.start).toBe("please ".length);
  });

  test("does not match a bang inside a word", () => {
    expect(
      getActiveMacroTokenMatch({
        value: "wow!com",
        caretIndex: "wow!com".length,
      }),
    ).toBeNull();
  });
});

describe("filterMacroEntries", () => {
  test("matches label, slug, and description and prefers an exact slug", () => {
    const macros = [
      createMacro({
        id: "1",
        label: "Ship notes",
        slug: "ship-notes",
        body: "Summarize what shipped.",
      }),
      createMacro({
        id: "2",
        label: "Commit",
        slug: "commit",
        description: "ship a change",
        body: "Write a conventional commit message.",
      }),
      createMacro({
        id: "3",
        label: "Review",
        slug: "review",
        body: "Review the latest patch.",
      }),
    ];

    expect(
      filterMacroEntries({ macros, query: "SHIP" }).map((macro) => macro.slug),
    ).toEqual(["commit", "ship-notes"]);
    expect(
      filterMacroEntries({ macros, query: "commit" }).map((macro) => macro.slug),
    ).toEqual(["commit"]);
  });
});

describe("applyMacroInsert", () => {
  test("replace mode swaps the whole draft, including after consuming a token", () => {
    expect(
      applyMacroInsert({
        draftText: "please !rev",
        body: "Review this patch.",
        insertMode: "replace",
        tokenMatch: { start: "please ".length, end: "please !rev".length },
      }),
    ).toEqual({
      text: "Review this patch.",
      caretIndex: "Review this patch.".length,
    });
  });

  test("append and prepend keep the remaining draft after the token is removed", () => {
    const tokenMatch = { start: "hello ".length, end: "hello !x".length };
    expect(
      applyMacroInsert({
        draftText: "hello !x",
        body: "world",
        insertMode: "append",
        tokenMatch,
      }).text,
    ).toBe("hello \n\nworld");
    expect(
      applyMacroInsert({
        draftText: "hello !x",
        body: "world",
        insertMode: "prepend",
        tokenMatch,
      }).text,
    ).toBe("world\n\nhello ");
  });
});
