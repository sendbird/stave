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
    expect(result.modelClaude).toBe("claude-opus-5-5");
    expect(result.modelCodex).toBe("gpt-6.1-sol");
    expect(result.version).toBe(SETTINGS_MODEL_MIGRATION_VERSION);
  });

  test("replaces an untouched Alt+1..0 seed with the new one", () => {
    const result = migrateSettingsModelDefaults(preMigrationSnapshot());

    expect(result.modelShortcutKeys).toEqual([...DEFAULT_MODEL_SHORTCUT_KEYS]);
    expect(result.modelShortcutKeys.slice(0, 4)).toEqual([
      "claude-code:claude-opus-5-5",
      "codex:gpt-6.1-sol",
      "claude-code:claude-fable-5-1",
      "codex:gpt-6-astra",
    ]);
  });

  test("retargets the untouched seeded Codex preset", () => {
    const result = migrateSettingsModelDefaults(preMigrationSnapshot());

    expect(result.taskPresets[0]).toMatchObject({
      id: "default-gpt-5-6-task",
      model: "gpt-6.1-sol",
    });
  });

  test("carries an untuned effort onto the new ladder", () => {
    // Sonnet@high and Terra@xhigh were both the old per-model defaults, so
    // they follow their model to Opus 5.5 at medium and GPT-6.1 Sol at high.
    const result = migrateSettingsModelDefaults(preMigrationSnapshot());

    expect(result.claudeEffort).toBe("medium");
    expect(result.codexReasoningEffort).toBe("high");
  });

  test("re-pitches an untuned effort even when the model does not move", () => {
    // A user parked on Luna at its old default (xhigh) lands on Stave's
    // current Luna default.
    const result = migrateSettingsModelDefaults(
      preMigrationSnapshot({
        modelCodex: "gpt-5.6-luna",
        codexReasoningEffort: "xhigh",
      }),
    );

    expect(result.modelCodex).toBe("gpt-5.6-luna");
    expect(result.codexReasoningEffort).toBe("xhigh");
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

  // Regression: "Astra effort keeps resetting to low".
  //
  // `previousDefaultCodexEffort` used to guess "medium" for every model that
  // was not `gpt-5.*`, so a user already on `gpt-6-astra` at "medium" looked
  // like they were sitting on a stale default. The migration then replaced it
  // with `resolveDefaultCodexEffortForModel`, which reads the dynamic registry
  // primed from the App Server `model/list` — landing on "low" whenever the
  // installed Codex binary recommended it. Astra was never in the pre-Astra
  // picker, so it has no previous default to migrate away from.
  test("leaves a deliberately chosen Astra effort alone", () => {
    for (const effort of ["low", "medium", "high", "xhigh", "max", "ultra"]) {
      const result = migrateSettingsModelDefaults(
        preMigrationSnapshot({
          modelCodex: "gpt-6-astra",
          codexReasoningEffort: effort,
        }),
      );

      expect(result.modelCodex).toBe("gpt-6-astra");
      expect(result.codexReasoningEffort).toBe(effort);
    }
  });

  test("still retargets the effort of a model that was in the old picker", () => {
    // Terra at the old "xhigh" default follows its model to Sol 6.1 at high.
    const result = migrateSettingsModelDefaults(
      preMigrationSnapshot({
        modelCodex: "gpt-5.6-terra",
        codexReasoningEffort: "xhigh",
      }),
    );

    expect(result.modelCodex).toBe("gpt-6.1-sol");
    expect(result.codexReasoningEffort).toBe("high");
  });

  test("keeps a tuned effort on a model that was in the old picker", () => {
    const result = migrateSettingsModelDefaults(
      preMigrationSnapshot({
        modelCodex: "gpt-5.6-luna",
        codexReasoningEffort: "max",
      }),
    );

    expect(result.codexReasoningEffort).toBe("max");
  });
});


