import { describe, expect, test } from "bun:test";
import { migrateLegacyRunSignOffReminder } from "../src/lib/agent-runs/legacy-settings";

describe("temporary migration: agent-run-settings-keys", () => {
  test("a profile saved with missionSignOffReminderMinutes keeps its reminder under the new key", () => {
    const persisted = { missionSignOffReminderMinutes: 90 };
    // The rehydration merge fills the new key with its default first.
    const settings = { runSignOffReminderMinutes: 30, ...persisted } as { runSignOffReminderMinutes: number };
    migrateLegacyRunSignOffReminder(settings, persisted);
    expect(settings).toEqual({ runSignOffReminderMinutes: 90 });
    migrateLegacyRunSignOffReminder(settings, settings);
    expect(settings).toEqual({ runSignOffReminderMinutes: 90 });
  });

  test("a value under the new key wins, and the old key is dropped", () => {
    const persisted = { runSignOffReminderMinutes: 0, missionSignOffReminderMinutes: 90 };
    const settings = { ...persisted } as { runSignOffReminderMinutes: number };
    migrateLegacyRunSignOffReminder(settings, persisted);
    expect(settings).toEqual({ runSignOffReminderMinutes: 0 });
  });

  test("a profile without either key keeps the default", () => {
    const settings = { runSignOffReminderMinutes: 30 };
    migrateLegacyRunSignOffReminder(settings, undefined);
    expect(settings).toEqual({ runSignOffReminderMinutes: 30 });
  });
});
