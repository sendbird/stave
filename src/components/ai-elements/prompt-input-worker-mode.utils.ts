import { toHumanModelName } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  WORKER_AUTO_VALUE,
  type WorkerArmState,
  type WorkerEffort,
  type WorkerEffortPreference,
  type WorkerPresetId,
  type WorkerProviderConfig,
  type WorkerResolution,
  getWorkerPreset,
  listWorkerEffortsForModel,
  listWorkerModelOptions,
  WORKER_PRESETS,
} from "@/lib/providers/worker-mode";
import type { PromptDraftRuntimeOverrides } from "@/types/chat";

export type WorkerPillTone = "off" | "armed" | "warning";

export interface WorkerPillPresentation {
  tone: WorkerPillTone;
  label: string;
  /** Short effort chip beside the label, omitted when the model has no effort. */
  effortLabel: string | null;
  tooltip: string;
  toggleAriaLabel: string;
  /** False when Worker mode cannot run, so the toggle opens the picker instead. */
  canToggle: boolean;
  /** Explanatory copy for a supported-but-notable state. */
  note: string | null;
  /** Blocking reason or cost caution. */
  warning: string | null;
}

export function describeWorkerPill(args: {
  arm: WorkerArmState;
  resolution: WorkerResolution;
  primaryProviderId: ProviderId;
  primaryModel: string;
}): WorkerPillPresentation {
  const { arm, resolution } = args;

  if (resolution.status === "unavailable") {
    // Deliberately still reads as armed-but-blocked rather than as off: the user
    // turned this on, and silently showing "Off" would hide that a turn is about
    // to run without the worker they configured.
    return {
      tone: "warning",
      label: "Worker",
      effortLabel: null,
      tooltip: resolution.detail,
      toggleAriaLabel: "Turn off Worker mode for this task",
      canToggle: true,
      note: null,
      warning: resolution.detail,
    };
  }

  if (!arm.enabled || resolution.status === "off") {
    return {
      tone: "off",
      label: "Worker",
      effortLabel: null,
      tooltip:
        "Worker mode is off. Turn it on to let this model delegate bounded implementation work to a same-provider worker.",
      toggleAriaLabel: "Turn on Worker mode for this task",
      canToggle: true,
      note: null,
      warning: null,
    };
  }

  const { profile } = resolution;
  const workerLabel = toHumanModelName({ model: profile.resolvedWorkerModel });
  const presetLabel = getWorkerPreset(profile.presetId).label;
  return {
    tone: profile.costWarning ? "warning" : "armed",
    label: workerLabel,
    effortLabel: profile.resolvedWorkerEffort,
    tooltip: `${presetLabel} — ${toHumanModelName({
      model: profile.primaryModel,
    })} plans and reviews, ${workerLabel} implements.`,
    toggleAriaLabel: "Turn off Worker mode for this task",
    canToggle: true,
    note: profile.toolsEnforced
      ? null
      : profile.executionAdapter === "acp-tool"
        ? "This ACP Worker cannot hard-limit tools or turn count, so those preset bounds are passed as instructions."
        : "Codex cannot hard-limit a worker's tools, so the preset's tool list is passed as guidance.",
    warning: profile.costWarning,
  };
}

/* -------------------------------------------------------------------------- */
/* Option builders                                                            */
/* -------------------------------------------------------------------------- */

export interface WorkerPresetOption {
  id: WorkerPresetId;
  label: string;
  summary: string;
}

export function buildWorkerPresetOptions(): WorkerPresetOption[] {
  return WORKER_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.label,
    summary: preset.summary,
  }));
}

export interface WorkerModelOption {
  /** `"auto"` or a concrete model id. */
  value: string;
  label: string;
  description: string;
}

/**
 * Model rows for the picker: `Auto` first, then every worker-capable model for
 * the active provider. `Auto`'s description names the model it currently
 * resolves to, so the row is never a black box.
 */
export function buildWorkerModelOptions(args: {
  providerId: ProviderId;
  presetId: WorkerPresetId;
  runtimeModels?: readonly string[];
  selectedModel?: string;
}): WorkerModelOption[] {
  const preset = getWorkerPreset(args.presetId);
  const autoModel = preset.autoModel[args.providerId];
  const runtimeOptions = listWorkerModelOptions(
    args.providerId,
    args.runtimeModels,
  ).filter((model) => model !== WORKER_AUTO_VALUE);
  const selectedModel = args.selectedModel?.trim();
  const missingSelection =
    selectedModel &&
    selectedModel !== WORKER_AUTO_VALUE &&
    !runtimeOptions.includes(selectedModel)
      ? selectedModel
      : null;
  return [
    {
      value: WORKER_AUTO_VALUE,
      label: "Auto",
      description: `${getWorkerPreset(args.presetId).label} default — ${toHumanModelName(
        { model: autoModel },
      )}`,
    },
    ...(missingSelection
      ? [
          {
            value: missingSelection,
            label: toHumanModelName({ model: missingSelection }),
            description: "No longer advertised by the provider runtime",
          },
        ]
      : []),
    ...runtimeOptions.map((model) => ({
      value: model,
      label: toHumanModelName({ model }),
      description: "",
    })),
  ];
}

