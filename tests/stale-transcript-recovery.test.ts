import { afterEach, describe, expect, test } from "bun:test";
import { buildMessageId } from "../src/lib/session/message-id";
import { mergeTaskMessagePage, pickFresherTaskMessage } from "../src/store/task-message-merge";
import { reconcileStopOfFinishedTurn } from "../src/store/stopped-turn-reconcile";
import { isWorkspaceRuntimeCacheBehindPersistence } from "../src/store/workspace-cache-freshness";
import {
  buildWorkspaceSessionState,
  type WorkspaceSessionState,
} from "../src/store/workspace-session-state";
import type { ChatMessage } from "../src/types/chat";

const TASK_ID = "task-1";
const WORKSPACE_ID = "ws-1";

function textParts(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    type: "text" as const,
    text: `part ${index + 1}`,
  }));
}

function assistant(args: {
  id: string;
  content: string;
  partCount: number;
  isStreaming?: boolean;
  completedAt?: string;
}): ChatMessage {
  return {
    id: args.id,
    role: "assistant",
    model: "model-1",
    providerId: "claude-code",
    content: args.content,
    isStreaming: args.isStreaming ?? false,
    ...(args.completedAt ? { completedAt: args.completedAt } : {}),
    parts: textParts(args.partCount),
  };
}

function user(id: string, content: string): ChatMessage {
  return {
    id,
    role: "user",
    model: "user",
    providerId: "user",
    content,
    parts: [{ type: "text", text: content }],
  };
}

function sessionWith(messages: ChatMessage[]): WorkspaceSessionState {
  const base = buildWorkspaceSessionState({ snapshot: null });
  return {
    ...base,
    tasks: [
      {
        id: TASK_ID,
        title: "Task",
        provider: "claude-code",
        updatedAt: "2026-01-01T00:00:00.000Z",
        unread: false,
        archivedAt: null,
      },
    ],
    messagesByTask: { [TASK_ID]: messages },
    messageCountByTask: { [TASK_ID]: messages.length },
  };
}

const finishedReply = assistant({
  id: "m-8",
  content: "Progress note. Final report with every published link.",
  partCount: 12,
  completedAt: "2026-01-01T07:07:26.000Z",
});
const staleReply = assistant({
  id: "m-8",
  content: "Progress note.",
  partCount: 4,
  isStreaming: true,
});

describe("message ids", () => {
  test("two turns at the same position get different ids", () => {
    expect(buildMessageId({ taskId: TASK_ID, count: 8, turnId: "turn-a" })).not.toBe(
      buildMessageId({ taskId: TASK_ID, count: 8, turnId: "turn-b" }),
    );
    expect(buildMessageId({ taskId: TASK_ID, count: 8 })).toBe(`${TASK_ID}-m-9`);
  });
});

describe("pickFresherTaskMessage", () => {
  test("prefers the persisted reply over a resident copy that fell behind", () => {
    expect(pickFresherTaskMessage({ resident: staleReply, persisted: finishedReply })).toBe(
      finishedReply,
    );
    const stoppedStaleReply = {
      ...staleReply,
      isStreaming: false,
      completedAt: "2026-01-01T10:07:00.000Z",
    };
    expect(
      pickFresherTaskMessage({ resident: stoppedStaleReply, persisted: finishedReply }),
    ).toBe(finishedReply);
  });

  test("keeps the resident copy while it is ahead of a debounced snapshot", () => {
    const persistedProgress = assistant({
      id: "m-8",
      content: "Progress",
      partCount: 2,
      isStreaming: true,
    });
    const residentProgress = assistant({
      id: "m-8",
      content: "Progress and more",
      partCount: 3,
      isStreaming: true,
    });
    expect(
      pickFresherTaskMessage({ resident: residentProgress, persisted: persistedProgress }),
    ).toBe(residentProgress);
    expect(pickFresherTaskMessage({ resident: finishedReply, persisted: finishedReply })).toBe(
      finishedReply,
    );
  });

  test("the latest page brings back messages the resident window lost", () => {
    const merged = mergeTaskMessagePage({
      currentMessages: [user("m-7", "Rebuild the docs."), staleReply],
      pageMessages: [
        user("m-7", "Rebuild the docs."),
        finishedReply,
        user("m-9", "Build the spec app."),
      ],
      mode: "latest",
    });
    expect(merged.map((message) => message.id)).toEqual(["m-7", "m-8", "m-9"]);
    expect(merged[1]).toBe(finishedReply);
  });
});

