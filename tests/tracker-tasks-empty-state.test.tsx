import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  TrackerSourceStatusStrip,
  TrackerTasksEmptyListState,
  TrackerTasksUnavailableState,
} from "@/components/layout/tasks/TrackerTasksEmptyState";
import { describeTrackerSources } from "@/lib/tracker-tasks/source-status";
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
    taskCount: 4,
    truncated: false,
    ...overrides,
  };
}

function renderEmpty(
  syncBySource: Parameters<typeof describeTrackerSources>[0],
  hasFilters = false,
) {
  return renderToStaticMarkup(
    createElement(TrackerTasksEmptyListState, {
      summaries: describeTrackerSources(syncBySource),
      hasFilters,
      refreshing: false,
      onReset: () => {},
      onRefresh: () => {},
    }),
  );
}

function renderStrip(
  syncBySource: Parameters<typeof describeTrackerSources>[0],
  hidden = false,
) {
  return renderToStaticMarkup(
    createElement(TrackerSourceStatusStrip, {
      summaries: describeTrackerSources(syncBySource),
      onRetry: () => {},
      hidden,
    }),
  );
}

describe("Tasks empty states", () => {
  test("the browser build says why the surface is unavailable", () => {
    const html = renderToStaticMarkup(
      createElement(TrackerTasksUnavailableState),
    );
    expect(html).toContain("Tasks needs the desktop app");
    expect(html).toContain("main process");
  });

  test("does not claim there is no assigned work when no tracker is connected", () => {
    // The reported bug: with Crane paired but its task API absent and Jira never
    // configured, the list said "Nothing assigned right now" and never mentioned
    // that Jira existed and would have worked.
    const html = renderEmpty({
      crane: status({ lastErrorCode: "tasks_api_unavailable" }),
      jira: status({ source: "jira", availability: "not_configured" }),
    });

    expect(html).toContain("No tracker is sending tickets");
    expect(html).not.toContain("Nothing assigned right now");
    expect(html).toContain("Crane");
    expect(html).toContain("does not serve the task list yet");
  });

  test("names the kill switch instead of a missing route when Crane turned the list off", () => {
    const html = renderEmpty({
      crane: status({ lastErrorCode: "tasks_disabled", taskCount: 0 }),
      jira: status({ source: "jira", availability: "not_configured" }),
    });
    expect(html).toContain("has the task list turned off");
    expect(html).not.toContain("does not serve the task list yet");
    expect(html).not.toContain("Nothing assigned right now");
    expect(html).toContain("Jira");
    expect(html).toContain("No credential saved yet.");
    expect(html).toContain("Open Settings");
  });

  test("holds its verdict until the sources have answered", () => {
    // A cold start has an empty cache and no status yet; either verdict would be
    // wrong for the moment before the first push lands.
    const html = renderEmpty({});
    expect(html).toContain("Checking your trackers");
    expect(html).not.toContain("No tracker is sending tickets");
    expect(html).not.toContain("Nothing assigned right now");
  });

  test("offers a re-check rather than Settings when nothing is fixable there", () => {
    const html = renderEmpty({
      crane: status({ lastErrorCode: "tasks_api_unavailable" }),
      jira: status({
        source: "jira",
        availability: "secure_storage_unavailable",
      }),
    });
    expect(html).toContain("Check again");
    expect(html).not.toContain("Open Settings");
  });

  test("says nothing is assigned only when a source is actually working", () => {
    const html = renderEmpty({
      crane: status(),
      jira: status({ source: "jira", availability: "not_configured" }),
    });
    expect(html).toContain("Nothing assigned right now");
    expect(html).not.toContain("No tracker is sending tickets");
  });

  test("offers Reset only when filters are active", () => {
    const filtered = renderEmpty({ crane: status() }, true);
    expect(filtered).toContain("No tickets match");
    expect(filtered).toContain("Reset filters");

    const unfiltered = renderEmpty({ crane: status() }, false);
    expect(unfiltered).not.toContain("Reset filters");
    expect(unfiltered).toContain("Refresh");
  });
});

describe("TrackerSourceStatusStrip", () => {
  test("renders nothing when every source is working", () => {
    expect(
      renderStrip({ crane: status(), jira: status({ source: "jira" }) }),
    ).toBe("");
  });

  test("surfaces a source that needs setup, which the old banner dropped", () => {
    // The old banner filtered to `availability === "ready"`, so an unconfigured
    // source was invisible whenever another source was connected.
    const html = renderStrip({
      crane: status(),
      jira: status({ source: "jira", availability: "not_configured" }),
    });
    expect(html).toContain("Jira");
    expect(html).toContain("No credential saved yet.");
    expect(html).toContain("Settings");
    expect(html).not.toContain("did not sync");
  });

  test("keeps the destructive treatment only for a transient failure", () => {
    const transient = renderStrip({
      crane: status(),
      jira: status({ source: "jira", lastErrorCode: "rate_limited" }),
    });
    expect(transient).toContain("bg-destructive/5");
    expect(transient).toContain("did not sync");
    expect(transient).toContain("Retry");

    const blocked = renderStrip({
      crane: status({ lastErrorCode: "tasks_api_unavailable" }),
      jira: status({ source: "jira" }),
    });
    expect(blocked).not.toContain("bg-destructive/5");
    expect(blocked).not.toContain("Retry");
  });

  test("offers Settings for a rejected credential and no retry", () => {
    const html = renderStrip({
      crane: status(),
      jira: status({ source: "jira", lastErrorCode: "unauthorized" }),
    });
    expect(html).toContain("The saved credential was rejected.");
    expect(html).toContain("Settings");
    expect(html).not.toContain("Retry");
  });

  test("stays out of the way while the empty state is explaining things", () => {
    expect(
      renderStrip(
        { jira: status({ source: "jira", availability: "not_configured" }) },
        true,
      ),
    ).toBe("");
  });
});
