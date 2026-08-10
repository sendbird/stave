import { describe, expect, test } from "bun:test";
import { buildWorkspaceHoverPreview } from "@/components/layout/ProjectWorkspaceSidebar.utils";
import { selectFleetOpenTasks } from "@/lib/fleet/workspace-activity";
import {
  filterTasksByName,
  getRespondingTasks,
  getTaskCounts,
  getVisibleTasks,
  isDelegatedChildTask,
  reconcileTasksWithPersistedArchival,
  selectTaskHistoryEntries,
} from "@/lib/tasks";
import { buildWorkspaceSessionState } from "@/store/workspace-session-state";
import { createEmptyWorkspaceInformation } from "@/lib/workspace-information";
import type { Task } from "@/types/chat";

/**
 * A delegated child task lives in a workspace task list like any other row, but
 * it is only ever meant to be read under the parent that delegated it. These
 * cover the two halves of that: the listing surfaces drop it, and the paths that
 * deliberately walk every task keep it.
 */

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-parent",
    title: "Ship the checkout fix",
    provider: "codex",
    updatedAt: "2026-08-10T00:00:00.000Z",
    unread: false,
    archivedAt: null,
    controlMode: "interactive",
    controlOwner: "stave",
    ...overrides,
  };
}

function buildChildTask(overrides: Partial<Task> = {}): Task {
  return buildTask({
    id: "task-child",
    title: "Review the checkout fix",
    updatedAt: "2026-08-10T00:00:01.000Z",
    controlMode: "managed",
    controlOwner: "external",
    parentTaskId: "task-parent",
    ...overrides,
  });
}

describe("isDelegatedChildTask", () => {
  test("marks only a task that carries a parent link", () => {
    expect(isDelegatedChildTask(buildChildTask())).toBe(true);
    expect(isDelegatedChildTask(buildTask())).toBe(false);
    expect(isDelegatedChildTask(buildTask({ parentTaskId: null }))).toBe(false);
  });
});

describe("workspace task listings exclude delegated child tasks", () => {
  const parent = buildTask();
  const child = buildChildTask();
  const tasks = [parent, child];

  test("getVisibleTasks drops the child under every filter", () => {
    for (const filter of ["active", "archived", "all"] as const) {
      const visible = getVisibleTasks({ tasks, filter });
      expect(visible.map((task) => task.id)).not.toContain("task-child");
    }
    expect(getVisibleTasks({ tasks, filter: "active" }).map((t) => t.id)).toEqual([
      "task-parent",
    ]);
  });

  test("getTaskCounts counts the parent only", () => {
    expect(getTaskCounts({ tasks })).toEqual({
      active: 1,
      archived: 0,
      all: 1,
    });
  });

  test("task history never offers a child as a past task", () => {
    // No open tabs at all, so every non-child task qualifies for history.
    const entries = selectTaskHistoryEntries({ tasks, openTaskTabIds: [] });
    expect(entries.map((task) => task.id)).toEqual(["task-parent"]);
  });

  test("task history ignores a child when deriving the legacy open set", () => {
    const entries = selectTaskHistoryEntries({ tasks, openTaskTabIds: null });
    expect(entries).toHaveLength(0);
  });

  test("name filtering cannot surface a child, matching query or not", () => {
    expect(
      filterTasksByName({ tasks, query: "checkout" }).map((task) => task.id),
    ).toEqual(["task-parent"]);
    expect(filterTasksByName({ tasks, query: "" }).map((task) => task.id)).toEqual(
      ["task-parent"],
    );
    // A list with no children keeps its own array reference.
    const parentOnly = [parent];
    expect(filterTasksByName({ tasks: parentOnly, query: "" })).toBe(parentOnly);
  });

  test("selectFleetOpenTasks counts neither archived nor delegated tasks", () => {
    const archived = buildTask({
      id: "task-archived",
      archivedAt: "2026-08-09T00:00:00.000Z",
    });
    expect(
      selectFleetOpenTasks([parent, child, archived]).map((task) => task.id),
    ).toEqual(["task-parent"]);
  });

  test("the sidebar hover preview does not inflate its task count", () => {
    const preview = buildWorkspaceHoverPreview({
      tasks,
      messageCountByTask: { "task-parent": 4, "task-child": 9 },
      activeTurnIdsByTask: { "task-child": "turn-child" },
    });

    expect(preview.taskCount).toBe(1);
    expect(preview.taskTitles).toEqual(["Ship the checkout fix"]);
    expect(preview.messageCount).toBe(4);
    expect(preview.runningTaskCount).toBe(0);
    expect(preview.isEmpty).toBe(false);
  });
});

