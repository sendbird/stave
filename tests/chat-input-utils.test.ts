import { describe, expect, test } from "bun:test";
import {
  getLatestUserPromptMessage,
  getLatestPromptSuggestions,
  getPromptHistoryEntries,
  isStaleActiveTurnDraft,
  mergePromptSuggestionWithDraft,
  shouldHandleApprovalEnterShortcut,
} from "@/components/session/chat-input.utils";

describe("getPromptHistoryEntries", () => {
  test("collects non-empty user prompts in chronological order", () => {
    expect(getPromptHistoryEntries([
      {
        id: "m-1",
        role: "user",
        model: "user",
        providerId: "user",
        content: "first prompt",
        parts: [],
      },
      {
        id: "m-2",
        role: "assistant",
        model: "gpt-5.4",
        providerId: "codex",
        content: "response",
        parts: [],
      },
      {
        id: "m-3",
        role: "user",
        model: "user",
        providerId: "user",
        content: "",
        parts: [],
      },
      {
        id: "m-4",
        role: "user",
        model: "user",
        providerId: "user",
        content: "second prompt",
        parts: [],
      },
    ])).toEqual([
      "first prompt",
      "second prompt",
    ]);
  });
});

describe("getLatestUserPromptMessage", () => {
  test("returns the latest non-empty user prompt", () => {
    expect(getLatestUserPromptMessage([
      {
        id: "m-1",
        role: "assistant",
        model: "gpt-5.4",
        providerId: "codex",
        content: "response",
        parts: [],
      },
      {
        id: "m-2",
        role: "user",
        model: "user",
        providerId: "user",
        content: "  first prompt  ",
        parts: [],
      },
      {
        id: "m-3",
        role: "user",
        model: "user",
        providerId: "user",
        content: " ",
        parts: [],
      },
      {
        id: "m-4",
        role: "user",
        model: "user",
        providerId: "user",
        content: "latest prompt",
        parts: [],
      },
    ])).toEqual({
      id: "m-4",
      content: "latest prompt",
    });
  });
});

describe("getLatestPromptSuggestions", () => {
  test("returns the latest assistant suggestions", () => {
    expect(getLatestPromptSuggestions([
      {
        id: "m-1",
        role: "assistant",
        model: "claude-sonnet-4-6",
        providerId: "claude-code",
        content: "First",
        promptSuggestions: ["Old one"],
        parts: [],
      },
      {
        id: "m-2",
        role: "user",
        model: "user",
        providerId: "user",
        content: "Thanks",
        parts: [],
      },
      {
        id: "m-3",
        role: "assistant",
        model: "claude-sonnet-4-6",
        providerId: "claude-code",
        content: "Second",
        promptSuggestions: ["Follow up", "Follow up", "  Another step  "],
        parts: [],
      },
    ])).toEqual(["Follow up", "Another step"]);
  });

  test("returns empty when there are no assistant suggestions", () => {
    expect(getLatestPromptSuggestions([
      {
        id: "m-1",
        role: "assistant",
        model: "gpt-5.4",
        providerId: "codex",
        content: "No suggestions",
        parts: [],
      },
    ])).toEqual([]);
  });

  test("does not reuse stale suggestions from an older assistant message", () => {
    expect(getLatestPromptSuggestions([
      {
        id: "m-1",
        role: "assistant",
        model: "claude-sonnet-4-6",
        providerId: "claude-code",
        content: "Older",
        promptSuggestions: ["Old one"],
        parts: [],
      },
      {
        id: "m-2",
        role: "assistant",
        model: "claude-sonnet-4-6",
        providerId: "claude-code",
        content: "Latest",
        parts: [],
      },
    ])).toEqual([]);
  });
});

describe("mergePromptSuggestionWithDraft", () => {
  test("uses the suggestion directly when the draft is empty", () => {
    expect(mergePromptSuggestionWithDraft({
      currentDraft: "",
      suggestion: "Open a PR",
    })).toBe("Open a PR");
  });

  test("appends the suggestion when draft content already exists", () => {
    expect(mergePromptSuggestionWithDraft({
      currentDraft: "Summarize the diff",
      suggestion: "Open a PR",
    })).toBe("Summarize the diff\nOpen a PR");
  });

  test("does not duplicate an identical draft", () => {
    expect(mergePromptSuggestionWithDraft({
      currentDraft: "Open a PR",
      suggestion: "Open a PR",
    })).toBe("Open a PR");
  });
});

describe("shouldHandleApprovalEnterShortcut", () => {
  test("accepts plain Enter on non-interactive targets", () => {
    expect(shouldHandleApprovalEnterShortcut({
      key: "Enter",
      targetTagName: "div",
    })).toBe(true);
  });

  test("rejects Enter when modifiers or composition are active", () => {
    expect(shouldHandleApprovalEnterShortcut({
      key: "Enter",
      metaKey: true,
      targetTagName: "div",
    })).toBe(false);
    expect(shouldHandleApprovalEnterShortcut({
      key: "Enter",
      isComposing: true,
      targetTagName: "div",
    })).toBe(false);
  });

  test("rejects Enter from editable or interactive controls", () => {
    expect(shouldHandleApprovalEnterShortcut({
      key: "Enter",
      targetTagName: "textarea",
    })).toBe(false);
    expect(shouldHandleApprovalEnterShortcut({
      key: "Enter",
      targetTagName: "div",
      targetRole: "button",
    })).toBe(false);
    expect(shouldHandleApprovalEnterShortcut({
      key: "Enter",
      targetTagName: "div",
      targetIsContentEditable: true,
    })).toBe(false);
  });
});

describe("isStaleActiveTurnDraft", () => {
  test("treats the currently running prompt as stale while the turn is active", () => {
    expect(isStaleActiveTurnDraft({
      isTurnActive: true,
      draftText: "Fix the failing test",
      latestUserPrompt: "Fix the failing test",
    })).toBe(true);
  });

  test("does not clear a queued next-turn draft", () => {
    expect(isStaleActiveTurnDraft({
      isTurnActive: true,
      draftText: "Follow up after this finishes",
      latestUserPrompt: "Fix the failing test",
      queuedNextTurn: {
        queuedAt: "2026-04-09T00:00:00.000Z",
      },
    })).toBe(false);
  });

  test("does not clear unrelated drafts", () => {
    expect(isStaleActiveTurnDraft({
      isTurnActive: true,
      draftText: "Follow up after this finishes",
      latestUserPrompt: "Fix the failing test",
    })).toBe(false);
  });
});
