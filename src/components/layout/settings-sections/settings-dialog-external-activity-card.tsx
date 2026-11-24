import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { useAppStore } from "@/store/app.store";
import { SettingsCard, SwitchField } from "../settings-dialog.shared";

export const EXTERNAL_ACTIVITY_SETTING_FIELD_ID = "settings-field-external-activity";

/**
 * Activity outside Stave. The description is the privacy notice: what is
 * read, where it stays, and that nothing is read while the switch is off.
 */
export function ExternalActivitySettingsCard() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const enabled = useAppStore((state) => state.settings.externalActivityEnabled);
  const updateSettings = useAppStore((state) => state.updateSettings);
  return (
    <SettingsCard
      id={EXTERNAL_ACTIVITY_SETTING_FIELD_ID}
      tabIndex={-1}
      title={t("settings:general.externalActivity.title")}
      description={t("settings:general.externalActivity.description")}
    >
      <SwitchField
        title={t("settings:general.externalActivity.enableTitle")}
        description={t("settings:general.externalActivity.enableDescription")}
        checked={enabled}
        onCheckedChange={(checked) => updateSettings({ patch: { externalActivityEnabled: checked } })}
      />
    </SettingsCard>
  );
}
