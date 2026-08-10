import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
  TaskHeartbeatSummary,
  TaskHeartbeatUpsertInput,
} from "../src/lib/automation/task-supervisor";

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
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
  };
}

function summary(
  overrides: Partial<TaskHeartbeatSummary> & { taskId: string },
): TaskHeartbeatSummary {
  return {
    heartbeatId: `hb-${overrides.taskId}`,
    state: "scheduled",
    reason: null,
    nextRunAt: "2026-08-10T10:00:00.000Z",
    occurrenceCount: 0,
    skippedCount: 0,
    ...overrides,
  };
}

const UPSERT_INPUT: TaskHeartbeatUpsertInput = {
  workspaceId: "ws-1",
  taskId: "task-1",
  prompt: "Re-check CI and report only on a change.",
  trigger: { kind: "schedule", schedule: { every: 1, unit: "hours" } },
  maxOccurrences: null,
  expiresAt: null,
};

interface HeartbeatApiMock {
  list?: unknown;
  create?: unknown;
  update?: unknown;
  setPaused?: unknown;
  remove?: unknown;
}

function installWindow(taskHeartbeats: HeartbeatApiMock | undefined) {
  (globalThis as { window?: unknown }).window = {
    localStorage: createMemoryStorage(),
    api: taskHeartbeats ? { taskHeartbeats } : {},
  };
}

/** A `list` mock whose snapshot can be swapped between calls. */
function createListMock(initial: TaskHeartbeatSummary[]) {
  const state = { summaries: initial, calls: 0 };
  return {
    state,
    list: async () => {
      state.calls += 1;
      return {
        ok: true,
        snapshot: { heartbeats: [], summaries: state.summaries },
      };
    },
  };
}

async function loadStore() {
  const { useAppStore } = await import("../src/store/app.store");
  return useAppStore;
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = undefined;
});

