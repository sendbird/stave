import { afterEach, describe, expect, test } from "bun:test";
import { USAGE_LIMIT_UNAVAILABLE_RETRY_MS } from "../src/lib/agent-runs/usage-limit";
import { emptyRateLimitsSnapshot } from "../src/lib/providers/account-usage-block";
import type { RateLimitsSnapshotResponse } from "../src/lib/providers/provider.types";
import { guardSendAgainstAccountUsage } from "../src/store/account-usage-guard";
import {
  createTaskPauseActions,
  resolveUnreadableUsageRetryDelay,
  UNREADABLE_USAGE_RETRY_MAX_MS,
} from "../src/store/app-store-task-pause-actions";
import { createAppStorePersistenceOptions } from "../src/store/app-store-persistence";
import { listDueUsageLimitAutoResumes, normalizeUsageLimitPauses, resolveNextUsageLimitAutoResume } from "../src/store/task-work-pause";
import type { AppState } from "../src/store/app-store.types";
import { pauseQueueOnUsageLimitRefusal, settleTaskQueueAfterTurn } from "../src/store/task-work-pause-wiring";

const ACCOUNT_A = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_B = "22222222-2222-4222-8222-222222222222";
const originalWindow = globalThis.window;
afterEach(() => { globalThis.window = originalWindow; });

function codexUsage(usedPercent: number, resetsAt = Date.now() + 86_400_000): RateLimitsSnapshotResponse {
  return {
    ...emptyRateLimitsSnapshot(),
    codex: { source: "rpc", error: null, buckets: [{
      limitId: "codex", limitName: null, planType: null, credits: null,
      secondary: null, individualLimit: null,
      primary: { usedPercent, resetsAt: Math.floor(resetsAt / 1000), windowDurationMins: 300 },
    }] },
  };
}

function harness(read: () => Promise<RateLimitsSnapshotResponse> = async () => codexUsage(0), extraApi: Record<string, unknown> = {}) {
  const requests: unknown[] = [];
  const sends: unknown[] = [];
  const dispatches: unknown[] = [];
  // The host provider runtime's live turns; a reload empties the renderer's copy.
  const host = { live: [] as Array<{ turnId: string; taskId: string; providerId: string }>, ok: true };
  globalThis.window = { api: { provider: { getRateLimitsSnapshot: (args: unknown) => {
    requests.push(args);
    return read();
  }, listLiveTurns: async () => host.ok ? { ok: true, hostStartedAt: 0, turns: host.live } : { ok: false } }, ...extraApi } } as unknown as Window & typeof globalThis;
  let state = {
    activeWorkspaceId: "ws-main", activeTaskId: "task-main",
    settings: { blockTurnsWhenAccountLimitReached: true, codexAccountProfileId: ACCOUNT_B },
    tasks: [{ id: "task-main", provider: "codex" }], messagesByTask: {},
    taskWorkspaceIdById: { "task-main": "ws-main" }, workspaceRuntimeCacheById: {},
    activeTurnIdsByTask: {}, layout: { terminalDocked: false },
    promptDraftByTask: { "task-main": { text: "New draft", runtimeOverrides: {
      autoRouting: true, model: "gpt-6-sol", modelProviderId: "codex", codexAccountProfileId: ACCOUNT_B,
    } } },
    usageLimitPauseByTask: {}, restoredQueueReleasedByTask: {},
    rateLimitsSnapshot: codexUsage(100),
    refreshRateLimits: async () => {},
    sendUserMessage: async (args: unknown) => { sends.push(args); return { status: "started" }; },
  } as unknown as AppState;
  const get = () => state;
  const set: Parameters<typeof createTaskPauseActions>[0]["set"] = (patch) => {
    state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  };
  const actions = createTaskPauseActions({ get, set, dispatchNextQueuedTaskTurn: (target) => { dispatches.push(target); } });
  state = { ...state, ...actions };
  const pause = () => actions.pauseTaskForUsageLimit({
    taskId: "task-main", workspaceId: "ws-main", providerId: "codex", accountProfileId: ACCOUNT_A,
    model: "gpt-5.5", stoppedTurn: false,
    usageLimit: { providerId: "codex", accountProfileId: ACCOUNT_A, windowLabel: "A primary", resetsAt: Date.now() - 60_000 },
  });
  return { host, get, set, actions, requests, sends, dispatches, pause };
}

