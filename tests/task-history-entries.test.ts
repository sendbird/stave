import { describe, expect, test } from "bun:test";
import { appendOpenTaskTabForHostCreatedTask, selectTaskHistoryEntries, placeTaskInHistory, resetTaskHistoryOrder } from "../src/lib/tasks";
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

describe("appendOpenTaskTabForHostCreatedTask", () => {
  test("appends a live top-level task to an explicit tab list", () => {
    expect(
      appendOpenTaskTabForHostCreatedTask({
        openTaskTabIds: ["open"],
        task: buildTask({ id: "created" }),
      }),
    ).toEqual(["open", "created"]);
  });

  test("leaves delegated children and archived tasks off the tab strip", () => {
    expect(
      appendOpenTaskTabForHostCreatedTask({
        openTaskTabIds: ["open"],
        task: buildTask({ id: "child", parentTaskId: "open" }),
      }),
    ).toEqual(["open"]);
    expect(
      appendOpenTaskTabForHostCreatedTask({
        openTaskTabIds: ["open"],
        task: buildTask({
          id: "archived",
          archivedAt: "2026-03-09T00:00:00.000Z",
        }),
      }),
    ).toEqual(["open"]);
  });

  test("does not materialize a missing legacy tab list", () => {
    expect(
      appendOpenTaskTabForHostCreatedTask({
        openTaskTabIds: undefined,
        task: buildTask({ id: "created" }),
      }),
    ).toBeUndefined();
  });
});


test("history puts pinned tasks first and otherwise keeps activity order", () => {
  const tasks = [
    buildTask({ id: "old", updatedAt: "2026-03-01", pinned: true }),
    buildTask({ id: "new", updatedAt: "2026-03-10" }),
    buildTask({ id: "middle", updatedAt: "2026-03-05" }),
  ];
  expect(selectTaskHistoryEntries({ tasks, openTaskTabIds: [] }).map(t => t.id))
    .toEqual(["old", "new", "middle"]);
});

const NOW = Date.parse("2026-03-12T00:00:00.000Z");
const history = (tasks: Task[]) => selectTaskHistoryEntries({ tasks, openTaskTabIds: [] }).map(t => t.id);

test("a history reorder stores a stable key that survives activity, prepending and new tasks", () => {
  const tasks = [
    buildTask({ id: "old", updatedAt: "2026-03-01T00:00:00.000Z" }),
    buildTask({ id: "middle", updatedAt: "2026-03-05T00:00:00.000Z" }),
    buildTask({ id: "new", updatedAt: "2026-03-10T00:00:00.000Z" }),
  ];
  const reordered = placeTaskInHistory({ tasks, activeTaskId: "old", overTaskId: "new", visibleTaskIds: ["new", "middle", "old"], now: NOW });
  expect(history(reordered)).toEqual(["old", "new", "middle"]);
  const key = reordered.find(t => t.id === "old")!.historyOrderKey;
  expect(key).toBeNumber();
  expect(Number.isInteger(key) && key! < tasks.length).toBe(false);
  // Activity on a placed task does not move it; a fresh task enters first.
  const later = reordered.map(t => t.id === "old" ? { ...t, updatedAt: "2026-03-01T12:00:00.000Z" } : t);
  const withNewTask = [buildTask({ id: "fresh", updatedAt: "2026-03-20T00:00:00.000Z" }), ...later];
  expect(history(withNewTask)).toEqual(["fresh", "old", "new", "middle"]);
  // A task closed later (no key) still sorts by its activity instead of sinking.
  const closed = [...withNewTask, buildTask({ id: "closed", updatedAt: "2026-03-11T00:00:00.000Z" })];
  expect(history(closed)).toEqual(["fresh", "old", "closed", "new", "middle"]);
});

test("a filtered reorder places the task between its visible neighbours only", () => {
  const tasks = [
    buildTask({ id: "a", updatedAt: "2026-03-10T00:00:00.000Z" }),
    buildTask({ id: "hidden", updatedAt: "2026-03-08T00:00:00.000Z" }),
    buildTask({ id: "b", updatedAt: "2026-03-06T00:00:00.000Z" }),
    buildTask({ id: "c", updatedAt: "2026-03-02T00:00:00.000Z" }),
  ];
  const reordered = placeTaskInHistory({ tasks, activeTaskId: "c", overTaskId: "b", visibleTaskIds: ["a", "b", "c"], now: NOW });
  expect(history(reordered)).toEqual(["a", "hidden", "c", "b"]);
  expect(reordered.filter(t => t.historyOrderKey !== undefined).map(t => t.id)).toEqual(["c"]);
  // Repeated moves into the same gap keep a strict order.
  let current = reordered;
  for (let index = 0; index < 80; index++) {
    const mover = index % 2 ? "b" : "c";
    const visible = history(current).filter(id => id !== "hidden");
    const target = visible[visible.indexOf(mover) === 1 ? 2 : 1]!;
    current = placeTaskInHistory({ tasks: current, activeTaskId: mover, overTaskId: target, visibleTaskIds: visible, now: NOW });
  }
  expect(new Set(history(current)).size).toBe(4);
});

test("pinned tasks stay first, a move never crosses the pin boundary, and reset returns to activity order", () => {
  const tasks = [
    buildTask({ id: "pinned", updatedAt: "2026-03-01T00:00:00.000Z", pinned: true }),
    buildTask({ id: "new", updatedAt: "2026-03-10T00:00:00.000Z" }),
    buildTask({ id: "old", updatedAt: "2026-03-02T00:00:00.000Z" }),
  ];
  expect(placeTaskInHistory({ tasks, activeTaskId: "old", overTaskId: "pinned", visibleTaskIds: ["pinned", "new", "old"], now: NOW })).toBe(tasks);
  const reordered = placeTaskInHistory({ tasks, activeTaskId: "old", overTaskId: "new", visibleTaskIds: ["pinned", "new", "old"], now: NOW });
  expect(history(reordered)).toEqual(["pinned", "old", "new"]);
  const reset = resetTaskHistoryOrder(reordered);
  expect(history(reset)).toEqual(["pinned", "new", "old"]);
  expect(resetTaskHistoryOrder(tasks)).toBe(tasks);
});
