import { afterEach, describe, expect, test } from "bun:test";
import {
  buildWorkspaceSessionState,
  type WorkspaceSessionState,
} from "../src/store/workspace-session-state";
import type { ChatMessage, Task } from "../src/types/chat";

// Workspace transitions (switch, hydrate, create, open project) await
// persistence or git before they install session state. A turn that finishes
// in that window must stay finished: installing a copy read before the wait
// brings it back as running, with no stream left to end it, so the task shows
// "Working" until the user stops it.
//
// The finished state is written with `setState` while each action is held at
// its await; the provider reducer that produces it is covered elsewhere.

const originalWindow = globalThis.window;
type AppStore = typeof import("../src/store/app.store").useAppStore;
let appStore: AppStore | undefined;
let originalStoreState: ReturnType<AppStore["getState"]> | undefined;
let releaseHeld: (() => void) | undefined;
let pending: Promise<unknown> | undefined;

const TURN_ID = "turn-1";
const UPDATED_AT = "2026-10-26T00:00:00.000Z";

function task(id: string): Task {
  return {
    id,
    title: id,
    provider: "claude-code",
    updatedAt: UPDATED_AT,
    unread: false,
    archivedAt: null,
  };
}

function prompt(taskId: string): ChatMessage {
  return {
    id: `${taskId}-m-1`,
    role: "user",
    model: "user",
    providerId: "user",
    content: "Finish this.",
    parts: [{ type: "text", text: "Finish this." }],
  };
}

function reply(taskId: string, finished: boolean): ChatMessage {
  return {
    id: `${taskId}-m-2`,
    role: "assistant",
    model: "model-1",
    providerId: "claude-code",
    turnId: TURN_ID,
    content: "Final answer.",
    isStreaming: !finished,
    ...(finished ? { completedAt: UPDATED_AT } : {}),
    parts: [{ type: "text", text: "Final answer." }],
  };
}

/** The session fields of one task whose turn is running or finished. */
function turnState(taskId: string, finished: boolean) {
  return {
    tasks: [task(taskId)],
    activeTaskId: taskId,
    messagesByTask: { [taskId]: [prompt(taskId), reply(taskId, finished)] },
    messageCountByTask: { [taskId]: 2 },
    activeTurnIdsByTask: { [taskId]: finished ? undefined : TURN_ID },
  };
}

function cachedSession(
  fields: Partial<WorkspaceSessionState>,
): WorkspaceSessionState {
  return { ...buildWorkspaceSessionState({ snapshot: null }), ...fields };
}

function shell(taskId: string, messageCount: number) {
  return {
    activeTaskId: taskId,
    tasks: [task(taskId)],
    promptDraftByTask: {},
    providerSessionByTask: {},
    messageCountByTask: { [taskId]: messageCount },
  };
}

/** A promise the test releases, plus a signal for when the action reached it. */
function createHold() {
  let release: () => void = () => undefined;
  let markReached: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reached = new Promise<void>((resolve) => {
    markReached = resolve;
  });
  releaseHeld = release;
  return {
    wait: async () => {
      markReached();
      await gate;
    },
    reached,
    release,
  };
}

