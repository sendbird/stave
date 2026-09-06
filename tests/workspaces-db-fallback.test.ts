import { afterEach, expect, test } from "bun:test";
import {
  loadAllTaskMessages,
  loadTaskMessagesPage,
  upsertWorkspace,
  type WorkspaceSnapshot,
} from "@/lib/db/workspaces.db";
import { createEmptyWorkspaceInformation } from "@/lib/workspace-information";
import type { ChatMessage, Task } from "@/types/chat";

const originalWindow = globalThis.window;

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function buildTask(id: string): Task {
  return {
    id,
    title: id,
    provider: "claude-code",
    updatedAt: "2026-07-31T00:00:00.000Z",
    unread: false,
  };
}

function buildMessage(id: string): ChatMessage {
  return {
    id,
    role: "user",
    model: "user",
    providerId: "user",
    content: id,
    parts: [{ type: "text", text: id }],
  };
}

function buildSnapshot(args: {
  tasks: Task[];
  messagesByTask: WorkspaceSnapshot["messagesByTask"];
}): WorkspaceSnapshot {
  return {
    activeTaskId: args.tasks[0]?.id ?? "",
    tasks: args.tasks,
    messagesByTask: args.messagesByTask,
    promptDraftByTask: {},
    providerSessionByTask: {},
    workspaceInformation: createEmptyWorkspaceInformation(),
  };
}

afterEach(() => {
  (globalThis as { window: typeof globalThis.window }).window = originalWindow;
});

test("browser quota failure rejects the save and retains the last durable messages", async () => {
  const localStorage = createMemoryStorage();
  (globalThis as { window: unknown }).window = { localStorage };
  const task = buildTask("quota-task");
  await upsertWorkspace({
    id: "quota-workspace",
    name: "Quota",
    snapshot: buildSnapshot({
      tasks: [task],
      messagesByTask: { [task.id]: [buildMessage("saved")] },
    }),
  });
  localStorage.setItem = () => {
    throw new Error("Quota exceeded");
  };
  await expect(
    upsertWorkspace({
      id: "quota-workspace",
      name: "Quota",
      snapshot: buildSnapshot({
        tasks: [task],
        messagesByTask: { [task.id]: [buildMessage("unsaved")] },
      }),
    }),
  ).rejects.toThrow("Quota exceeded");
  const page = await loadTaskMessagesPage({
    workspaceId: "quota-workspace",
    taskId: task.id,
    limit: 10,
    offset: 0,
  });
  expect(page.messages.map((message) => message.id)).toEqual(["saved"]);
});

test("browser fallback preserves omitted message pages for retained tasks", async () => {
  const localStorage = createMemoryStorage();
  const taskA = buildTask("task-a");
  const taskB = buildTask("task-b");
  localStorage.setItem(
    "stave:workspace-fallback:v1",
    JSON.stringify([
      {
        id: "ws-fallback",
        name: "Fallback",
        updatedAt: "2026-07-31T00:00:00.000Z",
        snapshot: buildSnapshot({
          tasks: [taskA, taskB],
          messagesByTask: {
            "task-a": [buildMessage("a-old")],
            "task-b": [buildMessage("b-durable")],
          },
        }),
      },
    ]),
  );
  (globalThis as { window: unknown }).window = { localStorage };

  await upsertWorkspace({
    id: "ws-fallback",
    name: "Fallback",
    snapshot: buildSnapshot({
      tasks: [taskA, taskB],
      messagesByTask: { "task-a": [buildMessage("a-new")] },
    }),
  });

  const preserved = await loadTaskMessagesPage({
    workspaceId: "ws-fallback",
    taskId: "task-b",
    limit: 10,
    offset: 0,
  });
  expect(preserved.messages.map((message) => message.id)).toEqual([
    "b-durable",
  ]);

  await upsertWorkspace({
    id: "ws-fallback",
    name: "Fallback",
    snapshot: buildSnapshot({
      tasks: [taskA],
      messagesByTask: { "task-a": [] },
    }),
  });

  const removed = await loadTaskMessagesPage({
    workspaceId: "ws-fallback",
    taskId: "task-b",
    limit: 10,
    offset: 0,
  });
  expect(removed.messages).toEqual([]);
  const explicitlyCleared = await loadTaskMessagesPage({
    workspaceId: "ws-fallback",
    taskId: "task-a",
    limit: 10,
    offset: 0,
  });
  expect(explicitlyCleared.messages).toEqual([]);
});

test("loads complete task history in chronological pages", async () => {
  const localStorage = createMemoryStorage();
  const task = buildTask("task-paged");
  const messages = Array.from({ length: 1_205 }, (_, index) =>
    buildMessage(`message-${String(index).padStart(4, "0")}`),
  );
  localStorage.setItem(
    "stave:workspace-fallback:v1",
    JSON.stringify([
      {
        id: "ws-paged",
        name: "Paged",
        updatedAt: "2026-07-31T00:00:00.000Z",
        snapshot: buildSnapshot({
          tasks: [task],
          messagesByTask: { [task.id]: messages },
        }),
      },
    ]),
  );
  (globalThis as { window: unknown }).window = { localStorage };

  const loaded = await loadAllTaskMessages({
    workspaceId: "ws-paged",
    taskId: task.id,
  });

  expect(loaded).toHaveLength(messages.length);
  expect(loaded.map((message) => message.id)).toEqual(
    messages.map((message) => message.id),
  );
});
