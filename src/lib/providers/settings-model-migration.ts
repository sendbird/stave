import {
  DEFAULT_CLAUDE_OPUS_MODEL,
  DEFAULT_CLAUDE_SONNET_1M_MODEL,
  DEFAULT_CLAUDE_SONNET_MODEL,
  resolveDefaultClaudeEffortForModel,
  resolveDefaultCodexEffortForModel,
} from "@/lib/providers/model-catalog";
import { DEFAULT_MODEL_SHORTCUT_KEYS } from "@/lib/providers/model-shortcuts";
import type { TaskPreset } from "@/lib/task-presets";

/**
 * Number of one-time settings migrations this build knows about.
 *
 * A persisted snapshot records the version it was last migrated to. Snapshots
 * written before the field existed read as 0 and receive every migration, so
 * the marker is what lets a migration key on a value ("still on the previous
 * default") without re-firing later if the user deliberately picks that value
 * again.
 */
export const SETTINGS_MODEL_MIGRATION_VERSION = 6;

/**
 * v1 (GPT-6 Astra release) — the per-provider defaults moved from Sonnet 5 to
 * Opus 5 and from GPT-5.6 Terra to GPT-5.6 Sol, the default-effort ladder was
 * re-pitched to run inverse to model strength, and the Alt+1..0 seed gained
 * both frontier models. Defaults only seed a fresh install, so without this an
 * existing user would sit on the previous ones indefinitely.
 *
 * Every rule below matches the *exact* previous seed and nothing else: a user
 * who chose another model, or who edited a shortcut slot or preset, made a
 * deliberate choice and is left untouched.
 */
// Frozen literal. Importing the live Sonnet constant here would make v1 treat
// Sonnet 5.5 as the pre-Opus default and skip users who are still on Sonnet 5.
const PREVIOUS_CLAUDE_DEFAULT_MODEL = "claude-sonnet-5";
const PREVIOUS_CODEX_DEFAULT_MODEL = "gpt-5.6-terra";

