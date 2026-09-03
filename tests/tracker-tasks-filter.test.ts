import { describe, expect, it } from "bun:test";

import {
  DEFAULT_TRACKER_TASK_FILTER,
  TRACKER_TASK_VIEWS,
  countActiveTrackerTaskFilters,
  createTrackerTaskFilter,
  filterTrackerTasks,
  projectFilterKeyForTask,
  projectFilterLabelForTask,
  type TrackerTaskFilter,
} from "@/lib/tracker-tasks/filter";
import type {
  TrackerTask,
  TrackerTaskListItem,
  TrackerTaskStaveLink,
} from "@/lib/tracker-tasks/types";

const NOW = new Date("2026-03-10T12:00:00.000Z");

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function makeTask(overrides: Partial<TrackerTask> = {}): TrackerTask {
  return {
    source: "crane",
    ref: overrides.key ?? "PLAT-1",
    key: "PLAT-1",
    title: "Fix the flaky upload retry",
    url: "https://example.invalid/PLAT-1",
    status: { raw: "In Progress", category: "in_progress" },
    priority: { raw: "Medium", level: "medium" },
    assignee: { id: "user-1", name: "Ada Lovelace" },
    labels: [],
    dueDate: null,
    effort: null,
    project: { id: "proj-platform", name: "Platform" },
    team: { key: "PLAT", name: "Platform Team" },
    parentKey: null,
    subtasks: null,
    issueType: "Bug",
    links: [],
    createdAt: daysAgo(30),
    updatedAt: daysAgo(1),
    closedAt: null,
    ...overrides,
  };
}

function makeLink(): TrackerTaskStaveLink {
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
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
  };
}

function makeItem(
  overrides: Partial<TrackerTask> = {},
  staveLinks: TrackerTaskStaveLink[] = [],
): TrackerTaskListItem {
  return { task: makeTask(overrides), staveLinks };
}

function filterWith(overrides: Partial<TrackerTaskFilter>): TrackerTaskFilter {
  return { ...createTrackerTaskFilter("all-open"), ...overrides };
}

function keysOf(items: TrackerTaskListItem[]): string[] {
  return items.map((item) => item.task.key);
}

describe("TRACKER_TASK_VIEWS", () => {
  it("keeps the tab order stable", () => {
    expect([...TRACKER_TASK_VIEWS]).toEqual([
      "assigned-open",
      "all-open",
      "recently-done",
      "in-stave",
    ]);
  });

  it("defaults to the assigned view with no constraints", () => {
    expect(DEFAULT_TRACKER_TASK_FILTER.view).toBe("assigned-open");
    expect(countActiveTrackerTaskFilters(DEFAULT_TRACKER_TASK_FILTER)).toBe(0);
  });

  it("hands out a fresh mutable filter per view", () => {
    const a = createTrackerTaskFilter("in-stave");
    const b = createTrackerTaskFilter("in-stave");
    expect(a.sources).not.toBe(b.sources);
    a.sources.push("crane");
    expect(b.sources).toEqual([]);
  });
});

