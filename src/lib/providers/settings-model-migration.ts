import {
  DEFAULT_CLAUDE_OPUS_MODEL,
  DEFAULT_CLAUDE_SONNET_MODEL,
  getDefaultModelForProvider,
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
export const SETTINGS_MODEL_MIGRATION_VERSION = 1;

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
const PREVIOUS_CLAUDE_DEFAULT_MODEL = DEFAULT_CLAUDE_SONNET_MODEL;
const PREVIOUS_CODEX_DEFAULT_MODEL = "gpt-5.6-terra";

const PREVIOUS_MODEL_SHORTCUT_KEYS: readonly string[] = [
  `claude-code:${DEFAULT_CLAUDE_OPUS_MODEL}`,
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

function previousDefaultCodexEffort(model: string) {
  const normalized = model.trim().toLowerCase();
  return normalized.startsWith("gpt-5.") ? "xhigh" : "medium";
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
export function migrateSettingsModelDefaults(
  input: SettingsModelMigrationInput,
): SettingsModelMigrationResult {
  const fromVersion = Math.max(0, Math.trunc(input.fromVersion ?? 0));
  if (fromVersion >= SETTINGS_MODEL_MIGRATION_VERSION) {
    return {
      version: SETTINGS_MODEL_MIGRATION_VERSION,
      changed: false,
      modelClaude: input.modelClaude,
      modelCodex: input.modelCodex,
      claudeEffort: input.claudeEffort,
      codexReasoningEffort: input.codexReasoningEffort,
      modelShortcutKeys: [...input.modelShortcutKeys],
      taskPresets: [...input.taskPresets],
    };
  }

  const nextClaudeDefault = getDefaultModelForProvider({
    providerId: "claude-code",
  });
  const nextCodexDefault = getDefaultModelForProvider({ providerId: "codex" });

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
    ? [...DEFAULT_MODEL_SHORTCUT_KEYS]
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
    version: SETTINGS_MODEL_MIGRATION_VERSION,
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