describe("paths that walk every task still see delegated children", () => {
  test("the responding-task check still reports a child mid-turn", () => {
    // Guards the quit/update warning: a child running a provider turn is real
    // in-flight work, so hiding it from listings must not hide it from here.
    const responding = getRespondingTasks({
      tasks: [buildTask(), buildChildTask()],
      activeTurnIdsByTask: { "task-child": "turn-child" },
    });

    expect(responding.map((task) => task.id)).toEqual(["task-child"]);
  });

  test("archival reconciliation still reaches a child row", () => {
    const reconciled = reconcileTasksWithPersistedArchival({
      tasks: [buildTask(), buildChildTask()],
      persistedTasks: [
        { id: "task-child", archivedAt: "2026-08-10T02:00:00.000Z" },
      ],
    });

    expect(reconciled).toHaveLength(2);
    expect(reconciled[1]?.archivedAt).toBe("2026-08-10T02:00:00.000Z");
    expect(reconciled[1]?.parentTaskId).toBe("task-parent");
  });
});

describe("hydration of persisted task rows", () => {
  function buildSnapshot(tasks: Array<Record<string, unknown>>) {
    return {
      activeTaskId: "task-parent",
      tasks: tasks as unknown as Task[],
      promptDraftByTask: {},
      providerSessionByTask: {},
      editorTabs: [],
      activeEditorTabId: null,
      terminalTabs: [],
      activeTerminalTabId: null,
      terminalDocked: false,
      cliSessionTabs: [],
      activeCliSessionTabId: null,
      activeSurface: { kind: "task" as const, taskId: "task-parent" },
      workspaceInformation: createEmptyWorkspaceInformation(),
      messageCountByTask: {},
      messagesByTask: {},
      lensTabs: [],
      paneTabMeta: {},
      dockLayout: null,
    };
  }

  test("a snapshot written before parentTaskId existed loads as non-child", () => {
    const built = buildWorkspaceSessionState({
      snapshot: buildSnapshot([
        {
          id: "task-parent",
          title: "Ship the checkout fix",
          provider: "codex",
          updatedAt: "2026-08-10T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ]),
    });

    const [task] = built.tasks;
    expect(built.tasks).toHaveLength(1);
    expect(task?.parentTaskId).toBeUndefined();
    expect(isDelegatedChildTask(task as Task)).toBe(false);
    // No migration ran, so control normalization is still the only rewrite.
    expect(task?.controlMode).toBe("interactive");
    expect(task?.controlOwner).toBe("stave");
    expect(getVisibleTasks({ tasks: built.tasks, filter: "active" })).toHaveLength(
      1,
    );
  });

  test("a snapshot that already carries parentTaskId keeps the link", () => {
    const built = buildWorkspaceSessionState({
      snapshot: buildSnapshot([
        {
          id: "task-child",
          title: "Review the checkout fix",
          provider: "codex",
          updatedAt: "2026-08-10T00:00:00.000Z",
          unread: false,
          archivedAt: null,
          controlMode: "managed",
          controlOwner: "external",
          parentTaskId: "task-parent",
        },
      ]),
    });

    expect(built.tasks[0]?.parentTaskId).toBe("task-parent");
    expect(getVisibleTasks({ tasks: built.tasks, filter: "active" })).toHaveLength(
      0,
    );
  });
});
