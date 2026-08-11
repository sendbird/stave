import { describe, expect, test } from "bun:test";
import { selectTaskHistoryEntries } from "../src/lib/tasks";
import type { Task } from "../src/types/chat";

function buildTask(overrides: Partial<Task> & Pick<Task, "id">): Task {
  return {
    title: overrides.id,
    provider: "claude-code",
    updatedAt: "2026-03-10T00:00:00.000Z",
    unread: false,
    archivedAt: null,
    ...overrides,
  };
}

describe("selectTaskHistoryEntries", () => {
  test("keeps archived tasks", () => {
    const archived = buildTask({
      id: "archived",
      archivedAt: "2026-03-09T00:00:00.000Z",
    });

    expect(
      selectTaskHistoryEntries({ tasks: [archived], openTaskTabIds: [] }).map(
        (task) => task.id,
      ),
    ).toEqual(["archived"]);
  });

  test("keeps a live task whose tab was closed without archiving", () => {
    // `closeTaskTab` closes the pane without archiving. Such a task is rendered
    // by no surface, so an archived-only history list strands it permanently.
    const closed = buildTask({ id: "closed" });

    expect(
      selectTaskHistoryEntries({ tasks: [closed], openTaskTabIds: [] }).map(
        (task) => task.id,
      ),
    ).toEqual(["closed"]);
  });

  test("drops a live task that still occupies a pane tab", () => {
    const open = buildTask({ id: "open" });

    expect(
      selectTaskHistoryEntries({ tasks: [open], openTaskTabIds: ["open"] }),
    ).toEqual([]);
  });

  test("keeps an archived task even when it lingers in the open tab ids", () => {
    const archived = buildTask({
      id: "archived",
      archivedAt: "2026-03-09T00:00:00.000Z",
    });

    expect(
      selectTaskHistoryEntries({
        tasks: [archived],
        openTaskTabIds: ["archived"],
      }).map((task) => task.id),
    ).toEqual(["archived"]);
  });

  test("treats unknown pane state as every live task open", () => {
    // Mirrors `normalizePaneState`: a shell summary that predates
    // `openTaskTabIds` means "all non-archived tasks open", so an unknown pane
    // state must not report live tasks as closed.
    const live = buildTask({ id: "live" });

    expect(
      selectTaskHistoryEntries({ tasks: [live], openTaskTabIds: null }),
    ).toEqual([]);
  });

  test("keeps archived tasks when the pane state is unknown", () => {
    const archived = buildTask({
      id: "archived",
      archivedAt: "2026-03-09T00:00:00.000Z",
    });
    const live = buildTask({ id: "live" });

    expect(
      selectTaskHistoryEntries({
        tasks: [archived, live],
        openTaskTabIds: null,
      }).map((task) => task.id),
    ).toEqual(["archived"]);
  });

  test("orders entries most recently updated first", () => {
    const older = buildTask({
      id: "older",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    const newer = buildTask({
      id: "newer",
      updatedAt: "2026-03-20T00:00:00.000Z",
    });

    expect(
      selectTaskHistoryEntries({
        tasks: [older, newer],
        openTaskTabIds: [],
      }).map((task) => task.id),
    ).toEqual(["newer", "older"]);
  });
});
