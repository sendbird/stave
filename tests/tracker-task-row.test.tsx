import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TrackerTaskRow } from "@/components/layout/tasks/TrackerTaskRow";
import { resolvePrimaryTrackerTaskLink } from "@/components/layout/tasks/tracker-task-ui";
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
    priority: { raw: "Urgent", level: "urgent" },
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

function renderRow(item: TrackerTaskListItem, selected = false) {
  return renderToStaticMarkup(
    createElement(TrackerTaskRow, {
      item,
      now: NOW,
      selected,
      onSelect: () => {},
      onKickoff: () => {},
      onAttach: () => {},
      onOpenStaveTask: () => {},
      attachTargetLabel: "feat/tasks",
    }),
  );
}

describe("TrackerTaskRow", () => {
  test("shows the key, title, status and priority a scanner needs", () => {
    const html = renderRow({ task: makeTask(), staveLinks: [] });

    expect(html).toContain("PLAT-1");
    expect(html).toContain("Fix the flaky upload retry");
    expect(html).toContain("In progress");
    expect(html).toContain('aria-label="Urgent"');
    expect(html).toContain('aria-selected="false"');
    expect(html).toContain('data-tracker-task-key="crane:PLAT-1"');
  });

  test("strikes through finished work and keeps it readable", () => {
    const html = renderRow({
      task: makeTask({
        status: { raw: "Done", category: "done" },
        closedAt: "2026-03-08T00:00:00.000Z",
      }),
      staveLinks: [],
    });

    expect(html).toContain("line-through");
    expect(html).toContain("Done");
  });

  test("renders an overdue due date in the destructive tone", () => {
    const html = renderRow({
      task: makeTask({ dueDate: "2026-03-08" }),
      staveLinks: [],
    });

    expect(html).toContain("2d overdue");
    expect(html).toContain("text-destructive");
  });

  test("keeps a tracker label colour out of the DOM unless it is safe", () => {
    const unsafe = renderRow({
      task: makeTask({
        labels: [{ name: "infra", color: "url(javascript:alert(1))" }],
      }),
      staveLinks: [],
    });
    expect(unsafe).toContain("infra");
    expect(unsafe).not.toContain("javascript");
    // A class list legitimately names background-color in a transition, so the
    // assertion has to be about the inline style the label dot would emit.
    expect(unsafe).not.toContain("background-color:");

    const safe = renderRow({
      task: makeTask({ labels: [{ name: "infra", color: "#ff8800" }] }),
      staveLinks: [],
    });
    expect(safe).toContain("background-color:#ff8800");
  });

  test("paints a Crane semantic colour with a theme class, not an inline style", () => {
    // Crane names one of seven slots rather than sending a colour, so the dot
    // has to come from the theme — which also keeps an external string out of
    // the style attribute entirely.
    const html = renderRow({
      task: makeTask({ labels: [{ name: "backend", color: "info" }] }),
      staveLinks: [],
    });
    expect(html).toContain("bg-info");
    expect(html).not.toContain("background-color:");
  });

  test("collapses labels past the first two into a count", () => {
    const html = renderRow({
      task: makeTask({
        labels: [
          { name: "one" },
          { name: "two" },
          { name: "three" },
          { name: "four" },
        ],
      }),
      staveLinks: [],
    });

    expect(html).toContain("one");
    expect(html).toContain("two");
    expect(html).not.toContain(">three<");
    expect(html).toContain("+2");
  });

  test("badges a ticket that already has a live Stave run", () => {
    const html = renderRow({
      task: makeTask(),
      staveLinks: [makeLink()],
    });

    expect(html).toContain("Running");
    expect(html).toContain("animate-pulse");
  });

  test("shows the mirrored Jira key when the ticket declares one", () => {
    const html = renderRow({
      task: makeTask({
        links: [
          {
            rel: "jira",
            key: "ABC-42",
            url: "https://example.atlassian.net/browse/ABC-42",
          },
        ],
      }),
      staveLinks: [],
    });

    expect(html).toContain("ABC-42");
  });

  test("falls back to a dash for an unassigned ticket", () => {
    const html = renderRow({
      task: makeTask({ assignee: null }),
      staveLinks: [],
    });

    expect(html).toContain('title="Unassigned"');
  });
});

describe("resolvePrimaryTrackerTaskLink", () => {
  test("returns nothing for a ticket that was never kicked off", () => {
    expect(resolvePrimaryTrackerTaskLink([])).toBeNull();
  });

  test("prefers a run that needs the user over one that is merely running", () => {
    const link = resolvePrimaryTrackerTaskLink([
      makeLink({ id: "a", state: "running" }),
      makeLink({ id: "b", state: "needs_input" }),
    ]);
    expect(link?.id).toBe("b");
  });

  test("prefers a live run over a finished one regardless of order", () => {
    const link = resolvePrimaryTrackerTaskLink([
      makeLink({ id: "old", state: "completed" }),
      makeLink({ id: "new", state: "running" }),
    ]);
    expect(link?.id).toBe("new");
  });

  test("surfaces a failed retry rather than the older success", () => {
    const link = resolvePrimaryTrackerTaskLink([
      makeLink({ id: "first", state: "completed" }),
      makeLink({ id: "retry", state: "failed" }),
    ]);
    expect(link?.id).toBe("retry");
  });

  test("breaks a same-state tie on the most recent update", () => {
    const link = resolvePrimaryTrackerTaskLink([
      makeLink({
        id: "older",
        state: "running",
        updatedAt: "2026-03-01T00:00:00.000Z",
      }),
      makeLink({
        id: "newer",
        state: "running",
        updatedAt: "2026-03-09T00:00:00.000Z",
      }),
    ]);
    expect(link?.id).toBe("newer");
  });
});
