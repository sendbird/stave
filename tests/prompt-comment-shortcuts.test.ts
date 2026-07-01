import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PROMPT_COMMENT_SHORTCUT,
  formatPromptCommentShortcutLabel,
  isPromptCommentShortcut,
  normalizePromptCommentShortcut,
} from "@/lib/prompt-comment-shortcuts";

describe("prompt comment shortcuts", () => {
  test("defaults to modifier enter", () => {
    expect(DEFAULT_PROMPT_COMMENT_SHORTCUT).toBe("mod-enter");
    expect(normalizePromptCommentShortcut(undefined)).toBe("mod-enter");
    expect(formatPromptCommentShortcutLabel("mod-enter")).toBe(
      "Cmd/Ctrl+Enter",
    );
  });

  test("matches command or control enter by default", () => {
    expect(
      isPromptCommentShortcut({
        shortcut: "mod-enter",
        key: "Enter",
        metaKey: true,
      }),
    ).toBe(true);
    expect(
      isPromptCommentShortcut({
        shortcut: "mod-enter",
        key: "Enter",
        ctrlKey: true,
      }),
    ).toBe(true);
    expect(
      isPromptCommentShortcut({
        shortcut: "mod-enter",
        key: "Enter",
        shiftKey: true,
      }),
    ).toBe(false);
  });

  test("supports the legacy shift enter option", () => {
    expect(
      isPromptCommentShortcut({
        shortcut: "shift-enter",
        key: "Enter",
        shiftKey: true,
      }),
    ).toBe(true);
    expect(
      isPromptCommentShortcut({
        shortcut: "shift-enter",
        key: "Enter",
        metaKey: true,
      }),
    ).toBe(false);
  });

  test("can be disabled", () => {
    expect(
      isPromptCommentShortcut({
        shortcut: "disabled",
        key: "Enter",
        metaKey: true,
      }),
    ).toBe(false);
  });
});
