import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FleetTaskActivityLine } from "@/components/layout/FleetTaskActivityLine";
import {
  buildTaskActivityLine,
  describeLastActivity,
  formatActivityDuration,
} from "@/lib/fleet/task-activity-line";
import type {
  ProviderTurnActivitySnapshot,
  ProviderTurnWorkItem,
} from "@/lib/providers/turn-status";
import { createWorkGraph } from "@/lib/work-graph/work-graph-reducer";

const START = 1_000_000;

function item(id: string, overrides: Partial<ProviderTurnWorkItem>): ProviderTurnWorkItem {
  return { id, kind: "tool", status: "running", title: "Read file", progressMessages: [], startedAt: START, updatedAt: START, ...overrides };
}

function activity(overrides: Partial<ProviderTurnActivitySnapshot> = {}): ProviderTurnActivitySnapshot {
  const items = [
    item("read", { title: "Read file", detail: "src/search.ts", updatedAt: START + 20_000 }),
    // Reported earlier in the list, but its last update is the newest.
    item("edit", { title: "Edit file", detail: "src/search.ts", updatedAt: START + 118_000 }),
  ];
  return {
    turnId: "turn-1", providerId: "claude-code", startedAt: START, lastEventAt: START + 118_000, stalledAt: null,
    pendingInteraction: null, workItemsById: Object.fromEntries(items.map((entry) => [entry.id, entry])),
    orderedWorkItemIds: ["edit", "read"], workGraph: createWorkGraph({ turnId: "turn-1", providerId: "claude-code", startedAt: START }),
    ...overrides,
  };
}

describe("a running task's activity line", () => {
  test("names the latest reported work with its own time and how long the turn has run", () => {
    const now = START + 130_000;
    const line = buildTaskActivityLine({ activity: activity(), now })!;
    expect(line.last).toEqual({ label: "Edit file", detail: "src/search.ts", at: START + 118_000 });
    expect(line.elapsedMs).toBe(130_000);
    expect(line.quietMs).toBe(12_000);
    expect(line.waitingMs).toBeNull();
    expect(describeLastActivity(line, now)).toBe("Edit file · src/search.ts · 12s ago");
  });

  test("a waiting turn measures from the oldest open request the work graph raised", () => {
    const graph = createWorkGraph({ turnId: "turn-1", providerId: "claude-code", startedAt: START });
    graph.interactionsById = {
      answered: { id: "answered", nodeKey: graph.rootKey, kind: "approval", title: "Old", raisedAt: START + 1_000, resolvedAt: START + 2_000 },
      open: { id: "open", nodeKey: graph.rootKey, kind: "approval", title: "Run tests", raisedAt: START + 60_000 },
    };
    const line = buildTaskActivityLine({ activity: activity({ pendingInteraction: "approval", workGraph: graph }), now: START + 125_000 })!;
    expect(line.waitingMs).toBe(65_000);
  });

  test("no reported work means no activity text, and no turn means no line", () => {
    const quiet = buildTaskActivityLine({ activity: activity({ workItemsById: {}, orderedWorkItemIds: [] }), now: START + 5_000 })!;
    expect(quiet.last).toBeNull();
    expect(describeLastActivity(quiet, START + 5_000)).toBeNull();
    expect(buildTaskActivityLine({ activity: null, now: START })).toBeNull();
    const ended = buildTaskActivityLine({ activity: activity({ completedAt: START + 90_000 }), now: START + 500_000 })!;
    expect(ended.elapsedMs).toBe(90_000);
    expect(ended.quietMs).toBeNull();
  });

  test("durations read as measured spans", () => {
    expect(formatActivityDuration(12_400)).toBe("12s");
    expect(formatActivityDuration(130_000)).toBe("2m 10s");
    expect(formatActivityDuration(120_000)).toBe("2m");
    expect(formatActivityDuration(3_900_000)).toBe("1h 5m");
    expect(formatActivityDuration(-5)).toBe("0s");
  });

  test("the row says running, waiting or quiet — never failed, never a percent or an estimate", () => {
    const running = renderToStaticMarkup(createElement(FleetTaskActivityLine, { activity: activity({ startedAt: Date.now() - 130_000 }), status: "running" }));
    expect(running).toContain("Running for 2m 10s");
    expect(running).toContain("Edit file · src/search.ts");
    const stalled = renderToStaticMarkup(createElement(FleetTaskActivityLine, {
      activity: activity({ lastEventAt: Date.now() - 7 * 60_000, stalledAt: Date.now() - 2 * 60_000 }), status: "stalled" }));
    expect(stalled).toContain("No updates for 7m");
    for (const markup of [running, stalled]) {
      expect(markup).not.toContain("Failed");
      expect(markup).not.toContain("%");
    }
    const nothingReported = renderToStaticMarkup(createElement(FleetTaskActivityLine, {
      activity: activity({ workItemsById: {}, orderedWorkItemIds: [], startedAt: Date.now() - 5_000 }), status: "running" }));
    expect(nothingReported).toContain("Running for 5s");
    expect(nothingReported).not.toContain("·");
    expect(renderToStaticMarkup(createElement(FleetTaskActivityLine, { activity: null, status: "running" }))).toBe("");
  });
});
