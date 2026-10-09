import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import { PromptModelField } from "@/components/layout/settings-dialog-model-fields";
import {
  ChoiceButtons,
  LabeledField,
  SettingsCard,
} from "@/components/layout/settings-dialog.shared";
import { Button } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import {
  AUX_LANES,
  auxLaneHasFallbackModel,
  auxLaneHasOverride,
  DEFAULT_AUXILIARY_INFERENCE_POLICY,
  resolveAuxLaneRuntime,
  type AuxLane,
  type AuxLaneConfig,
  type AuxLaneProviderId,
} from "@/lib/providers/auxiliary-inference-policy";
import { inferProviderIdFromModel } from "@/lib/providers/model-catalog";
import { useAppStore } from "@/store/app.store";
import { SettingsAdvancedDisclosure } from "./settings-dialog-advanced-disclosure";
import { AUX_LANE_COPY_KEYS } from "./settings-dialog-auxiliary-inference-lanes";
import { auxiliaryInferenceSectionStyles as styles } from "./settings-dialog-auxiliary-inference-section.styles";

const OVERRIDE_KEYS = ["providerId", "model", "fallbackModel"] as const;

/** Replace one lane's override fields, keeping its switch and lane-specific knobs. */
function patchLaneOverride(
  lane: AuxLane,
  patch: Partial<Pick<AuxLaneConfig, (typeof OVERRIDE_KEYS)[number]>> | "reset",
) {
  const { settings, updateSettings } = useAppStore.getState();
  const policy = settings.auxiliaryInferencePolicy;
  const next: AuxLaneConfig = { ...policy[lane] };
  for (const key of OVERRIDE_KEYS) {
    if (patch === "reset") {
      delete next[key];
    } else if (key in patch) {
      const value = patch[key];
      if (value) {
        next[key] = value as never;
      } else {
        delete next[key];
      }
    }
  }
  updateSettings({
    patch: { auxiliaryInferencePolicy: { ...policy, [lane]: next } },
  });
}

function managedProviderOf(model: string): AuxLaneProviderId {
  return inferProviderIdFromModel({ model }) === "codex" ? "codex" : "claude-code";
}

function AuxLaneOverrideCard(args: { lane: AuxLane }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  // Row-local subscriptions: both values are stable store references.
  const config = useAppStore(
    (state) =>
      state.settings.auxiliaryInferencePolicy[args.lane] ??
      DEFAULT_AUXILIARY_INFERENCE_POLICY[args.lane],
  );
  const shared = useAppStore(
    (state) => state.settings.auxiliaryInferenceDefault,
  );
  const copyKeys = AUX_LANE_COPY_KEYS[args.lane];
  const overridden = auxLaneHasOverride(config);
  const resolved = resolveAuxLaneRuntime({
    lane: args.lane,
    policy: { ...DEFAULT_AUXILIARY_INFERENCE_POLICY, [args.lane]: config },
    shared,
  });
  const inheritedModelDescription = resolved.model
    ? t("settingsProviders:auxiliaryInference.overrides.model.inherited", {
        model: resolved.model,
      })
    : t(
        "settingsProviders:auxiliaryInference.overrides.model.inheritedProviderChoice",
      );

  return (
    <SettingsCard
      title={t(copyKeys.title)}
      description={
        overridden
          ? t("settingsProviders:auxiliaryInference.overrides.status.overridden")
          : t("settingsProviders:auxiliaryInference.overrides.status.inherits")
      }
    >
      <LabeledField
        title={t("settingsProviders:auxiliaryInference.provider.title")}
        description={
          config.providerId
            ? t("settingsProviders:auxiliaryInference.provider.pinned")
            : t("settingsProviders:auxiliaryInference.provider.unpinned")
        }
      >
        <ChoiceButtons<AuxLaneProviderId>
          // Only an override is shown as selected; the inherited provider is
          // not a choice this lane made.
          value={config.providerId ?? ("" as AuxLaneProviderId)}
          onChange={(providerId) =>
            patchLaneOverride(args.lane, {
              providerId,
              // A model override belongs to one provider; drop a mismatched one.
              ...(config.model && managedProviderOf(config.model) !== providerId
                ? { model: undefined }
                : {}),
            })
          }
          options={(["claude-code", "codex"] as const).map((providerId) => ({
            value: providerId,
            label: providerId === "codex" ? "Codex" : "Claude",
            description:
              providerId === "codex"
                ? t("settingsProviders:auxiliaryInference.providerOptions.codex")
                : t("settingsProviders:auxiliaryInference.providerOptions.claude"),
            icon: (
              <ModelIcon
                providerId={providerId}
                className={sx(styles.providerIcon)}
              />
            ),
          }))}
        />
      </LabeledField>
      <PromptModelField
        title={t("settingsProviders:auxiliaryInference.model.title")}
        description={
          config.model ? t(copyKeys.modelDescription) : inheritedModelDescription
        }
        value={config.model ?? resolved.model ?? ""}
        // Picking a model also overrides the provider it belongs to, so the
        // lane never sends one provider's model id to the other.
        onSelect={(model) =>
          patchLaneOverride(args.lane, {
            model,
            providerId: managedProviderOf(model),
          })
        }
      />
      {auxLaneHasFallbackModel(args.lane) ? (
        <PromptModelField
          title={t("settingsProviders:auxiliaryInference.fallbackModel.title")}
          description={t(
            "settingsProviders:auxiliaryInference.fallbackModel.description",
          )}
          value={config.fallbackModel ?? resolved.fallbackModel ?? ""}
          onSelect={(model) =>
            patchLaneOverride(args.lane, { fallbackModel: model })
          }
        />
      ) : null}
      {overridden ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => patchLaneOverride(args.lane, "reset")}
        >
          {t("settingsProviders:auxiliaryInference.overrides.reset")}
        </Button>
      ) : null}
    </SettingsCard>
  );
}

/**
 * Settings → Background AI → Advanced: per-lane exceptions to the shared
 * utility model. Collapsed by default; a lane without an override inherits.
 */
export function AuxInferenceLaneOverrides() {
  const { t } = useTranslation(I18N_NAMESPACES);
  return (
    <SettingsAdvancedDisclosure
      title={t("settingsProviders:auxiliaryInference.overrides.title")}
      description={t(
        "settingsProviders:auxiliaryInference.overrides.description",
      )}
    >
      {AUX_LANES.map((lane) => (
        <AuxLaneOverrideCard key={lane} lane={lane} />
      ))}
    </SettingsAdvancedDisclosure>
  );
}
