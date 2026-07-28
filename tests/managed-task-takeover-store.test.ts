import { afterEach, beforeEach, describe, expect, test } from "bun:test";

const originalWindow = (globalThis as { window?: unknown }).window;
const takeOverCalls: unknown[] = [];
const stopCalls: unknown[] = [];
let takeOverResult: {
  ok: boolean;
  released?: boolean;
  message?: string;
} = {
  ok: true,
  released: true,
};

beforeEach(() => {
  takeOverCalls.length = 0;
  stopCalls.length = 0;
  takeOverResult = { ok: true, released: true };
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    api: {
      taskControl: {
        takeOver: async (args: unknown) => {
          takeOverCalls.push(args);
          return takeOverResult;
        },
        stop: async (args: unknown) => {
          stopCalls.push(args);
          return {
            ok: true,
            workspaceId: "workspace-1",
            taskId: "task-1",
            stopped: true,
            turnId: "turn-1",
          };
        },
      },
      persistence: {
        listWorkspaces: async () => ({ ok: true, rows: [] }),
        loadWorkspace: async () => ({ ok: true, snapshot: null }),
        upsertWorkspace: async () => ({ ok: true }),
        loadWorkspaceShellLite: async () => ({
          ok: true,
          shellLite: {
            activeTaskId: "task-1",
            tasks: [{
              id: "task-1",
              title: "Managed task",
              provider: "codex",
              updatedAt: "2026-07-26T00:01:00.000Z",
              unread: false,
              controlMode: "interactive",
              controlOwner: "stave",
              sourceContexts: [{
                type: "retrieved_context",
                sourceId: "crane:ATL-1",
                title: "Crane ATL-1",
                content: "Recovered from the local Crane binding.",
              }],
            }],
            promptDraftByTask: {},
            providerSessionByTask: {},
            messageCountByTask: { "task-1": 1 },
          },
        }),
      },
    },
  };
});

afterEach(async () => {
  const { useAppStore } = await import("../src/store/app.store");
  useAppStore.setState(useAppStore.getInitialState());
  (globalThis as { window?: unknown }).window = originalWindow;
});

async function seedManagedTask(args?: { active?: boolean }) {
  const { useAppStore } = await import("../src/store/app.store");
  useAppStore.setState({
    ...useAppStore.getInitialState(),
    activeWorkspaceId: "workspace-1",
    activeTaskId: "task-1",
    taskWorkspaceIdById: { "task-1": "workspace-1" },
    tasks: [
      {
        id: "task-1",
        title: "Managed task",
        provider: "codex",
        updatedAt: "2026-07-26T00:00:00.000Z",
        unread: false,
        controlMode: "managed",
        controlOwner: "stave",
      },
    ],
    messagesByTask: {
      "task-1": args?.active
        ? [
            {
              id: "assistant-1",
              role: "assistant",
              model: "gpt-5.6",
              providerId: "codex",
              content: "",
              isStreaming: true,
              parts: [
                {
                  type: "approval",
                  toolName: "Bash",
                  requestId: "approval-1",
                  description: "Run focused tests",
                  state: "approval-requested",
                },
              ],
            },
          ]
        : [],
    },
    activeTurnIdsByTask: args?.active ? { "task-1": "turn-1" } : {},
    hostOwnedTurnIdsByTask: args?.active ? { "task-1": "turn-1" } : {},
  });
  return useAppStore;
}

describe("managed task takeover store boundary", () => {
  test("changes renderer state only after host ownership is released", async () => {
    const useAppStore = await seedManagedTask();

    const result = await useAppStore
      .getState()
      .takeOverTask({ taskId: "task-1" });

    expect(result.ok).toBe(true);
    expect(takeOverCalls).toEqual([
      {
        workspaceId: "workspace-1",
        taskId: "task-1",
      },
    ]);
    expect(useAppStore.getState().tasks[0]).toMatchObject({
      controlMode: "interactive",
      controlOwner: "stave",
      sourceContexts: [{
        sourceId: "crane:ATL-1",
        content: "Recovered from the local Crane binding.",
      }],
    });
  });

  test("keeps the task managed when host takeover is rejected", async () => {
    const useAppStore = await seedManagedTask();
    takeOverResult = {
      ok: false,
      message: "The managed Crane run is still active.",
    };

    const result = await useAppStore
      .getState()
      .takeOverTask({ taskId: "task-1" });

    expect(result).toEqual({
      ok: false,
      message: "The managed Crane run is still active.",
    });
    expect(useAppStore.getState().tasks[0]).toMatchObject({
      controlMode: "managed",
      controlOwner: "stave",
    });
  });

  test("takes over an active managed approval after the host stops it", async () => {
    const useAppStore = await seedManagedTask({ active: true });

    const result = await useAppStore
      .getState()
      .takeOverTask({ taskId: "task-1" });

    expect(result.ok).toBe(true);
    expect(takeOverCalls).toEqual([
      {
        workspaceId: "workspace-1",
        taskId: "task-1",
      },
    ]);
    expect(useAppStore.getState().activeTurnIdsByTask["task-1"]).toBeUndefined();
    expect(
      useAppStore.getState().messagesByTask["task-1"]?.[0]?.parts[0],
    ).toMatchObject({
      type: "approval",
      state: "approval-interrupted",
    });
    expect(useAppStore.getState().tasks[0]).toMatchObject({
      controlMode: "interactive",
      controlOwner: "stave",
    });
  });

  test("stops a managed approval through the host without releasing ownership", async () => {
    const useAppStore = await seedManagedTask({ active: true });

    useAppStore.getState().abortTaskTurn({ taskId: "task-1" });
    await Bun.sleep(0);

    expect(stopCalls).toEqual([
      {
        workspaceId: "workspace-1",
        taskId: "task-1",
      },
    ]);
    expect(useAppStore.getState().activeTurnIdsByTask["task-1"]).toBeUndefined();
    expect(
      useAppStore.getState().messagesByTask["task-1"]?.[0]?.parts[0],
    ).toMatchObject({
      type: "approval",
      state: "approval-interrupted",
    });
    expect(useAppStore.getState().tasks[0]).toMatchObject({
      controlMode: "managed",
      controlOwner: "stave",
    });
    expect(useAppStore.getState().workspaceSnapshotVersion).toBe(1);
  });
});
