import { afterEach, describe, expect, test } from "bun:test";
import { createRestartContinuationActions } from "../src/store/app-store-restart-continuation-actions";
import { emptyRestartRecovery } from "../src/store/restart-continuation";
import type { AppState } from "../src/store/app-store.types";
import type { ChatMessage } from "../src/types/chat";
const originalWindow = globalThis.window;
// Recovery was installed an hour before these turns started.
const INSTALLED_AT = Date.now() - 3_600_000;
afterEach(() => { globalThis.window = originalWindow; });

function harness(setting: "ask" | "automatically" | "never" = "ask", provider = "codex") {
  const task = { id: "t", title: "Interrupted task", provider, updatedAt: "2026-01-01T00:00:00Z", unread: false, controlMode: "interactive", controlOwner: "stave" };
  let messages: ChatMessage[] = [];
  let owned = false;
  let managed = false;
  let shutdownCompleted = false;
  let successful = false;
  let blockOwnership: (() => Promise<void>) | undefined;
  // The host provider runtime: its boot time and the turns it still runs.
  const host = { startedAt: Date.now() - 1_000, live: [] as Array<{ turnId: string; taskId: string; providerId: string }>, ok: true };
  let turnCreatedAt = new Date(Date.now() - 60_000).toISOString();
  const calls = { messageLimits: [] as number[], assignments: 0 };
  const sends: unknown[] = [];
  let durable = "";
  let state = { activeWorkspaceId: "w", tasks: [task], messagesByTask: { t: [] }, activeTurnIdsByTask: {}, promptDraftByTask: {}, providerSessionByTask: {}, layout: {}, workspaceRuntimeCacheById: {}, taskWorkspaceIdById: {}, settings: { restartContinuation: setting }, restartRecovery: emptyRestartRecovery(INSTALLED_AT), restartPendingTasks: [], interruptedTasks: [], restoredQueueReleasedByTask: {} } as unknown as AppState;
  const shell = () => ({ activeTaskId: "t", tasks: [{ ...task, controlMode: managed ? "managed" : "interactive" }], promptDraftByTask: {}, providerSessionByTask: {}, editorTabs: [], activeEditorTabId: null, terminalTabs: [], activeTerminalTabId: null, messageCountByTask: { t: messages.length } });
  globalThis.window = { api: {
    persistence: {
      loadWorkspace: async () => ({ ok: true, row: null }),
      upsertWorkspace: async () => ({ ok: true }),
      listWorkspaces: async () => ({ ok: true, rows: [{ id: "w", name: "Workspace", updatedAt: "2026-01-01T00:00:00Z" }] }),
      loadWorkspaceShellForRestore: async () => ({ ok: true, shell: shell() }),
      listActiveWorkspaceTurns: async () => ({ ok: true, turns: shutdownCompleted ? [] : [{ id: "turn", workspaceId: "w", taskId: "t", providerId: provider, createdAt: turnCreatedAt, completedAt: null }] }),
      listTaskTurns: async () => ({ ok: true, turns: [{ id: "turn", workspaceId: "w", taskId: "t", providerId: provider, createdAt: turnCreatedAt, completedAt: shutdownCompleted ? "2026-01-01T00:01:00Z" : null,
        terminalReceipt: shutdownCompleted ? { version: 1, completedAt: "2026-01-01T00:01:00Z", outcome: successful ? "completed" : "cancelled", outputObserved: true, error: null, lastError: null, stopReason: successful ? "end_turn" : "user_abort", doneObserved: true, nativeTurnId: null, responseText: null } : null }] }),
      loadTaskMessages: async (args: { limit?: number }) => { calls.messageLimits.push(args.limit ?? 0); return ({ ok: true, page: { messages, totalCount: messages.length, limit: 500, offset: 0, hasMoreOlder: false } }); },
    },
    provider: { listLiveTurns: async () => host.ok ? { ok: true, hostStartedAt: host.startedAt, turns: host.live } : { ok: false, message: "host unavailable" } },
    agents: { listAssignments: async () => { calls.assignments += 1; if (blockOwnership) await blockOwnership(); return { ok: true, value: owned ? [{ taskId: "t" }] : [] }; } },
    agentRuns: { list: async () => ({ ok: true, agentRuns: [] }) },
  } } as unknown as Window & typeof globalThis;
  const set: Parameters<typeof createRestartContinuationActions>[0]["set"] = patch => { state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) }; };
  const create = () => {
    const actions = createRestartContinuationActions({ set, get: () => state, flushPersistence: () => { durable = JSON.stringify(state.restartRecovery); return true; } });
    state = { ...state, ...actions, sendUserMessage: async args => { expect(JSON.parse(durable).consumedTurnIds).toContain("turn"); sends.push(args); return { status: "started" } as never; } };
    return actions;
  };
  const actions = create();
  return { host, calls, setTurnCreatedAt: (at: number) => { turnCreatedAt = new Date(at).toISOString(); }, get: () => state, set, actions, sends, create, setMessages: (next: ChatMessage[]) => { messages = next; }, setOwned: () => { owned = true; }, finishDuringShutdown: (success = false) => { shutdownCompleted = true; successful = success; }, setManaged: () => { managed = true; }, deferOwnership: (read: () => Promise<void>) => { blockOwnership = read; }, restart: () => { state = { ...state, restartRecovery: JSON.parse(durable), interruptedTasks: [] }; return create(); } };
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
    h.set({ restartRecovery: { ...emptyRestartRecovery(INSTALLED_AT), automaticTimesByTask: { t: [Date.now(), Date.now(), Date.now()] } } });
    await h.actions.recoverInterruptedTasks();
    expect(h.get().interruptedTasks).toHaveLength(1);
    expect(h.sends).toHaveLength(0);
  });
  test("stopped, managed, assigned, approval and input tasks never continue", async () => {
    for (const excluded of ["stopped", "managed", "assigned", "approval", "input"]) {
      const h = harness("automatically");
      if (excluded === "stopped") h.set({ restartRecovery: { ...emptyRestartRecovery(INSTALLED_AT), stoppedTurnIds: ["turn"] } });
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

describe("a host turn that is still running is never continued", () => {
  test("renderer reload while the host turn streams offers nothing and starts no second turn", async () => {
    for (const setting of ["ask", "automatically"] as const) {
      const h = harness(setting);
      // A reload: the host booted before the turn and still runs it; the renderer
      // remembered it as pending and hydration emptied activeTurnIdsByTask.
      h.host.startedAt = Date.now() - 3_600_000;
      h.host.live = [{ turnId: "turn", taskId: "t", providerId: "codex" }];
      h.set({ restartPendingTasks: [{ taskId: "t", title: "Interrupted task", workspaceId: "w", providerId: "codex", turnId: "turn" }] });
      await h.actions.recoverInterruptedTasks();
      expect(h.get().interruptedTasks).toHaveLength(0);
      expect(h.sends).toHaveLength(0);
    }
  });
  test("a turn started after host boot is not an interruption even when the host no longer lists it", async () => {
    const h = harness("automatically");
    h.host.startedAt = Date.now() - 3_600_000;
    await h.actions.recoverInterruptedTasks();
    expect(h.get().interruptedTasks).toHaveLength(0);
    expect(h.sends).toHaveLength(0);
  });
  test("another live turn of the same task blocks continuation", async () => {
    const h = harness("automatically");
    h.host.live = [{ turnId: "newer", taskId: "t", providerId: "codex" }];
    await h.actions.recoverInterruptedTasks();
    expect(h.sends).toHaveLength(0);
  });
  test("a listed continuation re-checks the host before sending", async () => {
    const h = harness("ask");
    await h.actions.recoverInterruptedTasks();
    expect(h.get().interruptedTasks).toHaveLength(1);
    h.host.live = [{ turnId: "turn", taskId: "t", providerId: "codex" }];
    await h.actions.continueInterruptedTask({ taskId: "t" });
    expect(h.sends).toHaveLength(0);
  });
  test("an unreadable host runtime fails closed", async () => {
    const h = harness("automatically");
    h.host.ok = false;
    await h.actions.recoverInterruptedTasks();
    expect(h.sends).toHaveLength(0);
    expect(h.get().interruptedTasks).toHaveLength(0);
  });
});

describe("evaluated interruptions are settled and startup reads stay bounded", () => {
  test("an excluded interruption is settled and never read again on the next startup", async () => {
    for (const excluded of ["assigned", "managed", "stopped", "waiting"]) {
      const h = harness("automatically");
      if (excluded === "assigned") h.setOwned();
      if (excluded === "managed") h.setManaged();
      if (excluded === "stopped") h.set({ restartRecovery: { ...h.get().restartRecovery, stoppedTurnIds: ["turn"] } });
      if (excluded === "waiting") h.setMessages([{ id: "m", role: "assistant", model: "m", providerId: "codex", content: "", parts: [{ type: "approval", id: "a", requestId: "r", toolName: "shell", description: "request", state: "approval-requested" }] }] as ChatMessage[]);
      await h.actions.recoverInterruptedTasks();
      expect(h.get().restartRecovery.consumedTurnIds).toContain("turn");
      const reads = h.calls.messageLimits.length;
      await h.restart().recoverInterruptedTasks();
      expect(h.calls.messageLimits.length).toBe(reads);
      expect(h.sends).toHaveLength(0);
    }
  });
  test("interruptions older than a day, or from before the upgrade, are ignored without reads", async () => {
    const old = harness("automatically");
    old.setTurnCreatedAt(Date.now() - 25 * 60 * 60_000);
    await old.actions.recoverInterruptedTasks();
    expect(old.sends).toHaveLength(0);
    expect(old.get().interruptedTasks).toHaveLength(0);
    expect(old.calls.messageLimits).toHaveLength(0);
    expect(old.get().restartRecovery.consumedTurnIds).toContain("turn");
    const preUpgrade = harness("automatically");
    preUpgrade.set({ restartRecovery: { ...preUpgrade.get().restartRecovery, since: Date.now() - 1_000 } as never });
    await preUpgrade.actions.recoverInterruptedTasks();
    expect(preUpgrade.sends).toHaveLength(0);
    expect(preUpgrade.calls.messageLimits).toHaveLength(0);
  });
  test("deciding a candidate reads only a small recent message window", async () => {
    const h = harness("ask");
    await h.actions.recoverInterruptedTasks();
    expect(h.get().interruptedTasks).toHaveLength(1);
    expect(Math.max(...h.calls.messageLimits)).toBeLessThanOrEqual(20);
    expect(h.calls.assignments).toBe(1);
  });
});

test("a continued interrupted turn loads as interrupted, not streaming", async () => {
  const h = harness("ask");
  h.setMessages([{ id: "m", role: "assistant", model: "m", providerId: "codex", content: "partial", isStreaming: true, parts: [{ type: "text", text: "partial" }] }] as ChatMessage[]);
  await h.actions.recoverInterruptedTasks();
  await h.actions.continueInterruptedTask({ taskId: "t" });
  expect(h.sends).toHaveLength(1);
  expect(h.get().messagesByTask.t?.[0]?.isStreaming).toBe(false);
});
