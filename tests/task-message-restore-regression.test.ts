import { afterEach, expect, test } from "bun:test";
import type { ChatMessage } from "@/types/chat";

const originalWindow = globalThis.window;

afterEach(() => {
  globalThis.window = originalWindow;
});

test("restoring an archived task loads history when its resident message window is empty", async () => {
  const loadCalls: string[] = [];
  const values = new Map<string, string>();
  const messages: ChatMessage[] = [{
    id: "saved-reply",
    role: "assistant",
    providerId: "codex",
    model: "gpt-6.1-sol",
    content: "Saved task history",
    isStreaming: false,
    parts: [{ type: "text", text: "Saved task history" }],
  }];
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
    api: {
      persistence: {
        listWorkspaces: async () => ({ ok: true, rows: [] }),
        loadWorkspace: async () => ({ ok: true, snapshot: null }),
        upsertWorkspace: async () => ({ ok: true }),
        loadTaskMessages: async ({ taskId }: { taskId: string }) => {
          loadCalls.push(taskId);
          return {
            ok: true,
            page: { messages, totalCount: 1, limit: 24, offset: 0, hasMoreOlder: false },
          };
        },
      },
    },
  } as unknown as Window & typeof globalThis;

  const { useAppStore } = await import("@/store/app.store");
  useAppStore.setState({
    ...useAppStore.getInitialState(),
    hasHydratedWorkspaces: true,
    activeWorkspaceId: "workspace-restore",
    activeTaskId: "",
    tasks: [{
      id: "archived-task",
      title: "Archived task",
      provider: "codex",
      updatedAt: "2026-10-28T00:00:00.000Z",
      unread: false,
      archivedAt: "2026-10-28T00:01:00.000Z",
    }],
    messagesByTask: { "archived-task": [] },
    messageCountByTask: { "archived-task": 1 },
  });

  useAppStore.getState().restoreTask({ taskId: "archived-task" });
  await Bun.sleep(0);

  expect(loadCalls).toEqual(["archived-task"]);
  expect(useAppStore.getState().activeTaskId).toBe("archived-task");
  expect(useAppStore.getState().messagesByTask["archived-task"]).toEqual(messages);
});