afterEach(async () => {
  const useAppStore = await loadStore();
  useAppStore.setState(useAppStore.getInitialState());
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("task heartbeat store actions", () => {
  test("refresh keys the host snapshot by task id", async () => {
    const { list } = createListMock([
      summary({ taskId: "task-1" }),
      summary({ taskId: "task-2", state: "paused", reason: "Paused by the user." }),
    ]);
    installWindow({ list });

    const useAppStore = await loadStore();
    const result = await useAppStore.getState().refreshTaskHeartbeats();

    expect(result).toEqual({ ok: true });
    const byTask = useAppStore.getState().taskHeartbeatSummariesByTaskId;
    expect(Object.keys(byTask).sort()).toEqual(["task-1", "task-2"]);
    expect(byTask["task-2"]?.reason).toBe("Paused by the user.");
  });

  test("an unchanged snapshot keeps the record reference stable", async () => {
    const mock = createListMock([summary({ taskId: "task-1" })]);
    installWindow({ list: mock.list });

    const useAppStore = await loadStore();
    await useAppStore.getState().refreshTaskHeartbeats();
    const first = useAppStore.getState().taskHeartbeatSummariesByTaskId;

    // Same values, freshly allocated rows — exactly what a 15s poll delivers.
    mock.state.summaries = [summary({ taskId: "task-1" })];
    await useAppStore.getState().refreshTaskHeartbeats();

    expect(useAppStore.getState().taskHeartbeatSummariesByTaskId).toBe(first);
    expect(mock.state.calls).toBe(2);
  });

  test("a changed snapshot replaces the record", async () => {
    const mock = createListMock([summary({ taskId: "task-1" })]);
    installWindow({ list: mock.list });

    const useAppStore = await loadStore();
    await useAppStore.getState().refreshTaskHeartbeats();
    const first = useAppStore.getState().taskHeartbeatSummariesByTaskId;

    mock.state.summaries = [
      summary({ taskId: "task-1", state: "paused", reason: "Waiting on an approval." }),
    ];
    await useAppStore.getState().refreshTaskHeartbeats();
    const second = useAppStore.getState().taskHeartbeatSummariesByTaskId;
    expect(second).not.toBe(first);
    expect(second["task-1"]?.state).toBe("paused");

    // A dropped row is a change even though the surviving rows match.
    mock.state.summaries = [];
    await useAppStore.getState().refreshTaskHeartbeats();
    expect(useAppStore.getState().taskHeartbeatSummariesByTaskId).toEqual({});
  });

  test("a refused list surfaces its message instead of throwing", async () => {
    installWindow({
      list: async () => ({
        ok: false,
        snapshot: { heartbeats: [], summaries: [] },
        message: "The supervisor is not running.",
      }),
    });

    const useAppStore = await loadStore();
    useAppStore.setState({
      taskHeartbeatSummariesByTaskId: { "task-1": summary({ taskId: "task-1" }) },
    });

    const result = await useAppStore.getState().refreshTaskHeartbeats();
    expect(result).toEqual({
      ok: false,
      message: "The supervisor is not running.",
    });
    // A failed read must not blank the surfaces that already have rows.
    expect(
      Object.keys(useAppStore.getState().taskHeartbeatSummariesByTaskId),
    ).toEqual(["task-1"]);
  });

  test("a thrown IPC error becomes a failed result", async () => {
    installWindow({
      list: async () => {
        throw new Error("IPC channel closed");
      },
    });

    const useAppStore = await loadStore();
    const result = await useAppStore.getState().refreshTaskHeartbeats();
    expect(result.ok).toBe(false);
    expect(result.message).toBe("IPC channel closed");
  });

  test("a build without the heartbeat bridge fails cleanly", async () => {
    installWindow(undefined);

    const useAppStore = await loadStore();
    for (const result of await Promise.all([
      useAppStore.getState().refreshTaskHeartbeats(),
      useAppStore.getState().createTaskHeartbeat({ input: UPSERT_INPUT }),
      useAppStore.getState().setTaskHeartbeatPaused({ id: "hb-1", paused: true }),
      useAppStore.getState().removeTaskHeartbeat({ id: "hb-1" }),
    ])) {
      expect(result.ok).toBe(false);
      expect(result.message).toBe(
        "Task heartbeats are not available in this build.",
      );
    }
  });

  test("create forwards the input and refreshes from the host", async () => {
    const createCalls: unknown[] = [];
    const mock = createListMock([]);
    installWindow({
      list: mock.list,
      create: async (payload: { input: TaskHeartbeatUpsertInput }) => {
        createCalls.push(payload);
        mock.state.summaries = [summary({ taskId: payload.input.taskId })];
        return { ok: true, heartbeat: { id: "hb-task-1" } };
      },
    });

    const useAppStore = await loadStore();
    const result = await useAppStore
      .getState()
      .createTaskHeartbeat({ input: UPSERT_INPUT });

    expect(result).toEqual({ ok: true });
    expect(createCalls).toEqual([{ input: UPSERT_INPUT }]);
    expect(mock.state.calls).toBe(1);
    expect(
      useAppStore.getState().taskHeartbeatSummariesByTaskId["task-1"]?.heartbeatId,
    ).toBe("hb-task-1");
  });

  test("a refused create reports the host message and skips the refresh", async () => {
    const mock = createListMock([]);
    installWindow({
      list: mock.list,
      create: async () => ({
        ok: false,
        heartbeat: null,
        message: "This task is archived.",
      }),
    });

    const useAppStore = await loadStore();
    const result = await useAppStore
      .getState()
      .createTaskHeartbeat({ input: UPSERT_INPUT });

    expect(result).toEqual({ ok: false, message: "This task is archived." });
    expect(mock.state.calls).toBe(0);
  });

  test("pause and resume round-trip through the host snapshot", async () => {
    const setPausedCalls: unknown[] = [];
    const mock = createListMock([summary({ taskId: "task-1" })]);
    installWindow({
      list: mock.list,
      setPaused: async (payload: { id: string; paused: boolean }) => {
        setPausedCalls.push(payload);
        mock.state.summaries = [
          summary({
            taskId: "task-1",
            state: payload.paused ? "paused" : "scheduled",
            reason: payload.paused ? "Paused by the user." : null,
          }),
        ];
        return { ok: true, heartbeat: { id: payload.id } };
      },
    });

    const useAppStore = await loadStore();
    expect(
      await useAppStore
        .getState()
        .setTaskHeartbeatPaused({ id: "hb-task-1", paused: true }),
    ).toEqual({ ok: true });
    expect(
      useAppStore.getState().taskHeartbeatSummariesByTaskId["task-1"]?.state,
    ).toBe("paused");

    expect(
      await useAppStore
        .getState()
        .setTaskHeartbeatPaused({ id: "hb-task-1", paused: false }),
    ).toEqual({ ok: true });
    expect(
      useAppStore.getState().taskHeartbeatSummariesByTaskId["task-1"]?.state,
    ).toBe("scheduled");
    expect(setPausedCalls).toEqual([
      { id: "hb-task-1", paused: true },
      { id: "hb-task-1", paused: false },
    ]);
  });

  test("resuming a stopped heartbeat surfaces the host's refusal", async () => {
    const mock = createListMock([
      summary({
        taskId: "task-1",
        state: "stopped",
        reason: "This heartbeat reached its limit of 5 occurrences.",
      }),
    ]);
    installWindow({
      list: mock.list,
      setPaused: async () => ({
        ok: false,
        heartbeat: null,
        message:
          "This heartbeat stopped for good: This heartbeat reached its limit of 5 occurrences. Add a new one instead.",
      }),
    });

    const useAppStore = await loadStore();
    const result = await useAppStore
      .getState()
      .setTaskHeartbeatPaused({ id: "hb-task-1", paused: false });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("stopped for good");
    expect(mock.state.calls).toBe(0);
  });

  test("remove clears the row through a refresh", async () => {
    const removeCalls: unknown[] = [];
    const mock = createListMock([summary({ taskId: "task-1" })]);
    installWindow({
      list: mock.list,
      remove: async (payload: { id: string }) => {
        removeCalls.push(payload);
        mock.state.summaries = [];
        return { ok: true, id: payload.id };
      },
    });

    const useAppStore = await loadStore();
    await useAppStore.getState().refreshTaskHeartbeats();
    expect(
      useAppStore.getState().taskHeartbeatSummariesByTaskId["task-1"],
    ).toBeDefined();

    const result = await useAppStore
      .getState()
      .removeTaskHeartbeat({ id: "hb-task-1" });
    expect(result).toEqual({ ok: true });
    expect(removeCalls).toEqual([{ id: "hb-task-1" }]);
    expect(useAppStore.getState().taskHeartbeatSummariesByTaskId).toEqual({});
  });

  test("a refused remove keeps the row and reports why", async () => {
    const mock = createListMock([summary({ taskId: "task-1" })]);
    installWindow({
      list: mock.list,
      remove: async () => ({ ok: false, message: "No such heartbeat." }),
    });

    const useAppStore = await loadStore();
    await useAppStore.getState().refreshTaskHeartbeats();

    const result = await useAppStore
      .getState()
      .removeTaskHeartbeat({ id: "hb-task-1" });
    expect(result).toEqual({ ok: false, message: "No such heartbeat." });
    expect(
      useAppStore.getState().taskHeartbeatSummariesByTaskId["task-1"],
    ).toBeDefined();
  });
});
