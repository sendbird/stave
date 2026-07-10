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
    expect(normalizeModelShortcutKeys(["codex:gpt-5.6-luna", ""])).toEqual([
      "codex:gpt-5.6-luna",
      "",
      "codex:gpt-5.6-sol",
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
        shortcutKey: "claude-code:claude-opus-4-8",
      }),
    ).toEqual(
      expect.objectContaining({
        providerId: "claude-code",
        model: "claude-opus-4-8",
        providerLabel: "Claude Code",
        modelLabel: "Claude Opus 4.8",
        fullLabel: "Claude Code · Claude Opus 4.8",
      }),
    );
  });

  test("finds assigned model options and skips unavailable mappings", () => {
    const options = [
      {
        key: "claude-code:claude-opus-4-8",
        available: true,
      },
      {
        key: "codex:gpt-5.5",
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
