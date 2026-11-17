import { afterEach, expect, test } from "bun:test";
import { createAppStorePersistenceOptions } from "../src/store/app-store-persistence";
const emptyRestartRecovery = () => ({ consumedTurnIds: [], stoppedTurnIds: [], automaticTimesByTask: {} });
import type { AppState } from "../src/store/app-store.types";
const originalWindow = globalThis.window;
afterEach(() => { globalThis.window = originalWindow; });

test("a real persistence snapshot keeps pause and armed reset after a simulated renderer restart", () => {
  const pause = { workspaceId: "w", providerId: "codex", accountProfileId: "a", stoppedTurn: true, pausedAt: 100, resetsAt: 200, autoResumeAt: 300 };
  const state = { workspaces: [], recentRepositories: [], settings: {}, usageLimitPauseByTask: { t: pause }, restartRecovery: { ...emptyRestartRecovery(), automaticTimesByTask: { t: [10, 20, 30] } } } as unknown as AppState;
  const serialized = JSON.stringify(createAppStorePersistenceOptions().partialize(state));
  const restarted = JSON.parse(serialized);
  expect(restarted.usageLimitPauseByTask.t).toEqual(pause);
  expect(restarted.restartRecovery.automaticTimesByTask.t).toEqual([10, 20, 30]);
});

test("the persistence snapshot records the active turn before provider shutdown completes it", () => {
  const state = { activeWorkspaceId: "w", tasks: [{ id: "t", title: "Task", provider: "codex" }], activeTurnIdsByTask: { t: "live" }, workspaceRuntimeCacheById: {}, restartPendingTasks: [], restartRecovery: emptyRestartRecovery(), workspaces: [], recentRepositories: [], settings: {}, usageLimitPauseByTask: {} } as unknown as AppState;
  const saved = createAppStorePersistenceOptions().partialize(state);
  expect(saved.restartPendingTasks).toEqual([{ taskId: "t", title: "Task", providerId: "codex", workspaceId: "w", turnId: "live" }]);
});

test("streaming-only cache changes do not rewrite the pending recovery snapshot", () => {
  const options = createAppStorePersistenceOptions();
  const task = { id: "t", title: "Task", provider: "codex" };
  const cached = { tasks: [task], activeTurnIdsByTask: { t: "running" }, messagesByTask: { t: [] } };
  const state = { activeWorkspaceId: "visible", tasks: [], activeTurnIdsByTask: {}, workspaceRuntimeCacheById: { background: cached }, restartPendingTasks: [], restartRecovery: emptyRestartRecovery(), workspaces: [], recentRepositories: [], settings: {}, usageLimitPauseByTask: {} } as unknown as AppState;
  const first = options.partialize(state).restartPendingTasks;
  const streaming = { ...state, workspaceRuntimeCacheById: { background: { ...cached, messagesByTask: { t: [{ content: "more output" }] } } } } as unknown as AppState;
  expect(options.partialize(streaming).restartPendingTasks).toBe(first);
  const renamed = { ...streaming, workspaceRuntimeCacheById: { background: { ...cached, tasks: [{ ...task, title: "Renamed" }] } } } as unknown as AppState;
  const changed = options.partialize(renamed).restartPendingTasks;
  expect(changed).not.toBe(first);
  expect(changed[0]?.title).toBe("Renamed");
  const consumed = { ...renamed, restartRecovery: { ...emptyRestartRecovery(), consumedTurnIds: ["running"] } } as unknown as AppState;
  expect(options.partialize(consumed).restartPendingTasks).toEqual([]);
});
