import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MODEL_SHORTCUT_KEYS,
  describeModelShortcutKey,
  findModelShortcutEffort,
  findModelShortcutOption,
  listModelShortcutEffortOptions,
  normalizeModelShortcutEfforts,
  normalizeModelShortcutKeys,
  resolveModelShortcutSlot,
  resolveModelShortcutEffort,
} from "@/lib/providers/model-shortcuts";

describe("model shortcuts", () => {
  test("fills missing slots from the default shortcut map", () => {
    expect(normalizeModelShortcutKeys()).toEqual(DEFAULT_MODEL_SHORTCUT_KEYS);
    expect(normalizeModelShortcutKeys(["codex:gpt-5.6-luna", ""])).toEqual([
      "codex:gpt-5.6-luna",
      "",
      "claude-code:claude-fable-5-1",
      "codex:gpt-6-astra",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
  });

  test("upgrades persisted Opus 4.8 shortcuts to Opus 5", () => {
    expect(normalizeModelShortcutKeys(["claude-code:claude-opus-4-8"])[0]).toBe(
      "claude-code:claude-opus-5",
    );
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
        key: "claude-code:claude-opus-5",
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

  test("normalizes per-slot effort overrides and keeps empty slots unset", () => {
    expect(
      normalizeModelShortcutEfforts(["xhigh", "ultra", "unsupported", null]),
    ).toEqual(["xhigh", "ultra", "", "", "", "", "", "", "", ""]);
  });

  test("scopes shortcut effort options to the selected provider model", () => {
    expect(
      listModelShortcutEffortOptions({
        shortcutKey: "claude-code:claude-opus-4-8",
      }).map((option) => option.value),
    ).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(
      listModelShortcutEffortOptions({
        shortcutKey: "codex:gpt-5.6-luna",
      }).map((option) => option.value),
    ).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(
      listModelShortcutEffortOptions({
        shortcutKey: "kiro:auto",
      }).map((option) => option.value),
    ).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(
      listModelShortcutEffortOptions({
        shortcutKey: "cursor:auto",
      }),
    ).toEqual([]);
  });

  test("resolves only supported effort overrides for a shortcut slot", () => {
    expect(
      resolveModelShortcutEffort({
        shortcutKey: "codex:gpt-5.6-luna",
        effort: "max",
      }),
    ).toBe("max");
    expect(
      resolveModelShortcutEffort({
        shortcutKey: "codex:gpt-5.6-luna",
        effort: "ultra",
      }),
    ).toBeUndefined();
    expect(
      findModelShortcutEffort({
        slotIndex: 0,
        shortcutKeys: ["claude-code:claude-opus-4-8"],
        shortcutEfforts: ["xhigh"],
      }),
    ).toBe("xhigh");
  });
});
