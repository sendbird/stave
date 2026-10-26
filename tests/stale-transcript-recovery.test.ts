import { afterEach, describe, expect, test } from "bun:test";
import { buildMessageId } from "../src/lib/session/message-id";
import { mergeTaskMessagePage, pickFresherTaskMessage } from "../src/store/task-message-merge";
import { reconcileStopOfFinishedTurn } from "../src/store/stopped-turn-reconcile";
import {
  clearEndedTurnActivity,
  findStaleCachedTaskIds,
  resetStaleCachedTasks,
  resolveLatestCachedWorkspace,
} from "../src/store/workspace-cache-freshness";
import type { ProviderTurnActivitySnapshot } from "../src/lib/providers/turn-status";
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

describe("mergeTaskMessagePage latest order", () => {
  test("keeps older resident messages ahead of the page", () => {
    const resident = Array.from({ length: 5 }, (_, index) => user(`m-${index + 1}`, `message ${index + 1}`));
    const page = resident.slice(2).concat(user("m-6", "message 6"));
    const merged = mergeTaskMessagePage({ currentMessages: resident, pageMessages: page, mode: "latest" });
    expect(merged.map((message) => message.id)).toEqual(["m-1", "m-2", "m-3", "m-4", "m-5", "m-6"]);
  });

  test("places persisted messages before resident ones newer than the page", () => {
    const unsaved = user("m-x", "Typed after the page was written.");
    const merged = mergeTaskMessagePage({
      currentMessages: [user("m-6", "Older"), user("m-7", "Rebuild the docs."), staleReply, unsaved],
      pageMessages: [user("m-7", "Rebuild the docs."), finishedReply, user("m-9", "Build the spec app.")],
      mode: "latest",
    });
    expect(merged.map((message) => message.id)).toEqual(["m-6", "m-7", "m-8", "m-9", "m-x"]);
    expect(merged[2]).toBe(finishedReply);
  });

  test("keeps a disjoint window unless the caller knows it is stale", () => {
    const older = [user("m-1", "first"), user("m-2", "second")];
    const page = [user("m-123", "recent"), user("m-124", "latest")];
    expect(
      mergeTaskMessagePage({ currentMessages: older, pageMessages: page, mode: "latest" }).map(
        (message) => message.id,
      ),
    ).toEqual(["m-123", "m-124", "m-1", "m-2"]);
    expect(
      mergeTaskMessagePage({
        currentMessages: older,
        pageMessages: page,
        mode: "latest",
        supersedeDisjointWindow: true,
      }).map((message) => message.id),
    ).toEqual(["m-123", "m-124"]);
  });

  test("the winning resident copy takes an answer only the persisted copy has", () => {
    const requested = {
      type: "approval" as const,
      requestId: "approval-1",
      toolName: "Bash",
      description: "Run tests",
      state: "approval-requested" as const,
    };
    const resident = assistant({ id: "m-2", content: "Working", partCount: 1, isStreaming: true });
    const persisted = assistant({ id: "m-2", content: "Work", partCount: 1, isStreaming: true });
    const chosen = pickFresherTaskMessage({
      resident: { ...resident, parts: [...resident.parts, requested] },
      persisted: { ...persisted, parts: [...persisted.parts, { ...requested, state: "approval-responded" }] },
    });
    expect(chosen.content).toBe("Working");
    expect(chosen.parts.at(-1)).toMatchObject({ state: "approval-responded" });
  });

  test("an answer outranks the interrupted state a stop leaves", () => {
    const question = {
      type: "user_input" as const,
      requestId: "question-3",
      toolName: "AskUserQuestion",
      questions: [],
    };
    const chosen = pickFresherTaskMessage({
      resident: { ...finishedReply, parts: [...finishedReply.parts, { ...question, state: "input-interrupted" as const }] },
      persisted: {
        ...finishedReply,
        parts: [...finishedReply.parts, { ...question, state: "input-responded" as const, answers: { q: "yes" } }],
      },
    });
    expect(chosen.parts.at(-1)).toMatchObject({ state: "input-responded", answers: { q: "yes" } });
  });

  test("an unknown interaction state is not treated as an answer", () => {
    const requested = {
      type: "user_input" as const,
      requestId: "question-9",
      toolName: "AskUserQuestion",
      questions: [],
      state: "input-requested" as const,
    };
    const resident = { ...finishedReply, parts: [...finishedReply.parts, requested] };
    const persisted = {
      ...finishedReply,
      parts: [...finishedReply.parts, { ...requested, state: "something-else" }],
    } as unknown as ChatMessage;
    expect(pickFresherTaskMessage({ resident, persisted }).parts.at(-1)).toMatchObject({
      state: "input-requested",
    });
  });

  test("carries an answer from the resident copy into the persisted one", () => {
    const requested = {
      type: "user_input" as const,
      requestId: "question-1",
      toolName: "AskUserQuestion",
      questions: [],
      state: "input-requested" as const,
    };
    const persisted: ChatMessage = {
      ...finishedReply,
      parts: [...finishedReply.parts, requested],
    };
    const resident: ChatMessage = {
      ...staleReply,
      isStreaming: false,
      completedAt: "2026-01-01T10:07:00.000Z",
      parts: [{ ...requested, state: "input-responded", answers: { q: "yes" } }],
    };
    const chosen = pickFresherTaskMessage({ resident, persisted });
    expect(chosen.content).toBe(finishedReply.content);
    expect(chosen.parts.at(-1)).toMatchObject({ state: "input-responded", answers: { q: "yes" } });
  });

  test("refuses an older copy whose text grew inside the same part", () => {
    const finalSinglePart = assistant({
      id: "m-3",
      content: "Partial and final response",
      partCount: 1,
      completedAt: "2026-01-01T00:02:00.000Z",
    });
    const stoppedPartial = assistant({
      id: "m-3",
      content: "Partial",
      partCount: 1,
      completedAt: "2026-01-01T03:00:00.000Z",
    });
    expect(pickFresherTaskMessage({ resident: stoppedPartial, persisted: finalSinglePart })).toBe(
      finalSinglePart,
    );
  });
});

