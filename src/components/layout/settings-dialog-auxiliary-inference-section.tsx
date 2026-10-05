import { I18N_NAMESPACES, useTranslation, type I18nKey } from "@/i18n";
import { useCallback, type ReactNode } from "react";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import { PromptModelField } from "@/components/layout/settings-dialog-model-fields";
import {
  ChoiceButtons,
  LabeledField,
  SectionStack,
  SettingsCard,
  SwitchField,
} from "@/components/layout/settings-dialog.shared";
import {
  AUX_LANES,
  DEFAULT_AUXILIARY_INFERENCE_POLICY,
  resolveAuxLaneRuntime,
  type AuxLane,
  type AuxLaneConfig,
  type AuxLaneProviderId,
} from "@/lib/providers/auxiliary-inference-policy";
import { PROMPT_ENHANCEMENT_STYLE_PROFILE_CHARS } from "@/lib/providers/prompt-enhancement-context";
import { Button, Textarea } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import { auxiliaryInferenceSectionStyles as styles } from "./settings-dialog-auxiliary-inference-section.styles";

/**
 * Settings → Background AI.
 *
 * Every lane here is a model call Stave makes without the user asking for it.
 * Before this section they were invisible and unswitchable, which is how a
 * "cheap" background summary could quietly run on the user's most expensive
 * model. Each card exposes the three decisions that actually change spend:
 * whether the lane runs at all, which provider answers it, and which model.
 */

const LANE_COPY_KEYS = {
  intentGuard: {
    title: "settingsProviders:auxiliaryInference.lanes.intentGuard.title",
    switchTitle:
      "settingsProviders:auxiliaryInference.lanes.intentGuard.switchTitle",
    description:
      "settingsProviders:auxiliaryInference.lanes.intentGuard.description",
    modelDescription:
      "settingsProviders:auxiliaryInference.lanes.intentGuard.modelDescription",
  },
  turnSummary: {
    title: "settingsProviders:auxiliaryInference.lanes.turnSummary.title",
    switchTitle:
      "settingsProviders:auxiliaryInference.lanes.turnSummary.switchTitle",
    description:
      "settingsProviders:auxiliaryInference.lanes.turnSummary.description",
    modelDescription:
      "settingsProviders:auxiliaryInference.lanes.turnSummary.modelDescription",
  },
  taskName: {
    title: "settingsProviders:auxiliaryInference.lanes.taskName.title",
    switchTitle:
      "settingsProviders:auxiliaryInference.lanes.taskName.switchTitle",
    description:
      "settingsProviders:auxiliaryInference.lanes.taskName.description",
    modelDescription:
      "settingsProviders:auxiliaryInference.lanes.taskName.modelDescription",
  },
  utility: {
    title: "settingsProviders:auxiliaryInference.lanes.utility.title",
    switchTitle:
      "settingsProviders:auxiliaryInference.lanes.utility.switchTitle",
    description:
      "settingsProviders:auxiliaryInference.lanes.utility.description",
    modelDescription:
      "settingsProviders:auxiliaryInference.lanes.utility.modelDescription",
  },
  prDescription: {
    title: "settingsProviders:auxiliaryInference.lanes.prDescription.title",
    switchTitle:
      "settingsProviders:auxiliaryInference.lanes.prDescription.switchTitle",
    description:
      "settingsProviders:auxiliaryInference.lanes.prDescription.description",
    modelDescription:
      "settingsProviders:auxiliaryInference.lanes.prDescription.modelDescription",
  },
  prePrReview: {
    title: "settingsProviders:auxiliaryInference.lanes.prePrReview.title",
    switchTitle:
      "settingsProviders:auxiliaryInference.lanes.prePrReview.switchTitle",
    description:
      "settingsProviders:auxiliaryInference.lanes.prePrReview.description",
    modelDescription:
      "settingsProviders:auxiliaryInference.lanes.prePrReview.modelDescription",
  },
  inlineCompletion: {
    title: "settingsProviders:auxiliaryInference.lanes.inlineCompletion.title",
    switchTitle:
      "settingsProviders:auxiliaryInference.lanes.inlineCompletion.switchTitle",
    description:
      "settingsProviders:auxiliaryInference.lanes.inlineCompletion.description",
    modelDescription:
      "settingsProviders:auxiliaryInference.lanes.inlineCompletion.modelDescription",
  },
} as const satisfies Record<
  AuxLane,
  {
    title: I18nKey;
    switchTitle: I18nKey;
    description: I18nKey;
    modelDescription: I18nKey;
  }
>;

/** Provider choices; product names stay as written, descriptions are keys. */
const PROVIDER_OPTIONS = [
  {
    value: "claude-code" as const,
    label: "Claude",
    descriptionKey: "settingsProviders:auxiliaryInference.providerOptions.claude",
    icon: (
      <ModelIcon providerId="claude-code" className={sx(styles.providerIcon)} />
    ),
  },
  {
    value: "codex" as const,
    label: "Codex",
    descriptionKey: "settingsProviders:auxiliaryInference.providerOptions.codex",
    icon: <ModelIcon providerId="codex" className={sx(styles.providerIcon)} />,
  },
] as const satisfies ReadonlyArray<{
  value: AuxLaneProviderId;
  label: string;
  descriptionKey: I18nKey;
  icon: ReactNode;
}>;

