import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  useTrackerTaskListPipeline,
  type TrackerTaskListPipeline,
} from "@/components/layout/tasks/useTrackerTaskListPipeline";
import { DEFAULT_TRACKER_TASK_FILTER } from "@/lib/tracker-tasks/filter";
import type {
  TrackerTask,
  TrackerTaskListItem,
  TrackerTaskStaveLink,
} from "@/lib/tracker-tasks/types";

const NOW = new Date("2026-03-10T12:00:00.000Z");

function makeTask(overrides: Partial<TrackerTask> = {}): TrackerTask {
  return {
    source: "crane",
    ref: "PLAT-1",
    key: "PLAT-1",
    title: "Fix the flaky upload retry",
    url: "https://example.invalid/PLAT-1",
    status: { raw: "In Progress", category: "in_progress" },
    priority: { raw: "Medium", level: "medium" },
    assignee: null,
    labels: [],
    dueDate: null,
    effort: null,
    project: { id: "proj-platform", name: "Platform" },
    team: { key: "PLAT", name: "Platform" },
    parentKey: null,
    subtasks: null,
    issueType: null,
    links: [],
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-03-09T00:00:00.000Z",
    closedAt: null,
    ...overrides,
  };
}

function makeLink(
  overrides: Partial<TrackerTaskStaveLink> = {},
): TrackerTaskStaveLink {
  return {
    id: "link-1",
    source: "crane",
    taskRef: "PLAT-1",
    taskKey: "PLAT-1",
    workspaceId: "ws-1",
    staveTaskId: "task-1",
    craneJobId: null,
    state: "running",
    errorCode: null,
    createdAt: "2026-03-09T00:00:00.000Z",
    updatedAt: "2026-03-09T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * Runs the hook once and hands the result back.
 *
 * `renderToStaticMarkup` is the harness the other renderer tests use, and one
 * synchronous render is all a `useMemo`-only hook needs.
 */
function runPipeline(
  args: Parameters<typeof useTrackerTaskListPipeline>[0],
): TrackerTaskListPipeline {
  let captured: TrackerTaskListPipeline | null = null;
  function Probe() {
    captured = useTrackerTaskListPipeline(args);
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  if (!captured) {
    throw new Error("The pipeline hook did not run.");
  }
  return captured;
}

describe("useTrackerTaskListPipeline", () => {
  test("groups, sorts, and orders the visible keys", () => {
    const items: TrackerTaskListItem[] = [
      { task: makeTask({ key: "PLAT-2", ref: "PLAT-2" }), staveLinks: [] },
      {
        task: makeTask({
          key: "PLAT-1",
          ref: "PLAT-1",
          priority: { raw: "Urgent", level: "urgent" },
        }),
        staveLinks: [],
      },
    ];

    const pipeline = runPipeline({
      allItems: items,
      linksByKey: {},
      filter: { ...DEFAULT_TRACKER_TASK_FILTER, view: "all-open" },
      group: "status",
      sort: "priority",
      collapsedGroupIds: [],
      now: NOW,
    });

    expect(pipeline.groups.map((group) => group.id)).toEqual(["in_progress"]);
    expect(pipeline.orderedKeys).toEqual(["crane:PLAT-1", "crane:PLAT-2"]);
  });

  test("drops a collapsed group's rows from the keyboard order", () => {
    const pipeline = runPipeline({
      allItems: [{ task: makeTask(), staveLinks: [] }],
      linksByKey: {},
      filter: { ...DEFAULT_TRACKER_TASK_FILTER, view: "all-open" },
      group: "status",
      sort: "priority",
      collapsedGroupIds: ["in_progress"],
      now: NOW,
    });

    // The group header stays, so the count is still visible; only the rows the
    // user cannot see leave the movement order.
    expect(pipeline.groups).toHaveLength(1);
    expect(pipeline.orderedKeys).toEqual([]);
  });

  test("folds a pushed link in so a just-started ticket reaches the In Stave view", () => {
    const items: TrackerTaskListItem[] = [
      { task: makeTask(), staveLinks: [] },
    ];

    const withoutPush = runPipeline({
      allItems: items,
      linksByKey: {},
      filter: { ...DEFAULT_TRACKER_TASK_FILTER, view: "in-stave" },
      group: "status",
      sort: "priority",
      collapsedGroupIds: [],
      now: NOW,
    });
    expect(withoutPush.orderedKeys).toEqual([]);

    const withPush = runPipeline({
      allItems: items,
      linksByKey: { "crane:PLAT-1": [makeLink()] },
      filter: { ...DEFAULT_TRACKER_TASK_FILTER, view: "in-stave" },
      group: "status",
      sort: "priority",
      collapsedGroupIds: [],
      now: NOW,
    });
    expect(withPush.orderedKeys).toEqual(["crane:PLAT-1"]);
    expect(withPush.items[0]?.staveLinks).toHaveLength(1);
  });

  test("counts every view tab independently of the active chips", () => {
    const pipeline = runPipeline({
      allItems: [
        { task: makeTask(), staveLinks: [] },
        {
          task: makeTask({
            key: "PLAT-9",
            ref: "PLAT-9",
            status: { raw: "Done", category: "done" },
            closedAt: "2026-03-09T00:00:00.000Z",
          }),
          staveLinks: [],
        },
      ],
      linksByKey: {},
      // A source chip that matches nothing must not zero the tab counts, or the
      // tabs stop telling the user where the rows went.
      filter: { ...DEFAULT_TRACKER_TASK_FILTER, sources: ["jira"] },
      group: "status",
      sort: "priority",
      collapsedGroupIds: [],
      now: NOW,
    });

    expect(pipeline.orderedKeys).toEqual([]);
    expect(pipeline.viewCounts["assigned-open"]).toBe(1);
    expect(pipeline.viewCounts["all-open"]).toBe(1);
    expect(pipeline.viewCounts["recently-done"]).toBe(1);
    expect(pipeline.viewCounts["in-stave"]).toBe(0);
  });

  test("builds chip options from every loaded row, ordered for scanning", () => {
    const pipeline = runPipeline({
      allItems: [
        {
          task: makeTask({ labels: [{ name: "infra" }, { name: "ui" }] }),
          staveLinks: [],
        },
        {
          task: makeTask({
            key: "PLAT-2",
            ref: "PLAT-2",
            project: null,
            team: { key: "CORE", name: "Core" },
            labels: [{ name: "infra" }],
          }),
          staveLinks: [],
        },
      ],
      linksByKey: {},
      filter: { ...DEFAULT_TRACKER_TASK_FILTER, view: "all-open" },
      group: "status",
      sort: "key",
      collapsedGroupIds: [],
      now: NOW,
    });

    expect(pipeline.projectOptions.map((option) => option.label)).toEqual([
      "Core",
      "Platform",
    ]);
    expect(pipeline.labelOptions).toEqual([
      { value: "infra", label: "infra", count: 2 },
      { value: "ui", label: "ui", count: 1 },
    ]);
  });
});
