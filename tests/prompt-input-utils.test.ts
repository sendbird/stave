import { describe, expect, test } from "bun:test";
import {
  conversationContextUsageTone,
  formatConversationContextCounts,
  formatConversationContextPercent,
  getAcceptedCommandPaletteItem,
  getNextCommandSelectionIndex,
  getPromptEnhancementRevealSegments,
  getPromptEnhancementRevealTimings,
  isShortcutEchoInsertion,
  isPromptHistoryBoundaryReached,
  navigatePromptHistory,
  NO_COMMAND_SELECTION,
  NO_PROMPT_HISTORY_SELECTION,
  providerOffersConversationCompact,
  resolveLatestConversationContextUsage,
} from "@/components/ai-elements/prompt-input.utils";
import type { CommandPaletteItem } from "@/lib/commands";
import type { ChatMessage } from "@/types/chat";

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
    expect(
      getNextCommandSelectionIndex({
        currentIndex: NO_COMMAND_SELECTION,
        itemCount: items.length,
        direction: "next",
      }),
    ).toBe(0);
  });

  test("starts from the last item when moving up from no selection", () => {
    expect(
      getNextCommandSelectionIndex({
        currentIndex: NO_COMMAND_SELECTION,
        itemCount: items.length,
        direction: "previous",
      }),
    ).toBe(1);
  });
});

describe("getAcceptedCommandPaletteItem", () => {
  test("accepts the first match on Enter even without an explicit selection", () => {
    expect(
      getAcceptedCommandPaletteItem({
        items,
        selectedIndex: NO_COMMAND_SELECTION,
        triggerKey: "Enter",
      }),
    ).toEqual(items[0]);
  });

  test("accepts the first match on Tab even without an explicit selection", () => {
    expect(
      getAcceptedCommandPaletteItem({
        items,
        selectedIndex: NO_COMMAND_SELECTION,
        triggerKey: "Tab",
      }),
    ).toEqual(items[0]);
  });

  test("accepts the highlighted item on Enter after explicit selection", () => {
    expect(
      getAcceptedCommandPaletteItem({
        items,
        selectedIndex: 1,
        triggerKey: "Enter",
      }),
    ).toEqual(items[1]);
  });
});

describe("isPromptHistoryBoundaryReached", () => {
  test("requires cursor on first line when moving to previous history", () => {
    expect(
      isPromptHistoryBoundaryReached({
        value: "line1\nline2",
        selectionStart: 3,
        selectionEnd: 3,
        direction: "previous",
      }),
    ).toBe(true);
    expect(
      isPromptHistoryBoundaryReached({
        value: "line1\nline2",
        selectionStart: 7,
        selectionEnd: 7,
        direction: "previous",
      }),
    ).toBe(false);
  });

  test("requires cursor on last line when moving to next history", () => {
    expect(
      isPromptHistoryBoundaryReached({
        value: "line1\nline2",
        selectionStart: 2,
        selectionEnd: 2,
        direction: "next",
      }),
    ).toBe(false);
    expect(
      isPromptHistoryBoundaryReached({
        value: "line1\nline2",
        selectionStart: 8,
        selectionEnd: 8,
        direction: "next",
      }),
    ).toBe(true);
  });
});

describe("navigatePromptHistory", () => {
  const entries = ["first", "second", "third"] as const;

  test("captures draft and jumps to newest item on first previous navigation", () => {
    expect(
      navigatePromptHistory({
        entries,
        selectedIndex: NO_PROMPT_HISTORY_SELECTION,
        direction: "previous",
        draftBeforeHistory: "",
        currentValue: "working draft",
      }),
    ).toEqual({
      selectedIndex: 2,
      value: "third",
      draftBeforeHistory: "working draft",
    });
  });

  test("restores draft when moving next past the newest entry", () => {
    expect(
      navigatePromptHistory({
        entries,
        selectedIndex: 2,
        direction: "next",
        draftBeforeHistory: "working draft",
        currentValue: "third",
      }),
    ).toEqual({
      selectedIndex: NO_PROMPT_HISTORY_SELECTION,
      value: "working draft",
      draftBeforeHistory: "",
    });
  });
});