function AuxLaneCard(args: { lane: AuxLane }) {
  // Row-local subscription: a lane card re-renders only when its own lane
  // changes, so editing one card does not re-render the others.
  const config = useAppStore(
    (state) =>
      state.settings.auxiliaryInferencePolicy[args.lane] ??
      DEFAULT_AUXILIARY_INFERENCE_POLICY[args.lane],
  );
  const policy = useAppStore(
    (state) => state.settings.auxiliaryInferencePolicy,
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const { t } = useTranslation(I18N_NAMESPACES);
  const copyKeys = LANE_COPY_KEYS[args.lane];
  const modelDescription = t(copyKeys.modelDescription);
  const providerOptions = PROVIDER_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    description: t(option.descriptionKey),
    icon: option.icon,
  }));

  const patchLane = useCallback(
    (patch: Partial<AuxLaneConfig>) => {
      updateSettings({
        patch: {
          auxiliaryInferencePolicy: {
            ...policy,
            [args.lane]: { ...config, ...patch },
          },
        },
      });
    },
    [args.lane, config, policy, updateSettings],
  );

  const resolved = resolveAuxLaneRuntime({ lane: args.lane, policy });

  return (
    <SettingsCard
      title={t(copyKeys.title)}
      description={t(copyKeys.description)}
    >
      <SwitchField
        title={t(copyKeys.switchTitle)}
        description={
          config.enabled
            ? t("settingsProviders:auxiliaryInference.laneSwitch.on")
            : t("settingsProviders:auxiliaryInference.laneSwitch.off")
        }
        checked={config.enabled}
        onCheckedChange={(checked) => patchLane({ enabled: checked })}
      />
      {config.enabled ? (
        <>
          <LabeledField
            title={t("settingsProviders:auxiliaryInference.provider.title")}
            description={
              config.providerId
                ? t("settingsProviders:auxiliaryInference.provider.pinned")
                : t("settingsProviders:auxiliaryInference.provider.unpinned")
            }
          >
            <ChoiceButtons<AuxLaneProviderId>
              // Only a pinned choice is shown as selected. Showing the resolved
              // fall-through here would claim a pin the user never made, and
              // contradict the field's own description.
              value={config.providerId ?? ("" as AuxLaneProviderId)}
              onChange={(providerId) => patchLane({ providerId })}
              options={providerOptions}
            />
          </LabeledField>
          <PromptModelField
            title={t("settingsProviders:auxiliaryInference.model.title")}
            description={
              config.model
                ? modelDescription
                : resolved.model
                  ? t("settingsProviders:auxiliaryInference.model.currentDefault", {
                      description: modelDescription,
                      model: resolved.model,
                    })
                  : t("settingsProviders:auxiliaryInference.model.currentProviderChoice", {
                      description: modelDescription,
                    })
            }
            value={config.model ?? resolved.model ?? ""}
            onSelect={(model) => patchLane({ model })}
          />
          {config.fallbackModel !== undefined ? (
            <PromptModelField
              title={t("settingsProviders:auxiliaryInference.fallbackModel.title")}
              description={t("settingsProviders:auxiliaryInference.fallbackModel.description")}
              value={config.fallbackModel ?? resolved.fallbackModel ?? ""}
              onSelect={(model) => patchLane({ fallbackModel: model })}
            />
          ) : null}
        </>
      ) : null}
    </SettingsCard>
  );
}

/**
 * What the Enhance button knows about the user beyond the draft. The style
 * profile is the user's explicit taste; the learned examples are the implicit
 * one. Both ride the utility lane above, so they share its provider and model.
 */
function PromptEnhancementCard() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const styleProfile = useAppStore(
    (state) => state.settings.promptEnhancementStyleProfile,
  );
  const learnFromEdits = useAppStore(
    (state) => state.settings.promptEnhancementLearnFromEdits,
  );
  const exemplarCount = useAppStore(
    (state) => state.settings.promptEnhancementExemplars.length,
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <SettingsCard
      title={t("settingsProviders:auxiliaryInference.promptEnhancement.title")}
      description={t("settingsProviders:auxiliaryInference.promptEnhancement.description")}
    >
      <LabeledField
        title={t("settingsProviders:auxiliaryInference.promptEnhancement.style.title")}
        description={t("settingsProviders:auxiliaryInference.promptEnhancement.style.description")}
      >
        <Textarea
          id="settings-field-prompt-enhancement"
          value={styleProfile}
          maxLength={PROMPT_ENHANCEMENT_STYLE_PROFILE_CHARS}
          rows={4}
          placeholder={
            t("settingsProviders:auxiliaryInference.promptEnhancement.style.placeholder")
          }
          onChange={(event) =>
            updateSettings({
              patch: { promptEnhancementStyleProfile: event.target.value },
            })
          }
        />
      </LabeledField>
      <SwitchField
        title={t("settingsProviders:auxiliaryInference.promptEnhancement.learn.title")}
        description={
          learnFromEdits
            ? exemplarCount > 0
              ? t("settingsProviders:whole.rewriteExamples", { count: exemplarCount })
              : t("settingsProviders:auxiliaryInference.promptEnhancement.learn.empty")
            : t("settingsProviders:auxiliaryInference.promptEnhancement.learn.off")
        }
        checked={learnFromEdits}
        onCheckedChange={(checked) =>
          updateSettings({
            patch: { promptEnhancementLearnFromEdits: checked },
          })
        }
      />
      {exemplarCount > 0 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            updateSettings({ patch: { promptEnhancementExemplars: [] } })
          }
        >
          {t("settingsProviders:auxiliaryInference.promptEnhancement.forget")}</Button>
      ) : null}
    </SettingsCard>
  );
}

export function SettingsAuxiliaryInferenceSection() {
  return (
    <SectionStack>
      {AUX_LANES.map((lane) => (
        <AuxLaneCard key={lane} lane={lane} />
      ))}
      <PromptEnhancementCard />
    </SectionStack>
  );
}
