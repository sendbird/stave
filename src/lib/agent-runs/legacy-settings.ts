// temporary-migration: agent-run-settings-keys
/**
 * Profiles saved before agent runs were renamed keep the sign-off reminder as
 * `missionSignOffReminderMinutes`. Carries that value to
 * `runSignOffReminderMinutes` when the profile has no value under the new key,
 * then drops the old key so it is not written back. Mutates `settings`;
 * running it again changes nothing.
 */
export function migrateLegacyRunSignOffReminder(
  settings: { runSignOffReminderMinutes: number },
  persisted: unknown,
): void {
  const saved = (persisted ?? {}) as Record<string, unknown>;
  const legacy = saved.missionSignOffReminderMinutes;
  if (typeof saved.runSignOffReminderMinutes !== "number" && typeof legacy === "number" && Number.isFinite(legacy)) {
    settings.runSignOffReminderMinutes = legacy;
  }
  delete (settings as Record<string, unknown>).missionSignOffReminderMinutes;
}
// end temporary-migration: agent-run-settings-keys
