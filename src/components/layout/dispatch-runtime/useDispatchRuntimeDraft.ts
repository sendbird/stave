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
  clampCraneDispatchEffort,
  describeCraneAccess,
  detectCraneAutonomyPreset,
  listCraneAutonomyOptions,
  listCraneEffortOptions,
  reseedCraneAccessForProvider,
  resolveCraneDispatchAccessDefaults,
  resolveCraneDispatchAdvisorChoice,
  resolveCraneDispatchAdvisorDefaults,
  resolveCraneDispatchModelDefaults,
  type CraneDispatchAccessState,
  type CraneDispatchAdvisorSettings,
  type CraneDispatchAdvisorState,
  type CraneDispatchModelState,
} from "@/lib/crane-connector/dispatch-runtime";
import type {
  CraneDispatchApprovalResponse,
  CraneTeamRuntimeMemory,
} from "@/lib/crane-connector/types";
import type { ModelRuntimePreferenceSettings } from "@/lib/providers/model-runtime-preferences";
import {
  getSdkModelOptions,
  isManagedExecutionProviderId,
  listManagedExecutionProviderIds,
} from "@/lib/providers/model-catalog";
import type { ProviderModePresetId } from "@/lib/providers/provider-mode-presets";
import type {
  AdvisorTarget,
  ManagedExecutionProviderId,
  ProviderId,
} from "@/lib/providers/provider.types";
import { useCodexModelCatalog } from "@/lib/providers/use-codex-model-catalog";

const DISPATCH_PROVIDER_IDS = listManagedExecutionProviderIds();

/**
 * Stave settings this draft reads. Declared structurally rather than as the
 * store's settings type so a surface that is not the Crane approval dialog can
 * hand in whatever it already holds.
 */
export interface DispatchRuntimeDraftSettings
  extends ModelRuntimePreferenceSettings, CraneDispatchAdvisorSettings {
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
  advisor: CraneDispatchAdvisorState;
  /** Advisor pick for the provider currently being configured, armed or not. */
  advisorTarget: AdvisorTarget;
  advisorModels: string[];
  modelOptions: ModelSelectorOption[];
  selectedModelOption: ModelSelectorOption;
  effortLabel: string | undefined;
  autonomyPreset: ProviderModePresetId | null;
  autonomyOptions: { value: string; label: string }[];
  autonomyDescription: string | undefined;
  accessSummary: string;
  providerAvailable: boolean;
  setAccess: Dispatch<SetStateAction<CraneDispatchAccessState>>;
  setAdvisor: Dispatch<SetStateAction<CraneDispatchAdvisorState>>;
  setFastMode: (enabled: boolean) => void;
  applyAutonomyPreset: (presetId: ProviderModePresetId) => void;
  selectModel: (args: DispatchRuntimeSelectModelArgs) => void;
  /** Stable across renders so a seeding effect can depend on it safely. */
  seed: (args: DispatchRuntimeSeedArgs) => void;
  buildRuntimeChoice: () => CraneDispatchApprovalResponse["runtime"];
  buildTeamRuntimeMemory: () => CraneTeamRuntimeMemory;
}

/**
 * Models offered for an Advisor provider, with the current pick forced in.
 *
 * A remembered model that has left the catalog stays selectable rather than
 * silently snapping to a different one: the row then shows what will actually
 * run, and switching away from it is the user's decision.
 */
function advisorModelsForProvider(
  providerId: ManagedExecutionProviderId,
  selected: string,
) {
  return Array.from(
    new Set([selected, ...getSdkModelOptions({ providerId })]),
  ).filter(Boolean);
}

/**
 * Runtime, access, and Advisor draft state for a dispatch, shared by every
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
  // Seeded per dispatch from the Stave default and any remembered pick, and
  // never written back: approving one dispatch must not redefine the global
  // Advisor default.
  const [advisor, setAdvisor] = useState<CraneDispatchAdvisorState>(() =>
    resolveCraneDispatchAdvisorDefaults({
      settings,
      primaryProviderId: "claude-code",
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
  // The provider being configured, which is independent of the switch: an
  // Advisor can be set up here before it is armed, exactly as in the composer
  // and in Settings.
  const advisorTarget = advisor.targetByProvider[advisor.providerId];
  const advisorModels = useMemo(
    () => advisorModelsForProvider(advisor.providerId, advisorTarget.model),
    [advisor.providerId, advisorTarget.model],
  );

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
    setAdvisor(
      resolveCraneDispatchAdvisorDefaults({
        settings: seedArgs.settings,
        memory: seedArgs.memory ?? null,
        // Opposite of the provider running the turn, so the default pick is an
        // actual second opinion rather than the same model twice.
        primaryProviderId: seededModel.providerId,
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
    setModel((current) => ({
      providerId,
      model: nextModel,
      effort: clampCraneDispatchEffort({
        settings,
        providerId,
        model: nextModel,
        effort: selectArgs.effort ?? current.effort,
      }),
      // The picker resets its internal Fast toggle to `false` whenever it is
      // opened with a non-Codex model selected, so a Claude -> Codex switch
      // reports `fastMode: false` that the user never asked for. An explicit
      // toggle still arrives through `onFastModeChange`.
      codexFastMode:
        current.providerId === "codex" && selectArgs.fastMode !== undefined
          ? selectArgs.fastMode
          : current.codexFastMode,
    }));
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
    advisor,
    advisorTarget,
    advisorModels,
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
    setAdvisor,
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
        advisor: resolveCraneDispatchAdvisorChoice({
          advisor,
          consultLimit: settings.advisorConsultLimit,
        }),
      }),
    buildTeamRuntimeMemory: () =>
      buildCraneTeamRuntimeMemory({ model, advisor }),
  };
}
