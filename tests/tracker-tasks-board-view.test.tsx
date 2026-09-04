import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TasksBoard } from "@/components/layout/tasks/TasksBoard";
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
      assignee: { id: "u1", name: "Mara Ito" },
      labels: [{ name: "sync" }],
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

describe("TasksBoard", () => {
  test("renders a status column for every category and the card body", () => {
    const html = renderToStaticMarkup(
      createElement(TasksBoard, {
        items: [
          makeItem({
            key: "ATL-201",
            title: "Offline edits drop",
            status: { raw: "In Progress", category: "in_progress" },
          }),
        ],
        selectedKey: "jira:ATL-201",
        onSelect: () => {},
      }),
    );
    expect(html).toContain("data-stave-tasks-board");
    expect(html).toContain('data-board-column="todo"');
    expect(html).toContain('data-board-column="in_progress"');
    expect(html).toContain("ATL-201");
    expect(html).toContain("Offline edits drop");
    expect(html).toContain("MI");
    expect(html).toContain("sync");
  });
});
