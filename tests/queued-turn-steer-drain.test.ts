import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createTurnReceipt } from "@/lib/providers/turn-terminal-receipt";
import type {
  ProviderSteerTurnResponse,
  ProviderTurnRequest,
} from "@/lib/providers/provider.types";
import { getWorkspaceSessionForState } from "@/store/workspace-runtime-state";

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

const originalWindow = (globalThis as { window?: unknown }).window;

function createMemoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = undefined;
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

type StreamListener = (payload: {
  streamId: string;
  event: unknown;
  sequence: number;
  done: boolean;
  taskId: string | null;
  workspaceId: string | null;
  providerId: "claude-code" | "codex";
  turnId: string | null;
}) => void;

/**
 * A task with one live turn and one item waiting in the prompt queue, plus a
 * `steerTurn` that stays pending until the test decides how the provider
 * answered.
 */
async function setupTaskWithQueuedFollowUp() {
  const localStorage = createMemoryStorage();
  let streamListener: StreamListener | null = null;
  const startPushTurnCalls: ProviderTurnRequest[] = [];
  let streamCounter = 0;
  let settleSteer: (value: ProviderSteerTurnResponse) => void = () => {};
  const pendingSteer = new Promise<ProviderSteerTurnResponse>((resolve) => {
    settleSteer = resolve;
  });

  (globalThis as { window?: unknown }).window = {
    localStorage,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    api: {
      provider: {
        startPushTurn: async (request: ProviderTurnRequest) => {
          startPushTurnCalls.push(request);
          streamCounter += 1;
          return {
            ok: true,
            streamId: `stream-${streamCounter}`,
            turnId: `persisted-turn-${streamCounter}`,
          };
        },
        steerTurn: () => pendingSteer,
        subscribeStreamEvents: (listener: StreamListener) => {
          streamListener = listener;
          return () => {
            if (streamListener === listener) {
              streamListener = null;
            }
          };
        },
        abortTurn: async () => ({ ok: true, message: "aborted" }),
        cleanupTask: async () => ({ ok: true, message: "cleaned" }),
      },
      persistence: {
        loadWorkspace: async () => ({
          ok: true,
          snapshot: {
            activeTaskId: "",
            tasks: [],
            messagesByTask: {},
            promptDraftByTask: {},
            providerSessionByTask: {},
          },
        }),
      },
      fs: {
        listFiles: async () => ({ ok: true, files: [] }),
      },
    },
  };

  const { useAppStore } = await import("../src/store/app.store");
  const initialState = useAppStore.getInitialState();

  useAppStore.setState({
    ...initialState,
    hasHydratedWorkspaces: true,
    repositoryPath: "/tmp/stave-project",
    repositoryName: "stave-project",
    defaultBranch: "main",
    workspaces: [
      {
        id: "ws-a",
        name: "Feature Workspace",
        updatedAt: "2026-07-20T00:00:00.000Z",
      },
      {
        id: "ws-b",
        name: "Default Workspace",
        updatedAt: "2026-07-20T00:00:00.000Z",
      },
    ],
    activeWorkspaceId: "ws-a",
    workspaceBranchById: { "ws-a": "feature", "ws-b": "main" },
    workspacePathById: {
      "ws-a": "/tmp/stave-project-feature",
      "ws-b": "/tmp/stave-project",
    },
    workspaceDefaultById: { "ws-a": false, "ws-b": true },
    tasks: [
      {
        id: "task-a",
        title: "Task A",
        provider: "codex",
        updatedAt: "2026-07-20T00:00:00.000Z",
        unread: false,
        archivedAt: null,
      },
      {
        id: "task-b",
        title: "Task B",
        provider: "codex",
        updatedAt: "2026-07-20T00:00:00.000Z",
        unread: false,
        archivedAt: null,
      },
    ],
    activeTaskId: "task-a",
    draftProvider: "codex",
    messagesByTask: { "task-a": [] },
    activeTurnIdsByTask: {},
    nativeSessionReadyByTask: {},
    providerSessionByTask: {},
    taskWorkspaceIdById: { "task-a": "ws-a", "task-b": "ws-a" },
  });

  void useAppStore.getState().sendUserMessage({
    taskId: "task-a",
    content: "first message",
  });
  await Bun.sleep(10);
  expect(startPushTurnCalls).toHaveLength(1);

  await useAppStore.getState().sendUserMessage({
    taskId: "task-a",
    content: "queued follow-up",
  });
  const queuedTurn =
    useAppStore.getState().promptDraftByTask["task-a"]?.queuedTurns?.[0];
  expect(queuedTurn?.content).toBe("queued follow-up");

  const completeRunningTurn = (turn = 1, stopReason?: string) => {
    const listener = streamListener as StreamListener | null;
    listener?.({
      streamId: `stream-${turn}`,
      event: { type: "done", stop_reason: stopReason },
      sequence: 1,
      done: true,
      taskId: "task-a",
      workspaceId: "ws-a",
      providerId: "codex",
      turnId: `persisted-turn-${turn}`,
    });
  };

  return {
    useAppStore,
    startPushTurnCalls,
    completeRunningTurn,
    settleSteer,
    queuedTurnId: queuedTurn?.id ?? "",
  };
}

