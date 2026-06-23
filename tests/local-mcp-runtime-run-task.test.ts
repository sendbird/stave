import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

// Regression: the host-service local MCP `runTask` builds a pending provider
// turn via `buildPendingProviderTurnState`, which requires `messageCountByTask`
// (added together with durable message ids). When the caller omitted that map
// the helper dereferenced `undefined[taskId]`, so every MCP-initiated turn
// crashed with "Cannot read properties of undefined (reading '<taskId>')".
//
// `electron/` is not part of the `tsc` typecheck graph, so this runtime test is
// the guard that `runTask` keeps forwarding the required map.
//
// Persistence is stubbed (better-sqlite3 cannot run under Bun). The provider
// runtime is NOT module-mocked — that would leak across test files — instead its
// `startTurnStream` is patched in place and restored, so no real turn spawns.

const WORKSPACE_ID = "ws-runtask-regression";
const PROJECT_PATH = "/tmp/stave-runtask-regression/project";
const WORKSPACE_PATH = "/tmp/stave-runtask-regression/worktree";
const USER_DATA_PATH = "/tmp/stave-runtask-regression/user-data";

const startTurnStreamCalls: unknown[] = [];

const fakeStore = {
  loadProjectRegistry: () => [
    {
      projectPath: PROJECT_PATH,
      projectName: "proj",
      lastOpenedAt: "2026-01-01T00:00:00.000Z",
      defaultBranch: "main",
      workspaces: [
        { id: WORKSPACE_ID, name: "feature", updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
      activeWorkspaceId: WORKSPACE_ID,
      workspaceBranchById: { [WORKSPACE_ID]: "feature" },
      workspacePathById: { [WORKSPACE_ID]: WORKSPACE_PATH },
      workspaceDefaultById: {},
    },
  ],
  loadWorkspaceSnapshot: () => ({ tasks: [], messagesByTask: {} }),
  listActiveTurnsForWorkspace: () => [],
  beginTurn: () => {},
  upsertWorkspace: () => {},
  saveProjectRegistry: () => {},
};

mock.module("electron", () => ({
  app: { getPath: () => USER_DATA_PATH },
}));

mock.module("../electron/host-service/persistence", () => ({
  ensureHostServicePersistenceReady: () => fakeStore,
  resetHostServicePersistence: () => {},
  resolveHostServiceUserDataPath: () => USER_DATA_PATH,
}));

const { providerRuntime } = await import("../electron/providers/runtime");
const runtime = await import("../electron/host-service/local-mcp-runtime");

const originalStartTurnStream = providerRuntime.startTurnStream;

beforeAll(() => {
  providerRuntime.startTurnStream = ((params: unknown) => {
    startTurnStreamCalls.push(params);
    return { ok: true };
  }) as typeof providerRuntime.startTurnStream;
});

afterAll(() => {
  providerRuntime.startTurnStream = originalStartTurnStream;
});

describe("local MCP runtime runTask", () => {
  test("creates a new task turn without crashing on messageCountByTask", async () => {
    const result = await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      prompt: "Investigate the bug",
    });

    expect(result.workspaceId).toBe(WORKSPACE_ID);
    expect(result.taskId).toBeTruthy();
    expect(result.turnId).toBeTruthy();
    expect(startTurnStreamCalls).toHaveLength(1);
  });
});