describe("paused work resumes on the account selected when it resumes", () => {
  test("an automatic resume checks the account selected now, not the one the limit stopped", async () => {
    const h = harness();
    h.pause();
    h.actions.setUsageLimitAutoResume({ taskId: "task-main", enabled: true });
    const selectedSnapshot = h.get().rateLimitsSnapshot;
    await h.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
    expect(h.requests).toContainEqual(expect.objectContaining({ runtimeOptions: expect.objectContaining({ codexAccountProfileId: ACCOUNT_B }) }));
    expect(h.dispatches).toEqual([{ workspaceId: "ws-main", taskId: "task-main" }]);
    expect(h.get().usageLimitPauseByTask["task-main"]).toBeUndefined();
    expect(h.get().rateLimitsSnapshot).toBe(selectedSnapshot);
  });

  test("the queue a limit held is released on the accounts selected now", async () => {
    const h = harness();
    const queued = (id: string) => ({ id, queuedAt: "2026-10-11T00:00:00.000Z", content: id, attachedFilePaths: [], attachments: [],
      autoRouting: true, claudeAccountProfileId: ACCOUNT_A, codexAccountProfileId: ACCOUNT_A });
    h.set({ promptDraftByTask: { "task-main": { ...h.get().promptDraftByTask["task-main"]!, queuedTurns: [queued("first"), queued("second")] } } });
    h.pause();
    await h.actions.resumePausedTaskWork({ taskId: "task-main" });
    expect(h.dispatches).toEqual([{ workspaceId: "ws-main", taskId: "task-main" }]);
    expect(h.get().promptDraftByTask["task-main"]?.queuedTurns?.map((turn) => [turn.claudeAccountProfileId, turn.codexAccountProfileId]))
      .toEqual([["system-default", ACCOUNT_B], ["system-default", ACCOUNT_B]]);
  });

  test("a queued guard refusal records the queried account, not the current selection", async () => {
    const h = harness(async () => codexUsage(100));
    const result = await guardSendAgainstAccountUsage(h.get, "codex", { model: "gpt-5.5", accountProfileId: ACCOUNT_A });
    expect(result?.usageLimit).toMatchObject({ accountProfileId: ACCOUNT_A });
    pauseQueueOnUsageLimitRefusal(h.get, { workspaceId: "ws-main", taskId: "task-main", result: result! });
    expect(h.get().usageLimitPauseByTask["task-main"]).toMatchObject({ accountProfileId: ACCOUNT_A, stoppedTurn: false });
  });

  test("an exhausted selected account moves the reservation to its next window", async () => {
    const nextResetA = Math.floor((Date.now() + 3_600_000) / 1000) * 1000;
    const h = harness(async () => codexUsage(100, nextResetA));
    h.pause();
    h.actions.setUsageLimitAutoResume({ taskId: "task-main", enabled: true });
    await h.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
    expect(h.dispatches).toEqual([]);
    expect(h.get().usageLimitPauseByTask["task-main"]).toMatchObject({ accountProfileId: ACCOUNT_A, resetsAt: nextResetA, autoResumeAt: nextResetA + 60_000 });
  });

  test("a selection change during the dispatch guard still checks the queued account", async () => {
    const h = harness(async () => codexUsage(100));
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    h.set({ settings: { ...h.get().settings, codexAccountProfileId: ACCOUNT_A }, rateLimitsSnapshot: codexUsage(97), refreshRateLimits: () => pending });
    const checking = guardSendAgainstAccountUsage(h.get, "codex", { accountProfileId: ACCOUNT_A, model: "gpt-5.5" });
    h.set({ settings: { ...h.get().settings, codexAccountProfileId: ACCOUNT_B }, rateLimitsSnapshot: codexUsage(0) });
    finish();
    expect((await checking)?.usageLimit).toMatchObject({ accountProfileId: ACCOUNT_A });
    expect(h.requests[0]).toMatchObject({ runtimeOptions: { codexAccountProfileId: ACCOUNT_A } });
  });

  test("an unavailable account read holds the work and keeps the reservation for a later read", async () => {
    const h = harness(async () => emptyRateLimitsSnapshot());
    h.pause();
    h.actions.setUsageLimitAutoResume({ taskId: "task-main", enabled: true });
    const before = Date.now();
    await h.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
    expect(h.dispatches).toEqual([]);
    expect(h.sends).toEqual([]);
    const pause = h.get().usageLimitPauseByTask["task-main"];
    expect(pause).toMatchObject({ accountProfileId: ACCOUNT_A });
    expect(pause?.autoResumeAt).toBeGreaterThanOrEqual(before + USAGE_LIMIT_UNAVAILABLE_RETRY_MS);
  });

  test("a read that throws (offline right after waking) is due again at the retry time, and that read resumes", async () => {
    let online = false;
    const h = harness(async () => {
      if (!online) throw new Error("getaddrinfo ENOTFOUND");
      return codexUsage(0);
    });
    h.pause();
    h.actions.setUsageLimitAutoResume({ taskId: "task-main", enabled: true });
    const failedAt = Date.now();
    await h.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
    // What the app-root timer sees: nothing due before the retry, the task due at it.
    const pauses = h.get().usageLimitPauseByTask;
    const retryAt = pauses["task-main"]!.autoResumeAt!;
    expect(resolveNextUsageLimitAutoResume(pauses)).toEqual({ taskId: "task-main", at: retryAt });
    expect(listDueUsageLimitAutoResumes({ pauses, now: failedAt + USAGE_LIMIT_UNAVAILABLE_RETRY_MS - 60_000 })).toEqual([]);
    expect(listDueUsageLimitAutoResumes({ pauses, now: retryAt })).toEqual(["task-main"]);
    expect(h.dispatches).toEqual([]);
    online = true;
    await h.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
    expect(h.get().usageLimitPauseByTask["task-main"]).toBeUndefined();
    expect(h.dispatches).toEqual([{ workspaceId: "ws-main", taskId: "task-main" }]);
  });

  test("reads that keep failing back off; a readable verdict or Cancel starts over", async () => {
    const replies: Array<"fail" | "exhausted"> = ["fail", "fail", "fail", "exhausted", "fail"];
    const h = harness(async () => {
      const reply = replies.shift();
      if (reply === "exhausted") return codexUsage(100);
      throw new Error("offline");
    });
    h.pause();
    h.actions.setUsageLimitAutoResume({ taskId: "task-main", enabled: true });
    const waitAfterRead = async () => {
      const before = Date.now();
      await h.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
      return h.get().usageLimitPauseByTask["task-main"]!.autoResumeAt! - before;
    };
    const near = (actual: number, expected: number) => {
      expect(actual).toBeGreaterThanOrEqual(expected);
      expect(actual).toBeLessThan(expected + 1_000);
    };
    near(await waitAfterRead(), USAGE_LIMIT_UNAVAILABLE_RETRY_MS);
    near(await waitAfterRead(), 2 * USAGE_LIMIT_UNAVAILABLE_RETRY_MS);
    near(await waitAfterRead(), 4 * USAGE_LIMIT_UNAVAILABLE_RETRY_MS);
    // Still exhausted: the reservation moves to that window's reset, and the count clears.
    await h.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
    near(await waitAfterRead(), USAGE_LIMIT_UNAVAILABLE_RETRY_MS);
    expect(h.dispatches).toEqual([]);

    replies.push("fail");
    h.actions.setUsageLimitAutoResume({ taskId: "task-main", enabled: false });
    h.actions.setUsageLimitAutoResume({ taskId: "task-main", enabled: true });
    near(await waitAfterRead(), USAGE_LIMIT_UNAVAILABLE_RETRY_MS);
  });

  test("a pause removed outside the pause actions (task archived) takes its unreadable count with it", async () => {
    const h = harness(async () => { throw new Error("offline"); });
    h.pause();
    h.actions.setUsageLimitAutoResume({ taskId: "task-main", enabled: true });
    await h.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
    await h.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
    expect(h.get().usageLimitPauseByTask["task-main"]?.unreadableUsageReads).toBe(2);
    // Archiving drops the task's runtime entries, the pause among them.
    h.set({ usageLimitPauseByTask: {} });
    h.pause();
    h.actions.setUsageLimitAutoResume({ taskId: "task-main", enabled: true });
    const before = Date.now();
    await h.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
    const wait = h.get().usageLimitPauseByTask["task-main"]!.autoResumeAt! - before;
    expect(wait).toBeGreaterThanOrEqual(USAGE_LIMIT_UNAVAILABLE_RETRY_MS);
    expect(wait).toBeLessThan(USAGE_LIMIT_UNAVAILABLE_RETRY_MS + 1_000);
  });

  test("the unreadable retry wait doubles from five minutes up to thirty", () => {
    expect([1, 2, 3, 4, 5, 50].map(resolveUnreadableUsageRetryDelay)).toEqual([
      USAGE_LIMIT_UNAVAILABLE_RETRY_MS,
      2 * USAGE_LIMIT_UNAVAILABLE_RETRY_MS,
      4 * USAGE_LIMIT_UNAVAILABLE_RETRY_MS,
      UNREADABLE_USAGE_RETRY_MAX_MS,
      UNREADABLE_USAGE_RETRY_MAX_MS,
      UNREADABLE_USAGE_RETRY_MAX_MS,
    ]);
    expect(UNREADABLE_USAGE_RETRY_MAX_MS).toBe(30 * 60_000);
  });

  test("a read that reports its last attempt failed counts as unreadable", async () => {
    const h = harness(async () => ({
      ...codexUsage(0),
      reads: { codex: { status: "cached", reason: "backoff", nextRefreshAt: null, nextAutomaticReadAt: null, lastReadFailed: true } },
    }));
    h.pause();
    h.actions.setUsageLimitAutoResume({ taskId: "task-main", enabled: true });
    await h.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
    expect(h.dispatches).toEqual([]);
    expect(h.get().usageLimitPauseByTask["task-main"]?.autoResumeAt).toBeGreaterThan(Date.now());
  });

  test("Cancel during an unreadable read leaves the reservation off", async () => {
    let fail!: (error: Error) => void;
    const h = harness(() => new Promise((_, reject) => { fail = reject; }));
    h.pause();
    h.actions.setUsageLimitAutoResume({ taskId: "task-main", enabled: true });
    const resuming = h.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
    h.actions.setUsageLimitAutoResume({ taskId: "task-main", enabled: false });
    fail(new Error("offline"));
    await resuming;
    expect(h.get().usageLimitPauseByTask["task-main"]).toBeDefined();
    expect(h.get().usageLimitPauseByTask["task-main"]?.autoResumeAt).toBeUndefined();
  });

  test("a stopped turn continues its recorded provider and model on the account selected now", async () => {
    const h = harness();
    h.set({ settings: { ...h.get().settings, claudeAccountProfileId: ACCOUNT_B } });
    h.set({ messagesByTask: { "task-main": [{
      id: "a-ended", role: "assistant", providerId: "claude-code", model: "claude-sonnet-4-5",
      nativeAccountProfileId: ACCOUNT_A, content: "", parts: [{ type: "system_event", content: "[error] You've reached your limit" }],
    }] } });
    settleTaskQueueAfterTurn(h.get, () => {}, { workspaceId: "ws-main", taskId: "task-main" });
    expect(h.get().usageLimitPauseByTask["task-main"]).toMatchObject({ providerId: "claude-code", accountProfileId: ACCOUNT_A, model: "claude-sonnet-4-5" });
    await h.actions.resumePausedTaskWork({ taskId: "task-main" });
    expect(h.sends[0]).toMatchObject({ providerOverride: "claude-code", preservePromptDraft: true, runtimeOverrides: {
      autoRouting: false, model: "claude-sonnet-4-5", modelProviderId: "claude-code", claudeAccountProfileId: ACCOUNT_B,
    } });
    expect(h.get().promptDraftByTask["task-main"]?.text).toBe("New draft");
  });

  test("cancel during the account read suppresses the continuation", async () => {
    let finish!: (snapshot: RateLimitsSnapshotResponse) => void;
    const h = harness(() => new Promise((resolve) => { finish = resolve; }));
    h.pause();
    h.actions.setUsageLimitAutoResume({ taskId: "task-main", enabled: true });
    const resuming = h.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
    expect(h.requests).toHaveLength(1);
    h.actions.setUsageLimitAutoResume({ taskId: "task-main", enabled: false });
    finish(codexUsage(0));
    await resuming;
    expect(h.dispatches).toEqual([]);
    expect(h.get().usageLimitPauseByTask["task-main"]?.autoResumeAt).toBeUndefined();
  });

  test("automatic continuation pins the stopped Claude runtime instead of the edited Codex composer", async () => {
    const h = harness(async () => ({ ...emptyRateLimitsSnapshot(), claude: {
      source: "oauth", error: null, session: null, weekly: null, fableWeekly: null,
    } }));
    h.set({ settings: { ...h.get().settings, claudeAccountProfileId: ACCOUNT_B } });
    h.actions.pauseTaskForUsageLimit({
      taskId: "task-main", workspaceId: "ws-main", providerId: "claude-code", accountProfileId: ACCOUNT_A,
      model: "claude-sonnet-4-5", stoppedTurn: true,
      usageLimit: { providerId: "claude-code", accountProfileId: ACCOUNT_A, windowLabel: "Session", resetsAt: Date.now() - 60_000 },
    });
    h.actions.setUsageLimitAutoResume({ taskId: "task-main", enabled: true });
    await h.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
    expect(h.requests[0]).toMatchObject({ providers: ["claude-code"], runtimeOptions: { claudeAccountProfileId: ACCOUNT_B } });
    expect(h.sends[0]).toMatchObject({ providerOverride: "claude-code", runtimeOverrides: {
      autoRouting: false, model: "claude-sonnet-4-5", modelProviderId: "claude-code", claudeAccountProfileId: ACCOUNT_B,
    } });
  });

  test("an old account read cannot overwrite a replacement pause", async () => {
    let finish!: (snapshot: RateLimitsSnapshotResponse) => void;
    const h = harness(() => new Promise((resolve) => { finish = resolve; }));
    h.pause();
    h.actions.setUsageLimitAutoResume({ taskId: "task-main", enabled: true });
    const resuming = h.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
    h.actions.dismissUsageLimitPause({ taskId: "task-main" });
    h.actions.pauseTaskForUsageLimit({ taskId: "task-main", workspaceId: "ws-main", providerId: "codex", accountProfileId: ACCOUNT_B,
      stoppedTurn: false, usageLimit: { providerId: "codex", accountProfileId: ACCOUNT_B, windowLabel: "B weekly", resetsAt: Date.now() + 604_800_000 } });
    h.actions.setUsageLimitAutoResume({ taskId: "task-main", enabled: true });
    const replacement = h.get().usageLimitPauseByTask["task-main"];
    finish(codexUsage(0));
    await resuming;
    expect(h.get().usageLimitPauseByTask["task-main"]).toBe(replacement);
    expect(h.dispatches).toEqual([]);
  });

  test("a legacy pause with no recorded account stays held automatically; manual resume uses the chosen account", async () => {
    const h = harness();
    h.set({ usageLimitPauseByTask: { "task-main": {
      workspaceId: "ws-main", providerId: "codex", model: "gpt-5.5", stoppedTurn: true,
      pausedAt: Date.now() - 120_000, resetsAt: Date.now() - 60_000, autoResumeAt: Date.now() - 1,
    } } });
    await h.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
    expect(h.requests).toEqual([]);
    expect(h.sends).toEqual([]);
    expect(h.get().usageLimitPauseByTask["task-main"]?.autoResumeAt).toBeUndefined();
    await h.actions.resumePausedTaskWork({ taskId: "task-main" });
    expect(h.sends[0]).toMatchObject({ providerOverride: "codex", runtimeOverrides: { codexAccountProfileId: ACCOUNT_B, model: "gpt-5.5" } });
  });
});