export interface WorkerEffortOption {
  value: WorkerEffortPreference;
  label: string;
  title: string;
}

/**
 * Effort chips for the resolved worker model. Empty when the model rejects the
 * field, which the pill renders as "follows the model default" rather than as a
 * row of dead buttons.
 */
export function buildWorkerEffortOptions(args: {
  providerId: ProviderId;
  workerModel: string;
  presetId: WorkerPresetId;
}): WorkerEffortOption[] {
  const supported = listWorkerEffortsForModel({
    providerId: args.providerId,
    model: args.workerModel,
  });
  if (supported.length === 0) {
    return [];
  }
  const presetEffort = getWorkerPreset(args.presetId).autoEffort[
    args.providerId
  ];
  return [
    {
      value: WORKER_AUTO_VALUE,
      label: "Auto",
      title: `Preset default (${presetEffort})`,
    },
    ...supported.map((effort) => ({
      value: effort satisfies WorkerEffort as WorkerEffortPreference,
      label: effort,
      title: `Run the worker at ${effort} reasoning effort`,
    })),
  ];
}

/**
 * Which effort chip reads as selected. An explicit value that had to be clamped
 * still highlights the *requested* tier so the row reflects the user's choice,
 * with the clamp reported separately.
 */
export function resolveWorkerEffortSelection(
  config: WorkerProviderConfig,
): WorkerEffortPreference {
  return config.effort ?? WORKER_AUTO_VALUE;
}

/* -------------------------------------------------------------------------- */
/* Patch builders                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Merges one provider's worker config into the draft overrides.
 *
 * Always writes through the per-provider map so editing the Codex worker cannot
 * disturb the Claude worker sitting beside it.
 *
 * A patch key set to `undefined` means "drop this field", and the key is deleted
 * rather than stored as an explicit `undefined`. That distinction matters because
 * these overrides round-trip through JSON: a stored `undefined` disappears on
 * serialization, so keeping it would make the in-memory draft behave one way
 * before a reload (the field reads as cleared, shadowing the settings-level
 * value) and another way after (the key is gone, so the settings-level value
 * reappears). Deleting makes both paths agree — task-local copy is cleared and
 * the provider's own settings default applies, before and after a restart.
 */
function withWorkerConfig(args: {
  overrides?: PromptDraftRuntimeOverrides;
  providerId: ProviderId;
  patch: Partial<WorkerProviderConfig>;
}): PromptDraftRuntimeOverrides {
  const existing = args.overrides?.workerConfigByProvider ?? {};
  const merged: Record<string, unknown> = {
    ...(existing[args.providerId] ?? {}),
    ...args.patch,
  };
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) {
      delete merged[key];
    }
  }
  return {
    ...(args.overrides ?? {}),
    workerConfigByProvider: {
      ...existing,
      [args.providerId]: merged as WorkerProviderConfig,
    },
  };
}

export function buildWorkerTogglePatch(args: {
  overrides?: PromptDraftRuntimeOverrides;
  arm: WorkerArmState;
}): PromptDraftRuntimeOverrides {
  return {
    ...(args.overrides ?? {}),
    // Only the flag flips. The per-provider config is deliberately preserved so
    // re-arming restores the previous preset/model/effort.
    workerEnabled: !args.arm.enabled,
  };
}

export function buildWorkerPresetPatch(args: {
  overrides?: PromptDraftRuntimeOverrides;
  providerId: ProviderId;
  presetId: WorkerPresetId;
}): PromptDraftRuntimeOverrides {
  return withWorkerConfig({
    overrides: {
      ...(args.overrides ?? {}),
      workerEnabled: true,
    },
    providerId: args.providerId,
    // Switching preset clears any hand-edited copy: keeping the old text would
    // silently shadow the new preset's description and instructions.
    patch: {
      presetId: args.presetId,
      description: undefined,
      instructions: undefined,
      tools: undefined,
      maxTurns: undefined,
    },
  });
}

export function buildWorkerModelPatch(args: {
  overrides?: PromptDraftRuntimeOverrides;
  providerId: ProviderId;
  model: string;
}): PromptDraftRuntimeOverrides {
  return withWorkerConfig({
    overrides: {
      ...(args.overrides ?? {}),
      workerEnabled: true,
    },
    providerId: args.providerId,
    patch: { model: args.model },
  });
}

export function buildWorkerEffortPatch(args: {
  overrides?: PromptDraftRuntimeOverrides;
  providerId: ProviderId;
  effort: WorkerEffortPreference;
}): PromptDraftRuntimeOverrides {
  return withWorkerConfig({
    overrides: {
      ...(args.overrides ?? {}),
      workerEnabled: true,
    },
    providerId: args.providerId,
    patch: { effort: args.effort },
  });
}
