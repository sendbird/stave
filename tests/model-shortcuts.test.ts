import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MODEL_SHORTCUT_KEYS,
  describeModelShortcutKey,
  findModelShortcutOption,
  normalizeModelShortcutKeys,
  resolveModelShortcutSlot,
} from "@/lib/providers/model-shortcuts";

describe("model shortcuts", () => {
  test("fills missing slots from the default shortcut map", () => {
    expect(normalizeModelShortcutKeys()).toEqual(DEFAULT_MODEL_SHORTCUT_KEYS);
    expect(normalizeModelShortcutKeys(["codex:gpt-5.4-mini", ""])).toEqual([
      "codex:gpt-5.4-mini",
      "",
      "stave:stave-auto",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
  });

  test("resolves Alt+digit slots by keyboard code, including Alt+0", () => {
    expect(
      resolveModelShortcutSlot({
        key: "¡",
        code: "Digit1",
        altKey: true,
      }),
    ).toBe(0);
    expect(
      resolveModelShortcutSlot({
        key: "0",
        code: "Digit0",
        altKey: true,
      }),
    ).toBe(9);
    expect(
      resolveModelShortcutSlot({
        key: "1",
        code: "Digit1",
        altKey: true,
        shiftKey: true,
      }),
    ).toBeNull();
  });

  test("describes a stored shortcut key with provider and model labels", () => {
    expect(
      describeModelShortcutKey({
        shortcutKey: "stave:stave-auto",
      }),
    ).toEqual(
      expect.objectContaining({
        providerId: "stave",
        model: "stave-auto",
        providerLabel: "Stave",
        modelLabel: "Stave Auto",
        fullLabel: "Stave · Stave Auto",
      }),
    );
  });

  test("finds assigned model options and skips unavailable mappings", () => {
    const options = [
      {
        key: "claude-code:claude-opus-4-7",
        available: true,
      },
      {
        key: "codex:gpt-5.4",
        available: false,
      },
    ];

    expect(
      findModelShortcutOption({
        slotIndex: 0,
        options,
      }),
    ).toEqual(options[0]);
    expect(
      findModelShortcutOption({
        slotIndex: 1,
        options,
      }),
    ).toBeNull();
  });
});
