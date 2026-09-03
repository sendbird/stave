import { describe, expect, test } from "bun:test";
import { createEmptyWorkspaceInformation } from "@/lib/workspace-information";
import {
  evictColdWorkspaceRuntimeCacheEntries,
  saveActiveWorkspaceRuntimeCache,
} from "@/store/workspace-runtime-state";
import { applyProviderEventsToWorkspaceSession } from "@/store/workspace-turn-replay";
import {
  createEmptyWorkspaceState,
  createWorkspaceSnapshot,
  type WorkspaceSessionState,
} from "@/store/workspace-session-state";

describe("createWorkspaceSnapshot", () => {
  test("preserves seeded workspace information", () => {
    const workspaceInformation = createEmptyWorkspaceInformation();
    workspaceInformation.notes = "Seeded from kickoff";

    const snapshot = createWorkspaceSnapshot({
      activeTaskId: "task-1",
      tasks: [],
      messagesByTask: {},
      promptDraftByTask: {},
      workspaceInformation,
      editorTabs: [],
      activeEditorTabId: null,
      terminalTabs: [],
      activeTerminalTabId: null,
      terminalDocked: false,
      cliSessionTabs: [],
      activeCliSessionTabId: null,
      activeSurface: { kind: "task", taskId: "task-1" },
      providerSessionByTask: {},
    });

    expect(snapshot.workspaceInformation.notes).toBe("Seeded from kickoff");
  });
});

describe("saveActiveWorkspaceRuntimeCache", () => {
  test("retains active task messages while dropping idle task messages", () => {
    const cache = saveActiveWorkspaceRuntimeCache({
      state: {
        activeWorkspaceId: "ws-main",
        workspaceRuntimeCacheById: {},
        layout: { terminalDocked: false },
        activeTaskId: "task-other",
        tasks: [
          {
            id: "task-parent",
            title: "Parent",
            provider: "claude-code",
            updatedAt: "2026-04-20T12:00:00.000Z",
            unread: false,
            archivedAt: null,
          },
          {
            id: "task-other",
            title: "Other",
            provider: "claude-code",
            updatedAt: "2026-04-20T12:00:00.000Z",
            unread: false,
            archivedAt: null,
          },
        ],
        messagesByTask: {
          "task-parent": [
            {
              id: "task-parent-m-1",
              role: "user",
              model: "user",
              providerId: "user",
              content: "compare these",
              parts: [{ type: "text", text: "compare these" }],
            },
          ],
          "branch-a": [
            {
              id: "branch-a-m-1",
              role: "assistant",
              model: "claude-sonnet-4-6",
              providerId: "claude-code",
              content: "final branch answer",
              parts: [{ type: "text", text: "final branch answer" }],
            },
          ],
          "reviewer-1": [
            {
              id: "reviewer-1-m-1",
              role: "assistant",
              model: "claude-opus",
              providerId: "claude-code",
              content: "pick branch a",
              parts: [{ type: "text", text: "pick branch a" }],
            },
          ],
          "task-other": [
            {
              id: "task-other-m-1",
              role: "user",
              model: "user",
              providerId: "user",
              content: "keep me",
              parts: [{ type: "text", text: "keep me" }],
            },
          ],
          "idle-task": [
            {
              id: "idle-task-m-1",
              role: "user",
              model: "user",
              providerId: "user",
              content: "drop me",
              parts: [{ type: "text", text: "drop me" }],
            },
          ],
        },
        messageCountByTask: {
          "task-parent": 1,
          "branch-a": 1,
          "reviewer-1": 1,
          "task-other": 1,
          "idle-task": 1,
        },
        promptDraftByTask: {},
        workspaceInformation: createEmptyWorkspaceInformation(),
        editorTabs: [],
        activeEditorTabId: null,
        terminalTabs: [],
        activeTerminalTabId: null,
        cliSessionTabs: [],
        activeCliSessionTabId: null,
        activeSurface: { kind: "task", taskId: "task-other" },
        activeTurnIdsByTask: {},
        providerSessionByTask: {},
        providerGoalByTask: {},
        nativeSessionReadyByTask: {},
      },
    });

    expect(cache["ws-main"]?.messagesByTask).toEqual({
      "task-other": [
        {
          id: "task-other-m-1",
          role: "user",
          model: "user",
          providerId: "user",
          content: "keep me",
          parts: [{ type: "text", text: "keep me" }],
        },
      ],
    });
  });
});

