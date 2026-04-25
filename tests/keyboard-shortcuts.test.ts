import { describe, expect, test } from "bun:test";
import { isDevToolsShortcut, type ShortcutInput } from "../electron/main/keyboard-shortcuts";

function createInput(overrides: Partial<ShortcutInput>): ShortcutInput {
  return {
    alt: false,
    code: "",
    control: false,
    key: "",
    meta: false,
    shift: false,
    type: "keyDown",
    ...overrides,
  };
}

describe("isDevToolsShortcut", () => {
  test("matches the F12 accelerator", () => {
    expect(
      isDevToolsShortcut(
        createInput({
          key: "F12",
        }),
      ),
    ).toBe(true);
  });

  test("matches Cmd/Ctrl+Shift+I by physical key code", () => {
    expect(
      isDevToolsShortcut(
        createInput({
          code: "KeyI",
          control: true,
          key: "ㅑ",
          shift: true,
        }),
      ),
    ).toBe(true);
  });

  test("rejects unrelated chords", () => {
    expect(
      isDevToolsShortcut(
        createInput({
          code: "KeyK",
          control: true,
          key: "k",
          shift: true,
        }),
      ),
    ).toBe(false);
  });
});
