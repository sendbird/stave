import { afterEach, describe, expect, test } from "bun:test";
import { createRestartContinuationActions } from "../src/store/app-store-restart-continuation-actions";
import { emptyRestartRecovery } from "../src/store/restart-continuation";
import type { AppState } from "../src/store/app-store.types";
import type { ChatMessage } from "../src/types/chat";
const originalWindow = globalThis.window;
afterEach(() => { globalThis.window = originalWindow; });

function harness(setting: "ask" | "automatically" | "never" = "ask", provider = "codex") {
  const task = { id: "t", title: "Interrupted task", provider, updatedAt: "2026-01-01T00:00:00Z", unread: false, controlMode: "interactive", controlOwner: "stave" };
  let messages: ChatMessage[] = [];
  let owned = false;
  let managed = false;
  let shutdownCompleted = false;
  let successful = false;
  let blockOwnership: (() => Promise<void>) | undefined;
  const sends: unknown[] = [];
  let durable = "";
  let state = { activeWorkspaceId: "w", tasks: [task], messagesByTask: { t: [] }, activeTurnIdsByTask: {}, promptDraftByTask: {}, providerSessionByTask: {}, layout: {}, workspaceRuntimeCacheById: {}, taskWorkspaceIdById: {}, settings: { restartContinuation: setting }, restartRecovery: emptyRestartRecovery(), restartPendingTasks: [], interruptedTasks: [], restoredQueueReleasedByTask: {} } as unknown as AppState;
  const shell = () => ({ activeTaskId: "t", tasks: [{ ...task, controlMode: managed ? "managed" : "interactive" }], promptDraftByTask: {}, providerSessionByTask: {}, editorTabs: [], activeEditorTabId: null, terminalTabs: [], activeTerminalTabId: null, messageCountByTask: { t: messages.length } });
  globalThis.window = { api: {
    persistence: {
      loadWorkspace: async () => ({ ok: true, row: null }),
      upsertWorkspace: async () => ({ ok: true }),
      listWorkspaces: async () => ({ ok: true, rows: [{ id: "w", name: "Workspace", updatedAt: "2026-01-01T00:00:00Z" }] }),
      loadWorkspaceShellForRestore: async () => ({ ok: true, shell: shell() }),
      listActiveWorkspaceTurns: async () => ({ ok: true, turns: shutdownCompleted ? [] : [{ id: "turn", workspaceId: "w", taskId: "t", providerId: provider, createdAt: "2026-01-01T00:00:00Z", completedAt: null }] }),
      listTaskTurns: async () => ({ ok: true, turns: [{ id: "turn", workspaceId: "w", taskId: "t", providerId: provider, createdAt: "2026-01-01T00:00:00Z", completedAt: shutdownCompleted ? "2026-01-01T00:01:00Z" : null,
        terminalReceipt: shutdownCompleted ? { version: 1, completedAt: "2026-01-01T00:01:00Z", outcome: successful ? "completed" : "cancelled", outputObserved: true, error: null, lastError: null, stopReason: successful ? "end_turn" : "user_abort", doneObserved: true, nativeTurnId: null, responseText: null } : null }] }),
      loadTaskMessages: async () => ({ ok: true, page: { messages, totalCount: messages.length, limit: 500, offset: 0, hasMoreOlder: false } }),
    },
    agents: { listAssignments: async () => { if (blockOwnership) await blockOwnership(); return { ok: true, value: owned ? [{ taskId: "t" }] : [] }; } },
    agentRuns: { list: async () => ({ ok: true, agentRuns: [] }) },
  } } as unknown as Window & typeof globalThis;
  const set: Parameters<typeof createRestartContinuationActions>[0]["set"] = patch => { state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) }; };
  const create = () => {
    const actions = createRestartContinuationActions({ set, get: () => state, flushPersistence: () => { durable = JSON.stringify(state.restartRecovery); return true; } });
    state = { ...state, ...actions, sendUserMessage: async args => { expect(JSON.parse(durable).consumedTurnIds).toContain("turn"); sends.push(args); return { status: "started" } as never; } };
    return actions;
  };
  const actions = create();
  return { get: () => state, set, actions, sends, create, setMessages: (next: ChatMessage[]) => { messages = next; }, setOwned: () => { owned = true; }, finishDuringShutdown: (success = false) => { shutdownCompleted = true; successful = success; }, setManaged: () => { managed = true; }, deferOwnership: (read: () => Promise<void>) => { blockOwnership = read; }, restart: () => { state = { ...state, restartRecovery: JSON.parse(durable), interruptedTasks: [] }; return create(); } };
}