test("an armed reset survives a simulated restart and concurrent startup catch-up dispatches once", async () => {
  const first = harness();
  first.pause();
  first.actions.setUsageLimitAutoResume({ taskId: "task-main", enabled: true });
  const saved = JSON.stringify(first.get().usageLimitPauseByTask);
  const restarted = harness();
  restarted.set({ usageLimitPauseByTask: JSON.parse(saved) });
  expect(listDueUsageLimitAutoResumes({ pauses: restarted.get().usageLimitPauseByTask, now: Date.now() + 120000 })).toEqual(["task-main"]);
  await Promise.all([
    restarted.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" }),
    restarted.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" }),
  ]);
  expect(restarted.dispatches).toHaveLength(1);
  expect(restarted.get().usageLimitPauseByTask["task-main"]).toBeUndefined();
  await restarted.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
  expect(restarted.dispatches).toHaveLength(1);
});

describe("an automatic resume waits out transient reads instead of disarming", () => {
  const armed = (h: ReturnType<typeof harness>) => {
    h.pause();
    h.actions.setUsageLimitAutoResume({ taskId: "task-main", enabled: true });
  };
  test("a failed ownership lookup retries later with backoff and then resumes", async () => {
    let failing = true;
    const h = harness(undefined, { agents: { listAssignments: async () => failing ? { ok: false, code: "failed", message: "host restarting" } : { ok: true, value: [] } } });
    armed(h);
    const before = Date.now();
    await h.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
    const retried = h.get().usageLimitPauseByTask["task-main"];
    expect(h.dispatches).toHaveLength(0);
    expect(retried?.autoResumeAt).toBeGreaterThan(before);
    await h.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
    const second = h.get().usageLimitPauseByTask["task-main"];
    expect(second!.autoResumeAt! - Date.now()).toBeGreaterThan(retried!.autoResumeAt! - before);
    failing = false;
    await h.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
    expect(h.dispatches).toHaveLength(1);
  });
  test("it gives up with a visible note after repeated lookup failures", async () => {
    const { toast } = await import("../src/lib/notifications/toast");
    const notes: unknown[] = [];
    const original = toast.info;
    toast.info = ((title: unknown) => { notes.push(title); return "" as never; }) as typeof toast.info;
    try {
      const h = harness(undefined, { agents: { listAssignments: async () => { throw new Error("offline"); } } });
      armed(h);
      for (let attempt = 0; attempt < 20 && h.get().usageLimitPauseByTask["task-main"]?.autoResumeAt != null; attempt += 1) {
        await h.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
      }
      expect(h.dispatches).toHaveLength(0);
      expect(h.get().usageLimitPauseByTask["task-main"]).toBeDefined();
      expect(h.get().usageLimitPauseByTask["task-main"]?.autoResumeAt).toBeUndefined();
      expect(notes).toHaveLength(1);
    } finally {
      toast.info = original;
    }
  });
  test("a turn the host still runs for the task is never resumed beside it", async () => {
    const h = harness();
    armed(h);
    h.host.live = [{ turnId: "running", taskId: "task-main", providerId: "codex" }];
    await h.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
    expect(h.dispatches).toHaveLength(0);
    expect(h.get().usageLimitPauseByTask["task-main"]?.autoResumeAt).toBeGreaterThan(Date.now());
  });
  test("a restored task loads its stopped turn as interrupted, not streaming", async () => {
    const shell = { activeTaskId: "task-main", tasks: [{ id: "task-main", title: "Task", provider: "codex", updatedAt: "2026-01-01T00:00:00Z", unread: false, controlMode: "interactive", controlOwner: "stave" }], promptDraftByTask: {}, providerSessionByTask: {}, editorTabs: [], activeEditorTabId: null, terminalTabs: [], activeTerminalTabId: null, messageCountByTask: { "task-main": 1 } };
    const messages = [{ id: "m", role: "assistant", model: "m", providerId: "codex", content: "partial", isStreaming: true, parts: [{ type: "text", text: "partial" }] }];
    const h = harness(undefined, { persistence: {
      listWorkspaces: async () => ({ ok: true, rows: [] }), loadWorkspace: async () => ({ ok: true, row: null }), upsertWorkspace: async () => ({ ok: true }),
      loadWorkspaceShellForRestore: async () => ({ ok: true, shell }),
      loadTaskMessages: async () => ({ ok: true, page: { messages, totalCount: 1, limit: 120, offset: 0, hasMoreOlder: false } }),
    } });
    h.set({ activeWorkspaceId: "elsewhere" });
    armed(h);
    await h.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
    expect(h.get().workspaceRuntimeCacheById["ws-main"]?.messagesByTask["task-main"]?.[0]?.isStreaming).toBe(false);
  });
});

