import {
  CLAUDE_SDK_MODEL_OPTIONS,
  CODEX_MODEL_OPTIONS,
  DEFAULT_CLAUDE_OPUS_MODEL,
  getDefaultModelForProvider,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  CLAUDE_EFFORT_OPTIONS,
  CODEX_EFFORT_OPTIONS,
} from "@/lib/providers/runtime-option-contract";
import type { CliSessionContextMode } from "@/lib/terminal/types";

/**
 * A user-configurable preset shown in the preset bar that lives between the
 * task tab strip and the chat panel. Each preset either spawns a new task
 * with a fixed provider + model pair, or launches a native CLI session for
 * the underlying provider binary (Claude / Codex).
 */
export interface TaskPreset {
  id: string;
  /** Display label shown on the preset chip. */
  label: string;
  /** `task` creates a chat task; `cli-session` launches a native CLI tab. */
  kind: TaskPresetKind;
  /** Provider used for the task or native CLI session. */
  provider: ProviderId;
  /** Model id used for `task` presets. Ignored for CLI sessions. */
  model?: string;
  /**
   * Reasoning effort applied to `task` presets. Claude presets accept
   * `low | medium | high | xhigh | max`; Codex presets accept
   * `minimal | low | medium | high | xhigh`. When omitted, the model's
   * default effort is used at launch. Ignored for CLI sessions.
   */
  effort?: TaskPresetEffort;
  /** CLI session seed context. Defaults to `workspace`. */
  contextMode?: CliSessionContextMode;
}

export type TaskPresetKind = "task" | "cli-session";

export type TaskPresetEffort =
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

/**
 * Effort options selectable for a `task` preset, scoped to the provider's
 * supported reasoning-effort scale.
 */
export function listEffortsForPresetProvider(
  providerId: ProviderId,
): readonly { value: TaskPresetEffort; label: string }[] {
  if (providerId === "codex") {
    return CODEX_EFFORT_OPTIONS;
  }
  return CLAUDE_EFFORT_OPTIONS;
}

export const TASK_PRESET_KINDS: readonly TaskPresetKind[] = [
  "task",
  "cli-session",
] as const;

export const TASK_PRESET_SHORTCUT_SLOT_LABELS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
] as const;

/**
 * Default presets seeded on first run. Kept small and opinionated so the bar
 * is immediately useful without configuration.
 */
export const DEFAULT_TASK_PRESETS: readonly TaskPreset[] = [
  {
    id: "default-claude-opus-4-8-task",
    label: "Opus 4.8",
    kind: "task",
    provider: "claude-code",
    model: DEFAULT_CLAUDE_OPUS_MODEL,
  },
  {
    id: "default-gpt-5-5-task",
    label: "GPT-5.5",
    kind: "task",
    provider: "codex",
    model: "gpt-5.5",
  },
  {
    id: "default-claude-cli-session",
    label: "Claude CLI",
    kind: "cli-session",
    provider: "claude-code",
    contextMode: "workspace",
  },
  {
    id: "default-codex-cli-session",
    label: "Codex CLI",
    kind: "cli-session",
    provider: "codex",
    contextMode: "workspace",
  },
];

export function cloneDefaultTaskPresets(): TaskPreset[] {
  return DEFAULT_TASK_PRESETS.map((preset) => ({ ...preset }));
}

function getAllModelOptionsForProvider(providerId: ProviderId): string[] {
  if (providerId === "claude-code") {
    return [...CLAUDE_SDK_MODEL_OPTIONS];
  }
  if (providerId === "codex") {
    return [...CODEX_MODEL_OPTIONS];
  }
  return [];
}

export function listModelsForPresetProvider(
  providerId: ProviderId,
): readonly string[] {
  return getAllModelOptionsForProvider(providerId);
}

/**
 * Clamps a partial preset to a valid shape. Used when a persisted preset is
 * malformed (e.g. unknown provider) or when the
 * user switches the `kind` / `provider` in the editor.
 */
export function normalizeTaskPreset(input: Partial<TaskPreset>): TaskPreset {
  const kind: TaskPresetKind =
    input.kind === "cli-session" ? "cli-session" : "task";

  let provider: ProviderId;
  if (input.provider === "claude-code" || input.provider === "codex") {
    provider = input.provider;
  } else {
    provider = "claude-code";
  }

  const allowedModels = getAllModelOptionsForProvider(provider);
  const candidateModel =
    typeof input.model === "string" && input.model.trim().length > 0
      ? input.model.trim()
      : getDefaultModelForProvider({ providerId: provider });
  const model =
    kind === "cli-session"
      ? undefined
      : allowedModels.includes(candidateModel)
        ? candidateModel
        : getDefaultModelForProvider({ providerId: provider });

  const allowedEfforts = listEffortsForPresetProvider(provider).map(
    (option) => option.value,
  );
  const effort =
    kind === "cli-session"
      ? undefined
      : typeof input.effort === "string" &&
          allowedEfforts.includes(input.effort as TaskPresetEffort)
        ? (input.effort as TaskPresetEffort)
        : undefined;

  const contextMode: CliSessionContextMode =
    input.contextMode === "active-task" ? "active-task" : "workspace";

  const trimmedLabel =
    typeof input.label === "string" ? input.label.trim() : "";
  const label =
    trimmedLabel.length > 0
      ? trimmedLabel
      : buildDefaultPresetLabel({ kind, provider, model });

  return {
    id:
      typeof input.id === "string" && input.id.trim().length > 0
        ? input.id
        : generatePresetId(),
    label,
    kind,
    provider,
    model,
    effort,
    contextMode: kind === "cli-session" ? contextMode : undefined,
  };
}

export function generatePresetId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `preset-${crypto.randomUUID()}`;
  }
  return `preset-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export function getTaskPresetShortcutLabel(index: number): string | null {
  return TASK_PRESET_SHORTCUT_SLOT_LABELS[index] ?? null;
}

export function resolveTaskPresetShortcutSlot(args: {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): number | null {
  if (!args.ctrlKey || args.metaKey || args.altKey || args.shiftKey) {
    return null;
  }

  if (typeof args.code === "string") {
    const digitMatch = args.code.match(/^Digit([1-9])$/);
    if (digitMatch) {
      return Number.parseInt(digitMatch[1] ?? "", 10) - 1;
    }
  }

  if (/^[1-9]$/.test(args.key)) {
    return Number.parseInt(args.key, 10) - 1;
  }

  return null;
}

function buildDefaultPresetLabel(args: {
  kind: TaskPresetKind;
  provider: ProviderId;
  model?: string;
}) {
  if (args.kind === "cli-session") {
    return args.provider === "claude-code" ? "Claude CLI" : "Codex CLI";
  }
  if (args.model) {
    return args.model;
  }
  return args.provider === "claude-code" ? "Claude" : "Codex";
}

/**
 * Filters and normalises persisted preset arrays during store rehydration.
 * Accepts any input, returns either a clean list or the default seed.
 */
export function normalizePersistedTaskPresets(input: unknown): TaskPreset[] {
  if (!Array.isArray(input)) {
    return cloneDefaultTaskPresets();
  }
  const normalised: TaskPreset[] = [];
  const seenIds = new Set<string>();
  for (const candidate of input) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const preset = normalizeTaskPreset(candidate as Partial<TaskPreset>);
    if (seenIds.has(preset.id)) {
      preset.id = generatePresetId();
    }
    seenIds.add(preset.id);
    normalised.push(preset);
  }
  return normalised;
}