describe("September model migration", () => {
  test("updates v1 defaults once and preserves explicit effort and custom presets", () => {
    const input = {
      ...preMigrationSnapshot(), fromVersion: 1,
      modelClaude: "claude-opus-5", modelCodex: "gpt-5.6-sol",
      claudeEffort: "xhigh", codexReasoningEffort: "max",
      modelShortcutKeys: ["claude-code:claude-opus-5", "codex:gpt-5.6-sol",
        "claude-code:claude-fable-5-1", "codex:gpt-6-astra", "", "", "", "", "", ""],
      taskPresets: [
        { ...PREVIOUS_CODEX_PRESET, model: "gpt-5.6-sol" },
        { ...PREVIOUS_CODEX_PRESET, id: "custom", model: "gpt-5.6-sol" },
      ],
    };
    const result = migrateSettingsModelDefaults(input);
    expect(result.modelClaude).toBe("claude-opus-5-5");
    expect(result.modelCodex).toBe("gpt-6.1-sol");
    expect(result.claudeEffort).toBe("xhigh");
    expect(result.codexReasoningEffort).toBe("max");
    expect(result.modelShortcutKeys).toEqual([...DEFAULT_MODEL_SHORTCUT_KEYS]);
    expect(result.taskPresets[0]).toMatchObject({ model: "gpt-6.1-sol", label: "GPT-6.1 Sol" });
    expect(result.taskPresets[1]).toEqual(input.taskPresets[1]);
    const again = migrateSettingsModelDefaults({ ...result, fromVersion: result.version,
      modelCodex: "gpt-5.6-sol", modelClaude: "claude-opus-5" });
    expect(again.changed).toBe(false);
    expect(again.modelCodex).toBe("gpt-5.6-sol");
    expect(again.modelClaude).toBe("claude-opus-5");
  });
});

describe("Sonnet 5.5 migration", () => {
  test("moves a selected Sonnet 5 to Sonnet 5.5 and keeps high effort", () => {
    const result = migrateSettingsModelDefaults({
      ...preMigrationSnapshot({
        modelClaude: "claude-sonnet-5",
        claudeEffort: "high",
        modelShortcutKeys: [
          "claude-code:claude-sonnet-5",
          "claude-code:claude-sonnet-5[1m]",
          "codex:gpt-6-sol",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
        ],
        taskPresets: [
          {
            id: "sonnet-task",
            label: "Sonnet",
            kind: "task",
            provider: "claude-code",
            model: "claude-sonnet-5",
          },
        ],
      }),
      fromVersion: 2,
    });

    expect(result.changed).toBe(true);
    expect(result.version).toBe(SETTINGS_MODEL_MIGRATION_VERSION);
    expect(result.modelClaude).toBe("claude-sonnet-5-5");
    expect(result.claudeEffort).toBe("high");
    expect(result.modelShortcutKeys.slice(0, 2)).toEqual([
      "claude-code:claude-sonnet-5-5",
      "claude-code:claude-sonnet-5-5[1m]",
    ]);
    expect(result.taskPresets[0]).toMatchObject({ model: "claude-sonnet-5-5" });
  });

  test("keeps a tuned Sonnet effort and leaves Opus at high alone", () => {
    const tuned = migrateSettingsModelDefaults({
      ...preMigrationSnapshot({
        modelClaude: "claude-sonnet-5[1m]",
        claudeEffort: "max",
      }),
      fromVersion: 2,
    });
    expect(tuned.modelClaude).toBe("claude-sonnet-5-5[1m]");
    expect(tuned.claudeEffort).toBe("max");

    const opus = migrateSettingsModelDefaults({
      ...preMigrationSnapshot({
        modelClaude: "claude-opus-5-5",
        claudeEffort: "high",
      }),
      fromVersion: 2,
    });
    expect(opus.modelClaude).toBe("claude-opus-5-5");
    expect(opus.claudeEffort).toBe("high");
    expect(opus.changed).toBe(false);
  });
});

describe("GPT-6 Sol effort migration", () => {
  function settled(overrides: {
    modelCodex: string;
    codexReasoningEffort: string;
  }) {
    return migrateSettingsModelDefaults({
      fromVersion: 3,
      modelClaude: "claude-opus-5-5",
      modelCodex: overrides.modelCodex,
      claudeEffort: "medium",
      codexReasoningEffort: overrides.codexReasoningEffort,
      modelShortcutKeys: [...DEFAULT_MODEL_SHORTCUT_KEYS],
      taskPresets: [],
    });
  }

  test("moves Sol off the old medium default and leaves a tuned effort", () => {
    const raised = settled({
      modelCodex: "gpt-6-sol",
      codexReasoningEffort: "medium",
    });
    expect(raised.changed).toBe(true);
    expect(raised.version).toBe(SETTINGS_MODEL_MIGRATION_VERSION);
    expect(raised.modelCodex).toBe("gpt-6.1-sol");
    expect(raised.codexReasoningEffort).toBe("high");

    const tuned = settled({
      modelCodex: "gpt-6-sol",
      codexReasoningEffort: "low",
    });
    expect(tuned.modelCodex).toBe("gpt-6.1-sol");
    expect(tuned.codexReasoningEffort).toBe("low");
    expect(tuned.changed).toBe(true);

    const astra = settled({
      modelCodex: "gpt-6-astra",
      codexReasoningEffort: "medium",
    });
    expect(astra.modelCodex).toBe("gpt-6-astra");
    expect(astra.codexReasoningEffort).toBe("medium");
    expect(astra.changed).toBe(false);
  });
});

