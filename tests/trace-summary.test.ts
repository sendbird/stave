import { afterEach, describe, expect, test } from "bun:test";
import { applyAppLocale, i18n } from "@/i18n";
import type { AssistantTraceEntry } from "@/components/session/message/assistant-trace-builder";
import {
  buildCompletedTurnTitle,
  buildCountsTitle,
  countTraceCategories,
  extractTurnTitleSentence,
  TRACE_CATEGORY_COUNT_KEYS,
} from "@/components/session/message/trace-summary";

afterEach(() => applyAppLocale("en"));

function tool(id: string, toolName: string): AssistantTraceEntry {
  return {
    kind: "tool",
    id,
    part: { type: "tool_use", toolUseId: id, toolName, input: "{}", state: "output-available" },
  } as AssistantTraceEntry;
}

const DIFF: AssistantTraceEntry = {
  kind: "diff",
  id: "diff-1",
  parts: [{ type: "code_diff", filePath: "src/a.ts", oldContent: "a", newContent: "b", status: "accepted" }],
} as AssistantTraceEntry;

describe("countTraceCategories", () => {
  test("counts each kind of work in the order it first appeared", () => {
    expect(
      countTraceCategories([
        tool("t1", "Grep"),
        tool("t2", "Read"),
        tool("t3", "Edit"),
        DIFF,
        tool("t4", "Bash"),
        tool("t5", "Glob"),
        tool("t6", "mcp__linear__get_issue"),
      ]),
    ).toEqual([
      { category: "search", count: 2 },
      { category: "read", count: 1 },
      { category: "edit", count: 1 },
      { category: "change", count: 1 },
      { category: "command", count: 1 },
      { category: "tool", count: 1 },
    ]);
  });
});

describe("count labels", () => {
  test("use real plurals in English", () => {
    expect(i18n.t(TRACE_CATEGORY_COUNT_KEYS.read, { count: 1 })).toBe("1 read");
    expect(i18n.t(TRACE_CATEGORY_COUNT_KEYS.read, { count: 3 })).toBe("3 reads");
    expect(i18n.t(TRACE_CATEGORY_COUNT_KEYS.command, { count: 1 })).toBe("1 command");
    expect(i18n.t(TRACE_CATEGORY_COUNT_KEYS.edit, { count: 1 })).toBe("1 edit");
    expect(i18n.t(TRACE_CATEGORY_COUNT_KEYS.search, { count: 2 })).toBe("2 searches");
  });

  test("put the counter after the noun in Korean", () => {
    applyAppLocale("ko");
    expect(i18n.t(TRACE_CATEGORY_COUNT_KEYS.read, { count: 1 })).toBe("읽기 1");
    expect(i18n.t(TRACE_CATEGORY_COUNT_KEYS.command, { count: 2 })).toBe("명령 2");
    expect(i18n.t(TRACE_CATEGORY_COUNT_KEYS.edit, { count: 1 })).toBe("수정 1");
  });
});

describe("extractTurnTitleSentence", () => {
  test("takes the reply's first sentence as plain words", () => {
    expect(
      extractTurnTitleSentence(
        "One spec asserted the old 280px sidebar width. I updated the expectation to the current 290px token.",
      ),
    ).toBe("One spec asserted the old 280px sidebar width");
    expect(
      extractTurnTitleSentence("**Moved** `sidebarOpen` into the [store](src/store/app.store.ts) so it survives switches."),
    ).toBe("Moved sidebarOpen into the store so it survives switches");
  });

  test("keeps dotted names whole", () => {
    expect(extractTurnTitleSentence("Updated app.store.ts to v1.2 for the new flag. Then ran tests.")).toBe(
      "Updated app.store.ts to v1.2 for the new flag",
    );
  });

  test("skips sentences too short to say what happened", () => {
    expect(extractTurnTitleSentence("Done. The sidebar now reads its state from the store.")).toBe(
      "The sidebar now reads its state from the store",
    );
    expect(extractTurnTitleSentence("Done. Summary:\n\n1. **Store** – added a flag.")).toBeNull();
  });

  test("ignores code, headings and list markers", () => {
    expect(extractTurnTitleSentence("```ts\nconst a = 1;\n```\n\n## Fixed the flaky scroll test\n")).toBe(
      "Fixed the flaky scroll test",
    );
    expect(extractTurnTitleSentence("- Renamed the setting key everywhere")).toBe("Renamed the setting key everywhere");
    expect(extractTurnTitleSentence("")).toBeNull();
    expect(extractTurnTitleSentence("```\nonly code\n```")).toBeNull();
  });

  test("reads Korean sentences", () => {
    expect(extractTurnTitleSentence("사이드바 너비 테스트를 수정했습니다. 테스트 14개가 통과했습니다.")).toBe(
      "사이드바 너비 테스트를 수정했습니다",
    );
  });

  test("caps a runaway sentence", () => {
    const title = extractTurnTitleSentence(`${"word ".repeat(120)}end.`);
    expect(title?.length).toBe(200);
    expect(title?.endsWith("…")).toBe(true);
  });
});

describe("buildCountsTitle", () => {
  test("summarizes the work as one clause per kind, edits first", () => {
    expect(
      buildCountsTitle([
        { category: "read", count: 1 },
        { category: "edit", count: 1 },
        { category: "change", count: 1 },
        { category: "command", count: 1 },
      ]),
    ).toBe("Edited 1 file, ran 1 command, read 1 file");
    expect(buildCountsTitle([{ category: "search", count: 2 }])).toBe("Ran 2 searches");
  });

  test("names at most three kinds", () => {
    expect(
      buildCountsTitle([
        { category: "web", count: 1 },
        { category: "search", count: 1 },
        { category: "read", count: 4 },
        { category: "command", count: 2 },
      ]),
    ).toBe("Ran 2 commands, read 4 files, ran 1 search");
  });

  test("localizes to Korean", () => {
    applyAppLocale("ko");
    expect(
      buildCountsTitle([
        { category: "edit", count: 2 },
        { category: "command", count: 1 },
      ]),
    ).toBe("파일 2개 수정, 명령 1개 실행");
  });

  test("says the turn finished when it counted nothing", () => {
    expect(buildCountsTitle([])).toBe("Finished");
  });
});

describe("buildCompletedTurnTitle", () => {
  test("prefers the reply and falls back to the counted work", () => {
    const counts = [{ category: "edit" as const, count: 1 }];
    expect(buildCompletedTurnTitle({ responseText: "Renamed the flag in both stores.", counts })).toBe(
      "Renamed the flag in both stores",
    );
    expect(buildCompletedTurnTitle({ responseText: "Done.", counts })).toBe("Edited 1 file");
  });
});