/** Fails with a named reason instead of hanging until the test timeout. */
async function within<T>(promise: Promise<T>, label: string, timeoutMs = 2000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${label}`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function installWindow(api: Record<string, unknown>) {
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
      fs: { listFiles: async () => ({ ok: true, files: [] }) },
      ...api,
    },
  } as unknown;
}

async function loadStore() {
  const { useAppStore } = await import("../src/store/app.store");
  appStore = useAppStore;
  originalStoreState ??= useAppStore.getState();
  return useAppStore;
}

const REPOSITORY = {
  repositoryPath: "/tmp/stave-project",
  repositoryName: "stave-project",
  defaultBranch: "main",
};

function repositoryState(workspaceIds: string[]) {
  const workspaces = workspaceIds.map((id) => ({
    id,
    name: id,
    updatedAt: UPDATED_AT,
  }));
  const workspacePathById = Object.fromEntries(
    workspaceIds.map((id, index) => [
      id,
      index === 0 ? REPOSITORY.repositoryPath : `${REPOSITORY.repositoryPath}-${id}`,
    ]),
  );
  const workspaceBranchById = Object.fromEntries(
    workspaceIds.map((id) => [id, id === workspaceIds[0] ? "main" : id]),
  );
  const workspaceDefaultById = Object.fromEntries(
    workspaceIds.map((id, index) => [id, index === 0]),
  );
  return {
    ...REPOSITORY,
    hasHydratedWorkspaces: true,
    workspaces,
    activeWorkspaceId: workspaceIds[0]!,
    workspacePathById,
    workspaceBranchById,
    workspaceDefaultById,
    recentRepositories: [
      {
        ...REPOSITORY,
        lastOpenedAt: UPDATED_AT,
        workspaces,
        activeWorkspaceId: workspaceIds[0]!,
        workspaceBranchById,
        workspacePathById,
        workspaceDefaultById,
      },
    ],
  };
}

function expectFinished(session: {
  activeTurnIdsByTask: Record<string, string | undefined>;
  messagesByTask: Record<string, ChatMessage[]>;
} | undefined, taskId: string) {
  expect(session).toBeDefined();
  expect(session?.activeTurnIdsByTask[taskId]).toBeUndefined();
  const last = session?.messagesByTask[taskId]?.at(-1);
  expect(last?.content).toBe("Final answer.");
  expect(last?.isStreaming).toBe(false);
}

afterEach(async () => {
  releaseHeld?.();
  releaseHeld = undefined;
  await pending?.catch(() => undefined);
  pending = undefined;
  if (appStore && originalStoreState) {
    appStore.setState(originalStoreState, true);
  }
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("a turn that finishes during a workspace transition stays finished", () => {
  test("refreshing the project keeps the active workspace's live session over its old cache entry", async () => {
    installWindow({
      persistence: {
        listWorkspaces: async () => ({
          ok: true,
          rows: [{ id: "ws-main", name: "ws-main", updatedAt: UPDATED_AT }],
        }),
        loadWorkspace: async () => ({ ok: true, snapshot: null }),
        loadWorkspaceShell: async () => ({ ok: true, shell: shell("task-main", 2) }),
        upsertWorkspace: async () => ({ ok: true }),
      },
    });
    const store = await loadStore();
    store.setState({
      ...store.getInitialState(),
      ...repositoryState(["ws-main"]),
      ...turnState("task-main", true),
      // Left behind when the user last switched away while the turn ran.
      workspaceRuntimeCacheById: {
        "ws-main": cachedSession(turnState("task-main", false)),
      },
    });

    await store.getState().hydrateWorkspaces();

    const state = store.getState();
    expect(state.activeWorkspaceId).toBe("ws-main");
    expectFinished(state, "task-main");
  });

  test("switching keeps a cache that appeared while the shell was read", async () => {
    const hold = createHold();
    installWindow({
      persistence: {
        listWorkspaces: async () => ({ ok: true, rows: [] }),
        loadWorkspace: async () => ({ ok: true, snapshot: null }),
        loadWorkspaceShell: async ({ workspaceId }: { workspaceId: string }) => {
          if (workspaceId === "ws-alt") {
            await hold.wait();
          }
          return { ok: true, shell: shell(workspaceId === "ws-alt" ? "task-alt" : "task-main", 0) };
        },
        upsertWorkspace: async () => ({ ok: true }),
      },
    });
    const store = await loadStore();
    store.setState({
      ...store.getInitialState(),
      ...repositoryState(["ws-main", "ws-alt"]),
      ...turnState("task-main", true),
      workspaceRuntimeCacheById: {},
    });

    const switching = store.getState().switchWorkspace({ workspaceId: "ws-alt" });
    pending = switching;
    await within(hold.reached, "the ws-alt shell read");
    // A host-run turn synced into ws-alt while the switch waited.
    const synced = turnState("task-new", true);
    store.setState((state) => ({
      workspaceRuntimeCacheById: {
        ...state.workspaceRuntimeCacheById,
        "ws-alt": cachedSession({
          ...synced,
          tasks: [task("task-alt"), task("task-new")],
          messageCountByTask: { ...synced.messageCountByTask, "task-alt": 0 },
        }),
      },
    }));
    hold.release();
    await within(switching, "the switch");

    const state = store.getState();
    expect(state.activeWorkspaceId).toBe("ws-alt");
    expect(state.tasks.map((item) => item.id)).toEqual(["task-alt", "task-new"]);
    expectFinished(state, "task-new");
  });

  test("creating a workspace keeps a completion in the workspace it leaves", async () => {
    const hold = createHold();
    installWindow({
      terminal: {
        runCommand: async ({ command }: { command: string }) => {
          if (command.includes("git worktree add")) {
            await hold.wait();
          }
          return { ok: true, code: 0, stdout: "", stderr: "" };
        },
      },
      persistence: {
        listWorkspaces: async () => ({ ok: true, rows: [] }),
        loadWorkspace: async () => ({ ok: true, snapshot: null }),
        loadWorkspaceShellLite: async () => ({ ok: true, shellLite: null }),
        upsertWorkspace: async () => ({ ok: true }),
        saveRepositoryRegistry: async () => ({ ok: true }),
      },
    });
    const store = await loadStore();
    store.setState({
      ...store.getInitialState(),
      ...repositoryState(["ws-main"]),
      ...turnState("task-main", false),
      workspaceRuntimeCacheById: {},
    });

    const creating = store.getState().createWorkspace({
      name: "feature/next",
      mode: "branch",
      fromBranch: "main",
    });
    pending = creating;
    await within(hold.reached, "git worktree add");
    store.setState(turnState("task-main", true));
    hold.release();
    const result = await within(creating, "workspace creation");

    expect(result).toMatchObject({ ok: true });
    const state = store.getState();
    expect(state.activeWorkspaceId).toBe(result.workspaceId!);
    expectFinished(state.workspaceRuntimeCacheById["ws-main"], "task-main");
  });

  test("opening another project keeps a completion in the workspace it leaves", async () => {
    const hold = createHold();
    installWindow({
      persistence: {
        listWorkspaces: async () => ({ ok: true, rows: [] }),
        loadWorkspace: async () => ({ ok: true, snapshot: null }),
        loadWorkspaceShellSummary: async () => {
          await hold.wait();
          return { ok: true, summary: null };
        },
        upsertWorkspace: async () => ({ ok: true }),
      },
    });
    const store = await loadStore();
    store.setState({
      ...store.getInitialState(),
      ...repositoryState(["ws-main"]),
      ...turnState("task-main", false),
      workspaceRuntimeCacheById: {},
    });

    const opening = store
      .getState()
      .openRepository({ repositoryPath: "/tmp/other-project" });
    pending = opening;
    await within(hold.reached, "the new project's shell summary read");
    store.setState(turnState("task-main", true));
    hold.release();
    await within(opening, "opening the project");

    const state = store.getState();
    expect(state.repositoryPath).toBe("/tmp/other-project");
    expectFinished(state.workspaceRuntimeCacheById["ws-main"], "task-main");
  });
});
