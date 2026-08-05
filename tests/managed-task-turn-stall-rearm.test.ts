import { afterEach, beforeEach, describe, expect, test } from "bun:test";

/**
 * Regression: `refreshActiveManagedTask` rebuilds the session from the database,
 * which restores `activeTurnIdsByTask` from every turn row without a
 * `completedAt`. The stall / auto-abort net, however, is armed from provider
 * events and lives only in renderer memory, so a turn adopted this way was shown
 * as active with nothing watching it: no timer, and no activity snapshot for a
 * timer to mark stalled. If the host that owned it died mid-turn, the task
 * stayed "active" forever and pinned its workspace in the sidebar.
 */

const originalWindow = (globalThis as { window?: unknown }).window;

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

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

const MANAGED_TASK = {
  id: "task-a",
  title: "Managed Task",
  provider: "codex" as const,
  updatedAt: "2026-07-20T00:00:00.000Z",
  unread: false,
  archivedAt: null,
  controlMode: "managed" as const,
};

const ADOPTED_TURN_ID = "persisted-turn-adopted";

beforeEach(() => {
  (globalThis as { window?: unknown }).window = undefined;
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

async function setupAdoptedManagedTurn(args: { turnCompletedAt: string | null }) {
  const abortTurnCalls: Array<{ turnId: string }> = [];
  const cleanupTaskCalls: Array<{ taskId: string }> = [];

  (globalThis as { window?: unknown }).window = {
    localStorage: createMemoryStorage(),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    api: {
      provider: {
        subscribeStreamEvents: () => () => {},
        abortTurn: async (target: { turnId: string }) => {
          abortTurnCalls.push(target);
          return { ok: true, message: "aborted" };
        },
        cleanupTask: async (target: { taskId: string }) => {
          cleanupTaskCalls.push(target);
          return { ok: true, message: "cleaned" };
        },
      },
      persistence: {
        // `workspaces.db` only treats the bridge as usable when all three of
        // these exist, and falls back to empty local rows otherwise.
        listWorkspaces: async () => ({
          ok: true,
          rows: [
            {
              id: "ws-a",
              name: "Default Workspace",
              updatedAt: "2026-07-20T00:00:00.000Z",
            },
          ],
        }),
        upsertWorkspace: async () => ({ ok: true }),
        loadWorkspace: async () => ({
          ok: true,
          snapshot: {
            activeTaskId: "task-a",
            tasks: [MANAGED_TASK],
            messagesByTask: { "task-a": [] },
            promptDraftByTask: {},
            providerSessionByTask: {},
          },
        }),
        listActiveWorkspaceTurns: async () => ({
          ok: true,
          turns: [
            {
              id: ADOPTED_TURN_ID,
              workspaceId: "ws-a",
              taskId: "task-a",
              providerId: "codex",
              createdAt: "2026-07-20T00:00:00.000Z",
              completedAt: args.turnCompletedAt,
            },
          ],
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
    projectPath: "/tmp/stave-project",
    projectName: "project",
    defaultBranch: "main",
    workspaces: [
      {
        id: "ws-a",
        name: "Default Workspace",
        updatedAt: "2026-07-20T00:00:00.000Z",
      },
    ],
    activeWorkspaceId: "ws-a",
    workspaceBranchById: { "ws-a": "main" },
    workspacePathById: { "ws-a": "/tmp/stave-project" },
    workspaceDefaultById: { "ws-a": true },
    tasks: [MANAGED_TASK],
    activeTaskId: "task-a",
    messagesByTask: { "task-a": [] },
    // The renderer has no live turn: this run of the store never streamed it.
    activeTurnIdsByTask: {},
    providerTurnActivityByTask: {},
    taskWorkspaceIdById: { "task-a": "ws-a" },
  });

  return { useAppStore, abortTurnCalls, cleanupTaskCalls };
}

function installCompressedStallTimers() {
  const originalSetTimeout = globalThis.setTimeout;
  (globalThis as { setTimeout: typeof setTimeout }).setTimeout = ((
    fn: (...callbackArgs: unknown[]) => void,
    delay?: number,
    ...rest: unknown[]
  ) => {
    const compressed =
      typeof delay === "number" && delay >= 60_000 ? 30 : delay;
    return originalSetTimeout(fn as never, compressed, ...rest);
  }) as typeof setTimeout;
}

describe("managed task refresh adopting an in-flight turn", () => {
  test("arms the stall net so a turn nobody owns any more gets reclaimed", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    installCompressedStallTimers();

    try {
      const { useAppStore, abortTurnCalls, cleanupTaskCalls } =
        await setupAdoptedManagedTurn({ turnCompletedAt: null });

      await useAppStore.getState().refreshActiveManagedTask();

      // The adopted turn is displayed as active and now has a liveness
      // snapshot, dated from adoption rather than the persisted turn row.
      expect(useAppStore.getState().activeTurnIdsByTask["task-a"]).toBe(
        ADOPTED_TURN_ID,
      );
      const activity =
        useAppStore.getState().providerTurnActivityByTask["task-a"];
      expect(activity?.turnId).toBe(ADOPTED_TURN_ID);
      expect(activity?.providerId).toBe("codex");
      expect(activity?.stalledAt).toBeNull();

      // The host never emits again: the compressed stall-mark and auto-abort
      // grace timers must reclaim the turn on their own.
      await Bun.sleep(200);

      expect(abortTurnCalls).toEqual([{ turnId: ADOPTED_TURN_ID }]);
      expect(cleanupTaskCalls).toEqual([{ taskId: "task-a" }]);
      expect(
        useAppStore.getState().activeTurnIdsByTask["task-a"],
      ).toBeUndefined();
      expect(
        useAppStore.getState().providerTurnActivityByTask["task-a"],
      ).toBeUndefined();
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  test("leaves a completed turn alone", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    installCompressedStallTimers();

    try {
      const { useAppStore, abortTurnCalls } = await setupAdoptedManagedTurn({
        turnCompletedAt: "2026-07-20T00:05:00.000Z",
      });

      await useAppStore.getState().refreshActiveManagedTask();
      await Bun.sleep(200);

      expect(
        useAppStore.getState().activeTurnIdsByTask["task-a"],
      ).toBeUndefined();
      expect(
        useAppStore.getState().providerTurnActivityByTask["task-a"],
      ).toBeUndefined();
      expect(abortTurnCalls).toEqual([]);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });
});
