import { afterEach, expect, test } from "bun:test";
import { useAppStore } from "../src/store/app.store";
import { getRestoreConversationBeforeTurnPlan, restoreConversationBeforeTurn } from "../src/store/turn-file-conversation";
import { flushPendingSnapshotPersists } from "../src/store/workspace-session-state";
import { TruncateTaskMessagesAfterArgsSchema } from "../electron/main/ipc/schemas";
import type { ChatMessage } from "../src/types/chat";
const originalWindow = globalThis.window;
const user = (turn: string): ChatMessage => ({ id: `u-${turn}`, turnId: turn, role: "user", providerId: "user", model: "user", content: turn, parts: [] });
const answer = (turn: string): ChatMessage => ({ id: `a-${turn}`, turnId: turn, role: "assistant", providerId: "codex", model: "test", content: turn, nativeProviderSessionId: "thread", nativeProviderTurnId: `native-${turn}`, parts: [] });
function prepare() {
  const calls: unknown[] = [], truncates: unknown[] = [];
  (globalThis as { window?: unknown }).window = { api: {
    provider: { rollbackCodexThread: async (args: unknown) => { calls.push(args); return { ok: true, detail: "done" }; } },
    persistence: {
      listWorkspaces: async () => ({ ok: true, rows: [] }),
      loadWorkspace: async () => ({ ok: true, snapshot: null }),
      upsertWorkspace: async () => ({ ok: true }),
      truncateTaskMessagesAfter: async (args: unknown) => { truncates.push(args); return { ok: true, removedCount: 4 }; },
    },
  } };
  useAppStore.setState({ ...useAppStore.getInitialState(), activeWorkspaceId: "workspace", activeTaskId: "task",
    tasks: [{ id: "task", title: "Task", provider: "codex", updatedAt: "now", unread: false, controlMode: "interactive", controlOwner: "stave" }],
    taskWorkspaceIdById: { task: "workspace" },
    messagesByTask: { task: [user("first"), answer("first"), user("second"), answer("second")] }, messageCountByTask: { task: 4 },
    providerSessionByTask: { task: { codex: { nativeSessionId: "thread", syncedThroughMessageId: "a-second" } } },
    flushActiveWorkspaceSnapshot: async () => {},
  });
  return { calls, truncates };
}
afterEach(async () => { await flushPendingSnapshotPersists(); useAppStore.setState(useAppStore.getInitialState()); globalThis.window = originalWindow; });

test("first-turn preflight includes selected and later native turns, and rollback clears every prompt and reply", async () => {
  const { calls, truncates } = prepare();
  expect(await getRestoreConversationBeforeTurnPlan({ taskId: "task", messageId: "a-first" })).toEqual({ ok: true, turnId: "first", numTurns: 2 });
  expect(calls).toEqual([]);
  expect((await restoreConversationBeforeTurn({ taskId: "task", messageId: "a-first" })).ok).toBe(true);
  expect(calls).toEqual([{ threadId: "thread", numTurns: 2, runtimeOptions: { codexAccountProfileId: "system-default", codexBinaryPath: undefined } }]);
  expect(truncates).toEqual([{ workspaceId: "workspace", taskId: "task", messageId: "u-first", before: true }]);
  expect(useAppStore.getState().messagesByTask.task).toEqual([]);
  expect(useAppStore.getState().messageCountByTask.task).toBe(0);
  expect(useAppStore.getState().providerSessionByTask.task?.codex).toEqual({ nativeSessionId: "thread" });
});

test("restoring a later turn keeps only earlier exchanges and moves the native sync cursor", async () => {
  const { calls } = prepare();
  expect((await restoreConversationBeforeTurn({ taskId: "task", messageId: "a-second" })).ok).toBe(true);
  expect(calls).toMatchObject([{ numTurns: 1 }]);
  expect(useAppStore.getState().messagesByTask.task?.map((message) => message.id)).toEqual(["u-first", "a-first"]);
  expect(useAppStore.getState().providerSessionByTask.task?.codex).toMatchObject({ syncedThroughMessageId: "a-first" });
});

test.each(["running", "missing-turn", "missing-user", "mixed-provider", "mixed-account", "stale-session"])("preflight refuses %s without native or persistence writes", async (scenario) => {
  const { calls, truncates } = prepare();
  if (scenario === "running") useAppStore.setState({ activeTurnIdsByTask: { task: "active" } });
  useAppStore.setState((state) => ({ messagesByTask: { task: state.messagesByTask.task!.map((message) => {
    if (scenario === "missing-turn" && message.id === "a-first") return { ...message, turnId: undefined };
    if (scenario === "mixed-provider" && message.id === "a-second") return { ...message, providerId: "claude-code" };
    if (scenario === "mixed-account" && message.id === "a-second") return { ...message, nativeAccountProfileId: "other" };
    if (scenario === "missing-user" && message.id === "u-first") return { ...message, turnId: undefined };
    if (scenario === "stale-session" && message.id === "a-first") return { ...message, nativeProviderSessionId: "old" };
    return message;
  }) } }));
  expect((await getRestoreConversationBeforeTurnPlan({ taskId: "task", messageId: "a-first" })).ok).toBe(false);
  expect((await restoreConversationBeforeTurn({ taskId: "task", messageId: "a-first" })).ok).toBe(false);
  expect(calls).toEqual([]); expect(truncates).toEqual([]);
});

test("the new inclusive boundary is explicit while invalid flags and extra IPC fields stay rejected", () => {
  const args = { workspaceId: "workspace", taskId: "task", messageId: "user" };
  expect(TruncateTaskMessagesAfterArgsSchema.safeParse(args).success).toBe(true);
  expect(TruncateTaskMessagesAfterArgsSchema.safeParse({ ...args, before: true }).success).toBe(true);
  expect(TruncateTaskMessagesAfterArgsSchema.safeParse({ ...args, before: false }).success).toBe(false);
  expect(TruncateTaskMessagesAfterArgsSchema.safeParse({ ...args, overwrite: true }).success).toBe(false);
});

test("preflight reads the complete paginated history before locating an unloaded turn", async () => {
  prepare();
  const full = useAppStore.getState().messagesByTask.task!;
  useAppStore.setState({ messagesByTask: { task: full.slice(2) } });
  const offsets: number[] = [];
  const api = globalThis.window.api!.persistence!;
  api.loadTaskMessages = async (args) => {
    const offset = args.offset ?? 0;
    offsets.push(offset);
    return { ok: true, page: { messages: offset === 0 ? full.slice(2) : full.slice(0, 2), totalCount: 4, limit: 2, offset, hasMoreOlder: offset === 0 } };
  };
  expect(await getRestoreConversationBeforeTurnPlan({ taskId: "task", messageId: "a-first" })).toEqual({ ok: true, turnId: "first", numTurns: 2 });
  expect(offsets).toEqual([0, 2]);
});

test("a native rollback refusal preserves the local transcript and never truncates persistence", async () => {
  const { truncates } = prepare();
  globalThis.window.api!.provider!.rollbackCodexThread = async () => ({ ok: false, detail: "busy" });
  const before = useAppStore.getState().messagesByTask;
  expect(await restoreConversationBeforeTurn({ taskId: "task", messageId: "a-first" })).toEqual({ ok: false, detail: "busy" });
  expect(useAppStore.getState().messagesByTask).toBe(before);
  expect(truncates).toEqual([]);
});
