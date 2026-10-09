import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { useAppStore } from "@/store/app.store";
import type { SectionId } from "../settings-dialog.schema";
import { SettingsCard, SwitchField } from "../settings-dialog.shared";
import {
  buildAuxLaneEnablementPatch,
  selectAuxLaneEnabled,
} from "../settings-dialog-aux-lane-enablement";
import { SettingsSectionLink } from "../settings-dialog-section-link";

/**
 * Editor owns the on/off for AI inline completions. The runtime also requires
 * the Background AI inline-completion lane, so this switch shows and writes
 * both; the lane's provider and model stay in Background AI.
 */
export function EditorAiCompletionsCard(args: {
  onNavigateSection?: (id: SectionId) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const enabled = useAppStore((state) =>
    selectAuxLaneEnabled(state.settings, "inlineCompletion"),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <SettingsCard
      title={t("settings:editorSection.aiCompletions.title")}
      description={t("settings:editorSection.aiCompletions.description")}
    >
      <SwitchField
        title={t("settings:editorSection.aiCompletions.enable.title")}
        description={t("settings:editorSection.aiCompletions.enable.description")}
        checked={enabled}
        onCheckedChange={(checked) =>
          updateSettings({
            patch: buildAuxLaneEnablementPatch({
              settings: useAppStore.getState().settings,
              lane: "inlineCompletion",
              enabled: checked,
            }),
          })
        }
      />
      <SettingsSectionLink
        title={t("settings:editorSection.aiCompletions.modelLink.title")}
        description={t("settings:editorSection.aiCompletions.modelLink.description")}
        actionLabel={t("settings:editorSection.aiCompletions.modelLink.action")}
        target="auxiliaryInference"
        onNavigateSection={args.onNavigateSection}
      />
    </SettingsCard>
  );
}
