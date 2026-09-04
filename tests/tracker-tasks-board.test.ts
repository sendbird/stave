import { describe, expect, it } from "bun:test";

import { groupTrackerTasksForBoard } from "@/lib/tracker-tasks/board";
import type {
  TrackerTask,
  TrackerTaskListItem,
} from "@/lib/tracker-tasks/types";

function makeItem(overrides: Partial<TrackerTask> = {}): TrackerTaskListItem {
  return {
    task: {
      source: "jira",
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
    },
    staveLinks: [],
  };
}

describe("groupTrackerTasksForBoard", () => {
  it("keeps every status column even when some are empty", () => {
    const columns = groupTrackerTasksForBoard([
      makeItem({
        key: "A-1",
        status: { raw: "In Progress", category: "in_progress" },
      }),
      makeItem({ key: "A-2", status: { raw: "To Do", category: "todo" } }),
    ]);
    expect(columns.map((column) => column.id)).toEqual([
      "todo",
      "in_progress",
      "in_review",
      "done",
      "closed",
    ]);
    expect(columns[0]?.items.map((item) => item.task.key)).toEqual(["A-2"]);
    expect(columns[1]?.items.map((item) => item.task.key)).toEqual(["A-1"]);
    expect(columns[2]?.items).toEqual([]);
  });

  it("preserves incoming order inside a column", () => {
    const columns = groupTrackerTasksForBoard([
      makeItem({ key: "B-2", status: { raw: "To Do", category: "todo" } }),
      makeItem({ key: "B-1", status: { raw: "To Do", category: "todo" } }),
    ]);
    expect(columns[0]?.items.map((item) => item.task.key)).toEqual([
      "B-2",
      "B-1",
    ]);
  });
});
