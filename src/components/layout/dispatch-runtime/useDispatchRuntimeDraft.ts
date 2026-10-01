import { useCallback, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  buildModelSelectorOptions,
  buildModelSelectorValue,
  type ModelSelectorOption,
} from "@/components/ai-elements/model-selector.utils";
import {
  applyCraneAutonomyPreset,
  buildCraneDispatchRuntimeChoice,
  buildCraneTeamRuntimeMemory,
  describeCraneAccess,
  detectCraneAutonomyPreset,
  listCraneAutonomyOptions,
  listCraneEffortOptions,
  reseedCraneAccessForProvider,
  resolveCraneDispatchAccessDefaults,
  resolveCraneDispatchModelDefaults,
  resolveCraneDispatchModelSwitch,
  type CraneDispatchAccessState,
  type CraneDispatchModelState,
} from "@/lib/crane-connector/dispatch-runtime";
import type {
  CraneDispatchApprovalResponse,
  CraneTeamRuntimeMemory,
} from "@/lib/crane-connector/types";
import type { ModelRuntimePreferenceSettings } from "@/lib/providers/model-runtime-preferences";
import {
  isManagedExecutionProviderId,
  listManagedExecutionProviderIds,
} from "@/lib/providers/model-catalog";
import type { ProviderModePresetId } from "@/lib/providers/provider-mode-presets";
import type { ProviderId } from "@/lib/providers/provider.types";
import { useCodexModelCatalog } from "@/lib/providers/use-codex-model-catalog";

const DISPATCH_PROVIDER_IDS = listManagedExecutionProviderIds();

/**
 * Stave settings this draft reads. Declared structurally rather than as the
 * store's settings type so a surface that is not the Crane approval dialog can
 * hand in whatever it already holds.
 */
export interface DispatchRuntimeDraftSettings
  extends ModelRuntimePreferenceSettings {
  providerTimeoutMs: number;
  codexBinaryPath: string;
}

export interface DispatchRuntimeSeedArgs {
  /**
   * Read fresh at seed time by the caller, so a setting changed in another
   * window cannot reset choices already made in the open surface.
   */
  settings: DispatchRuntimeDraftSettings;
  draftProvider: ProviderId;
  memory?: CraneTeamRuntimeMemory | null;
}

export interface DispatchRuntimeSelectModelArgs {
  selection: ModelSelectorOption;
  effort?: CraneDispatchModelState["effort"];
  fastMode?: boolean;
}

export interface DispatchRuntimeDraft {
  model: CraneDispatchModelState;
  access: CraneDispatchAccessState;
  modelOptions: ModelSelectorOption[];
  selectedModelOption: ModelSelectorOption;
  effortLabel: string | undefined;
  autonomyPreset: ProviderModePresetId | null;
  autonomyOptions: { value: string; label: string }[];
  autonomyDescription: string | undefined;
  accessSummary: string;
  providerAvailable: boolean;
  setAccess: Dispatch<SetStateAction<CraneDispatchAccessState>>;
  setFastMode: (enabled: boolean) => void;
  applyAutonomyPreset: (presetId: ProviderModePresetId) => void;
  selectModel: (args: DispatchRuntimeSelectModelArgs) => void;
  /** Stable across renders so a seeding effect can depend on it safely. */
  seed: (args: DispatchRuntimeSeedArgs) => void;
  buildRuntimeChoice: () => CraneDispatchApprovalResponse["runtime"];
  buildTeamRuntimeMemory: () => CraneTeamRuntimeMemory;
}

/**
 * Runtime and access draft state for a dispatch, shared by every
 * surface that starts an agent run from an external ticket.
 */
