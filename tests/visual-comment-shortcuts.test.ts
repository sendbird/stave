import { describe, expect, test } from "bun:test";
import {
  DEFAULT_VISUAL_COMMENT_SHORTCUT,
  formatVisualCommentShortcutLabel,
  isVisualCommentShortcut,
  normalizeVisualCommentShortcut,
} from "@/lib/visual-comment-shortcuts";

describe("visual comment shortcuts", () => {
  test("defaults to browser-safe modifier alt period", () => {
    expect(DEFAULT_VISUAL_COMMENT_SHORTCUT).toBe("mod-alt-period");
    expect(normalizeVisualCommentShortcut(undefined)).toBe("mod-alt-period");
    expect(formatVisualCommentShortcutLabel("mod-alt-period")).toBe(
      "Cmd/Ctrl+Alt+.",
    );
  });

  test("matches command or control alt period by default", () => {
    expect(
      isVisualCommentShortcut({
        shortcut: "mod-alt-period",
        key: ".",
        altKey: true,
        metaKey: true,
      }),
    ).toBe(true);
    expect(
      isVisualCommentShortcut({
        shortcut: "mod-alt-period",
        key: ".",
        altKey: true,
        ctrlKey: true,
      }),
    ).toBe(true);
    expect(
      isVisualCommentShortcut({
        shortcut: "mod-alt-period",
        key: ".",
        metaKey: true,
      }),
    ).toBe(false);
  });

  test("supports legacy modifier period", () => {
    expect(
      isVisualCommentShortcut({
        shortcut: "mod-period",
        key: ".",
        metaKey: true,
      }),
    ).toBe(true);
    expect(
      isVisualCommentShortcut({
        shortcut: "mod-period",
        key: ".",
        ctrlKey: true,
      }),
    ).toBe(true);
    expect(
      isVisualCommentShortcut({
        shortcut: "mod-period",
        key: ".",
        altKey: true,
        metaKey: true,
      }),
    ).toBe(false);
    expect(
      isVisualCommentShortcut({
        shortcut: "mod-period",
        key: ".",
        shiftKey: true,
        metaKey: true,
      }),
    ).toBe(false);
  });

  test("supports shifted modifier period", () => {
    expect(
      isVisualCommentShortcut({
        shortcut: "mod-shift-period",
        key: ">",
        code: "Period",
        shiftKey: true,
        metaKey: true,
      }),
    ).toBe(true);
    expect(
      isVisualCommentShortcut({
        shortcut: "mod-shift-period",
        key: ".",
        metaKey: true,
      }),
    ).toBe(false);
  });

  test("can be disabled", () => {
    expect(
      isVisualCommentShortcut({
        shortcut: "disabled",
        key: ".",
        metaKey: true,
      }),
    ).toBe(false);
  });
});
