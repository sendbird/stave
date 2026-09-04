import { describe, expect, it } from "bun:test";

import {
  DEFAULT_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS,
  DEFAULT_TRACKER_TASKS_SETTINGS,
  MAX_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS,
  MIN_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS,
  TrackerTasksSettingsSchema,
  normalizeTrackerTasksSettings,
} from "@/lib/tracker-tasks/settings";

describe("TrackerTasksSettingsSchema", () => {
  it("accepts a complete settings object", () => {
    const parsed = TrackerTasksSettingsSchema.safeParse({
      defaultView: "all-open",
      refreshIntervalSeconds: 900,
      defaultKickoffStartMode: "stage",
    });
    expect(parsed.success).toBe(true);
  });

  it("defaults the refresh interval when it is absent", () => {
    const parsed = TrackerTasksSettingsSchema.safeParse({
      defaultView: "all-open",
      defaultKickoffStartMode: "run",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.refreshIntervalSeconds).toBe(
      DEFAULT_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS,
    );
  });

  it("rejects unknown keys", () => {
    const parsed = TrackerTasksSettingsSchema.safeParse({
      ...DEFAULT_TRACKER_TASKS_SETTINGS,
      pollForever: true,
    });
    expect(parsed.success).toBe(false);
  });

  it("bounds the refresh interval", () => {
    for (const seconds of [
      MIN_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS - 1,
      MAX_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS + 1,
      120.5,
      Number.NaN,
    ]) {
      const parsed = TrackerTasksSettingsSchema.safeParse({
        ...DEFAULT_TRACKER_TASKS_SETTINGS,
        refreshIntervalSeconds: seconds,
      });
      expect(parsed.success).toBe(false);
    }
    for (const seconds of [
      MIN_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS,
      MAX_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS,
    ]) {
      const parsed = TrackerTasksSettingsSchema.safeParse({
        ...DEFAULT_TRACKER_TASKS_SETTINGS,
        refreshIntervalSeconds: seconds,
      });
      expect(parsed.success).toBe(true);
    }
  });
});

describe("DEFAULT_TRACKER_TASKS_SETTINGS", () => {
  it("is a valid settings object", () => {
    expect(
      TrackerTasksSettingsSchema.safeParse(DEFAULT_TRACKER_TASKS_SETTINGS)
        .success,
    ).toBe(true);
    expect(DEFAULT_TRACKER_TASKS_SETTINGS.refreshIntervalSeconds).toBe(300);
    expect(DEFAULT_TRACKER_TASKS_SETTINGS.defaultKickoffStartMode).toBe("run");
    expect(DEFAULT_TRACKER_TASKS_SETTINGS.sourceEnabled).toEqual({
      jira: true,
      crane: true,
    });
  });
});

describe("normalizeTrackerTasksSettings", () => {
  it("passes a valid object through untouched", () => {
    const value = {
      defaultView: "in-stave" as const,
      refreshIntervalSeconds: 600,
      defaultKickoffStartMode: "stage" as const,
      sourceEnabled: { jira: false, crane: true },
    };
    expect(normalizeTrackerTasksSettings(value)).toEqual(value);
  });

  it("falls back entirely for a non-object", () => {
    for (const value of [null, undefined, 7, "settings", []]) {
      expect(normalizeTrackerTasksSettings(value)).toEqual({
        ...DEFAULT_TRACKER_TASKS_SETTINGS,
      });
    }
  });

  it("salvages per field: a bad interval does not reset the view", () => {
    expect(
      normalizeTrackerTasksSettings({
        defaultView: "recently-done",
        refreshIntervalSeconds: 5,
        defaultKickoffStartMode: "stage",
      }),
    ).toEqual({
      defaultView: "recently-done",
      refreshIntervalSeconds: DEFAULT_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS,
      defaultKickoffStartMode: "stage",
      sourceEnabled: DEFAULT_TRACKER_TASKS_SETTINGS.sourceEnabled,
    });
  });

  it("salvages per field: a bad view does not reset the interval", () => {
    expect(
      normalizeTrackerTasksSettings({
        defaultView: "everything-ever",
        refreshIntervalSeconds: 1_800,
        defaultKickoffStartMode: "stage",
      }),
    ).toEqual({
      defaultView: DEFAULT_TRACKER_TASKS_SETTINGS.defaultView,
      refreshIntervalSeconds: 1_800,
      defaultKickoffStartMode: "stage",
      sourceEnabled: DEFAULT_TRACKER_TASKS_SETTINGS.sourceEnabled,
    });
  });

  it("salvages per field: a bad kickoff mode does not reset the rest", () => {
    expect(
      normalizeTrackerTasksSettings({
        defaultView: "all-open",
        refreshIntervalSeconds: 120,
        defaultKickoffStartMode: "teleport",
      }),
    ).toEqual({
      defaultView: "all-open",
      refreshIntervalSeconds: 120,
      defaultKickoffStartMode: "run",
      sourceEnabled: DEFAULT_TRACKER_TASKS_SETTINGS.sourceEnabled,
    });
  });

  it("drops an unknown key written by a newer build without losing the rest", () => {
    expect(
      normalizeTrackerTasksSettings({
        defaultView: "all-open",
        refreshIntervalSeconds: 120,
        defaultKickoffStartMode: "stage",
        pollForever: true,
      }),
    ).toEqual({
      defaultView: "all-open",
      refreshIntervalSeconds: 120,
      defaultKickoffStartMode: "stage",
      sourceEnabled: DEFAULT_TRACKER_TASKS_SETTINGS.sourceEnabled,
    });
  });

  it("supplies the default interval when the field is missing", () => {
    expect(
      normalizeTrackerTasksSettings({
        defaultView: "all-open",
        defaultKickoffStartMode: "stage",
      }),
    ).toEqual({
      defaultView: "all-open",
      refreshIntervalSeconds: DEFAULT_TRACKER_TASKS_REFRESH_INTERVAL_SECONDS,
      defaultKickoffStartMode: "stage",
      sourceEnabled: DEFAULT_TRACKER_TASKS_SETTINGS.sourceEnabled,
    });
  });

  it("salvages per source: one bad flag does not reset the other", () => {
    expect(
      normalizeTrackerTasksSettings({
        defaultView: "all-open",
        refreshIntervalSeconds: 120,
        defaultKickoffStartMode: "stage",
        sourceEnabled: { jira: false, crane: "nope" },
      }),
    ).toEqual({
      defaultView: "all-open",
      refreshIntervalSeconds: 120,
      defaultKickoffStartMode: "stage",
      sourceEnabled: { jira: false, crane: true },
    });
  });
});