export function useDispatchRuntimeDraft(args: {
  settings: DispatchRuntimeDraftSettings;
  providerAvailability: Record<ProviderId, boolean>;
  /** Probing the Codex catalog is only worth it while the surface is open. */
  codexCatalogEnabled: boolean;
}): DispatchRuntimeDraft {
  const { providerAvailability, settings } = args;
  const [model, setModel] = useState<CraneDispatchModelState>({
    providerId: "claude-code",
    model: "",
    effort: "high",
    codexFastMode: false,
  });
  const [access, setAccess] = useState<CraneDispatchAccessState>(() =>
    resolveCraneDispatchAccessDefaults({
      settings,
      providerId: "claude-code",
      model: settings.modelClaude,
    }),
  );
  const codexModelCatalog = useCodexModelCatalog({
    enabled: args.codexCatalogEnabled,
    codexBinaryPath: settings.codexBinaryPath,
  });
  const modelOptions = useMemo<ModelSelectorOption[]>(
    () =>
      buildModelSelectorOptions({
        providerIds: DISPATCH_PROVIDER_IDS,
        availabilityByProvider: providerAvailability,
        modelsByProvider: { codex: codexModelCatalog.models },
      }),
    [codexModelCatalog.models, providerAvailability],
  );
  // Read by `seed`, which is intentionally stable so a catalog refresh cannot
  // reset choices already made in the open surface.
  const modelOptionsRef = useRef<string[]>([]);
  modelOptionsRef.current = useMemo(
    () => modelOptions.map((option) => option.model).filter(Boolean),
    [modelOptions],
  );
  const selectedModelOption = useMemo(
    () =>
      buildModelSelectorValue({
        providerId: model.providerId,
        model: model.model,
        available: providerAvailability[model.providerId],
      }),
    [providerAvailability, model.model, model.providerId],
  );
  const effortOptions = listCraneEffortOptions({
    providerId: model.providerId,
    model: model.model,
  });
  const effortLabel = effortOptions.find(
    (option) => option.value === model.effort,
  )?.label;
  const autonomyPreset = detectCraneAutonomyPreset({
    providerId: model.providerId,
    access,
  });
  const autonomyOptions = useMemo(() => {
    const presets = listCraneAutonomyOptions({
      providerId: model.providerId,
    }).map((preset) => ({
      value: preset.value as string,
      label: preset.label,
    }));
    return autonomyPreset
      ? presets
      : [...presets, { value: "custom", label: "Custom" }];
  }, [autonomyPreset, model.providerId]);
  const autonomyDescription = autonomyPreset
    ? listCraneAutonomyOptions({ providerId: model.providerId }).find(
        (preset) => preset.value === autonomyPreset,
      )?.description
    : "These access settings no longer match a built-in preset.";
  const seed = useCallback((seedArgs: DispatchRuntimeSeedArgs) => {
    const seededModel = resolveCraneDispatchModelDefaults({
      settings: seedArgs.settings,
      draftProvider: seedArgs.draftProvider,
      memory: seedArgs.memory ?? null,
      availableModels: modelOptionsRef.current,
    });
    setModel(seededModel);
    setAccess(
      resolveCraneDispatchAccessDefaults({
        settings: seedArgs.settings,
        providerId: seededModel.providerId,
        model: seededModel.model,
      }),
    );
  }, []);

  const selectModel = (selectArgs: DispatchRuntimeSelectModelArgs) => {
    if (selectArgs.selection.isAuto) {
      return;
    }
    if (!isManagedExecutionProviderId(selectArgs.selection.providerId)) {
      return;
    }
    const providerId = selectArgs.selection.providerId;
    const nextModel = selectArgs.selection.model;
    const nextCapabilities = resolveCraneDispatchModelSwitch({
      settings,
      providerId,
      model: nextModel,
      ...(selectArgs.effort ? { effort: selectArgs.effort } : {}),
    });
    setModel({
      providerId,
      model: nextModel,
      effort: nextCapabilities.effort,
      codexFastMode: nextCapabilities.codexFastMode,
    });
    setAccess((current) =>
      reseedCraneAccessForProvider({
        settings,
        previous: { providerId: model.providerId, access: current },
        next: { providerId, model: nextModel },
      }),
    );
  };

  return {
    model,
    access,
    modelOptions,
    selectedModelOption,
    effortLabel,
    autonomyPreset,
    autonomyOptions,
    autonomyDescription,
    accessSummary: describeCraneAccess({
      providerId: model.providerId,
      access,
    }),
    providerAvailable: providerAvailability[model.providerId] !== false,
    setAccess,
    setFastMode: (enabled) =>
      setModel((current) => ({ ...current, codexFastMode: enabled })),
    applyAutonomyPreset: (presetId) =>
      setAccess((current) =>
        applyCraneAutonomyPreset({
          providerId: model.providerId,
          presetId,
          access: current,
        }),
      ),
    selectModel,
    seed,
    buildRuntimeChoice: () =>
      buildCraneDispatchRuntimeChoice({
        model,
        access,
        providerTimeoutMs: settings.providerTimeoutMs,
      }),
    buildTeamRuntimeMemory: () =>
      buildCraneTeamRuntimeMemory({ model }),
  };
}