function restartPauseState(h: ReturnType<typeof harness>) {
  const previous = { ...h.get(), workspaces: [], recentRepositories: [] };
  const saved = JSON.parse(JSON.stringify(createAppStorePersistenceOptions().partialize(previous)));
  return {
    usageLimitPauseByTask: normalizeUsageLimitPauses(saved.usageLimitPauseByTask),
    restoredQueueReleasedByTask: saved.restoredQueueReleasedByTask,
  };
}

test("a restarted continuation keeps its reservation and uses the selected account", async () => {
  const taskId = "task-main";
  const sentAt = Date.now();
  const first = harness();
  first.actions.pauseTaskForUsageLimit({
    taskId, workspaceId: "ws-main", providerId: "codex", accountProfileId: ACCOUNT_A,
    model: "gpt-5.5", stoppedTurn: true, origin: { kind: "turn", id: "exhausted-turn" },
    usageLimit: { providerId: "codex", windowLabel: "Session", resetsAt: sentAt + 60_000 },
  });
  first.actions.setUsageLimitAutoResume({ taskId, enabled: true });
  const saved = restartPauseState(first);
  const id = saved.usageLimitPauseByTask[taskId]!.reservation!.id;
  let consumed = false;
  const restarted = harness(undefined, { persistence: {
    hasUsageLimitResume: async () => consumed,
    listWorkspaces: async () => ({ ok: true, workspaces: [] }),
    listTaskTurns: async () => ({ ok: true, turns: [] }),
  } });
  restarted.set(saved);
  expect(listDueUsageLimitAutoResumes({ pauses: restarted.get().usageLimitPauseByTask, now: sentAt })).toEqual([]);
  expect(listDueUsageLimitAutoResumes({ pauses: restarted.get().usageLimitPauseByTask, now: sentAt + 121_000 })).toEqual([taskId]);
  const resume = () => restarted.actions.resumePausedTaskWork({ taskId, trigger: "auto" });
  await Promise.all([resume(), resume()]);
  expect(restarted.sends).toEqual([expect.objectContaining({
    usageLimitResume: expect.objectContaining({ turnId: id }),
    runtimeOverrides: expect.objectContaining({ codexAccountProfileId: ACCOUNT_B, model: "gpt-5.5" }),
  })]);
  const beforeAcknowledgement = restartPauseState(restarted);
  expect(beforeAcknowledgement.usageLimitPauseByTask[taskId]).toMatchObject({
    origin: { kind: "turn", id: "exhausted-turn" }, reservation: { id },
  });
  consumed = true;
  restarted.set(beforeAcknowledgement);
  await resume();
  expect(restarted.sends).toHaveLength(1);
  expect(restarted.get().usageLimitPauseByTask[taskId]).toBeUndefined();
  // The host claimed the send but has no successful terminal receipt.
  expect(restartPauseState(restarted).restoredQueueReleasedByTask[taskId]).toBeUndefined();
  expect(restarted.dispatches).toHaveLength(0);
});

