import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { useAppStore } from "@/store/app.store";
import { SelectField, SettingsCard, SwitchField } from "../settings-dialog.shared";

/** OS notifications, and how often a waiting agent run sign-off reminds you. */
export function DesktopNotificationsCard() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const nativeNotificationsEnabled = useAppStore((state) => state.settings.nativeNotificationsEnabled);
  const runSignOffReminderMinutes = useAppStore((state) => state.settings.runSignOffReminderMinutes);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const reminderOptions = [
    { value: "0", label: t("settings:desktopNotifications.signOffReminder.never") },
    { value: "15", label: t("settings:desktopNotifications.signOffReminder.afterMinutes", { count: 15 }) },
    { value: "30", label: t("settings:desktopNotifications.signOffReminder.afterMinutes", { count: 30 }) },
    { value: "60", label: t("settings:desktopNotifications.signOffReminder.afterHours", { count: 1 }) },
    { value: "120", label: t("settings:desktopNotifications.signOffReminder.afterHours", { count: 2 }) },
  ];
  return (
    <SettingsCard
      title={t("settings:desktopNotifications.title")}
      description={t("settings:desktopNotifications.description")}
    >
      <SwitchField
        title={t("settings:desktopNotifications.native.title")}
        description={t("settings:desktopNotifications.native.description")}
        checked={nativeNotificationsEnabled}
        onCheckedChange={(checked) => updateSettings({ patch: { nativeNotificationsEnabled: checked } })}
      />
      <SelectField
        title={t("settings:desktopNotifications.signOffReminder.title")}
        description={t("settings:desktopNotifications.signOffReminder.description")}
        value={String(runSignOffReminderMinutes)}
        options={reminderOptions}
        onChange={(value) => updateSettings({ patch: { runSignOffReminderMinutes: Number(value) } })}
      />
    </SettingsCard>
  );
}
