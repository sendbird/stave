import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  TrackerSourceErrorBanner,
  TrackerTasksNoMatchState,
  TrackerTasksNoSourceState,
  TrackerTasksUnavailableState,
} from "@/components/layout/tasks/TrackerTasksEmptyState";
import type { TrackerSourceSyncStatus } from "@/lib/tracker-tasks/types";

function makeStatus(
  overrides: Partial<TrackerSourceSyncStatus> = {},
): TrackerSourceSyncStatus {
  return {
    source: "crane",
    availability: "ready",
    syncing: false,
    lastSyncedAt: "2026-03-10T11:55:00.000Z",
    lastErrorCode: null,
    taskCount: 12,
    truncated: false,
    ...overrides,
  };
}

describe("Tasks empty states", () => {
  test("the browser build says why the surface is unavailable", () => {
    const html = renderToStaticMarkup(
      createElement(TrackerTasksUnavailableState),
    );
    expect(html).toContain("Tasks needs the desktop app");
    expect(html).toContain("main process");
  });

  test("the no-source state names each source's blocker and offers Settings", () => {
    const html = renderToStaticMarkup(
      createElement(TrackerTasksNoSourceState, {
        statuses: [
          makeStatus({ availability: "unpaired" }),
          makeStatus({ source: "jira", availability: "not_configured" }),
        ],
      }),
    );

    expect(html).toContain("No tracker is connected");
    expect(html).toContain("Crane");
    expect(html).toContain("Not paired with this installation yet.");
    expect(html).toContain("Jira");
    expect(html).toContain("No credential saved yet.");
    expect(html).toContain("Open Settings");
  });

  test("the no-match state offers Reset only when filters are active", () => {
    const filtered = renderToStaticMarkup(
      createElement(TrackerTasksNoMatchState, {
        hasFilters: true,
        refreshing: false,
        onReset: () => {},
        onRefresh: () => {},
      }),
    );
    expect(filtered).toContain("No tickets match");
    expect(filtered).toContain("Reset filters");

    const unfiltered = renderToStaticMarkup(
      createElement(TrackerTasksNoMatchState, {
        hasFilters: false,
        refreshing: false,
        onReset: () => {},
        onRefresh: () => {},
      }),
    );
    expect(unfiltered).toContain("Nothing assigned right now");
    expect(unfiltered).not.toContain("Reset filters");
    expect(unfiltered).toContain("Refresh");
  });
});

describe("TrackerSourceErrorBanner", () => {
  test("renders nothing when every source synced cleanly", () => {
    const html = renderToStaticMarkup(
      createElement(TrackerSourceErrorBanner, {
        statuses: [makeStatus(), makeStatus({ source: "jira" })],
        onRetry: () => {},
      }),
    );
    expect(html).toBe("");
  });

  test("translates a known error code and keeps the retry affordance", () => {
    const html = renderToStaticMarkup(
      createElement(TrackerSourceErrorBanner, {
        statuses: [makeStatus({ source: "jira", lastErrorCode: "invalid_jql" })],
        onRetry: () => {},
      }),
    );
    expect(html).toContain("Jira did not sync");
    expect(html).toContain("The saved JQL query was rejected.");
    expect(html).toContain("Retry");
  });

  test("shows an unrecognised code verbatim so it can be quoted", () => {
    const html = renderToStaticMarkup(
      createElement(TrackerSourceErrorBanner, {
        statuses: [makeStatus({ lastErrorCode: "teapot_overflow" })],
        onRetry: () => {},
      }),
    );
    expect(html).toContain("teapot_overflow");
  });

  test("ignores an error on a source that is not even configured", () => {
    // An unconfigured source has its own empty state; showing a red banner for
    // it would make setup look like a failure.
    const html = renderToStaticMarkup(
      createElement(TrackerSourceErrorBanner, {
        statuses: [
          makeStatus({
            availability: "not_configured",
            lastErrorCode: "unauthorized",
          }),
        ],
        onRetry: () => {},
      }),
    );
    expect(html).toBe("");
  });
});
