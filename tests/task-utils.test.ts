import { describe, expect, test } from "bun:test";
import {
  findWorkspaceTaskOrThrow,
  getArchiveFallbackTaskId,
  getRespondingTasks,
  getRespondingProviderId,
  getTaskCounts,
  getVisibleTasks,
  isTaskArchived,
  normalizeSuggestedTaskTitle,
  reorderTasksWithinFilter,
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
  test("uses the streaming assistant's resolved provider for responding tone", () => {
    const messages: ChatMessage[] = [
      {
        id: "m1",
        role: "assistant",
        model: "gpt-5.4",
        providerId: "stave",
        content: "",
        isStreaming: true,
        parts: [],
      },
    ];

    expect(getRespondingProviderId({ fallbackProviderId: "stave", messages })).toBe("codex");
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

    expect(getRespondingProviderId({ fallbackProviderId: "stave", messages })).toBe("claude-code");
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