describe("queued turns in a background task", () => {
  test.each(["task", "workspace", "project"] as const)(
    "sends in order after switching to another %s",
    async (target) => {
      const { useAppStore, startPushTurnCalls, completeRunningTurn } =
        await setupTaskWithQueuedFollowUp();
      const original = useAppStore.getState();
      original.setRepositoryBasePrompt({ prompt: "Source project instructions" });
      expect(
        await original.sendUserMessage({
          taskId: "task-a",
          content: "another queued follow-up",
        }),
      ).toMatchObject({ status: "queued" });

      if (target === "task") {
        original.selectTask({ taskId: "task-b" });
      } else if (target === "workspace") {
        await original.switchWorkspace({ workspaceId: "ws-b" });
      } else {
        await original.openRepository({ repositoryPath: "/tmp/other-project" });
        useAppStore.getState().setRepositoryBasePrompt({
          prompt: "Other project instructions",
        });
        expect(useAppStore.getState().taskWorkspaceIdById["task-a"]).toBeUndefined();
      }
      const visible = useAppStore.getState();
      expect(visible.activeTaskId).not.toBe("task-a");
      expect(startPushTurnCalls).toHaveLength(1);

      const queuedPrompts = ["queued follow-up", "another queued follow-up"];
      for (const [index, prompt] of queuedPrompts.entries()) {
        completeRunningTurn(index + 1);
        for (
          let attempt = 0;
          attempt < 100 && startPushTurnCalls.length === index + 1;
          attempt += 1
        ) {
          await Bun.sleep(5);
        }
        expect(startPushTurnCalls).toHaveLength(index + 2);
        const sent = startPushTurnCalls[index + 1];
        expect(sent).toMatchObject({
          taskId: "task-a",
          workspaceId: "ws-a",
          cwd: "/tmp/stave-project-feature",
          prompt,
          runtimeOptions: { claudeSystemPrompt: "Source project instructions" },
        });
        expect(sent?.conversation?.contextParts).toContainEqual(
          expect.objectContaining({
            sourceId: "stave:current-task-awareness",
            content: expect.stringContaining(
              "- name: stave-project\n- path: /tmp/stave-project\n\nWorkspace:\n- id: ws-a\n- name: Feature Workspace\n- root: /tmp/stave-project-feature\n- branch: feature",
            ),
          }),
        );
      }

      const after = useAppStore.getState();
      expect(after.activeTaskId).toBe(visible.activeTaskId);
      expect(after.activeWorkspaceId).toBe(visible.activeWorkspaceId);
      const source = getWorkspaceSessionForState({
        state: after,
        workspaceId: "ws-a",
      });
      expect(source?.promptDraftByTask["task-a"]?.queuedTurns ?? []).toEqual([]);
      completeRunningTurn(3);
    },
  );

  test.each(["cancelled", "aborted", "usage_limit"])(
    "holds the queue after a terminal %s event in another project",
    async (reason) => {
      const { useAppStore, startPushTurnCalls, completeRunningTurn, queuedTurnId } =
        await setupTaskWithQueuedFollowUp();
      const store = () => useAppStore.getState();
      await store().openRepository({ repositoryPath: "/tmp/other-project" });
      completeRunningTurn(1, reason);
      for (let attempt = 0; attempt < 100 && store().workspaceRuntimeCacheById["ws-a"]?.activeTurnIdsByTask["task-a"]; attempt += 1) {
        await Bun.sleep(5);
      }
      const source = store().workspaceRuntimeCacheById["ws-a"];
      expect(source?.activeTurnIdsByTask["task-a"]).toBeUndefined();
      expect(source?.promptDraftByTask["task-a"]?.queuedTurns?.[0]?.id).toBe(queuedTurnId);
      expect(startPushTurnCalls).toHaveLength(1);
      expect(Boolean(store().usageLimitPauseByTask["task-a"])).toBe(reason === "usage_limit");
    },
  );
});