const PREVIOUS_MODEL_SHORTCUT_KEYS: readonly string[] = [
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

/**
 * Per-model default efforts as they stood *before* the Astra release, frozen
 * here because the migration has to recognize "still on the old default" after
 * the live resolvers have already moved on. Claude mirrored the old substring
 * rule (Fable/Opus xhigh, Sonnet high, everything else medium); every Codex
 * model in the picker defaulted to xhigh.
 */
function previousDefaultClaudeEffort(model: string) {
  const normalized = model.trim().toLowerCase();
  if (normalized.includes("fable") || normalized.includes("opus")) {
    return "xhigh";
  }
  if (normalized.includes("sonnet")) {
    return "high";
  }
  return "medium";
}

/**
 * Only the models that actually shipped in the pre-Astra Codex picker had a
 * "previous default" to recognize. Returning a guess for anything else made
 * the migration claim a deliberate choice was a stale default: a user already
 * on `gpt-6-astra` at "medium" matched the invented `"medium"` guess and had
 * their effort overwritten by whatever `resolveDefaultCodexEffortForModel`
 * returned — which, once the App Server catalog primed the dynamic registry,
 * could be "low". `undefined` never equals a trimmed string, so an unknown
 * model is now always left alone.
 */
const PREVIOUS_CODEX_PICKER_MODELS: readonly string[] = [
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.5",
];

function previousDefaultCodexEffort(model: string): string | undefined {
  const normalized = model.trim().toLowerCase();
  return PREVIOUS_CODEX_PICKER_MODELS.includes(normalized)
    ? "xhigh"
    : undefined;
}

/** The seeded Codex task preset as it shipped before the Astra release. */
const PREVIOUS_CODEX_TASK_PRESET = {
  id: "default-gpt-5-6-task",
  label: "GPT-5.6",
  kind: "task",
  provider: "codex",
  model: PREVIOUS_CODEX_DEFAULT_MODEL,
} as const;

export interface SettingsModelMigrationInput {
  /**
   * Version read from the persisted snapshot *before* it is merged with
   * `defaultSettings`. A snapshot that predates the field must arrive here as
   * `undefined`, otherwise the merge would hand it the current version and
   * silently skip every existing user.
   */
  fromVersion?: number | null;
  modelClaude: string;
  modelCodex: string;
  claudeEffort: string;
  codexReasoningEffort: string;
  modelShortcutKeys: readonly string[];
  taskPresets: readonly TaskPreset[];
}

export interface SettingsModelMigrationResult {
  version: number;
  changed: boolean;
  modelClaude: string;
  modelCodex: string;
  claudeEffort: string;
  codexReasoningEffort: string;
  modelShortcutKeys: string[];
  taskPresets: TaskPreset[];
}

function isUntouchedPreviousShortcutSeed(keys: readonly string[]) {
  return (
    keys.length === PREVIOUS_MODEL_SHORTCUT_KEYS.length &&
    keys.every((key, index) => key === PREVIOUS_MODEL_SHORTCUT_KEYS[index])
  );
}

function isUntouchedPreviousCodexPreset(preset: TaskPreset) {
  return (
    preset.id === PREVIOUS_CODEX_TASK_PRESET.id &&
    preset.label === PREVIOUS_CODEX_TASK_PRESET.label &&
    preset.kind === PREVIOUS_CODEX_TASK_PRESET.kind &&
    preset.provider === PREVIOUS_CODEX_TASK_PRESET.provider &&
    preset.model === PREVIOUS_CODEX_TASK_PRESET.model
  );
}

/**
 * Applies every pending one-time model-default migration to a persisted
 * settings snapshot. Safe to call on every load: once the snapshot's version
 * has caught up with this build it returns the input unchanged.
 */
function migrateV1(
  input: SettingsModelMigrationInput,
): SettingsModelMigrationResult {
  const fromVersion = Math.max(0, Math.trunc(input.fromVersion ?? 0));
  if (fromVersion >= 1) {
    return {
      version: 1,
      changed: false,
      modelClaude: input.modelClaude,
      modelCodex: input.modelCodex,
      claudeEffort: input.claudeEffort,
      codexReasoningEffort: input.codexReasoningEffort,
      modelShortcutKeys: [...input.modelShortcutKeys],
      taskPresets: [...input.taskPresets],
    };
  }

  const nextClaudeDefault = "claude-opus-5";
  const nextCodexDefault = "gpt-5.6-sol";

  const modelClaude =
    input.modelClaude.trim() === PREVIOUS_CLAUDE_DEFAULT_MODEL
      ? nextClaudeDefault
      : input.modelClaude;
  const modelCodex =
    input.modelCodex.trim() === PREVIOUS_CODEX_DEFAULT_MODEL
      ? nextCodexDefault
      : input.modelCodex;

  // The effort ladder was re-pitched in the same release, so a stored effort
  // that still matches the *old* model's old default follows its model to the
  // new default — the same rule `resolveClaudeEffortForModelSwitch` applies to
  // an interactive model switch. An effort the user actually tuned is kept.
  const claudeEffort =
    input.claudeEffort.trim() === previousDefaultClaudeEffort(input.modelClaude)
      ? resolveDefaultClaudeEffortForModel({ model: modelClaude })
      : input.claudeEffort;
  const codexReasoningEffort =
    input.codexReasoningEffort.trim() ===
    previousDefaultCodexEffort(input.modelCodex)
      ? resolveDefaultCodexEffortForModel({ model: modelCodex })
      : input.codexReasoningEffort;

  const shortcutsWereUntouched = isUntouchedPreviousShortcutSeed(
    input.modelShortcutKeys,
  );
  const modelShortcutKeys = shortcutsWereUntouched
    ? [...V1_MODEL_SHORTCUT_KEYS]
    : [...input.modelShortcutKeys];

  let presetsChanged = false;
  const taskPresets = input.taskPresets.map((preset) => {
    if (!isUntouchedPreviousCodexPreset(preset)) {
      return preset;
    }
    presetsChanged = true;
    return { ...preset, model: nextCodexDefault };
  });

  return {
    version: 1,
    changed:
      modelClaude !== input.modelClaude ||
      modelCodex !== input.modelCodex ||
      claudeEffort !== input.claudeEffort ||
      codexReasoningEffort !== input.codexReasoningEffort ||
      shortcutsWereUntouched ||
      presetsChanged,
    modelClaude,
    modelCodex,
    claudeEffort,
    codexReasoningEffort,
    modelShortcutKeys,
    taskPresets,
  };
}

// Freeze historical seeds: importing live defaults into old migrations makes
// customized settings indistinguishable from an untouched seed on later loads.
const V1_MODEL_SHORTCUT_KEYS = [
  "claude-code:claude-opus-5",
  "codex:gpt-5.6-sol",
  "claude-code:claude-fable-5-1",
  "codex:gpt-6-astra",
  "",
  "",
  "",
  "",
  "",
  "",
];

const SOL_6_MODEL_SHORTCUT_KEYS = [
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
];

export function migrateSettingsModelDefaults(
  input: SettingsModelMigrationInput,
): SettingsModelMigrationResult {
  const fromVersion = Math.max(0, Math.trunc(input.fromVersion ?? 0));
  const result = migrateV1(input);
  if (fromVersion >= SETTINGS_MODEL_MIGRATION_VERSION) {
    return { ...result, version: SETTINGS_MODEL_MIGRATION_VERSION };
  }
  if (fromVersion < 5) {
    if (result.modelClaude === "claude-opus-5") {
      result.modelClaude = DEFAULT_CLAUDE_OPUS_MODEL;
      if (result.claudeEffort === "high") {
        result.claudeEffort = "medium";
      }
      result.changed = true;
    }
    if (result.modelCodex === "gpt-5.6-sol") {
      result.modelCodex = "gpt-6-sol";
      if (result.codexReasoningEffort === "high") {
        result.codexReasoningEffort = "medium";
      }
      result.changed = true;
    }
    if (
      result.modelShortcutKeys.length === V1_MODEL_SHORTCUT_KEYS.length &&
      result.modelShortcutKeys.every(
        (key, index) => key === V1_MODEL_SHORTCUT_KEYS[index],
      )
    ) {
      result.modelShortcutKeys = [...DEFAULT_MODEL_SHORTCUT_KEYS];
      result.changed = true;
    }
    result.taskPresets = result.taskPresets.map((preset) => {
      if (preset.kind !== "task" || preset.effort) return preset;
      if (
        preset.id === "default-claude-opus-5-task" &&
        preset.provider === "claude-code" &&
        preset.label === "Opus 5" &&
        preset.model === "claude-opus-5"
      ) {
        result.changed = true;
        return { ...preset, model: DEFAULT_CLAUDE_OPUS_MODEL, label: "Opus 5.5" };
      }
      if (
        preset.id === "default-gpt-5-6-task" &&
        preset.provider === "codex" &&
        preset.label === "GPT-5.6" &&
        preset.model === "gpt-5.6-sol"
      ) {
        result.changed = true;
        return { ...preset, model: "gpt-6-sol", label: "GPT-6 Sol" };
      }
      return preset;
    });
    applySonnet55Migration(result);
    applySolHighEffortMigration(result);
    applyLunaTerraEffortMigration(result);
  }
  applySol61Migration(result);
  return { ...result, version: SETTINGS_MODEL_MIGRATION_VERSION };
}

const SONNET_5_TO_55: Readonly<Record<string, string>> = {
  "claude-sonnet-5": DEFAULT_CLAUDE_SONNET_MODEL,
  "claude-sonnet-5[1m]": DEFAULT_CLAUDE_SONNET_1M_MODEL,
};

/**
 * v3 — Sonnet 5.5 replaces Sonnet 5 on the balanced rung. A selected Sonnet 5
 * id moves to the matching 5.5 id. Effort is left alone: high is the default
 * for both. Runs once, so a later deliberate Sonnet 5 pin is left alone.
 * Opus selections are untouched.
 */
function applySonnet55Migration(result: SettingsModelMigrationResult) {
  const previousModel = result.modelClaude.trim();
  const upgradedModel = SONNET_5_TO_55[previousModel];
  if (upgradedModel) {
    result.modelClaude = upgradedModel;
    result.changed = true;
  }
  let shortcutsChanged = false;
  result.modelShortcutKeys = result.modelShortcutKeys.map((key) => {
    const next = upgradeSonnet5ShortcutKey(key);
    if (next !== key) {
      shortcutsChanged = true;
    }
    return next;
  });
  if (shortcutsChanged) {
    result.changed = true;
  }

  result.taskPresets = result.taskPresets.map((preset) => {
    if (preset.provider !== "claude-code" || typeof preset.model !== "string") {
      return preset;
    }
    const nextModel = SONNET_5_TO_55[preset.model.trim()];
    if (!nextModel) {
      return preset;
    }
    result.changed = true;
    return { ...preset, model: nextModel };
  });
}

/**
 * v4 — GPT-6 Sol's composer default moves from medium to high. Only a stored
 * medium on that model moves. A tuned effort, and medium on any other model,
 * stays. Runs once.
 */
function applySolHighEffortMigration(result: SettingsModelMigrationResult) {
  if (
    result.modelCodex.trim() === "gpt-6-sol" &&
    result.codexReasoningEffort.trim() === "medium"
  ) {
    result.codexReasoningEffort = "high";
    result.changed = true;
  }
}

const LUNA_EFFORT_MODELS = new Set(["gpt-6-luna", "gpt-5.6-luna"]);

/**
 * v6 — GPT-6.1 Sol replaces GPT-6 Sol as the Codex default. A selected
 * GPT-6 Sol moves to GPT-6.1 Sol. Effort stays, including Sol 6's default
 * (`high`). The untouched shortcut seed and the seeded Sol preset move with
 * it. Runs once.
 */
function applySol61Migration(result: SettingsModelMigrationResult) {
  if (result.modelCodex.trim() === "gpt-6-sol") {
    result.modelCodex = "gpt-6.1-sol";
    result.changed = true;
  }
  if (
    result.modelShortcutKeys.length === SOL_6_MODEL_SHORTCUT_KEYS.length &&
    result.modelShortcutKeys.every(
      (key, index) => key === SOL_6_MODEL_SHORTCUT_KEYS[index],
    )
  ) {
    result.modelShortcutKeys = [...DEFAULT_MODEL_SHORTCUT_KEYS];
    result.changed = true;
  }
  result.taskPresets = result.taskPresets.map((preset) => {
    if (preset.kind !== "task" || preset.effort) return preset;
    if (
      preset.id === "default-gpt-5-6-task" &&
      preset.provider === "codex" &&
      preset.label === "GPT-6 Sol" &&
      preset.model === "gpt-6-sol"
    ) {
      result.changed = true;
      return { ...preset, model: "gpt-6.1-sol", label: "GPT-6.1 Sol" };
    }
    return preset;
  });
}

/**
 * v5 — Luna's composer default moves from medium to xhigh, and Terra's moves
 * from high to xhigh. Only the old default on that model moves. A tuned
 * effort stays. Runs once.
 */
function applyLunaTerraEffortMigration(result: SettingsModelMigrationResult) {
  const model = result.modelCodex.trim();
  const effort = result.codexReasoningEffort.trim();
  if (LUNA_EFFORT_MODELS.has(model) && effort === "medium") {
    result.codexReasoningEffort = "xhigh";
    result.changed = true;
    return;
  }
  if (model === "gpt-5.6-terra" && effort === "high") {
    result.codexReasoningEffort = "xhigh";
    result.changed = true;
  }
}

function upgradeSonnet5ShortcutKey(key: string) {
  const prefix = "claude-code:";
  if (!key.startsWith(prefix)) {
    return key;
  }
  const nextModel = SONNET_5_TO_55[key.slice(prefix.length)];
  return nextModel ? `${prefix}${nextModel}` : key;
}
