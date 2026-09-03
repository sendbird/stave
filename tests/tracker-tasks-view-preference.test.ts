import { describe, expect, it } from "bun:test";

import {
  DEFAULT_TRACKER_TASKS_VIEW_PREFERENCE,
  TRACKER_TASKS_VIEW_PREFERENCE_STORAGE_KEY,
  parseTrackerTasksViewPreference,
  serializeTrackerTasksViewPreference,
  type TrackerTasksViewPreference,
} from "@/lib/tracker-tasks/view-preference";

describe("TRACKER_TASKS_VIEW_PREFERENCE_STORAGE_KEY", () => {
  it("is namespaced so it cannot collide with another surface", () => {
    expect(TRACKER_TASKS_VIEW_PREFERENCE_STORAGE_KEY).toBe(
      "stave.tracker-tasks.view",
    );
  });
});

describe("parseTrackerTasksViewPreference", () => {
  it("round-trips a full preference", () => {
    const value: TrackerTasksViewPreference = {
      view: "recently-done",
      group: "due",
      sort: "updated",
      sources: ["jira", "crane"],
    };
    const parsed = parseTrackerTasksViewPreference(
      serializeTrackerTasksViewPreference(value),
    );
    expect(parsed).toEqual(value);
  });

  it("returns the default for absent or empty input", () => {
    expect(parseTrackerTasksViewPreference(null)).toEqual({
      ...DEFAULT_TRACKER_TASKS_VIEW_PREFERENCE,
      sources: [],
    });
    expect(parseTrackerTasksViewPreference("")).toEqual({
      ...DEFAULT_TRACKER_TASKS_VIEW_PREFERENCE,
      sources: [],
    });
  });

  it("returns the default for corrupt input instead of throwing", () => {
    for (const raw of [
      "{",
      "not json at all",
      "null",
      "42",
      '"a string"',
      "[]",
      '["assigned-open"]',
    ]) {
      expect(parseTrackerTasksViewPreference(raw)).toEqual({
        ...DEFAULT_TRACKER_TASKS_VIEW_PREFERENCE,
        sources: [],
      });
    }
  });

  it("salvages field by field so one unknown value costs only that field", () => {
    const parsed = parseTrackerTasksViewPreference(
      JSON.stringify({
        view: "in-stave",
        group: "constellation",
        sort: "vibes",
        sources: ["jira"],
      }),
    );
    expect(parsed).toEqual({
      view: "in-stave",
      group: "status",
      sort: "priority",
      sources: ["jira"],
    });
  });

  it("drops unknown sources, duplicates and non-strings", () => {
    const parsed = parseTrackerTasksViewPreference(
      JSON.stringify({
        sources: ["jira", "jira", "gitlab", 7, null, "crane"],
      }),
    );
    expect(parsed.sources).toEqual(["jira", "crane"]);
  });

  it("ignores a sources value that is not an array", () => {
    expect(
      parseTrackerTasksViewPreference(JSON.stringify({ sources: "jira" }))
        .sources,
    ).toEqual([]);
  });

  it("ignores unknown fields written by another build", () => {
    const parsed = parseTrackerTasksViewPreference(
      JSON.stringify({ view: "all-open", density: "compact" }),
    );
    expect(parsed.view).toBe("all-open");
    expect(Object.keys(parsed).sort()).toEqual([
      "group",
      "sort",
      "sources",
      "view",
    ]);
  });

  it("never hands back the shared default array", () => {
    const parsed = parseTrackerTasksViewPreference(null);
    expect(parsed.sources).not.toBe(
      DEFAULT_TRACKER_TASKS_VIEW_PREFERENCE.sources,
    );
    parsed.sources.push("crane");
    expect(DEFAULT_TRACKER_TASKS_VIEW_PREFERENCE.sources).toEqual([]);
  });
});

describe("serializeTrackerTasksViewPreference", () => {
  it("writes only the four known fields", () => {
    const serialized = serializeTrackerTasksViewPreference({
      view: "all-open",
      group: "due",
      sort: "key",
      sources: [],
    });
    expect(JSON.parse(serialized)).toEqual({
      view: "all-open",
      group: "due",
      sort: "key",
      sources: [],
    });
  });
});