describe("startup recovery through persistence and the ordinary send responder", () => {
  for (const provider of ["claude-code", "codex"]) {
    test(`${provider}: Ask lists, Continue sends once, second startup does not catch up again`, async () => {
      const h = harness("ask", provider);
      await h.actions.recoverInterruptedTasks();
      expect(h.get().interruptedTasks).toHaveLength(1);
      expect(h.sends).toHaveLength(0);
      await Promise.all([h.actions.continueInterruptedTask({ taskId: "t" }), h.actions.continueInterruptedTask({ taskId: "t" })]);
      expect(h.sends).toHaveLength(1);
      expect(h.sends[0]).toMatchObject({ providerOverride: provider, content: expect.stringContaining("Check the current state") });
      await h.restart().recoverInterruptedTasks();
      expect(h.sends).toHaveLength(1);
      expect(h.get().interruptedTasks).toHaveLength(0);
    });
  }
  test("Automatically sends and persists a guard timestamp; Never only consumes", async () => {
    const auto = harness("automatically");
    await auto.actions.recoverInterruptedTasks();
    expect(auto.sends).toHaveLength(1);
    expect(auto.get().restartRecovery.automaticTimesByTask.t).toHaveLength(1);
    const never = harness("never");
    await never.actions.recoverInterruptedTasks();
    expect(never.sends).toHaveLength(0);
    expect(never.get().interruptedTasks).toHaveLength(0);
    expect(never.get().restartRecovery.consumedTurnIds).toContain("turn");
  });
  test("three recent automatic continuations falls back to Ask", async () => {
    const h = harness("automatically");
    h.set({ restartRecovery: { ...emptyRestartRecovery(), automaticTimesByTask: { t: [Date.now(), Date.now(), Date.now()] } } });
    await h.actions.recoverInterruptedTasks();
    expect(h.get().interruptedTasks).toHaveLength(1);
    expect(h.sends).toHaveLength(0);
  });
  test("stopped, managed, assigned, approval and input tasks never continue", async () => {
    for (const excluded of ["stopped", "managed", "assigned", "approval", "input"]) {
      const h = harness("automatically");
      if (excluded === "stopped") h.set({ restartRecovery: { ...emptyRestartRecovery(), stoppedTurnIds: ["turn"] } });
      if (excluded === "managed") h.setManaged();
      if (excluded === "assigned") h.setOwned();
      if (excluded === "approval" || excluded === "input") h.setMessages([{ id: "m", role: "assistant", model: "m", providerId: "codex", content: "", parts: [excluded === "approval" ? { type: "approval", id: "a", requestId: "r", toolName: "shell", description: "request", state: "approval-requested" } : { type: "user_input", id: "u", requestId: "r", toolName: "ask", questions: [], state: "input-requested" }] }] as ChatMessage[]);
      await h.actions.recoverInterruptedTasks();
      expect(h.sends).toHaveLength(0);
      expect(h.get().interruptedTasks).toHaveLength(0);
    }
  });
  test("fresh pending request during ownership read suppresses a previously listed continuation", async () => {
    const h = harness();
    await h.actions.recoverInterruptedTasks();
    let release!: () => void;
    h.deferOwnership(() => new Promise(resolve => { release = resolve; }));
    const continuing = h.actions.continueInterruptedTask({ taskId: "t" });
    await Bun.sleep(5);
    h.set({ messagesByTask: { t: [{ parts: [{ type: "approval", state: "approval-requested" }] }] as ChatMessage[] } });
    release();
    await continuing;
    expect(h.sends).toHaveLength(0);
  });
});

test("the last renderer live snapshot recovers a turn cancelled by app shutdown but not a success", async () => {
  for (const success of [false, true]) {
    const h = harness("automatically");
    h.set({ restartPendingTasks: [{ taskId: "t", title: "Interrupted task", workspaceId: "w", providerId: "codex", turnId: "turn" }] });
    h.finishDuringShutdown(success);
    await h.actions.recoverInterruptedTasks();
    expect(h.sends).toHaveLength(success ? 0 : 1);
  }
});

test("continuing a cached task preserves another running task in its workspace", async () => {
  const h = harness();
  const session = { ...h.get(), activeTurnIdsByTask: { other: "live-other" }, tasks: h.get().tasks };
  h.set({ activeWorkspaceId: "visible-elsewhere", tasks: [], workspaceRuntimeCacheById: { w: session as never } });
  await h.actions.recoverInterruptedTasks();
  await h.actions.continueInterruptedTask({ taskId: "t" });
  expect(h.sends).toHaveLength(1);
  expect(h.get().workspaceRuntimeCacheById.w.activeTurnIdsByTask.other).toBe("live-other");
});