describe("stale cached tasks", () => {
  test("flags only known tasks that counted fewer rows than persistence holds", () => {
    const cached = sessionWith([user("m-7", "Rebuild the docs."), staleReply]);
    expect(
      findStaleCachedTaskIds({
        cachedWorkspaceState: cached,
        persistedMessageCountByTask: { [TASK_ID]: 4 },
      }),
    ).toEqual([TASK_ID]);
    expect(
      findStaleCachedTaskIds({
        cachedWorkspaceState: cached,
        persistedMessageCountByTask: { [TASK_ID]: 2, "task-unknown": 9 },
      }),
    ).toEqual([]);
  });

  test("resets a stale task but keeps live turns and other tasks", () => {
    const base = sessionWith([user("m-7", "Rebuild the docs."), staleReply]);
    const cached: WorkspaceSessionState = {
      ...base,
      tasks: [
        ...base.tasks,
        { ...base.tasks[0]!, id: "task-live" },
        { ...base.tasks[0]!, id: "task-other" },
      ],
      messagesByTask: {
        ...base.messagesByTask,
        "task-live": [user("l-1", "Still running")],
        "task-other": [user("o-1", "Running in this cache")],
      },
      messageCountByTask: { ...base.messageCountByTask, "task-live": 1, "task-other": 1 },
      activeTurnIdsByTask: {
        [TASK_ID]: "turn-finished",
        "task-live": "turn-live",
        "task-other": "turn-other",
      },
    };
    const { session, refreshedTaskIds, endedTurns } = resetStaleCachedTasks({
      cachedWorkspaceState: cached,
      staleTaskIds: [TASK_ID, "task-live"],
      persistedMessageCountByTask: { [TASK_ID]: 4, "task-live": 3, "task-other": 1 },
      liveTurnIds: new Set(["turn-live", "turn-other"]),
    });
    expect(refreshedTaskIds).toEqual([TASK_ID]);
    expect(endedTurns).toEqual([{ taskId: TASK_ID, turnId: "turn-finished" }]);
    expect(session.messagesByTask[TASK_ID]).toEqual([]);
    expect(session.messageCountByTask[TASK_ID]).toBe(4);
    expect(session.activeTurnIdsByTask[TASK_ID]).toBeUndefined();
    expect(session.activeTurnIdsByTask["task-live"]).toBe("turn-live");
    expect(session.activeTurnIdsByTask["task-other"]).toBe("turn-other");
    expect(session.messagesByTask["task-other"]).toBe(cached.messagesByTask["task-other"]);
  });
});

