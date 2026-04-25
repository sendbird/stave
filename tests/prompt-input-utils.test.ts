import { describe, expect, test } from "bun:test";
import {
  getAcceptedCommandPaletteItem,
  getNextCommandSelectionIndex,
  isPromptHistoryBoundaryReached,
  navigatePromptHistory,
  NO_COMMAND_SELECTION,
  NO_PROMPT_HISTORY_SELECTION,
} from "@/components/ai-elements/prompt-input.utils";
import type { CommandPaletteItem } from "@/lib/commands";

const items: CommandPaletteItem[] = [
  {
    id: "status",
    command: "/status",
    insertText: "/status",
    description: "Show workspace status.",
    source: "provider_native",
    searchText: "/status status show workspace status",
  },
  {
    id: "usage",
    command: "/usage",
    insertText: "/usage",
    description: "Show token usage.",
    source: "provider_native",
    searchText: "/usage usage show token usage",
  },
];

describe("getNextCommandSelectionIndex", () => {
  test("starts from the first item when moving down from no selection", () => {
    expect(getNextCommandSelectionIndex({
      currentIndex: NO_COMMAND_SELECTION,
      itemCount: items.length,
      direction: "next",
    })).toBe(0);
  });

  test("starts from the last item when moving up from no selection", () => {
    expect(getNextCommandSelectionIndex({
      currentIndex: NO_COMMAND_SELECTION,
      itemCount: items.length,
      direction: "previous",
    })).toBe(1);
  });
});

describe("getAcceptedCommandPaletteItem", () => {
  test("accepts the first match on Enter even without an explicit selection", () => {
    expect(getAcceptedCommandPaletteItem({
      items,
      selectedIndex: NO_COMMAND_SELECTION,
      triggerKey: "Enter",
    })).toEqual(items[0]);
  });

  test("accepts the first match on Tab even without an explicit selection", () => {
    expect(getAcceptedCommandPaletteItem({
      items,
      selectedIndex: NO_COMMAND_SELECTION,
      triggerKey: "Tab",
    })).toEqual(items[0]);
  });

  test("accepts the highlighted item on Enter after explicit selection", () => {
    expect(getAcceptedCommandPaletteItem({
      items,
      selectedIndex: 1,
      triggerKey: "Enter",
    })).toEqual(items[1]);
  });
});

describe("isPromptHistoryBoundaryReached", () => {
  test("requires cursor on first line when moving to previous history", () => {
    expect(isPromptHistoryBoundaryReached({
      value: "line1\nline2",
      selectionStart: 3,
      selectionEnd: 3,
      direction: "previous",
    })).toBe(true);
    expect(isPromptHistoryBoundaryReached({
      value: "line1\nline2",
      selectionStart: 7,
      selectionEnd: 7,
      direction: "previous",
    })).toBe(false);
  });

  test("requires cursor on last line when moving to next history", () => {
    expect(isPromptHistoryBoundaryReached({
      value: "line1\nline2",
      selectionStart: 2,
      selectionEnd: 2,
      direction: "next",
    })).toBe(false);
    expect(isPromptHistoryBoundaryReached({
      value: "line1\nline2",
      selectionStart: 8,
      selectionEnd: 8,
      direction: "next",
    })).toBe(true);
  });
});

describe("navigatePromptHistory", () => {
  const entries = ["first", "second", "third"] as const;

  test("captures draft and jumps to newest item on first previous navigation", () => {
    expect(navigatePromptHistory({
      entries,
      selectedIndex: NO_PROMPT_HISTORY_SELECTION,
      direction: "previous",
      draftBeforeHistory: "",
      currentValue: "working draft",
    })).toEqual({
      selectedIndex: 2,
      value: "third",
      draftBeforeHistory: "working draft",
    });
  });

  test("restores draft when moving next past the newest entry", () => {
    expect(navigatePromptHistory({
      entries,
      selectedIndex: 2,
      direction: "next",
      draftBeforeHistory: "working draft",
      currentValue: "third",
    })).toEqual({
      selectedIndex: NO_PROMPT_HISTORY_SELECTION,
      value: "working draft",
      draftBeforeHistory: "",
    });
  });
});
