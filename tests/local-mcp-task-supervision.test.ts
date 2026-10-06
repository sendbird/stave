import { afterEach, expect, mock, test } from "bun:test";
import type { Task } from "../src/types/chat";

const workspaceId = "worktree:supervision";
const taskId = "renderer-created-task";
const task: Task = { id: taskId, title: "New goal", provider: "codex", updatedAt: "2026-10-06T00:00:00Z", unread: false };
let tasks: Task[] = [];
let model = "gpt-6-sol";
let activeTurnId: string | null = null;
const store = {
  loadRepositoryRegistry: () => [{
    repositoryPath: "/tmp/supervision/project", repositoryName: "Project", defaultBranch: "main",
    workspaces: [{ id: workspaceId, name: "Work", updatedAt: task.updatedAt }],
    activeWorkspaceId: workspaceId, workspaceDefaultById: {},
    workspacePathById: { [workspaceId]: "/tmp/supervision/worktree" }, workspaceBranchById: {},
  }],
  loadWorkspaceShell: () => ({
    tasks, activeTaskId: tasks[0]?.id ?? "", providerSessionByTask: {}, messageCountByTask: {},
    promptDraftByTask: { [taskId]: { text: "", runtimeOverrides: { model, modelProviderId: "codex" } } },
  }),
  listActiveTurnsForWorkspace: () => activeTurnId ? [{ id: activeTurnId, taskId, completedAt: null }] : [],
  loadTaskMessagesPage: () => ({ messages: [], totalCount: 0 }),
};
mock.module("electron", () => ({ app: { getPath: () => "/tmp/supervision/user-data" } }));
mock.module("../electron/host-service/persistence", () => ({
  ensureHostServicePersistenceReady: () => store, resetHostServicePersistence: () => {},
  resolveHostServiceUserDataPath: () => "/tmp/supervision/user-data",
}));
const runtime = await import("../electron/host-service/local-mcp-runtime");
const snapshot = () => runtime.getTaskSupervisionSnapshot({ workspaceId, taskId });

afterEach(async () => {
  await runtime.cleanupLocalMcpRuntime();
  tasks = [];
  model = "gpt-6-sol";
  activeTurnId = null;
});

test("supervision finds a renderer-created task after an empty workspace was cached", async () => {
  expect((await snapshot()).exists).toBe(false);
  tasks = [task];
  for (let i = 0; i < 3; i++) expect(await snapshot()).toMatchObject({ exists: true, model, taskId });
});

test("supervision reads current archival, model and active turn rather than cached values", async () => {
  tasks = [task];
  expect(await snapshot()).toMatchObject({ archived: false, model: "gpt-6-sol", activeTurnId: null });
  tasks = [{ ...task, archivedAt: "2026-10-06T01:00:00Z" }];
  model = "gpt-6.1-sol";
  activeTurnId = "new-turn";
  expect(await snapshot()).toMatchObject({ archived: true, model, activeTurnId });
  tasks = [];
  expect((await snapshot()).exists).toBe(false);
});