describe("isWorkspaceRuntimeCacheBehindPersistence", () => {
  test("flags a cache that counted fewer rows than persistence holds", () => {
    const cached = sessionWith([user("m-7", "Rebuild the docs."), staleReply]);
    expect(
      isWorkspaceRuntimeCacheBehindPersistence({
        cachedWorkspaceState: cached,
        persistedMessageCountByTask: { [TASK_ID]: 4 },
      }),
    ).toBe(true);
    expect(
      isWorkspaceRuntimeCacheBehindPersistence({
        cachedWorkspaceState: cached,
        persistedMessageCountByTask: { [TASK_ID]: 2, "task-unknown": 9 },
      }),
    ).toBe(false);
  });
});

describe("reconcileStopOfFinishedTurn", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  function installPersistence(args: { completedAt: string | null }) {
    (globalThis as { window: unknown }).window = {
      api: {
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          upsertWorkspace: async () => ({ ok: true }),
          listTaskTurns: async () => ({
            ok: true,
            turns: [
              {
                id: "turn-a",
                workspaceId: WORKSPACE_ID,
                taskId: TASK_ID,
                providerId: "claude-code",
                createdAt: "2026-01-01T06:38:18.000Z",
                completedAt: args.completedAt,
              },
            ],
          }),
          loadTaskMessages: async () => ({
            ok: true,
            page: {
              messages: [
                user("m-7", "Rebuild the docs."),
                finishedReply,
                user("m-9", "Build the spec app."),
              ],
              totalCount: 3,
              limit: 120,
              offset: 0,
              hasMoreOlder: false,
            },
          }),
        },
      },
    };
  }

  function createState() {
    let state = {
      activeWorkspaceId: "ws-other",
      workspaceRuntimeCacheById: {
        [WORKSPACE_ID]: sessionWith([user("m-7", "Rebuild the docs."), staleReply]),
      } as Record<string, WorkspaceSessionState>,
    };
    const set = ((update: (current: typeof state) => Partial<typeof state>) => {
      state = { ...state, ...update(state) };
    }) as unknown as Parameters<typeof reconcileStopOfFinishedTurn>[0]["set"];
    return { set, read: () => state };
  }

  test("reloads persisted messages when the stopped turn had already finished", async () => {
    installPersistence({ completedAt: "2026-01-01T07:39:42.000Z" });
    const { set, read } = createState();
    const reconciled = await reconcileStopOfFinishedTurn({
      set,
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      turnId: "turn-a",
      stopRequestedAt: "2026-01-01T10:07:00.000Z",
    });
    expect(reconciled).toBe(true);
    const messages = read().workspaceRuntimeCacheById[WORKSPACE_ID]?.messagesByTask[TASK_ID] ?? [];
    expect(messages.map((message) => message.id)).toEqual(["m-7", "m-8", "m-9"]);
    expect(messages[1]?.content).toBe(finishedReply.content);
  });

  test("leaves a genuinely running turn to the stop", async () => {
    installPersistence({ completedAt: null });
    const { set, read } = createState();
    const reconciled = await reconcileStopOfFinishedTurn({
      set,
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      turnId: "turn-a",
      stopRequestedAt: "2026-01-01T10:07:00.000Z",
    });
    expect(reconciled).toBe(false);
    expect(
      read().workspaceRuntimeCacheById[WORKSPACE_ID]?.messagesByTask[TASK_ID]?.[1],
    ).toBe(staleReply);
  });
});