describe("filterTrackerTasks views", () => {
  const items = [
    makeItem({ key: "OPEN-1", status: { raw: "To Do", category: "todo" } }),
    makeItem({
      key: "OPEN-2",
      status: { raw: "Doing", category: "in_progress" },
      assignee: { id: "user-2", name: "Grace Hopper" },
    }),
    makeItem({
      key: "OPEN-3",
      status: { raw: "Review", category: "in_review" },
      assignee: null,
    }),
    makeItem({
      key: "DONE-1",
      status: { raw: "Done", category: "done" },
      closedAt: daysAgo(2),
    }),
    makeItem({
      key: "DONE-2",
      status: { raw: "Done", category: "done" },
      closedAt: daysAgo(20),
    }),
    makeItem({
      key: "CLOSED-1",
      status: { raw: "Closed", category: "closed" },
      closedAt: null,
      updatedAt: daysAgo(3),
    }),
    makeItem({ key: "LINK-1", status: { raw: "Done", category: "done" } }, [
      makeLink(),
    ]),
  ];

  it("assigned-open keeps only unfinished work", () => {
    const result = filterTrackerTasks(
      items,
      filterWith({ view: "assigned-open" }),
      { now: NOW },
    );
    expect(keysOf(result)).toEqual(["OPEN-1", "OPEN-2", "OPEN-3"]);
  });

  it("assigned-open applies currentUserIds only as a defensive refinement", () => {
    const result = filterTrackerTasks(
      items,
      filterWith({ view: "assigned-open" }),
      { now: NOW, currentUserIds: ["user-1"] },
    );
    // OPEN-2 belongs to someone else; OPEN-3 is unassigned and stays visible.
    expect(keysOf(result)).toEqual(["OPEN-1", "OPEN-3"]);
  });

  it("all-open ignores the assignee entirely", () => {
    const result = filterTrackerTasks(items, filterWith({ view: "all-open" }), {
      now: NOW,
      currentUserIds: ["user-1"],
    });
    expect(keysOf(result)).toEqual(["OPEN-1", "OPEN-2", "OPEN-3"]);
  });

  it("recently-done uses closedAt, falls back to updatedAt, and cuts off at 14 days", () => {
    const result = filterTrackerTasks(
      items,
      filterWith({ view: "recently-done" }),
      { now: NOW },
    );
    expect(keysOf(result)).toEqual(["DONE-1", "CLOSED-1", "LINK-1"]);
  });

  it("recently-done ignores a finish timestamp in the future", () => {
    const future = makeItem({
      key: "FUTURE-1",
      status: { raw: "Done", category: "done" },
      closedAt: new Date(NOW.getTime() + 60_000).toISOString(),
    });
    const result = filterTrackerTasks(
      [future],
      filterWith({ view: "recently-done" }),
      { now: NOW },
    );
    expect(result).toEqual([]);
  });

  it("in-stave keeps rows that produced a run, finished or not", () => {
    const result = filterTrackerTasks(items, filterWith({ view: "in-stave" }), {
      now: NOW,
    });
    expect(keysOf(result)).toEqual(["LINK-1"]);
  });
});

describe("filterTrackerTasks chips", () => {
  const items = [
    makeItem({
      key: "PLAT-1",
      source: "crane",
      priority: { raw: "Urgent", level: "urgent" },
      labels: [{ name: "backend" }, { name: "Flaky" }],
    }),
    makeItem({
      key: "WEB-2",
      source: "jira",
      priority: { raw: "Low", level: "low" },
      project: null,
      team: { key: "WEB", name: "Web Team" },
      labels: [{ name: "frontend" }],
    }),
    makeItem({
      key: "MISC-3",
      source: "jira",
      priority: { raw: null, level: "none" },
      project: null,
      team: null,
      labels: [],
    }),
  ];

  it("treats an empty array as no constraint", () => {
    const result = filterTrackerTasks(items, filterWith({}), { now: NOW });
    expect(result).toBe(items);
  });

  it("filters by source", () => {
    const result = filterTrackerTasks(
      items,
      filterWith({ sources: ["jira"] }),
      {
        now: NOW,
      },
    );
    expect(keysOf(result)).toEqual(["WEB-2", "MISC-3"]);
  });

  it("filters by priority", () => {
    const result = filterTrackerTasks(
      items,
      filterWith({ priorities: ["urgent", "none"] }),
      { now: NOW },
    );
    expect(keysOf(result)).toEqual(["PLAT-1", "MISC-3"]);
  });

  it("filters by status category", () => {
    const result = filterTrackerTasks(
      items,
      filterWith({ statusCategories: ["todo"] }),
      { now: NOW },
    );
    expect(result).toEqual([]);
  });

  it("filters by project key using the shared rule", () => {
    const result = filterTrackerTasks(
      items,
      filterWith({ projectKeys: ["proj-platform", "WEB"] }),
      { now: NOW },
    );
    expect(keysOf(result)).toEqual(["PLAT-1", "WEB-2"]);
  });

  it("matches the project-less bucket with an empty key", () => {
    const result = filterTrackerTasks(
      items,
      filterWith({ projectKeys: [""] }),
      {
        now: NOW,
      },
    );
    expect(keysOf(result)).toEqual(["MISC-3"]);
  });

  it("filters labels case-insensitively", () => {
    const result = filterTrackerTasks(
      items,
      filterWith({ labels: ["flaky"] }),
      {
        now: NOW,
      },
    );
    expect(keysOf(result)).toEqual(["PLAT-1"]);
  });

  it("filters by Stave link state", () => {
    const linked = makeItem({ key: "LINKED-9" }, [makeLink()]);
    const pool = [...items, linked];
    expect(
      keysOf(
        filterTrackerTasks(pool, filterWith({ linked: "linked" }), {
          now: NOW,
        }),
      ),
    ).toEqual(["LINKED-9"]);
    expect(
      keysOf(
        filterTrackerTasks(pool, filterWith({ linked: "unlinked" }), {
          now: NOW,
        }),
      ),
    ).toEqual(["PLAT-1", "WEB-2", "MISC-3"]);
  });

  it("preserves input order", () => {
    const result = filterTrackerTasks(
      items,
      filterWith({ sources: ["jira", "crane"] }),
      { now: NOW },
    );
    expect(keysOf(result)).toEqual(["PLAT-1", "WEB-2", "MISC-3"]);
  });
});

