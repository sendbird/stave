import { afterEach, expect, test } from "bun:test";
import { createStore } from "zustand/vanilla";
import { createTaskMessagePageLoader } from "@/store/task-message-page-loader";
import type { AppState } from "@/store/app-store.types";
import type { ChatMessage } from "@/types/chat";
import type { NotificationAttentionSync } from "@/store/notification-attention-sync";

const originalWindow = globalThis.window;
afterEach(() => {
  globalThis.window = originalWindow;
});
const message = (id: string): ChatMessage => ({
  id,
  content: id,
  parts: [],
  role: "user",
  providerId: "user",
  model: "user",
});

test("browsing history preserves the live tail and newer paging follows incoming messages", async () => {
  const durable = Array.from({ length: 600 }, (_, index) =>
    message(`message-${index}`),
  );
  const calls: Array<{ offset?: number; messageId?: string }> = [];
  globalThis.window = {
    api: {
      persistence: {
        listWorkspaces: async () => ({ ok: true, rows: [] }),
        loadWorkspace: async () => ({ ok: true, snapshot: null }),
        upsertWorkspace: async () => ({ ok: true }),
        loadTaskMessages: async (args: {
          offset?: number;
          limit?: number;
          messageId?: string;
        }) => {
          calls.push(args);
          const limit = args.limit ?? 120;
          const offset = args.messageId ? 480 : (args.offset ?? 0);
          const start = Math.max(0, durable.length - offset - limit);
          return {
            ok: true,
            page: {
              messages: durable.slice(start, durable.length - offset),
              offset,
              limit,
              totalCount: durable.length,
              hasMoreOlder: start > 0,
            },
          };
        },
      },
    },
  } as unknown as Window & typeof globalThis;
  const live = durable.slice(-24);
  const store = createStore<AppState>(
    () =>
      ({
        activeWorkspaceId: "workspace",
        taskWorkspaceIdById: { task: "workspace" },
        messagesByTask: { task: live },
        messageCountByTask: { task: 600 },
        taskMessagesLoadingByTask: {},
        taskMessageWindowOffsetByTask: {},
        taskHistoryMessagesByTask: {},
        taskHistoryMessageCountByTask: {},
        workspaceRuntimeCacheById: {},
        layout: { terminalDocked: false },
        tasks: [],
      }) as unknown as AppState,
  );
  const load = createTaskMessagePageLoader({
    set: store.setState,
    get: store.getState,
    attentionSync: {
      syncTaskInteractions: () => undefined,
    } as unknown as NotificationAttentionSync,
  });
  expect(
    await load({
      taskId: "task",
      workspaceId: "workspace",
      mode: "older",
      messageId: "message-10",
    }),
  ).toBe("loaded");
  expect(store.getState().messagesByTask.task).toBe(live);
  expect(store.getState().taskHistoryMessagesByTask.task[0]?.id).toBe(
    "message-0",
  );
  const incoming = message("incoming");
  durable.push(incoming);
  store.setState({
    messagesByTask: { task: [...live, incoming] },
    messageCountByTask: { task: 601 },
  });
  expect(
    await load({ taskId: "task", workspaceId: "workspace", mode: "newer" }),
  ).toBe("loaded");
  expect(calls.at(-1)?.offset).toBe(361);
  expect(store.getState().taskHistoryMessagesByTask.task.at(-1)?.id).toBe(
    "message-239",
  );
  expect(store.getState().messagesByTask.task.at(-1)).toBe(incoming);
  expect(
    await load({ taskId: "task", workspaceId: "workspace", mode: "latest" }),
  ).toBe("loaded");
  expect(store.getState().taskHistoryMessagesByTask.task).toBeUndefined();
  expect(store.getState().taskMessageWindowOffsetByTask.task).toBe(0);
  expect(store.getState().messagesByTask.task.at(-1)?.id).toBe("incoming");
});
