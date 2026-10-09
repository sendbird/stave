import { I18N_NAMESPACES, useTranslation, type I18nKey } from "@/i18n";
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
  normalizeAuxInferenceDefault,
  type AuxInferenceDefault,
  type AuxInferenceDefaultProviderId,
} from "@/lib/providers/auxiliary-inference-policy";
import { useAppStore } from "@/store/app.store";
import { auxiliaryInferenceSectionStyles as styles } from "./settings-dialog-auxiliary-inference-section.styles";

export const AUX_INFERENCE_DEFAULT_FIELD_ID =
  "settings-field-auxiliary-inference-default";

const SHARED_PROVIDER_OPTIONS = [
  {
    value: "auto" as const,
    labelKey: "common:labels.auto",
    descriptionKey:
      "settingsProviders:auxiliaryInference.sharedDefault.providerOptions.auto",
  },
  {
    value: "claude-code" as const,
    label: "Claude",
    descriptionKey:
      "settingsProviders:auxiliaryInference.sharedDefault.providerOptions.claude",
  },
  {
    value: "codex" as const,
    label: "Codex",
    descriptionKey:
      "settingsProviders:auxiliaryInference.sharedDefault.providerOptions.codex",
  },
] as const satisfies ReadonlyArray<{
  value: AuxInferenceDefaultProviderId;
  label?: string;
  labelKey?: I18nKey;
  descriptionKey: I18nKey;
}>;

/**
 * Settings → Background AI → Utility model: the one provider and model every
 * lane uses unless the lane overrides it under Advanced. Replaces the
 * former "Utility AI" provider row in Settings → Models.
 */
export function AuxInferenceSharedDefaultCard() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const shared = useAppStore(
    (state) => state.settings.auxiliaryInferenceDefault,
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const patchShared = (next: AuxInferenceDefault) =>
    updateSettings({
      patch: { auxiliaryInferenceDefault: normalizeAuxInferenceDefault(next) },
    });

  const providerOptions = SHARED_PROVIDER_OPTIONS.map((option) => ({
    value: option.value,
    label: "labelKey" in option ? t(option.labelKey) : option.label,
    description: t(option.descriptionKey),
    ...(option.value === "auto"
      ? {}
      : {
          icon: (
            <ModelIcon
              providerId={option.value}
              className={sx(styles.providerIcon)}
            />
          ),
        }),
  }));

  return (
    <SettingsCard
      id={AUX_INFERENCE_DEFAULT_FIELD_ID}
      tabIndex={-1}
      title={t("settingsProviders:auxiliaryInference.sharedDefault.title")}
      description={t(
        "settingsProviders:auxiliaryInference.sharedDefault.description",
      )}
    >
      <LabeledField
        title={t("settingsProviders:auxiliaryInference.provider.title")}
      >
        <ChoiceButtons<AuxInferenceDefaultProviderId>
          columns={3}
          value={shared.providerId}
          // A model belongs to one provider, so changing the provider drops
          // a model chosen for the other one back to automatic.
          onChange={(providerId) =>
            patchShared({
              providerId,
              model: providerId === shared.providerId ? shared.model : null,
            })
          }
          options={providerOptions}
        />
      </LabeledField>
      <PromptModelField
        title={t("settingsProviders:auxiliaryInference.model.title")}
        description={
          shared.model
            ? t(
                "settingsProviders:auxiliaryInference.sharedDefault.model.explicit",
              )
            : t(
                "settingsProviders:auxiliaryInference.sharedDefault.model.automatic",
              )
        }
        value={shared.model ?? ""}
        // Normalization moves the provider to the picked model's provider.
        onSelect={(model) => patchShared({ providerId: shared.providerId, model })}
      />
      {shared.model ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            patchShared({ providerId: shared.providerId, model: null })
          }
        >
          {t("settingsProviders:auxiliaryInference.sharedDefault.model.reset")}
        </Button>
      ) : null}
    </SettingsCard>
  );
}