describe("applyProviderEventsToWorkspaceSession", () => {
  test("persists normalized provider browser connection metadata", () => {
    const workspaceInformation = createEmptyWorkspaceInformation();
    const session = {
      activeTaskId: "task-1",
      tasks: [],
      messagesByTask: { "task-1": [] },
      messageCountByTask: { "task-1": 0 },
      promptDraftByTask: {},
      workspaceInformation,
      editorTabs: [],
      activeEditorTabId: null,
      terminalTabs: [],
      activeTerminalTabId: null,
      terminalDocked: false,
      cliSessionTabs: [],
      activeCliSessionTabId: null,
      activeSurface: { kind: "task" as const, taskId: "task-1" },
      activeTurnIdsByTask: { "task-1": "turn-1" },
      providerSessionByTask: {},
      providerGoalByTask: {},
      nativeSessionReadyByTask: {},
    };

    const applied = applyProviderEventsToWorkspaceSession({
      session,
      taskId: "task-1",
      events: [
        {
          type: "browser_connection",
          providerId: "codex",
          status: "connected",
          at: Date.parse("2026-08-11T05:00:00.000Z"),
        },
      ],
      provider: "codex",
      model: "gpt-5.4",
      turnId: "turn-1",
    });

    expect(applied.snapshotChanged).toBe(true);
    expect(applied.session.workspaceInformation.connectedBrowserTab).toEqual({
      providerId: "codex",
      status: "connected",
      requestedAt: "2026-08-11T05:00:00.000Z",
      lastUpdatedAt: "2026-08-11T05:00:00.000Z",
    });
  });

  test("marks snapshots changed when only the provider goal changes", () => {
    const session = {
      activeTaskId: "task-1",
      tasks: [
        {
          id: "task-1",
          title: "Goal Task",
          provider: "codex",
          updatedAt: "2026-04-20T12:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-1": [] },
      messageCountByTask: { "task-1": 0 },
      promptDraftByTask: {},
      workspaceInformation: createEmptyWorkspaceInformation(),
      editorTabs: [],
      activeEditorTabId: null,
      terminalTabs: [],
      activeTerminalTabId: null,
      terminalDocked: false,
      cliSessionTabs: [],
      activeCliSessionTabId: null,
      activeSurface: { kind: "task", taskId: "task-1" },
      activeTurnIdsByTask: { "task-1": "turn-1" },
      providerSessionByTask: { "task-1": { codex: "thread-1" } },
      providerGoalByTask: {},
      nativeSessionReadyByTask: { "task-1": true },
    };

    const applied = applyProviderEventsToWorkspaceSession({
      session,
      taskId: "task-1",
      events: [
        {
          type: "goal_status",
          providerId: "codex",
          goal: {
            providerId: "codex",
            nativeSessionId: "thread-1",
            objective: "Fix the stalled goal turn",
            status: "active",
            tokenBudget: null,
            tokensUsed: 0,
            timeUsedSeconds: 0,
            createdAt: 0,
            updatedAt: 1,
          },
        },
      ],
      provider: "codex",
      model: "gpt-5.4",
      turnId: "turn-1",
    });

    expect(applied.stateChanged).toBe(true);
    expect(applied.snapshotChanged).toBe(true);
    expect(applied.session.providerGoalByTask["task-1"]?.objective).toBe(
      "Fix the stalled goal turn",
    );
  });
});

describe("workspace runtime cache eviction", () => {
  function sessionWith(args?: {
    activeTurnIdsByTask?: Record<string, string | undefined>;
  }): WorkspaceSessionState {
    return {
      ...createEmptyWorkspaceState(),
      activeTurnIdsByTask: args?.activeTurnIdsByTask ?? {},
    } as WorkspaceSessionState;
  }

  function cacheOf(ids: string[]) {
    return Object.fromEntries(ids.map((id) => [id, sessionWith()] as const));
  }

  test("keeps the cache at its cap by dropping the oldest entries", () => {
    const ids = Array.from({ length: 12 }, (_, index) => `ws-${index}`);
    const next = evictColdWorkspaceRuntimeCacheEntries({
      cache: cacheOf(ids),
      activeWorkspaceId: "ws-11",
      limit: 8,
    });

    expect(Object.keys(next)).toHaveLength(8);
    // Oldest four gone, newest kept.
    expect(Object.keys(next)).toEqual([
      "ws-4",
      "ws-5",
      "ws-6",
      "ws-7",
      "ws-8",
      "ws-9",
      "ws-10",
      "ws-11",
    ]);
  });

  test("leaves the cache alone while it is under the cap", () => {
    const cache = cacheOf(["a", "b", "c"]);
    expect(
      evictColdWorkspaceRuntimeCacheEntries({
        cache,
        activeWorkspaceId: "c",
        limit: 8,
      }),
    ).toBe(cache);
  });

  test("never evicts the active workspace", () => {
    const ids = Array.from({ length: 10 }, (_, index) => `ws-${index}`);
    const next = evictColdWorkspaceRuntimeCacheEntries({
      cache: cacheOf(ids),
      // Oldest entry is the active one.
      activeWorkspaceId: "ws-0",
      limit: 8,
    });

    expect(Object.keys(next)).toHaveLength(8);
    expect(next["ws-0"]).toBeDefined();
  });

  test("never evicts a workspace with an in-flight turn", () => {
    const cache: Record<string, WorkspaceSessionState> = {
      "ws-busy": sessionWith({ activeTurnIdsByTask: { "task-1": "turn-1" } }),
      ...cacheOf(["ws-1", "ws-2", "ws-3", "ws-4", "ws-5", "ws-6", "ws-7"]),
      "ws-active": sessionWith(),
    };

    const next = evictColdWorkspaceRuntimeCacheEntries({
      cache,
      activeWorkspaceId: "ws-active",
      limit: 4,
    });

    expect(next["ws-busy"]).toBeDefined();
    expect(next["ws-active"]).toBeDefined();
    expect(Object.keys(next)).toHaveLength(4);
  });

  test("keeps everything when nothing is evictable", () => {
    const cache: Record<string, WorkspaceSessionState> = {
      "ws-a": sessionWith({ activeTurnIdsByTask: { t: "turn-a" } }),
      "ws-b": sessionWith({ activeTurnIdsByTask: { t: "turn-b" } }),
      "ws-c": sessionWith(),
    };
    const next = evictColdWorkspaceRuntimeCacheEntries({
      cache,
      activeWorkspaceId: "ws-c",
      limit: 1,
    });
    expect(Object.keys(next)).toHaveLength(3);
  });
});
