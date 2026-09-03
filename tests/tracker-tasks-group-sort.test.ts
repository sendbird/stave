import { describe, expect, it } from "bun:test";

import {
  TRACKER_TASK_GROUP_MODES,
  groupTrackerTasks,
  trackerDueBucket,
} from "@/lib/tracker-tasks/group";
import {
  TRACKER_TASK_SORTS,
  compareTrackerKeys,
  compareTrackerTasks,
  sortTrackerTasks,
} from "@/lib/tracker-tasks/sort";
import type {
  TrackerTask,
  TrackerTaskListItem,
} from "@/lib/tracker-tasks/types";

// Tuesday, 10 March 2026, in whatever timezone the test host runs in. Due dates
// are calendar dates, so every expectation below is a local-day expectation.
const NOW = new Date(2026, 2, 10, 12, 0, 0);
const SUNDAY = new Date(2026, 2, 15, 23, 0, 0);

function makeTask(overrides: Partial<TrackerTask> = {}): TrackerTask {
  return {
    source: "crane",
    ref: overrides.key ?? "PLAT-1",
    key: "PLAT-1",
    title: "A ticket",
    url: "https://example.invalid/PLAT-1",
    status: { raw: "To Do", category: "todo" },
    priority: { raw: "Medium", level: "medium" },
    assignee: null,
    labels: [],
    dueDate: null,
    effort: null,
    project: null,
    team: null,
    parentKey: null,
    subtasks: null,
    issueType: null,
    links: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    closedAt: null,
    ...overrides,
  };
}

function makeItem(overrides: Partial<TrackerTask> = {}): TrackerTaskListItem {
  return { task: makeTask(overrides), staveLinks: [] };
}

function keysOf(items: TrackerTaskListItem[]): string[] {
  return items.map((item) => item.task.key);
}

describe("groupTrackerTasks by status", () => {
  it("orders groups by what needs attention first", () => {
    const items = [
      makeItem({ key: "A-1", status: { raw: "Closed", category: "closed" } }),
      makeItem({ key: "A-2", status: { raw: "To Do", category: "todo" } }),
      makeItem({
        key: "A-3",
        status: { raw: "Doing", category: "in_progress" },
      }),
      makeItem({
        key: "A-4",
        status: { raw: "Review", category: "in_review" },
      }),
      makeItem({ key: "A-5", status: { raw: "Done", category: "done" } }),
      makeItem({
        key: "A-6",
        status: { raw: "Doing", category: "in_progress" },
      }),
    ];
    const groups = groupTrackerTasks(items, "status", { now: NOW });
    expect(groups.map((group) => group.id)).toEqual([
      "in_progress",
      "in_review",
      "todo",
      "done",
      "closed",
    ]);
    expect(groups.map((group) => group.label)).toEqual([
      "In progress",
      "In review",
      "To do",
      "Done",
      "Closed",
    ]);
    // Input order survives inside a group.
    expect(keysOf(groups[0]!.items)).toEqual(["A-3", "A-6"]);
  });

  it("drops empty groups", () => {
    const groups = groupTrackerTasks(
      [makeItem({ key: "A-1", status: { raw: "To Do", category: "todo" } })],
      "status",
      { now: NOW },
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.id).toBe("todo");
  });

  it("returns nothing for an empty list", () => {
    expect(groupTrackerTasks([], "status", { now: NOW })).toEqual([]);
    expect(groupTrackerTasks([], "due", { now: NOW })).toEqual([]);
  });

  it("exposes both modes", () => {
    expect([...TRACKER_TASK_GROUP_MODES]).toEqual(["status", "due"]);
  });
});

describe("groupTrackerTasks by due date", () => {
  it("buckets around the local calendar week", () => {
    const items = [
      makeItem({ key: "D-1", dueDate: "2026-03-16" }),
      makeItem({ key: "D-2", dueDate: "2026-03-10" }),
      makeItem({ key: "D-3", dueDate: null }),
      makeItem({ key: "D-4", dueDate: "2026-03-09" }),
      makeItem({ key: "D-5", dueDate: "2026-03-15" }),
      makeItem({ key: "D-6", dueDate: "2026-03-11" }),
    ];
    const groups = groupTrackerTasks(items, "due", { now: NOW });
    expect(groups.map((group) => group.label)).toEqual([
      "Overdue",
      "Today",
      "This week",
      "Later",
      "No due date",
    ]);
    expect(keysOf(groups[2]!.items)).toEqual(["D-5", "D-6"]);
  });

  it("treats the last day of the week as inclusive and the next day as later", () => {
    expect(trackerDueBucket("2026-03-15", NOW)).toBe("this-week");
    expect(trackerDueBucket("2026-03-16", NOW)).toBe("later");
  });

  it("leaves This week empty on the last day of the week", () => {
    // Sunday closes the week, so nothing future can still be "this week".
    expect(trackerDueBucket("2026-03-15", SUNDAY)).toBe("today");
    expect(trackerDueBucket("2026-03-16", SUNDAY)).toBe("later");
    const groups = groupTrackerTasks(
      [makeItem({ key: "D-1", dueDate: "2026-03-16" })],
      "due",
      { now: SUNDAY },
    );
    expect(groups.map((group) => group.id)).toEqual(["later"]);
  });

  it("reads a due date as a local calendar date, never UTC midnight", () => {
    // Late evening local time: a UTC reading would shift the day for anyone
    // west of Greenwich and report today's ticket as overdue.
    expect(trackerDueBucket("2026-03-10", new Date(2026, 2, 10, 23, 30))).toBe(
      "today",
    );
    expect(trackerDueBucket("2026-03-10", new Date(2026, 2, 10, 0, 30))).toBe(
      "today",
    );
  });

  it("files an impossible or malformed date under No due date", () => {
    expect(trackerDueBucket("2026-02-31", NOW)).toBe("none");
    expect(trackerDueBucket("not-a-date", NOW)).toBe("none");
    expect(trackerDueBucket(null, NOW)).toBe("none");
  });
});

