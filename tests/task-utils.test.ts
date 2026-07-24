import { describe, expect, test } from "bun:test";
import {
  AUTO_TASK_NAME_HISTORY_MESSAGE_CHARS,
  AUTO_TASK_NAME_HISTORY_MESSAGES,
  AUTO_TASK_NAME_MAX_USER_TURNS,
  AUTO_TASK_NAME_PROMPT_CHARS,
  buildSuggestTaskNamePayload,
  findWorkspaceTaskOrThrow,
  getArchiveFallbackTaskId,
  getRespondingTasks,
  getRespondingProviderId,
  getTaskCounts,
  getVisibleTasks,
  isTaskArchived,
  normalizeSuggestedTaskTitle,
  reconcileTasksWithPersistedArchival,
  reorderTasksWithinFilter,
  shouldSuggestTaskName,
} from "../src/lib/tasks";
import type { ChatMessage, Task } from "../src/types/chat";

const tasks: Task[] = [
  {
    id: "task-active-1",
    title: "Active One",
    provider: "claude-code",
    updatedAt: "2026-03-10T01:00:00.000Z",
    unread: false,
    archivedAt: null,
  },
  {
    id: "task-archived-1",
    title: "Archived One",
    provider: "codex",
    updatedAt: "2026-03-10T02:00:00.000Z",
    unread: false,
    archivedAt: "2026-03-08T01:00:00.000Z",
  },
  {
    id: "task-active-2",
    title: "Active Two",
    provider: "codex",
    updatedAt: "2026-03-10T03:00:00.000Z",
    unread: true,
    archivedAt: null,
  },
];

describe("task utils", () => {
  test("uses the streaming assistant provider for responding tone", () => {
    const messages: ChatMessage[] = [
      {
        id: "m1",
        role: "assistant",
        model: "gpt-5.4",
        providerId: "codex",
        content: "",
        isStreaming: true,
        parts: [],
      },
    ];

    expect(getRespondingProviderId({ fallbackProviderId: "claude-code", messages })).toBe("codex");
  });

  test("ignores archived tasks when listing responding tasks", () => {
    expect(getRespondingTasks({
      tasks,
      activeTurnIdsByTask: {
        "task-active-1": "turn-1",
        "task-archived-1": "turn-2",
      },
    }).map((task) => task.id)).toEqual(["task-active-1"]);
  });

  test("falls back to the last assistant provider when a turn has no streaming marker", () => {
    const messages: ChatMessage[] = [
      {
        id: "m1",
        role: "assistant",
        model: "claude-sonnet-4-6",
        providerId: "claude-code",
        content: "Done",
        isStreaming: false,
        parts: [],
      },
    ];

    expect(getRespondingProviderId({ fallbackProviderId: "codex", messages })).toBe("claude-code");
  });

  test("filters archived and active task views", () => {
    expect(getVisibleTasks({ tasks, filter: "active" }).map((task) => task.id)).toEqual(["task-active-1", "task-active-2"]);
    expect(getVisibleTasks({ tasks, filter: "archived" }).map((task) => task.id)).toEqual(["task-archived-1"]);
    expect(getVisibleTasks({ tasks, filter: "all" }).map((task) => task.id)).toEqual(tasks.map((task) => task.id));
  });

  test("counts task buckets", () => {
    expect(getTaskCounts({ tasks })).toEqual({ active: 2, archived: 1, all: 3 });
  });

  test("reorders only the visible tasks within the active filter", () => {
    const reordered = reorderTasksWithinFilter({
      tasks,
      activeTaskId: "task-active-2",
      overTaskId: "task-active-1",
      filter: "active",
    });

    expect(reordered.map((task) => task.id)).toEqual(["task-active-2", "task-archived-1", "task-active-1"]);
  });

  test("reorders the full list in the all filter", () => {
    const reordered = reorderTasksWithinFilter({
      tasks,
      activeTaskId: "task-active-2",
      overTaskId: "task-active-1",
      filter: "all",
    });

    expect(reordered.map((task) => task.id)).toEqual(["task-active-2", "task-active-1", "task-archived-1"]);
  });

  test("selects an unarchived fallback after archive", () => {
    expect(getArchiveFallbackTaskId({ tasks, archivedTaskId: "task-active-1" })).toBe("task-active-2");
    expect(getArchiveFallbackTaskId({
      tasks: tasks.filter((task) => task.id !== "task-active-2"),
      archivedTaskId: "task-active-1",
    })).toBe("");
    expect(getArchiveFallbackTaskId({ tasks: [tasks[1]!], archivedTaskId: "task-archived-1" })).toBe("");
  });

  test("detects archived tasks", () => {
    expect(isTaskArchived(tasks[0]!)).toBe(false);
    expect(isTaskArchived(tasks[1]!)).toBe(true);
  });

  test("throws when a requested task id does not exist in the workspace", () => {
    expect(() => findWorkspaceTaskOrThrow({
      tasks,
      requestedTaskId: "task-missing",
    })).toThrow("Task not found in this workspace: task-missing");
  });

  test("returns null when no requested task id is provided", () => {
    expect(findWorkspaceTaskOrThrow({ tasks, requestedTaskId: "" })).toBeNull();
  });

  test("normalizes concise suggested task titles", () => {
    expect(normalizeSuggestedTaskTitle({ title: "  \"Fix IPC Task Naming\"  " })).toBe("Fix IPC Task Naming");
  });

  test("rejects verbose context-apology suggestions", () => {
    expect(normalizeSuggestedTaskTitle({
      title: "I don't have enough context to generate an accurate task title. The message \"3번만 해줘\" appears to be the latest message in a conversation.",
    })).toBeNull();
  });
});