describe("Luna and Terra effort migration", () => {
  function settled(overrides: {
    modelCodex: string;
    codexReasoningEffort: string;
  }) {
    return migrateSettingsModelDefaults({
      fromVersion: 4,
      modelClaude: "claude-opus-5-5",
      modelCodex: overrides.modelCodex,
      claudeEffort: "medium",
      codexReasoningEffort: overrides.codexReasoningEffort,
      modelShortcutKeys: [...DEFAULT_MODEL_SHORTCUT_KEYS],
      taskPresets: [],
    });
  }

  test("moves Luna off medium and Terra off high, and leaves a tuned effort", () => {
    const luna = settled({
      modelCodex: "gpt-6-luna",
      codexReasoningEffort: "medium",
    });
    expect(luna.changed).toBe(true);
    expect(luna.codexReasoningEffort).toBe("xhigh");

    const previousLuna = settled({
      modelCodex: "gpt-5.6-luna",
      codexReasoningEffort: "medium",
    });
    expect(previousLuna.codexReasoningEffort).toBe("xhigh");

    const terra = settled({
      modelCodex: "gpt-5.6-terra",
      codexReasoningEffort: "high",
    });
    expect(terra.changed).toBe(true);
    expect(terra.codexReasoningEffort).toBe("xhigh");

    const tunedLuna = settled({
      modelCodex: "gpt-6-luna",
      codexReasoningEffort: "low",
    });
    expect(tunedLuna.codexReasoningEffort).toBe("low");
    expect(tunedLuna.changed).toBe(false);

    const tunedTerra = settled({
      modelCodex: "gpt-5.6-terra",
      codexReasoningEffort: "max",
    });
    expect(tunedTerra.codexReasoningEffort).toBe("max");
    expect(tunedTerra.changed).toBe(false);
  });
});

describe("GPT-6.1 Sol migration", () => {
  test("moves a selected GPT-6 Sol to GPT-6.1 Sol once", () => {
    const moved = migrateSettingsModelDefaults({
      fromVersion: 5,
      modelClaude: "claude-opus-5-5",
      modelCodex: "gpt-6-sol",
      claudeEffort: "medium",
      codexReasoningEffort: "high",
      modelShortcutKeys: [
        "claude-code:claude-opus-5-5",
        "codex:gpt-6-sol",
        "claude-code:claude-fable-5-1",
        "codex:gpt-6-astra",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
      taskPresets: [
        {
          id: "default-gpt-5-6-task",
          label: "GPT-6 Sol",
          kind: "task",
          provider: "codex",
          model: "gpt-6-sol",
        },
      ],
    });
    expect(moved.changed).toBe(true);
    expect(moved.version).toBe(SETTINGS_MODEL_MIGRATION_VERSION);
    expect(moved.modelCodex).toBe("gpt-6.1-sol");
    expect(moved.codexReasoningEffort).toBe("high");
    expect(moved.modelShortcutKeys[1]).toBe("codex:gpt-6.1-sol");
    expect(moved.taskPresets[0]).toMatchObject({
      model: "gpt-6.1-sol",
      label: "GPT-6.1 Sol",
    });

    const tuned = migrateSettingsModelDefaults({
      fromVersion: 5,
      modelClaude: "claude-opus-5-5",
      modelCodex: "gpt-6-sol",
      claudeEffort: "medium",
      codexReasoningEffort: "ultra",
      modelShortcutKeys: ["codex:gpt-6-astra"],
      taskPresets: [],
    });
    expect(tuned.modelCodex).toBe("gpt-6.1-sol");
    expect(tuned.codexReasoningEffort).toBe("ultra");

    const again = migrateSettingsModelDefaults({
      ...moved,
      fromVersion: moved.version,
      modelCodex: "gpt-6-sol",
      codexReasoningEffort: "high",
    });
    expect(again.changed).toBe(false);
    expect(again.modelCodex).toBe("gpt-6-sol");
    expect(again.codexReasoningEffort).toBe("high");
  });
});