describe("compareTrackerKeys", () => {
  it("compares digit runs numerically", () => {
    expect(compareTrackerKeys("ABC-9", "ABC-10")).toBeLessThan(0);
    expect(compareTrackerKeys("ABC-10", "ABC-9")).toBeGreaterThan(0);
    expect(compareTrackerKeys("ABC-10", "ABC-10")).toBe(0);
    expect(compareTrackerKeys("ABC-1", "ABD-1")).toBeLessThan(0);
    expect(compareTrackerKeys("abc-2", "ABC-10")).toBeLessThan(0);
  });
});

describe("sortTrackerTasks", () => {
  it("exposes every sort", () => {
    expect([...TRACKER_TASK_SORTS]).toEqual([
      "priority",
      "due",
      "updated",
      "key",
    ]);
  });

  it("sorts priority urgent to none", () => {
    const items = [
      makeItem({ key: "P-1", priority: { raw: null, level: "none" } }),
      makeItem({ key: "P-2", priority: { raw: "High", level: "high" } }),
      makeItem({ key: "P-3", priority: { raw: "Urgent", level: "urgent" } }),
      makeItem({ key: "P-4", priority: { raw: "Low", level: "low" } }),
      makeItem({ key: "P-5", priority: { raw: "Medium", level: "medium" } }),
    ];
    expect(keysOf(sortTrackerTasks(items, "priority"))).toEqual([
      "P-3",
      "P-2",
      "P-5",
      "P-4",
      "P-1",
    ]);
  });

  it("sorts due dates ascending with undated rows last", () => {
    const items = [
      makeItem({ key: "D-1", dueDate: null }),
      makeItem({ key: "D-2", dueDate: "2026-03-20" }),
      makeItem({ key: "D-3", dueDate: "2026-03-02" }),
      makeItem({ key: "D-4", dueDate: "not-a-date" }),
    ];
    expect(keysOf(sortTrackerTasks(items, "due"))).toEqual([
      "D-3",
      "D-2",
      "D-1",
      "D-4",
    ]);
  });

  it("sorts updated newest first", () => {
    const items = [
      makeItem({ key: "U-1", updatedAt: "2026-03-01T00:00:00.000Z" }),
      makeItem({ key: "U-2", updatedAt: "2026-03-05T00:00:00.000Z" }),
      makeItem({ key: "U-3", updatedAt: "2026-02-01T00:00:00.000Z" }),
    ];
    expect(keysOf(sortTrackerTasks(items, "updated"))).toEqual([
      "U-2",
      "U-1",
      "U-3",
    ]);
  });

  it("sorts keys naturally", () => {
    const items = [
      makeItem({ key: "ABC-10" }),
      makeItem({ key: "ABC-9" }),
      makeItem({ key: "ABD-1" }),
    ];
    expect(keysOf(sortTrackerTasks(items, "key"))).toEqual([
      "ABC-9",
      "ABC-10",
      "ABD-1",
    ]);
  });

  it("breaks every tie on source then key, so refreshes cannot reshuffle", () => {
    const tied = [
      makeItem({
        key: "ZZ-2",
        source: "jira",
        priority: { raw: "High", level: "high" },
      }),
      makeItem({
        key: "AA-10",
        source: "crane",
        priority: { raw: "High", level: "high" },
      }),
      makeItem({
        key: "AA-2",
        source: "crane",
        priority: { raw: "High", level: "high" },
      }),
      makeItem({
        key: "AA-2",
        source: "jira",
        priority: { raw: "High", level: "high" },
      }),
    ];
    const expected = ["AA-2", "AA-10", "AA-2", "ZZ-2"];
    expect(keysOf(sortTrackerTasks(tied, "priority"))).toEqual(expected);
    // The same input in a different arrival order lands in the same place.
    expect(keysOf(sortTrackerTasks([...tied].reverse(), "priority"))).toEqual(
      expected,
    );
    // Undated rows tie on the due sort too and must not jitter.
    expect(keysOf(sortTrackerTasks(tied, "due"))).toEqual(expected);
    expect(keysOf(sortTrackerTasks([...tied].reverse(), "due"))).toEqual(
      expected,
    );
  });

  it("never compares two distinct rows as equal", () => {
    const compare = compareTrackerTasks("updated");
    const a = makeItem({ key: "AA-1", source: "crane" });
    const b = makeItem({ key: "AA-1", source: "jira" });
    expect(compare(a, b)).toBeLessThan(0);
    expect(compare(b, a)).toBeGreaterThan(0);
    expect(compare(a, a)).toBe(0);
  });

  it("returns a new array and leaves the input untouched", () => {
    const items = [makeItem({ key: "B-1" }), makeItem({ key: "A-1" })];
    const sorted = sortTrackerTasks(items, "key");
    expect(sorted).not.toBe(items);
    expect(keysOf(items)).toEqual(["B-1", "A-1"]);
    expect(keysOf(sorted)).toEqual(["A-1", "B-1"]);
  });
});
