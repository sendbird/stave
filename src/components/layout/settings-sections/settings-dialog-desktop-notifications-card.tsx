import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { useAppStore } from "@/store/app.store";
import { SelectField, SettingsCard, SwitchField } from "../settings-dialog.shared";

/** OS notifications, and how often a waiting agent run sign-off reminds you. */
export function DesktopNotificationsCard() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const nativeNotificationsEnabled = useAppStore((state) => state.settings.nativeNotificationsEnabled);
  const runSignOffReminderMinutes = useAppStore((state) => state.settings.runSignOffReminderMinutes);
  const notificationActionsEnabled = useAppStore((state) => state.settings.notificationActionsEnabled);
  const restartContinuation = useAppStore((state) => state.settings.restartContinuation);
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
      {window.api?.platform === "darwin" && <SwitchField
        title={t("settings:desktopNotifications.actions.title")}
        description={t("settings:desktopNotifications.actions.description")}
        checked={notificationActionsEnabled}
        onCheckedChange={(checked) => updateSettings({ patch: { notificationActionsEnabled: checked } })}
      />}
      <SelectField
        title={t("settings:desktopNotifications.restart.title")}
        description={t("settings:desktopNotifications.restart.description")}
        value={restartContinuation}
        options={[
          { value: "ask", label: t("settings:desktopNotifications.restart.ask") },
          { value: "automatically", label: t("settings:desktopNotifications.restart.automatically") },
          { value: "never", label: t("settings:desktopNotifications.restart.never") },
        ]}
        onChange={(value) => updateSettings({ patch: { restartContinuation: value as "ask" | "automatically" | "never" } })}
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
