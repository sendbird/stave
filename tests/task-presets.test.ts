import { describe, expect, test } from "bun:test";
import {
  cloneDefaultTaskPresets,
  DEFAULT_TASK_PRESETS,
  getTaskPresetShortcutLabel,
  listModelsForPresetProvider,
  normalizePersistedTaskPresets,
  normalizeTaskPreset,
  resolveTaskPresetShortcutSlot,
  type TaskPreset,
} from "@/lib/task-presets";

describe("task preset defaults", () => {
  test("seeds five presets with the expected kinds", () => {
    const presets = cloneDefaultTaskPresets();
    expect(presets).toHaveLength(5);
    expect(presets.map((preset) => preset.id)).toEqual([
      "default-claude-opus-4-7-task",
      "default-gpt-5-4-task",
      "default-stave-auto-task",
      "default-claude-cli-session",
      "default-codex-cli-session",
    ]);
    expect(presets.filter((preset) => preset.kind === "task")).toHaveLength(3);
    expect(
      presets.filter((preset) => preset.kind === "cli-session"),
    ).toHaveLength(2);
  });

  test("clone returns a structurally new array that doesn't mutate the constant", () => {
    const cloned = cloneDefaultTaskPresets();
    cloned.push({
      id: "extra",
      label: "Extra",
      kind: "task",
      provider: "codex",
      model: "gpt-5.4",
    });
    expect(DEFAULT_TASK_PRESETS).toHaveLength(5);
  });
});

describe("normalizeTaskPreset", () => {
  test("fills defaults for a blank task preset input", () => {
    const preset = normalizeTaskPreset({});
    expect(preset.kind).toBe("task");
    expect(preset.provider).toBe("claude-code");
    expect(preset.model).toBeDefined();
    expect(preset.label.length).toBeGreaterThan(0);
    expect(preset.id.length).toBeGreaterThan(0);
  });

  test("forces stave provider to claude-code for CLI session presets", () => {
    const preset = normalizeTaskPreset({
      kind: "cli-session",
      provider: "stave",
    });
    expect(preset.kind).toBe("cli-session");
    expect(preset.provider).toBe("claude-code");
    expect(preset.model).toBeUndefined();
    expect(preset.contextMode).toBe("workspace");
  });

  test("falls back to provider default model when model is unknown", () => {
    const preset = normalizeTaskPreset({
      kind: "task",
      provider: "codex",
      model: "nonexistent-model",
    });
    expect(preset.provider).toBe("codex");
    expect(listModelsForPresetProvider("codex")).toContain(preset.model!);
  });

  test("keeps a valid user-supplied model", () => {
    const preset = normalizeTaskPreset({
      kind: "task",
      provider: "claude-code",
      model: "claude-opus-4-7",
      label: "Opus 4.7",
    });
    expect(preset.model).toBe("claude-opus-4-7");
    expect(preset.label).toBe("Opus 4.7");
  });
});

describe("normalizePersistedTaskPresets", () => {
  test("returns defaults for non-array input", () => {
    expect(normalizePersistedTaskPresets(undefined)).toHaveLength(5);
    expect(normalizePersistedTaskPresets(null)).toHaveLength(5);
    expect(normalizePersistedTaskPresets({})).toHaveLength(5);
  });

  test("returns an empty list when an empty array is persisted", () => {
    expect(normalizePersistedTaskPresets([])).toEqual([]);
  });

  test("drops non-object entries and regenerates duplicate ids", () => {
    const input: unknown[] = [
      { id: "alpha", kind: "task", provider: "claude-code", label: "A" },
      null,
      "string",
      { id: "alpha", kind: "task", provider: "codex", label: "B" },
    ];
    const result = normalizePersistedTaskPresets(input);
    expect(result).toHaveLength(2);
    const [first, second] = result as TaskPreset[];
    expect(first.id).toBe("alpha");
    expect(second.id).not.toBe("alpha");
    expect(second.label).toBe("B");
  });
});

describe("preset shortcuts", () => {
  test("maps Ctrl+1..9 to the first nine preset slots", () => {
    expect(
      resolveTaskPresetShortcutSlot({
        key: "1",
        code: "Digit1",
        ctrlKey: true,
      }),
    ).toBe(0);
    expect(
      resolveTaskPresetShortcutSlot({
        key: "9",
        code: "Digit9",
        ctrlKey: true,
      }),
    ).toBe(8);
  });

  test("ignores non-control shortcuts and modifier collisions", () => {
    expect(
      resolveTaskPresetShortcutSlot({
        key: "1",
        code: "Digit1",
        metaKey: true,
      }),
    ).toBeNull();
    expect(
      resolveTaskPresetShortcutSlot({
        key: "1",
        code: "Digit1",
        ctrlKey: true,
        shiftKey: true,
      }),
    ).toBeNull();
    expect(
      resolveTaskPresetShortcutSlot({
        key: "0",
        code: "Digit0",
        ctrlKey: true,
      }),
    ).toBeNull();
  });

  test("returns human-readable labels for the first nine slots", () => {
    expect(getTaskPresetShortcutLabel(0)).toBe("1");
    expect(getTaskPresetShortcutLabel(8)).toBe("9");
    expect(getTaskPresetShortcutLabel(9)).toBeNull();
  });
});
