import { useAppStore } from "@/store/app.store";
import { SelectField, SettingsCard, SwitchField } from "../settings-dialog.shared";

const AGENT_RUN_REMINDER_OPTIONS = [
  { value: "0", label: "Never" },
  { value: "15", label: "After 15 minutes" },
  { value: "30", label: "After 30 minutes" },
  { value: "60", label: "After 1 hour" },
  { value: "120", label: "After 2 hours" },
];

/** OS notifications, and how often a waiting agent run sign-off reminds you. */
export function DesktopNotificationsCard() {
  const nativeNotificationsEnabled = useAppStore((state) => state.settings.nativeNotificationsEnabled);
  const runSignOffReminderMinutes = useAppStore((state) => state.settings.runSignOffReminderMinutes);
  const updateSettings = useAppStore((state) => state.updateSettings);
  return (
    <SettingsCard
      title="Desktop Notifications"
      description="Show task completion, approval, input requests and run sign-offs through the operating system."
    >
      <SwitchField
        title="Native Notifications"
        description="Notify you when a task needs attention outside the active workspace."
        checked={nativeNotificationsEnabled}
        onCheckedChange={(checked) => updateSettings({ patch: { nativeNotificationsEnabled: checked } })}
      />
      <SelectField
        title="Run Sign-off Reminders"
        description="A run waiting for your sign-off notifies once. Remind again, in one batched notification, after it has waited this long."
        value={String(runSignOffReminderMinutes)}
        options={AGENT_RUN_REMINDER_OPTIONS}
        onChange={(value) => updateSettings({ patch: { runSignOffReminderMinutes: Number(value) } })}
      />
    </SettingsCard>
  );
}
