import { describe, expect, it } from "bun:test";

import {
  describeTrackerSources,
  hasPendingTrackerSource,
  hasProducingTrackerSource,
  listActionableTrackerSources,
  summarizeTrackerSource,
} from "@/lib/tracker-tasks/source-status";
import type { TrackerSourceSyncStatus } from "@/lib/tracker-tasks/types";

function status(
  overrides: Partial<TrackerSourceSyncStatus> = {},
): TrackerSourceSyncStatus {
  return {
    source: "crane",
    availability: "ready",
    syncing: false,
    lastSyncedAt: "2026-09-03T10:00:00.000Z",
    lastErrorCode: null,
    taskCount: 3,
    truncated: false,
    ...overrides,
  };
}

describe("summarizeTrackerSource", () => {
  it("reports a working source as producing, with its row count", () => {
    const summary = summarizeTrackerSource("crane", status());
    expect(summary.condition).toBe("producing");
    expect(summary.detail).toBe("3 tickets cached.");
    expect(summary.fixInSettings).toBe(false);
  });

  it("singularizes a one-ticket source", () => {
    expect(
      summarizeTrackerSource("crane", status({ taskCount: 1 })).detail,
    ).toBe("1 ticket cached.");
  });

  it("treats a source mid-refresh as working, not as a problem", () => {
    const summary = summarizeTrackerSource("jira", status({ syncing: true }));
    expect(summary.condition).toBe("syncing");
    expect(hasProducingTrackerSource([summary])).toBe(true);
  });

  it("names the setup step for every unavailable state", () => {
    const cases = [
      ["disabled", "Turned off in Settings."],
      ["unpaired", "Pair this tracker in Settings → Integrations."],
      [
        "not_configured",
        "Add the site URL, account email, and API token in Settings.",
      ],
    ] as const;
    for (const [availability, detail] of cases) {
      const summary = summarizeTrackerSource("jira", status({ availability }));
      expect(summary.condition).toBe("setup");
      expect(summary.detail).toBe(detail);
      expect(summary.fixInSettings).toBe(true);
      expect(summary.retryable).toBe(false);
    }
  });

  it("does not send the user to Settings for an OS keychain problem", () => {
    const summary = summarizeTrackerSource(
      "jira",
      status({ availability: "secure_storage_unavailable" }),
    );
    expect(summary.condition).toBe("setup");
    expect(summary.fixInSettings).toBe(false);
  });

  it("separates a transient failure from a permanent one", () => {
    const transient = summarizeTrackerSource(
      "jira",
      status({ lastErrorCode: "rate_limited" }),
    );
    expect(transient.condition).toBe("error");
    expect(transient.retryable).toBe(true);

    const permanent = summarizeTrackerSource(
      "crane",
      status({ lastErrorCode: "tasks_api_unavailable" }),
    );
    expect(permanent.condition).toBe("blocked");
    expect(permanent.retryable).toBe(false);
    // The server does not serve the route; no Settings change fixes that.
    expect(permanent.fixInSettings).toBe(false);
  });

  it("points a rejected credential or query at Settings", () => {
    for (const code of ["unauthorized", "forbidden", "invalid_jql"]) {
      const summary = summarizeTrackerSource(
        "jira",
        status({ lastErrorCode: code }),
      );
      expect(summary.condition).toBe("blocked");
      expect(summary.fixInSettings).toBe(true);
    }
  });

  it("shows an unrecognised code verbatim so it can be quoted", () => {
    expect(
      summarizeTrackerSource(
        "crane",
        status({ lastErrorCode: "teapot_overflow" }),
      ).detail,
    ).toBe("teapot_overflow");
  });

  it("keeps a source that main has not reported yet", () => {
    // Dropping it is how an unconfigured tracker became invisible on a cold
    // start; calling it a setup step would accuse a healthy install instead.
    const summary = summarizeTrackerSource("jira", null);
    expect(summary.condition).toBe("unknown");
    expect(summary.headline).toBe("Checking");
    expect(summary.retryable).toBe(false);
    expect(summary.fixInSettings).toBe(false);
    // It is neither working nor actionable, so it neither claims rows exist nor
    // adds a row to the strip.
    expect(hasProducingTrackerSource([summary])).toBe(false);
    expect(listActionableTrackerSources([summary])).toEqual([]);
    expect(hasPendingTrackerSource([summary])).toBe(true);
  });
});

describe("describeTrackerSources", () => {
  it("returns every source in a stable order even when none is reported", () => {
    const summaries = describeTrackerSources({});
    expect(summaries.map((entry) => entry.source)).toEqual(["crane", "jira"]);
  });

  it("mixes a working source with one that needs setup", () => {
    const summaries = describeTrackerSources({
      crane: status(),
      jira: status({ source: "jira", availability: "not_configured" }),
    });
    expect(summaries.map((entry) => entry.condition)).toEqual([
      "producing",
      "setup",
    ]);
    // The regression this whole module exists for: one healthy source must not
    // hide the other one's setup step.
    expect(listActionableTrackerSources(summaries)).toHaveLength(1);
    expect(hasProducingTrackerSource(summaries)).toBe(true);
  });
});

describe("hasProducingTrackerSource", () => {
  it("is false when every source is unavailable or blocked", () => {
    expect(
      hasProducingTrackerSource(
        describeTrackerSources({
          crane: status({ lastErrorCode: "tasks_api_unavailable" }),
          jira: status({ source: "jira", availability: "not_configured" }),
        }),
      ),
    ).toBe(false);
  });
});

describe("listActionableTrackerSources", () => {
  it("puts a transient failure ahead of a blocker and a blocker ahead of setup", () => {
    const summaries = [
      summarizeTrackerSource("jira", status({ availability: "disabled" })),
      summarizeTrackerSource(
        "crane",
        status({ lastErrorCode: "unauthorized" }),
      ),
      summarizeTrackerSource(
        "crane",
        status({ lastErrorCode: "rate_limited" }),
      ),
    ];
    expect(
      listActionableTrackerSources(summaries).map((entry) => entry.condition),
    ).toEqual(["error", "blocked", "setup"]);
  });

  it("omits a source that is working", () => {
    expect(
      listActionableTrackerSources([summarizeTrackerSource("crane", status())]),
    ).toEqual([]);
  });
});
