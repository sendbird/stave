import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import {
  LabeledField,
  SectionStack,
  SettingsCard,
  SwitchField,
} from "@/components/layout/settings-dialog.shared";
import { AUX_LANES, type AuxLane } from "@/lib/providers/auxiliary-inference-policy";
import { PROMPT_ENHANCEMENT_STYLE_PROFILE_CHARS } from "@/lib/providers/prompt-enhancement-context";
import { Button, Textarea } from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import type { SectionId } from "./settings-dialog.schema";
import { AUX_LANE_COPY_KEYS } from "./settings-dialog-auxiliary-inference-lanes";
import { AuxInferenceLaneOverrides } from "./settings-dialog-auxiliary-inference-overrides";
import { AuxInferenceSharedDefaultCard } from "./settings-dialog-auxiliary-inference-shared-default";
import {
  AuxLaneEnablementLink,
  buildAuxLaneEnablementPatch,
  hasExternalAuxLaneEnablementOwner,
  selectAuxLaneEnabled,
} from "./settings-dialog-aux-lane-enablement";

/**
 * Settings → Background AI.
 *
 * Every lane here is a model call Stave makes without the user asking for it.
 * Before this section they were invisible and unswitchable, which is how a
 * "cheap" background summary could quietly run on the user's most expensive
 * model. The section is a shared default plus exceptions: one utility model
 * (provider and model) every lane uses, an on/off per lane, and, collapsed
 * under Advanced, a per-lane override of the provider or model.
 */

function AuxLaneCard(args: {
  lane: AuxLane;
  onNavigateSection?: (id: SectionId) => void;
}) {
  // Row-local subscription: a lane card re-renders only when its own lane
  // changes, so editing one card does not re-render the others.
  // Effective on/off: some lanes are also gated by an older settings key.
  const enabled = useAppStore((state) =>
    selectAuxLaneEnabled(state.settings, args.lane),
  );
  const externallyOwned = hasExternalAuxLaneEnablementOwner(args.lane);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const { t } = useTranslation(I18N_NAMESPACES);
  const copyKeys = AUX_LANE_COPY_KEYS[args.lane];

  return (
    <SettingsCard
      title={t(copyKeys.title)}
      description={t(copyKeys.description)}
    >
      {externallyOwned ? (
        <AuxLaneEnablementLink
          lane={args.lane}
          enabled={enabled}
          onNavigateSection={args.onNavigateSection}
        />
      ) : (
        <SwitchField
          title={t(copyKeys.switchTitle)}
          description={
            enabled
              ? t("settingsProviders:auxiliaryInference.laneSwitch.on")
              : t("settingsProviders:auxiliaryInference.laneSwitch.off")
          }
          checked={enabled}
          onCheckedChange={(checked) =>
            updateSettings({
              patch: buildAuxLaneEnablementPatch({
                settings: useAppStore.getState().settings,
                lane: args.lane,
                enabled: checked,
              }),
            })
          }
        />
      )}
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

export function SettingsAuxiliaryInferenceSection(args: {
  onNavigateSection?: (id: SectionId) => void;
} = {}) {
  return (
    <SectionStack>
      <AuxInferenceSharedDefaultCard />
      {AUX_LANES.map((lane) => (
        <AuxLaneCard
          key={lane}
          lane={lane}
          onNavigateSection={args.onNavigateSection}
        />
      ))}
      <AuxInferenceLaneOverrides />
      <PromptEnhancementCard />
    </SectionStack>
  );
}
