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

const NOW = new Date("2026-03-05T09:00:00.000Z");

const BASE_PROPS = {
  now: NOW,
  selectedKey: null as string | null,
  onSelect: () => {},
  onKickoff: () => {},
  onAttach: () => {},
  onOpenStaveTask: () => {},
  attachTargetLabel: null,
};

describe("TasksBoard", () => {
  test("renders a status column for every category and the card body", () => {
    const html = renderToStaticMarkup(
      createElement(TasksBoard, {
        ...BASE_PROPS,
        items: [
          makeItem({
            key: "ATL-201",
            title: "Offline edits drop",
            status: { raw: "In Progress", category: "in_progress" },
          }),
        ],
        selectedKey: "jira:ATL-201",
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

  test("gives an empty column a placeholder instead of a bare header", () => {
    const html = renderToStaticMarkup(
      createElement(TasksBoard, {
        ...BASE_PROPS,
        items: [
          makeItem({
            key: "ATL-201",
            status: { raw: "In Progress", category: "in_progress" },
          }),
        ],
      }),
    );
    // Five categories, one of them populated: the other four say "nothing
    // here" rather than collapsing to a bare header.
    expect(html.split("No tickets").length - 1).toBe(4);
    expect(html).toContain("ATL-201");
    // No drag contract exists here, so no column may invite a drop.
    expect(html).not.toContain("Drop cards here");
  });

  test("loading draws the column shape with placeholder cards and no rows", () => {
    const html = renderToStaticMarkup(
      createElement(TasksBoard, {
        ...BASE_PROPS,
        items: [],
        loading: true,
      }),
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-board-column="todo"');
    expect(html).toContain("To do, loading");
    // The placeholder must not be mistaken for the "nothing here" verdict.
    expect(html).not.toContain("No tickets");
  });

  test("carries the ownership signals the list row carries", () => {
    const html = renderToStaticMarkup(
      createElement(TasksBoard, {
        ...BASE_PROPS,
        items: [
          makeItem({
            key: "ATL-207",
            title: "Reconnect races a merge",
            // Two days before `NOW`, so the card must surface the overdue date.
            dueDate: "2026-03-03",
          }),
        ],
      }),
    );
    expect(html).toContain("2d overdue");
  });

  test("clamps a long title instead of widening the column", () => {
    const title = "supercalifragilistic".repeat(12);
    const html = renderToStaticMarkup(
      createElement(TasksBoard, {
        ...BASE_PROPS,
        items: [makeItem({ key: "ATL-208", title })],
      }),
    );
    // The full text stays reachable on hover even though the box clamps it.
    expect(html).toContain(`title="${title}"`);
  });
});
