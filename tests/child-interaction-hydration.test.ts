import { afterEach, beforeEach, expect, test } from "bun:test";
import type { TaskMessagesPage, WorkspaceShell } from "@/lib/db/workspaces.db";
import type { PersistedTurnSummary } from "@/lib/db/turns.db";
import type { ChatMessage, Task } from "@/types/chat";
import { createEmptyWorkspaceState } from "@/store/workspace-session-state";

const originalWindow = globalThis.window;
const expected = { repositoryPath: "/tmp/attention-project", workspaceId: "child-workspace", taskId: "child", turnId: "child-turn", kind: "approval" as const, requestId: "approval", messageId: "request-message" };
const child: Task = { id: "child", title: "Child", provider: "codex", updatedAt: "2026-10-01T00:00:00Z", unread: false, controlMode: "managed", controlOwner: "stave", parentTaskId: "parent" };
const request: ChatMessage = { id: "request-message", role: "assistant", model: "model", providerId: "codex", content: "", parts: [{ type: "approval", requestId: "approval", toolName: "Shell", description: "Verify", state: "approval-requested" }] };
const shell: WorkspaceShell = { ...createEmptyWorkspaceState(), activeTaskId: "child", tasks: [child], messageCountByTask: { child: 250 } };
const turns: PersistedTurnSummary[] = [{ id: "child-turn", workspaceId: "child-workspace", taskId: "child", providerId: "codex", createdAt: child.updatedAt, completedAt: null }];
const page: TaskMessagesPage = { messages: [request], totalCount: 250, limit: 120, offset: 130, hasMoreOlder: true };

beforeEach(() => {
  globalThis.window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } } as unknown as Window & typeof globalThis;
});
afterEach(async () => {
  const { useAppStore } = await import("@/store/app.store");
  useAppStore.setState(useAppStore.getInitialState(), true);
  globalThis.window = originalWindow;
});

async function setup(cached = false) {
  const { useAppStore } = await import("@/store/app.store");
  useAppStore.setState({ ...useAppStore.getInitialState(), repositoryPath: expected.repositoryPath, activeWorkspaceId: "parent-workspace", activeTaskId: "parent",
    workspaces: [{ id: "child-workspace", name: "Child", updatedAt: child.updatedAt }], tasks: [{ ...child, id: "parent" }],
    taskWorkspaceIdById: { child: "child-workspace" }, workspaceRuntimeCacheById: cached ? { "child-workspace": { ...createEmptyWorkspaceState(), nativeSessionReadyByTask: {}, activeTurnIdsByTask: {}, providerGoalByTask: {}, tasks: [child], activeTaskId: "child" } } : {} });
  return useAppStore;
}

test("cold child request hydration retains parent selection and the full durable message count", async () => {
  const store = await setup();
  const { loadChildInteraction } = await import("@/components/team/load-child-interaction");
  let bounded = false;
  await loadChildInteraction(expected, { loadWorkspaceShell: async () => shell, listActiveWorkspaceTurns: async () => turns,
    loadTaskMessagesPage: async args => { bounded = args.limit === 120 && args.preserveStreaming === true; return page; } });
  const state = store.getState();
  expect(bounded).toBe(true);
  expect([state.activeWorkspaceId, state.activeTaskId]).toEqual(["parent-workspace", "parent"]);
  expect(state.workspaceRuntimeCacheById["child-workspace"]?.messagesByTask.child).toEqual([request]);
  expect(state.workspaceRuntimeCacheById["child-workspace"]?.messageCountByTask.child).toBe(250);
  expect(state.workspaceRuntimeCacheById["child-workspace"]?.activeTurnIdsByTask.child).toBe("child-turn");
});

for (const change of ["metadata", "messages", "turn"] as const) {
  test(`a ${change} update during the child read wins over the persisted snapshot`, async () => {
    const store = await setup(true);
    const { loadChildInteraction } = await import("@/components/team/load-child-interaction");
    let release!: (value: WorkspaceShell) => void;
    const pending = loadChildInteraction(expected, { loadWorkspaceShell: () => new Promise(resolve => { release = resolve; }),
      listActiveWorkspaceTurns: async () => turns, loadTaskMessagesPage: async () => page });
    const cached = store.getState().workspaceRuntimeCacheById["child-workspace"]!;
    const updated = { ...cached,
      ...(change === "metadata" ? { tasks: [{ ...child, title: "Renamed", archivedAt: child.updatedAt, controlMode: "interactive" as const }] } : {}),
      ...(change === "messages" ? { messagesByTask: { child: [{ ...request, id: "new-request" }] } } : {}),
      ...(change === "turn" ? { activeTurnIdsByTask: { child: "new-turn" } } : {}),
    };
    store.setState({ workspaceRuntimeCacheById: { "child-workspace": updated } });
    release(shell); await pending;
    expect(store.getState().workspaceRuntimeCacheById["child-workspace"]).toBe(updated);
    expect(store.getState().activeTaskId).toBe("parent");
  });
}