describe("queued turns after completion is recovered from persistence", () => {
  test.each([
    ["switch", "completed", 0, true],
    ["switch", "completed", 1, true],
    ["hydrate", "completed", 1, true],
    ["switch", "cancelled", 1, true],
    ["switch", "unknown", 1, true],
    ["switch", "completed", 1, false],
  ] as const)("%s with %s outcome, %d extra rows and saved reply %s", async (entry, outcome, extraRows, hasSavedReply) => {
    const { useAppStore, startPushTurnCalls, completeRunningTurn } =
      await setupTaskWithQueuedFollowUp();
    const store = () => useAppStore.getState();
    if (entry === "switch") await store().switchWorkspace({ workspaceId: "ws-b" });
    const before = store();
    const cached = getWorkspaceSessionForState({ state: before, workspaceId: "ws-a" })!;
    const turnId = cached.activeTurnIdsByTask["task-a"]!;
    const completedAt = new Date().toISOString();
    const receipt = {
      ...createTurnReceipt(), completedAt, outcome,
      doneObserved: outcome !== "unknown",
    };
    const messages = cached.messagesByTask["task-a"]!.map((message) =>
      message.role === "assistant"
        ? {
            ...message, turnId, content: "Saved reply", isStreaming: false, completedAt,
            terminalReceipt: hasSavedReply ? receipt : createTurnReceipt(),
            parts: [{ type: "text" as const, text: "Saved reply" }],
          }
        : message,
    );
    const persistence = window.api!.persistence!;
    persistence.listWorkspaces = async () => ({ ok: true, rows: before.workspaces });
    persistence.upsertWorkspace = async () => ({ ok: true });
    persistence.loadWorkspace = async ({ workspaceId }) => ({
      ok: true,
      snapshot: workspaceId === "ws-a" ? {
        activeTaskId: "task-a",
        tasks: cached.tasks,
        messagesByTask: { "task-a": messages },
        promptDraftByTask: cached.promptDraftByTask,
        providerSessionByTask: cached.providerSessionByTask,
      } : null,
    });
    persistence.loadWorkspaceShellSummary = async () => ({
      ok: true,
      summary: {
        activeTaskId: "task-a",
        tasks: cached.tasks,
        messageCountByTask: { "task-a": messages.length + extraRows },
        terminalTabCount: 0,
        cliSessionTabCount: 0,
      },
    });
    persistence.listActiveWorkspaceTurns = async () => ({ ok: true, turns: [] });
    persistence.listTaskTurns = async () => ({
      ok: true,
      turns: [{
        id: turnId, taskId: "task-a", workspaceId: "ws-a", providerId: "codex",
        createdAt: completedAt, completedAt,
        terminalReceipt: receipt,
      }],
    });
    persistence.loadTaskMessages = async () => ({
      ok: true,
      page: { messages, totalCount: messages.length + extraRows, limit: 120, offset: 0, hasMoreOlder: false },
    });

    if (entry === "switch") await store().switchWorkspace({ workspaceId: "ws-a" });
    else await store().hydrateWorkspaces();

    if (!hasSavedReply) {
      expect(store().activeTurnIdsByTask["task-a"]).toBe(turnId);
      expect(startPushTurnCalls).toHaveLength(1);
      completeRunningTurn(1);
      for (let attempt = 0; attempt < 100 && startPushTurnCalls.length === 1; attempt += 1) {
        await Bun.sleep(5);
      }
      expect(startPushTurnCalls).toHaveLength(2);
      completeRunningTurn(2);
    } else if (outcome === "completed") {
      for (let attempt = 0; attempt < 100 && startPushTurnCalls.length === 1; attempt += 1) {
        await Bun.sleep(5);
      }
      expect(startPushTurnCalls).toHaveLength(2);
      expect(startPushTurnCalls[1]?.conversation?.history).toContainEqual(
        expect.objectContaining({ role: "assistant", content: "Saved reply" }),
      );
      await store().syncHostTaskTurn({
        workspaceId: "ws-a", taskId: "task-a", turnId, providerId: "codex",
        model: "test-model", sequence: 1, eventType: "done", done: true,
      });
      completeRunningTurn(1);
      expect(store().activeTurnIdsByTask["task-a"]).toBe(startPushTurnCalls[1]?.turnId);
      completeRunningTurn(2);
    } else {
      expect(store().activeTurnIdsByTask["task-a"]).toBeUndefined();
      expect(store().promptDraftByTask["task-a"]?.queuedTurns).toHaveLength(1);
      expect(startPushTurnCalls).toHaveLength(1);
    }
  });
});

describe("queued turn draining around a steer that races turn completion", () => {
  test("runs the queued item once the rejected steer releases its reservation", async () => {
    const {
      useAppStore,
      startPushTurnCalls,
      completeRunningTurn,
      settleSteer,
      queuedTurnId,
    } = await setupTaskWithQueuedFollowUp();

    const steering = useAppStore.getState().sendUserMessage({
      taskId: "task-a",
      content: "queued follow-up",
      queuedTurnId,
      submitIntent: "steer",
    });
    await Bun.sleep(5);

    // The turn finishes while the provider is still deciding on the steer.
    // Draining skips the reserved item — correctly, since the provider may be
    // about to accept it — so completion alone starts nothing.
    completeRunningTurn();
    await Bun.sleep(5);
    expect(startPushTurnCalls).toHaveLength(1);

    // The provider says no: the item is a plain queued turn again, and the
    // only completion event it could have waited for has already gone by.
    settleSteer({
      ok: false,
      delivery: "rejected",
      message: "turn is no longer steerable",
    });
    await expect(steering).resolves.toMatchObject({
      status: "steer-unavailable",
    });
    await Bun.sleep(20);

    expect(startPushTurnCalls).toHaveLength(2);
    expect(startPushTurnCalls[1]?.prompt).toContain("queued follow-up");
    expect(
      useAppStore.getState().promptDraftByTask["task-a"]?.queuedTurns ?? [],
    ).toEqual([]);
  });
});