describe("resolveLatestCachedWorkspace", () => {
  const running = (turnId: string) => ({
    ...sessionWith([user("m-7", "Rebuild the docs."), staleReply]),
    activeTurnIdsByTask: { [TASK_ID]: turnId },
  });

  test("keeps the read and its refresh when nothing landed during the wait", () => {
    const readCache = running("turn-1");
    const refresh = resetStaleCachedTasks({
      cachedWorkspaceState: readCache,
      staleTaskIds: [TASK_ID],
      persistedMessageCountByTask: { [TASK_ID]: 4 },
      liveTurnIds: new Set(),
    });
    const resolved = resolveLatestCachedWorkspace({ readCache, latestCache: readCache, refresh });
    expect(resolved.session).toBe(refresh.session);
    expect(resolved.refresh).toBe(refresh);
    expect(resolveLatestCachedWorkspace({ readCache, latestCache: undefined, refresh: null }).session).toBe(readCache);
  });

  test("installs the completion that landed while the switch awaited", () => {
    const readCache = running("turn-1");
    const latestCache: WorkspaceSessionState = {
      ...sessionWith([user("m-7", "Rebuild the docs."), finishedReply]),
      activeTurnIdsByTask: { [TASK_ID]: undefined },
    };
    const resolved = resolveLatestCachedWorkspace({ readCache, latestCache, refresh: null });
    expect(resolved.session).toBe(latestCache);
    expect(resolved.session?.activeTurnIdsByTask[TASK_ID]).toBeUndefined();
    expect(resolved.session?.messagesByTask[TASK_ID]?.at(-1)?.isStreaming).toBe(false);
  });

  test("applies the refresh to the latest cache but spares a turn that started meanwhile", () => {
    const base = running("turn-1");
    const readCache: WorkspaceSessionState = {
      ...base,
      tasks: [...base.tasks, { ...base.tasks[0]!, id: "task-new" }],
      messagesByTask: { ...base.messagesByTask, "task-new": [user("n-1", "Old")] },
      messageCountByTask: { ...base.messageCountByTask, "task-new": 1 },
      activeTurnIdsByTask: { [TASK_ID]: "turn-1", "task-new": undefined },
    };
    const refresh = resetStaleCachedTasks({
      cachedWorkspaceState: readCache,
      staleTaskIds: [TASK_ID, "task-new"],
      persistedMessageCountByTask: { [TASK_ID]: 4, "task-new": 3 },
      liveTurnIds: new Set(),
    });
    expect(refresh.refreshedTaskIds).toEqual([TASK_ID, "task-new"]);
    const latestCache: WorkspaceSessionState = {
      ...readCache,
      messagesByTask: {
        ...readCache.messagesByTask,
        "task-new": [user("n-1", "Old"), user("n-2", "Started meanwhile")],
      },
      activeTurnIdsByTask: { [TASK_ID]: undefined, "task-new": "turn-new" },
    };
    const resolved = resolveLatestCachedWorkspace({ readCache, latestCache, refresh });
    expect(resolved.refresh?.refreshedTaskIds).toEqual([TASK_ID]);
    expect(resolved.refresh?.endedTurns).toEqual([{ taskId: TASK_ID, turnId: "turn-1" }]);
    expect(resolved.session?.messagesByTask[TASK_ID]).toEqual([]);
    expect(resolved.session?.messageCountByTask[TASK_ID]).toBe(4);
    expect(resolved.session?.activeTurnIdsByTask["task-new"]).toBe("turn-new");
    expect(resolved.session?.messagesByTask["task-new"]).toBe(latestCache.messagesByTask["task-new"]);
  });
});

describe("clearEndedTurnActivity", () => {
  test("drops only the activity of the ended turn", () => {
    const activity = (turnId: string) =>
      ({ turnId, pendingInteraction: "user_input" }) as unknown as ProviderTurnActivitySnapshot;
    const next = clearEndedTurnActivity({
      activityByTask: {
        [TASK_ID]: activity("turn-finished"),
        "task-live": activity("turn-live"),
        "task-newer": activity("turn-newer"),
      },
      endedTurns: [
        { taskId: TASK_ID, turnId: "turn-finished" },
        { taskId: "task-newer", turnId: "turn-older" },
      ],
    });
    expect(next[TASK_ID]).toBeUndefined();
    expect(next["task-live"]?.turnId).toBe("turn-live");
    expect(next["task-newer"]?.turnId).toBe("turn-newer");
  });
});

describe("reconcileStopOfFinishedTurn", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  function installPersistence(args: {
    completedAt: string | null;
    beforePage?: () => Promise<void>;
  }) {
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
          loadTaskMessages: async () => {
            await args.beforePage?.();
            return {
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
            };
          },
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
    const get = (() => state) as unknown as Parameters<typeof reconcileStopOfFinishedTurn>[0]["get"];
    const append = (message: ChatMessage) => {
      const session = state.workspaceRuntimeCacheById[WORKSPACE_ID]!;
      state = {
        ...state,
        workspaceRuntimeCacheById: {
          [WORKSPACE_ID]: {
            ...session,
            messagesByTask: {
              [TASK_ID]: [...(session.messagesByTask[TASK_ID] ?? []), message],
            },
          },
        },
      };
    };
    return { get, set, read: () => state, append };
  }

  test("reloads persisted messages when the stopped turn had already finished", async () => {
    installPersistence({ completedAt: "2026-01-01T07:39:42.000Z" });
    const { get, set, read } = createState();
    const reconciled = await reconcileStopOfFinishedTurn({
      get,
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

  test("keeps messages a new turn added while the reload was in flight", async () => {
    let appendDuringLoad: (() => void) | null = null;
    installPersistence({
      completedAt: "2026-01-01T07:39:42.000Z",
      beforePage: async () => {
        appendDuringLoad?.();
      },
    });
    const { get, set, read, append } = createState();
    const newPrompt = user("m-10-turn-next", "Next request");
    appendDuringLoad = () => append(newPrompt);
    await reconcileStopOfFinishedTurn({
      get,
      set,
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      turnId: "turn-a",
      stopRequestedAt: "2026-01-01T10:07:00.000Z",
    });
    const messages = read().workspaceRuntimeCacheById[WORKSPACE_ID]?.messagesByTask[TASK_ID] ?? [];
    expect(messages.map((message) => message.id)).toEqual(["m-7", "m-8", "m-9", "m-10-turn-next"]);
    expect(messages.at(-1)).toBe(newPrompt);
  });

  test("leaves a genuinely running turn to the stop", async () => {
    installPersistence({ completedAt: null });
    const { get, set, read } = createState();
    const reconciled = await reconcileStopOfFinishedTurn({
      get,
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
