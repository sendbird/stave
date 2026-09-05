import { describe, expect, test } from "bun:test";
import { DEFAULT_MODEL_SHORTCUT_KEYS } from "@/lib/providers/model-shortcuts";
import {
  migrateSettingsModelDefaults,
  SETTINGS_MODEL_MIGRATION_VERSION,
} from "@/lib/providers/settings-model-migration";
import type { TaskPreset } from "@/lib/task-presets";

const PREVIOUS_SHORTCUT_KEYS = [
  "claude-code:claude-opus-5",
  "codex:gpt-5.6-terra",
  "codex:gpt-5.6-sol",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
];

const PREVIOUS_CODEX_PRESET: TaskPreset = {
  id: "default-gpt-5-6-task",
  label: "GPT-5.6",
  kind: "task",
  provider: "codex",
  model: "gpt-5.6-terra",
};

function preMigrationSnapshot(overrides?: {
  modelClaude?: string;
  modelCodex?: string;
  claudeEffort?: string;
  codexReasoningEffort?: string;
  modelShortcutKeys?: string[];
  taskPresets?: TaskPreset[];
}) {
  return {
    fromVersion: undefined,
    modelClaude: overrides?.modelClaude ?? "claude-sonnet-5",
    modelCodex: overrides?.modelCodex ?? "gpt-5.6-terra",
    // The old per-model defaults for the old default models.
    claudeEffort: overrides?.claudeEffort ?? "high",
    codexReasoningEffort: overrides?.codexReasoningEffort ?? "xhigh",
    modelShortcutKeys: overrides?.modelShortcutKeys ?? [
      ...PREVIOUS_SHORTCUT_KEYS,
    ],
    taskPresets: overrides?.taskPresets ?? [{ ...PREVIOUS_CODEX_PRESET }],
  };
}

describe("settings model default migration", () => {
  test("moves an existing user off the previous per-provider defaults", () => {
    const result = migrateSettingsModelDefaults(preMigrationSnapshot());

    expect(result.changed).toBe(true);
    expect(result.modelClaude).toBe("claude-opus-5");
    expect(result.modelCodex).toBe("gpt-5.6-sol");
    expect(result.version).toBe(SETTINGS_MODEL_MIGRATION_VERSION);
  });

  test("replaces an untouched Alt+1..0 seed with the new one", () => {
    const result = migrateSettingsModelDefaults(preMigrationSnapshot());

    expect(result.modelShortcutKeys).toEqual([...DEFAULT_MODEL_SHORTCUT_KEYS]);
    expect(result.modelShortcutKeys.slice(0, 4)).toEqual([
      "claude-code:claude-opus-5",
      "codex:gpt-5.6-sol",
      "claude-code:claude-fable-5-1",
      "codex:gpt-6-astra",
    ]);
  });

  test("retargets the untouched seeded Codex preset", () => {
    const result = migrateSettingsModelDefaults(preMigrationSnapshot());

    expect(result.taskPresets[0]).toMatchObject({
      id: "default-gpt-5-6-task",
      model: "gpt-5.6-sol",
    });
  });

  test("carries an untuned effort onto the new ladder", () => {
    // Sonnet@high and Terra@xhigh were both the old per-model defaults, so
    // they follow their model to Opus 5 and Sol at the new default rung.
    const result = migrateSettingsModelDefaults(preMigrationSnapshot());

    expect(result.claudeEffort).toBe("high");
    expect(result.codexReasoningEffort).toBe("high");
  });

  test("re-pitches an untuned effort even when the model does not move", () => {
    // A user parked on Luna at its old default (xhigh) lands on the new one.
    const result = migrateSettingsModelDefaults(
      preMigrationSnapshot({
        modelCodex: "gpt-5.6-luna",
        codexReasoningEffort: "xhigh",
      }),
    );

    expect(result.modelCodex).toBe("gpt-5.6-luna");
    expect(result.codexReasoningEffort).toBe("max");
  });

  test("keeps an effort the user actually tuned", () => {
    const result = migrateSettingsModelDefaults(
      preMigrationSnapshot({
        claudeEffort: "low",
        codexReasoningEffort: "ultra",
      }),
    );

    expect(result.claudeEffort).toBe("low");
    expect(result.codexReasoningEffort).toBe("ultra");
  });

  test("leaves a deliberately chosen model alone", () => {
    const result = migrateSettingsModelDefaults(
      preMigrationSnapshot({
        modelClaude: "claude-haiku-4-5",
        modelCodex: "gpt-5.6-luna",
      }),
    );

    expect(result.modelClaude).toBe("claude-haiku-4-5");
    expect(result.modelCodex).toBe("gpt-5.6-luna");
  });

  test("leaves customized shortcut slots and presets alone", () => {
    const customShortcuts = [...PREVIOUS_SHORTCUT_KEYS];
    customShortcuts[1] = "codex:gpt-5.6-luna";
    const customPreset: TaskPreset = {
      ...PREVIOUS_CODEX_PRESET,
      label: "My Codex",
    };

    const result = migrateSettingsModelDefaults(
      preMigrationSnapshot({
        modelShortcutKeys: customShortcuts,
        taskPresets: [customPreset],
      }),
    );

    expect(result.modelShortcutKeys).toEqual(customShortcuts);
    expect(result.taskPresets[0]).toEqual(customPreset);
  });

  test("does not re-fire once the snapshot records the current version", () => {
    // The whole point of the version marker: a user who deliberately picks the
    // old default after migrating must keep it across restarts.
    const result = migrateSettingsModelDefaults({
      ...preMigrationSnapshot(),
      fromVersion: SETTINGS_MODEL_MIGRATION_VERSION,
    });

    expect(result.changed).toBe(false);
    expect(result.modelClaude).toBe("claude-sonnet-5");
    expect(result.modelCodex).toBe("gpt-5.6-terra");
    expect(result.claudeEffort).toBe("high");
    expect(result.codexReasoningEffort).toBe("xhigh");
    expect(result.modelShortcutKeys).toEqual(PREVIOUS_SHORTCUT_KEYS);
    expect(result.taskPresets[0]).toEqual(PREVIOUS_CODEX_PRESET);
  });

  test("treats a fresh install as already migrated", () => {
    const result = migrateSettingsModelDefaults({
      fromVersion: SETTINGS_MODEL_MIGRATION_VERSION,
      modelClaude: "claude-opus-5",
      modelCodex: "gpt-5.6-sol",
      claudeEffort: "high",
      codexReasoningEffort: "high",
      modelShortcutKeys: [...DEFAULT_MODEL_SHORTCUT_KEYS],
      taskPresets: [],
    });

    expect(result.changed).toBe(false);
  });
});