test("unreadable quota backs off across reload and Cancel clears the saved schedule", async () => {
  const taskId = "task-main";
  const offline = async () => { throw new Error("offline"); };
  const first = harness(offline);
  first.pause();
  first.actions.setUsageLimitAutoResume({ taskId, enabled: true });
  await first.actions.resumePausedTaskWork({ taskId, trigger: "auto" });
  const saved = restartPauseState(first);
  expect(saved.usageLimitPauseByTask[taskId]).toMatchObject({ unreadableUsageReads: 1 });
  const restarted = harness(offline);
  restarted.set(saved);
  const before = Date.now();
  await restarted.actions.resumePausedTaskWork({ taskId, trigger: "auto" });
  const backedOff = restartPauseState(restarted).usageLimitPauseByTask[taskId]!;
  expect(backedOff.unreadableUsageReads).toBe(2);
  expect(backedOff.autoResumeAt!).toBeGreaterThanOrEqual(before + 10 * 60_000);
  restarted.actions.setUsageLimitAutoResume({ taskId, enabled: false });
  const cancelled = restartPauseState(restarted);
  const afterCancel = harness();
  afterCancel.set(cancelled);
  await afterCancel.actions.resumePausedTaskWork({ taskId, trigger: "auto" });
  expect(afterCancel.get().usageLimitPauseByTask[taskId]).toBeDefined();
  expect(afterCancel.get().usageLimitPauseByTask[taskId]?.autoResumeAt).toBeUndefined();
  expect(afterCancel.get().usageLimitPauseByTask[taskId]?.unreadableUsageReads).toBeUndefined();
  expect(afterCancel.requests).toEqual([]);
  expect(afterCancel.dispatches).toEqual([]);
});