describe("filterTrackerTasks query", () => {
  const items = [
    makeItem({
      key: "PLAT-2",
      title: "Retry uploads",
      labels: [{ name: "backend" }],
    }),
    makeItem({
      key: "PLAT-24",
      title: "Upload metrics dashboard",
      labels: [{ name: "backend" }, { name: "metrics" }],
    }),
    makeItem({
      key: "WEB-7",
      title: "Composer spacing",
      project: null,
      team: { key: "WEB", name: "Web Team" },
      labels: [{ name: "Frontend" }],
    }),
  ];

  it("treats a bare key as an exact match, not a prefix", () => {
    const result = filterTrackerTasks(items, filterWith({ query: "plat-2" }), {
      now: NOW,
    });
    expect(keysOf(result)).toEqual(["PLAT-2"]);
  });

  it("matches a leading #label token", () => {
    const result = filterTrackerTasks(
      items,
      filterWith({ query: "#frontend" }),
      { now: NOW },
    );
    expect(keysOf(result)).toEqual(["WEB-7"]);
  });

  it("combines a #label token with the remaining free text", () => {
    const result = filterTrackerTasks(
      items,
      filterWith({ query: "#backend dashboard" }),
      { now: NOW },
    );
    expect(keysOf(result)).toEqual(["PLAT-24"]);
  });

  it("treats a bare # as free text rather than a label constraint", () => {
    const result = filterTrackerTasks(items, filterWith({ query: "#" }), {
      now: NOW,
    });
    expect(result).toEqual([]);
  });

  it("matches title, project name, team name and labels case-insensitively", () => {
    expect(
      keysOf(
        filterTrackerTasks(items, filterWith({ query: "UPLOAD" }), {
          now: NOW,
        }),
      ),
    ).toEqual(["PLAT-2", "PLAT-24"]);
    expect(
      keysOf(
        filterTrackerTasks(items, filterWith({ query: "platform" }), {
          now: NOW,
        }),
      ),
    ).toEqual(["PLAT-2", "PLAT-24"]);
    expect(
      keysOf(
        filterTrackerTasks(items, filterWith({ query: "web team" }), {
          now: NOW,
        }),
      ),
    ).toEqual(["WEB-7"]);
    expect(
      keysOf(
        filterTrackerTasks(items, filterWith({ query: "metrics" }), {
          now: NOW,
        }),
      ),
    ).toEqual(["PLAT-24"]);
  });

  it("ignores a whitespace-only query", () => {
    const result = filterTrackerTasks(items, filterWith({ query: "   " }), {
      now: NOW,
    });
    expect(result).toBe(items);
  });
});

describe("project chip helpers", () => {
  it("prefers the project, then the team, then the empty bucket", () => {
    expect(projectFilterKeyForTask(makeTask())).toBe("proj-platform");
    expect(projectFilterLabelForTask(makeTask())).toBe("Platform");

    const teamOnly = makeTask({ project: null });
    expect(projectFilterKeyForTask(teamOnly)).toBe("PLAT");
    expect(projectFilterLabelForTask(teamOnly)).toBe("Platform Team");

    const neither = makeTask({ project: null, team: null });
    expect(projectFilterKeyForTask(neither)).toBe("");
    expect(projectFilterLabelForTask(neither)).toBe("No project");
  });
});

describe("countActiveTrackerTaskFilters", () => {
  it("counts each constrained dimension once and ignores the view", () => {
    expect(
      countActiveTrackerTaskFilters(createTrackerTaskFilter("in-stave")),
    ).toBe(0);
    expect(
      countActiveTrackerTaskFilters(
        filterWith({ sources: ["crane", "jira"], labels: ["a"] }),
      ),
    ).toBe(2);
    expect(
      countActiveTrackerTaskFilters(
        filterWith({
          sources: ["crane"],
          statusCategories: ["todo"],
          priorities: ["high"],
          projectKeys: ["p"],
          labels: ["l"],
          linked: "linked",
          query: "x",
        }),
      ),
    ).toBe(7);
  });

  it("does not count a whitespace-only query", () => {
    expect(countActiveTrackerTaskFilters(filterWith({ query: "  " }))).toBe(0);
  });
});
