import { describe, expect, test } from "bun:test";
import {
  APP_SHORTCUT_DEFINITIONS,
  assignAppShortcutKey,
  createEmptyAppShortcutKeys,
  formatAppShortcutLabel,
  normalizeAppShortcutKeys,
  resolveAppShortcutAction,
} from "@/lib/app-shortcuts";

describe("app shortcuts", () => {
  test("fills missing persisted bindings from defaults", () => {
    const normalized = normalizeAppShortcutKeys({
      "view.show-explorer": "x",
    });

    expect(normalized["view.show-explorer"]).toBe("x");
    expect(normalized["navigation.home"]).toBe("h");
    expect(normalized["view.toggle-zen-mode"]).toBe("z");
  });

  test("preserves explicit disabled bindings", () => {
    const normalized = normalizeAppShortcutKeys({
      "view.show-explorer": "",
      "view.show-lens": "l",
    });

    expect(normalized["view.show-explorer"]).toBe("");
    expect(normalized["view.show-lens"]).toBe("l");
  });

  test("reassigns duplicate bindings to the newest action", () => {
    const updated = assignAppShortcutKey({
      actionId: "view.show-lens",
      shortcutKeys: normalizeAppShortcutKeys(),
      nextKey: "e",
    });

    expect(updated["view.show-lens"]).toBe("e");
    expect(updated["view.show-explorer"]).toBe("");
  });

  test("formats chord labels from the current bindings", () => {
    const label = formatAppShortcutLabel({
      actionId: "view.toggle-terminal",
      modifierLabel: "Cmd/Ctrl",
      shortcutKeys: normalizeAppShortcutKeys(),
    });

    expect(label).toBe("Cmd/Ctrl+K `");
  });

  test("resolves actions from the configured second key", () => {
    const shortcutKeys = assignAppShortcutKey({
      actionId: "view.show-explorer",
      shortcutKeys: normalizeAppShortcutKeys(),
      nextKey: "x",
    });

    expect(
      resolveAppShortcutAction({
        key: "x",
        shortcutKeys,
      }),
    ).toBe("view.show-explorer");
    expect(
      resolveAppShortcutAction({
        key: "e",
        shortcutKeys,
      }),
    ).toBe(null);
  });

  test("can clear all chord bindings", () => {
    const cleared = createEmptyAppShortcutKeys();

    expect(
      APP_SHORTCUT_DEFINITIONS.every(
        (definition) => cleared[definition.commandId] === "",
      ),
    ).toBe(true);
  });
});
