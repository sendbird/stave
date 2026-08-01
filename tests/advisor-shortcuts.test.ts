import { describe, expect, test } from "bun:test";
import {
  ADVISOR_PICKER_SHORTCUT_LABEL,
  ADVISOR_TOGGLE_SHORTCUT_LABEL,
  resolveAdvisorShortcutAction,
} from "@/lib/advisor-shortcuts";

function keyEvent(overrides: {
  key?: string;
  code?: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}) {
  return {
    key: "a",
    code: "KeyA",
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  };
}

describe("resolveAdvisorShortcutAction", () => {
  test("Alt+A toggles and Alt+Shift+A opens the picker", () => {
    expect(resolveAdvisorShortcutAction(keyEvent({}))).toBe("toggle");
    expect(resolveAdvisorShortcutAction(keyEvent({ shiftKey: true }))).toBe(
      "picker",
    );
  });

  test("matches by code when Option composes a different character", () => {
    // macOS turns Option+A into "å" and Option+Shift+A into "Å". A key-only
    // match would silently lose the binding on the primary platform.
    expect(resolveAdvisorShortcutAction(keyEvent({ key: "å" }))).toBe("toggle");
    expect(
      resolveAdvisorShortcutAction(keyEvent({ key: "Å", shiftKey: true })),
    ).toBe("picker");
  });

  test("matches by key when the layout reports a non-QWERTY code", () => {
    expect(
      resolveAdvisorShortcutAction(keyEvent({ key: "A", code: "KeyQ" })),
    ).toBe("toggle");
  });

  test("requires Alt and rejects the other modifiers", () => {
    expect(resolveAdvisorShortcutAction(keyEvent({ altKey: false }))).toBeNull();
    expect(resolveAdvisorShortcutAction(keyEvent({ ctrlKey: true }))).toBeNull();
    expect(resolveAdvisorShortcutAction(keyEvent({ metaKey: true }))).toBeNull();
  });

  test("ignores other keys, including the neighbouring composer bindings", () => {
    // Alt+P opens the model selector and Alt+1..0 pick model slots; the Advisor
    // must not answer for any of them.
    expect(
      resolveAdvisorShortcutAction(keyEvent({ key: "p", code: "KeyP" })),
    ).toBeNull();
    expect(
      resolveAdvisorShortcutAction(keyEvent({ key: "1", code: "Digit1" })),
    ).toBeNull();
  });

  test("labels match the bindings the resolver accepts", () => {
    expect(ADVISOR_TOGGLE_SHORTCUT_LABEL).toBe("Alt+A");
    expect(ADVISOR_PICKER_SHORTCUT_LABEL).toBe("Alt+Shift+A");
  });
});
