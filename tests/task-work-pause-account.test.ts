import { afterEach, describe, expect, test } from "bun:test";
import { emptyRateLimitsSnapshot } from "../src/lib/providers/account-usage-block";
import type { RateLimitsSnapshotResponse } from "../src/lib/providers/provider.types";
import { guardSendAgainstAccountUsage } from "../src/store/account-usage-guard";
import { createTaskPauseActions } from "../src/store/app-store-task-pause-actions";
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

function harness(read: () => Promise<RateLimitsSnapshotResponse> = async () => codexUsage(0)) {
  const requests: unknown[] = [];
  const sends: unknown[] = [];
  const dispatches: unknown[] = [];
  globalThis.window = { api: { provider: { getRateLimitsSnapshot: (args: unknown) => {
    requests.push(args);
    return read();
  } } } } as unknown as Window & typeof globalThis;
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
  return { get, set, actions, requests, sends, dispatches, pause };
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

  test("an unavailable account read holds the work and removes the automatic reservation", async () => {
    const h = harness(async () => emptyRateLimitsSnapshot());
    h.pause();
    h.actions.setUsageLimitAutoResume({ taskId: "task-main", enabled: true });
    await h.actions.resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
    expect(h.dispatches).toEqual([]);
    expect(h.get().usageLimitPauseByTask["task-main"]).toMatchObject({ accountProfileId: ACCOUNT_A });
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