describe("reconcileTasksWithPersistedArchival", () => {
  const liveTask: Task = {
    id: "task-live",
    title: "Live",
    provider: "claude-code",
    updatedAt: "2026-03-10T01:00:00.000Z",
    unread: false,
    archivedAt: null,
  };

  test("restores the persisted archived flag when the host session still marks the task active", () => {
    // Reproduces the bug: renderer archived the task (persistence), but the
    // host's cached session still has it live. Persisting the stale session
    // must not revive the task.
    const reconciled = reconcileTasksWithPersistedArchival({
      tasks: [liveTask],
      persistedTasks: [{ id: "task-live", archivedAt: "2026-03-11T00:00:00.000Z" }],
    });

    expect(reconciled[0]?.archivedAt).toBe("2026-03-11T00:00:00.000Z");
  });

  test("keeps host-created tasks that are not yet persisted", () => {
    const hostCreated: Task = { ...liveTask, id: "task-new" };
    const reconciled = reconcileTasksWithPersistedArchival({
      tasks: [hostCreated],
      persistedTasks: [{ id: "task-other", archivedAt: "2026-03-11T00:00:00.000Z" }],
    });

    expect(reconciled[0]).toBe(hostCreated);
    expect(reconciled[0]?.archivedAt).toBeNull();
  });

  test("clears a stale archived flag when the task was restored in persistence", () => {
    const staleArchived: Task = {
      ...liveTask,
      id: "task-restored",
      archivedAt: "2026-03-09T00:00:00.000Z",
    };
    const reconciled = reconcileTasksWithPersistedArchival({
      tasks: [staleArchived],
      persistedTasks: [{ id: "task-restored", archivedAt: null }],
    });

    expect(reconciled[0]?.archivedAt).toBeNull();
  });

  test("returns the original array when there is nothing to reconcile", () => {
    const input = [liveTask];
    expect(reconcileTasksWithPersistedArchival({ tasks: input, persistedTasks: [] })).toBe(input);
    expect(
      reconcileTasksWithPersistedArchival({
        tasks: input,
        persistedTasks: [{ id: "task-live", archivedAt: null }],
      }),
    ).toBe(input);
  });
});

describe("shouldSuggestTaskName", () => {
  test("fires during the opening naming window", () => {
    expect(
      shouldSuggestTaskName({ task: { titleManuallySet: false }, priorUserTurnCount: 0 }),
    ).toBe(true);
    expect(
      shouldSuggestTaskName({
        task: undefined,
        priorUserTurnCount: AUTO_TASK_NAME_MAX_USER_TURNS - 1,
      }),
    ).toBe(true);
  });

  test("stops once the naming window has passed", () => {
    expect(
      shouldSuggestTaskName({
        task: null,
        priorUserTurnCount: AUTO_TASK_NAME_MAX_USER_TURNS,
      }),
    ).toBe(false);
  });

  test("never fires after a manual rename, even on the first turn", () => {
    expect(
      shouldSuggestTaskName({ task: { titleManuallySet: true }, priorUserTurnCount: 0 }),
    ).toBe(false);
  });
});

describe("buildSuggestTaskNamePayload", () => {
  test("clips prompt, history length, and per-message content", () => {
    const payload = buildSuggestTaskNamePayload({
      prompt: "p".repeat(AUTO_TASK_NAME_PROMPT_CHARS + 500),
      history: Array.from({ length: 10 }, (_, index) => ({
        role: index % 2 === 0 ? "user" : "assistant",
        content: "c".repeat(AUTO_TASK_NAME_HISTORY_MESSAGE_CHARS + 5_000),
      })),
    });

    expect(payload.prompt.length).toBe(AUTO_TASK_NAME_PROMPT_CHARS);
    expect(payload.history.length).toBe(AUTO_TASK_NAME_HISTORY_MESSAGES);
    for (const message of payload.history) {
      expect(message.content.length).toBe(AUTO_TASK_NAME_HISTORY_MESSAGE_CHARS);
    }
  });

  test("keeps the trailing messages", () => {
    const payload = buildSuggestTaskNamePayload({
      prompt: "latest",
      history: [
        { role: "user", content: "first" },
        { role: "assistant", content: "second" },
        { role: "user", content: "third" },
        { role: "assistant", content: "fourth" },
        { role: "user", content: "fifth" },
      ],
    });
    expect(payload.history.map((message) => message.content)).toEqual([
      "second",
      "third",
      "fourth",
      "fifth",
    ]);
  });
});
