import { describe, expect, it } from "bun:test";

import {
  DEFAULT_TRACKER_ISSUES_REFRESH_INTERVAL_SECONDS,
  DEFAULT_TRACKER_ISSUES_SETTINGS,
  MAX_TRACKER_ISSUES_REFRESH_INTERVAL_SECONDS,
  MIN_TRACKER_ISSUES_REFRESH_INTERVAL_SECONDS,
  TrackerIssuesSettingsSchema,
  normalizeTrackerIssuesSettings,
} from "@/lib/tracker-issues/settings";

describe("TrackerIssuesSettingsSchema", () => {
  it("accepts a complete settings object", () => {
    const parsed = TrackerIssuesSettingsSchema.safeParse({
      defaultView: "all-open",
      refreshIntervalSeconds: 900,
      defaultKickoffStartMode: "stage",
    });
    expect(parsed.success).toBe(true);
  });

  it("defaults the refresh interval when it is absent", () => {
    const parsed = TrackerIssuesSettingsSchema.safeParse({
      defaultView: "all-open",
      defaultKickoffStartMode: "run",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.refreshIntervalSeconds).toBe(
      DEFAULT_TRACKER_ISSUES_REFRESH_INTERVAL_SECONDS,
    );
  });

  it("rejects unknown keys", () => {
    const parsed = TrackerIssuesSettingsSchema.safeParse({
      ...DEFAULT_TRACKER_ISSUES_SETTINGS,
      pollForever: true,
    });
    expect(parsed.success).toBe(false);
  });

  it("bounds the refresh interval", () => {
    for (const seconds of [
      MIN_TRACKER_ISSUES_REFRESH_INTERVAL_SECONDS - 1,
      MAX_TRACKER_ISSUES_REFRESH_INTERVAL_SECONDS + 1,
      120.5,
      Number.NaN,
    ]) {
      const parsed = TrackerIssuesSettingsSchema.safeParse({
        ...DEFAULT_TRACKER_ISSUES_SETTINGS,
        refreshIntervalSeconds: seconds,
      });
      expect(parsed.success).toBe(false);
    }
    for (const seconds of [
      MIN_TRACKER_ISSUES_REFRESH_INTERVAL_SECONDS,
      MAX_TRACKER_ISSUES_REFRESH_INTERVAL_SECONDS,
    ]) {
      const parsed = TrackerIssuesSettingsSchema.safeParse({
        ...DEFAULT_TRACKER_ISSUES_SETTINGS,
        refreshIntervalSeconds: seconds,
      });
      expect(parsed.success).toBe(true);
    }
  });
});

describe("DEFAULT_TRACKER_ISSUES_SETTINGS", () => {
  it("is a valid settings object", () => {
    expect(
      TrackerIssuesSettingsSchema.safeParse(DEFAULT_TRACKER_ISSUES_SETTINGS)
        .success,
    ).toBe(true);
    expect(DEFAULT_TRACKER_ISSUES_SETTINGS.refreshIntervalSeconds).toBe(300);
    expect(DEFAULT_TRACKER_ISSUES_SETTINGS.defaultKickoffStartMode).toBe("run");
    expect(DEFAULT_TRACKER_ISSUES_SETTINGS.sourceEnabled).toEqual({
      jira: true,
      crane: true,
    });
  });
});

describe("normalizeTrackerIssuesSettings", () => {
  it("passes a valid object through untouched", () => {
    const value = {
      defaultView: "in-stave" as const,
      refreshIntervalSeconds: 600,
      defaultKickoffStartMode: "stage" as const,
      sourceEnabled: { jira: false, crane: true },
    };
    expect(normalizeTrackerIssuesSettings(value)).toEqual(value);
  });

  it("falls back entirely for a non-object", () => {
    for (const value of [null, undefined, 7, "settings", []]) {
      expect(normalizeTrackerIssuesSettings(value)).toEqual({
        ...DEFAULT_TRACKER_ISSUES_SETTINGS,
      });
    }
  });

  it("salvages per field: a bad interval does not reset the view", () => {
    expect(
      normalizeTrackerIssuesSettings({
        defaultView: "recently-done",
        refreshIntervalSeconds: 5,
        defaultKickoffStartMode: "stage",
      }),
    ).toEqual({
      defaultView: "recently-done",
      refreshIntervalSeconds: DEFAULT_TRACKER_ISSUES_REFRESH_INTERVAL_SECONDS,
      defaultKickoffStartMode: "stage",
      sourceEnabled: DEFAULT_TRACKER_ISSUES_SETTINGS.sourceEnabled,
    });
  });

  it("salvages per field: a bad view does not reset the interval", () => {
    expect(
      normalizeTrackerIssuesSettings({
        defaultView: "everything-ever",
        refreshIntervalSeconds: 1_800,
        defaultKickoffStartMode: "stage",
      }),
    ).toEqual({
      defaultView: DEFAULT_TRACKER_ISSUES_SETTINGS.defaultView,
      refreshIntervalSeconds: 1_800,
      defaultKickoffStartMode: "stage",
      sourceEnabled: DEFAULT_TRACKER_ISSUES_SETTINGS.sourceEnabled,
    });
  });

  it("salvages per field: a bad kickoff mode does not reset the rest", () => {
    expect(
      normalizeTrackerIssuesSettings({
        defaultView: "all-open",
        refreshIntervalSeconds: 120,
        defaultKickoffStartMode: "teleport",
      }),
    ).toEqual({
      defaultView: "all-open",
      refreshIntervalSeconds: 120,
      defaultKickoffStartMode: "run",
      sourceEnabled: DEFAULT_TRACKER_ISSUES_SETTINGS.sourceEnabled,
    });
  });

  it("drops an unknown key written by a newer build without losing the rest", () => {
    expect(
      normalizeTrackerIssuesSettings({
        defaultView: "all-open",
        refreshIntervalSeconds: 120,
        defaultKickoffStartMode: "stage",
        pollForever: true,
      }),
    ).toEqual({
      defaultView: "all-open",
      refreshIntervalSeconds: 120,
      defaultKickoffStartMode: "stage",
      sourceEnabled: DEFAULT_TRACKER_ISSUES_SETTINGS.sourceEnabled,
    });
  });

  it("supplies the default interval when the field is missing", () => {
    expect(
      normalizeTrackerIssuesSettings({
        defaultView: "all-open",
        defaultKickoffStartMode: "stage",
      }),
    ).toEqual({
      defaultView: "all-open",
      refreshIntervalSeconds: DEFAULT_TRACKER_ISSUES_REFRESH_INTERVAL_SECONDS,
      defaultKickoffStartMode: "stage",
      sourceEnabled: DEFAULT_TRACKER_ISSUES_SETTINGS.sourceEnabled,
    });
  });

  it("salvages per source: one bad flag does not reset the other", () => {
    expect(
      normalizeTrackerIssuesSettings({
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
