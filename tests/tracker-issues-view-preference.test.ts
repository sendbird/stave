import { describe, expect, it } from "bun:test";

import {
  DEFAULT_TRACKER_ISSUES_VIEW_PREFERENCE,
  TRACKER_ISSUES_VIEW_PREFERENCE_STORAGE_KEY,
  parseTrackerIssuesViewPreference,
  serializeTrackerIssuesViewPreference,
  type TrackerIssuesViewPreference,
} from "@/lib/tracker-issues/view-preference";

describe("TRACKER_ISSUES_VIEW_PREFERENCE_STORAGE_KEY", () => {
  it("is namespaced so it cannot collide with another surface", () => {
    expect(TRACKER_ISSUES_VIEW_PREFERENCE_STORAGE_KEY).toBe(
      "stave.tracker-issues.view",
    );
  });
});

describe("parseTrackerIssuesViewPreference", () => {
  it("round-trips a full preference", () => {
    const value: TrackerIssuesViewPreference = {
      view: "recently-done",
      group: "due",
      sort: "updated",
      sources: ["jira", "crane"],
      layout: "board",
      peekWidth: 560,
    };
    const parsed = parseTrackerIssuesViewPreference(
      serializeTrackerIssuesViewPreference(value),
    );
    expect(parsed).toEqual(value);
  });

  it("returns the default for absent or empty input", () => {
    expect(parseTrackerIssuesViewPreference(null)).toEqual({
      ...DEFAULT_TRACKER_ISSUES_VIEW_PREFERENCE,
      sources: [],
    });
    expect(parseTrackerIssuesViewPreference("")).toEqual({
      ...DEFAULT_TRACKER_ISSUES_VIEW_PREFERENCE,
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
      expect(parseTrackerIssuesViewPreference(raw)).toEqual({
        ...DEFAULT_TRACKER_ISSUES_VIEW_PREFERENCE,
        sources: [],
      });
    }
  });

  it("salvages an unknown layout without dropping the rest", () => {
    const parsed = parseTrackerIssuesViewPreference(
      JSON.stringify({
        view: "all-open",
        layout: "calendar",
        peekWidth: "640",
      }),
    );
    expect(parsed.layout).toBe("list");
    expect(parsed.peekWidth).toBe(640);
    expect(parsed.view).toBe("all-open");
  });

  it("salvages field by field so one unknown value costs only that field", () => {
    const parsed = parseTrackerIssuesViewPreference(
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
      layout: "list",
      peekWidth: 480,
    });
  });

  it("drops unknown sources, duplicates and non-strings", () => {
    const parsed = parseTrackerIssuesViewPreference(
      JSON.stringify({
        sources: ["jira", "jira", "gitlab", 7, null, "crane"],
      }),
    );
    expect(parsed.sources).toEqual(["jira", "crane"]);
  });

  it("ignores a sources value that is not an array", () => {
    expect(
      parseTrackerIssuesViewPreference(JSON.stringify({ sources: "jira" }))
        .sources,
    ).toEqual([]);
  });

  it("ignores unknown fields written by another build", () => {
    const parsed = parseTrackerIssuesViewPreference(
      JSON.stringify({ view: "all-open", density: "compact" }),
    );
    expect(parsed.view).toBe("all-open");
    expect(Object.keys(parsed).sort()).toEqual([
      "group",
      "layout",
      "peekWidth",
      "sort",
      "sources",
      "view",
    ]);
  });

  it("never hands back the shared default array", () => {
    const parsed = parseTrackerIssuesViewPreference(null);
    expect(parsed.sources).not.toBe(
      DEFAULT_TRACKER_ISSUES_VIEW_PREFERENCE.sources,
    );
    parsed.sources.push("crane");
    expect(DEFAULT_TRACKER_ISSUES_VIEW_PREFERENCE.sources).toEqual([]);
  });
});

describe("serializeTrackerIssuesViewPreference", () => {
  it("writes only the known fields and clamps peek width", () => {
    const serialized = serializeTrackerIssuesViewPreference({
      view: "all-open",
      group: "due",
      sort: "key",
      sources: [],
      layout: "board",
      peekWidth: 12,
    });
    expect(JSON.parse(serialized)).toEqual({
      view: "all-open",
      group: "due",
      sort: "key",
      sources: [],
      layout: "board",
      peekWidth: 360,
    });
  });
});