describe("prompt enhancement reveal", () => {
  test("highlights only the words the rewrite actually changed", () => {
    const segments = getPromptEnhancementRevealSegments({
      previous: "fix the login bug",
      next: "fix the login bug in src/auth",
    });

    expect(segments.map((segment) => segment.text).join("")).toBe(
      "fix the login bug in src/auth",
    );
    expect(
      segments
        .filter((segment) => segment.changed)
        .map((segment) => segment.text),
      // The gap between untouched text and the first new word stays untouched:
      // a highlighted space there reads as a stray coloured bar.
    ).toEqual(["in", " src/auth"]);
  });

  test("keeps a word that only moved out of the highlight", () => {
    const segments = getPromptEnhancementRevealSegments({
      previous: "deploy the worker",
      next: "carefully deploy the worker to staging",
    });

    expect(
      segments
        .filter((segment) => segment.changed)
        .map((segment) => segment.text.trim()),
    ).toEqual(["carefully", "to", "staging"]);
  });

  test("never highlights a line break or a gap next to untouched text", () => {
    const segments = getPromptEnhancementRevealSegments({
      previous: "one\n\nthree",
      next: "one\n\ntwo\n\nthree",
    });

    for (const segment of segments) {
      if (segment.changed) {
        expect(segment.text).not.toContain("\n");
      }
    }
    expect(segments.map((segment) => segment.text).join("")).toBe(
      "one\n\ntwo\n\nthree",
    );
  });

  test("numbers the changed segments so they can be staggered", () => {
    const segments = getPromptEnhancementRevealSegments({
      previous: "ship it",
      next: "ship it now, please",
    });
    const changed = segments.filter((segment) => segment.changed);

    expect(changed.map((segment) => segment.order)).toEqual([0, 1]);
    for (const segment of segments) {
      if (!segment.changed) {
        expect(segment.order).toBe(-1);
      }
    }
  });

  test("treats an empty rewrite and a first draft sensibly", () => {
    expect(
      getPromptEnhancementRevealSegments({ previous: "x", next: "" }),
    ).toEqual([]);
    expect(
      getPromptEnhancementRevealSegments({ previous: "", next: "brand new" }),
    ).toEqual([
      { text: "brand", changed: true, order: 0 },
      { text: " new", changed: true, order: 1 },
    ]);
  });

  test("paces the reveal so a full rewrite is not slower than a small edit", () => {
    // A couple of new words: a visible beat between them, and the reveal ends
    // once the last afterglow has faded.
    expect(getPromptEnhancementRevealTimings(2)).toEqual({
      stepMs: 28,
      durationMs: 928,
    });
    // A wholesale rewrite compresses the stagger instead of holding the
    // composer locked for several seconds.
    const wholesale = getPromptEnhancementRevealTimings(200);
    expect(wholesale.stepMs).toBe(3);
    expect(wholesale.durationMs).toBeLessThanOrEqual(1500);
    expect(getPromptEnhancementRevealTimings(0)).toEqual({
      stepMs: 0,
      durationMs: 700,
    });
  });
});

describe("isShortcutEchoInsertion", () => {
  test("claims the single character an Option chord leaks into the draft", () => {
    expect(
      isShortcutEchoInsertion({ previous: "ship it", next: "ship it1" }),
    ).toBe(true);
    // macOS composes Option+1 as "¡" on a US layout.
    expect(
      isShortcutEchoInsertion({ previous: "ship it", next: "ship it¡" }),
    ).toBe(true);
    // The caret is not always at the end of the draft.
    expect(
      isShortcutEchoInsertion({ previous: "ship it", next: "ship1 it" }),
    ).toBe(true);
  });

  test("leaves every edit that is not a one-character echo alone", () => {
    expect(isShortcutEchoInsertion({ previous: "ship", next: "ship" })).toBe(
      false,
    );
    expect(isShortcutEchoInsertion({ previous: "ship", next: "shi" })).toBe(
      false,
    );
    expect(isShortcutEchoInsertion({ previous: "ship", next: "ship it" })).toBe(
      false,
    );
    // A newline is a deliberate Shift+Enter, never a chord echo.
    expect(isShortcutEchoInsertion({ previous: "ship", next: "ship\n" })).toBe(
      false,
    );
    // A replacement is not an insertion.
    expect(isShortcutEchoInsertion({ previous: "ship", next: "shop1" })).toBe(
      false,
    );
  });

  test("treats an astral character as one character", () => {
    expect(isShortcutEchoInsertion({ previous: "ship", next: "ship🚀" })).toBe(
      true,
    );
  });
});

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "assistant-1",
    role: "assistant",
    model: "test",
    providerId: "codex",
    content: "done",
    parts: [{ type: "text", text: "done" }],
    ...overrides,
  };
}

describe("conversation context usage", () => {
  test("uses the newest reported window and ignores earlier turns", () => {
    expect(
      resolveLatestConversationContextUsage([
        assistantMessage({
          id: "older",
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            contextUsedTokens: 100,
            contextWindowTokens: 1_000,
          },
        }),
        assistantMessage({
          id: "newer",
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            contextUsedTokens: 750,
            contextWindowTokens: 1_000,
          },
        }),
      ]),
    ).toEqual({
      usedPercent: 75,
      usedTokens: 750,
      windowTokens: 1_000,
      remainingTokens: 250,
      messageId: "newer",
    });
  });

  test("accepts a percent-only report", () => {
    expect(
      resolveLatestConversationContextUsage([
        assistantMessage({
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            contextUsedPercent: 3.671,
          },
        }),
      ]),
    ).toEqual({
      usedPercent: 3.671,
      messageId: "assistant-1",
    });
  });

  test("hides when no message reports a window or percent", () => {
    expect(
      resolveLatestConversationContextUsage([
        assistantMessage({
          usage: { inputTokens: 12, outputTokens: 4 },
        }),
      ]),
    ).toBeNull();
  });

  test("formats percent and counts, and maps tone bands", () => {
    expect(formatConversationContextPercent(3.671)).toBe("3.7%");
    expect(formatConversationContextPercent(75.2)).toBe("75%");
    expect(
      formatConversationContextCounts({
        usedPercent: 75,
        usedTokens: 750,
        windowTokens: 1_000,
        messageId: "assistant-1",
      }),
    ).toBe("750 / 1,000");
    expect(conversationContextUsageTone(12)).toBe("ok");
    expect(conversationContextUsageTone(60)).toBe("warn");
    expect(conversationContextUsageTone(85)).toBe("critical");
  });

  test("offers compact for Claude, Codex, or a catalog that lists it", () => {
    expect(
      providerOffersConversationCompact({ providerId: "claude-code" }),
    ).toBe(true);
    expect(providerOffersConversationCompact({ providerId: "codex" })).toBe(
      true,
    );
    expect(providerOffersConversationCompact({ providerId: "cursor" })).toBe(
      false,
    );
    expect(
      providerOffersConversationCompact({
        providerId: "kiro",
        commandPaletteItems: [{ command: "/compact" }],
      }),
    ).toBe(true);
  });
});
