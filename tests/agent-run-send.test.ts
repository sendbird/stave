import { afterEach, describe, expect, test } from "bun:test";
import type { AgentRunCommandResponse, AgentRunDetail, AgentRunStartArgs } from "../src/lib/agent-runs/api";
import { useAgentAssignmentsStore, type TaskAgent } from "../src/store/agent-assignments-store";
import {
  cancelAgentRunBeforeStop,
  recoverUnsentAgentRunPrompt,
  registerAgentRunBridge,
  startAgentRunForSend,
  type AgentRunBridge,
  type AgentRunFirstPromptEnd,
} from "../src/store/agent-run-send";
import type { AppState } from "../src/store/app-store.types";
import { holdsComposerTurn, usePendingAutoRoutingStore } from "../src/store/pending-auto-routing-store";
import { useProviderAccounts } from "../src/lib/providers/use-provider-accounts";
import { useProviderAccountIdentities } from "../src/lib/providers/use-provider-account-identity";

const AGENT = { agentConfigId: "implementer", agentName: "Implementer" } as TaskAgent;

function fakeBridge(options: { active?: ReturnType<AgentRunBridge["activeAgentRun"]>; refuse?: string } = {}) {
  const started: AgentRunStartArgs[] = [];
  const cancelled: string[] = [];
  const watched: Array<{ agentRunId: string; end: (end: AgentRunFirstPromptEnd) => void }> = [];
  const bridge: AgentRunBridge = {
    activeAgentRun: () => options.active ?? null,
    start: async (input) => {
      started.push(input);
      return options.refuse
        ? { ok: false, agentRun: null, code: "refused", message: options.refuse }
        : ({ ok: true, agentRun: { agentRun: { id: "run-1" } } as AgentRunDetail } satisfies AgentRunCommandResponse);
    },
    cancel: async (agentRunId) => {
      cancelled.push(agentRunId);
      return { ok: true, agentRun: null };
    },
    watchFirstPrompt: ({ agentRunId }, end) => {
      watched.push({ agentRunId, end });
    },
  };
  registerAgentRunBridge(bridge);
  return { started, cancelled, watched };
}

const pendingRow = () => usePendingAutoRoutingStore.getState().byTaskId["task-1"];

function sendArgs(overrides: Partial<Parameters<typeof startAgentRunForSend>[0]> = {}) {
  let state = {
    activeWorkspaceId: "ws-1",
    tasks: [{ id: "task-1", archivedAt: null }],
    taskWorkspaceIdById: { "task-1": "ws-1" },
    workspaceRuntimeCacheById: {},
    failedSendsByTask: {},
    promptDraftByTask: { "task-1": { text: "Add CSV export.", attachedFilePaths: [], attachments: [], runtimeOverrides: { autoRouting: true } } },
  } as unknown as AppState;
  return {
    args: {
      set: (update: (current: AppState) => Partial<AppState>) => {
        state = { ...state, ...update(state) };
      },
      workspaceId: "ws-1",
      taskId: "task-1",
      providerId: "claude-code",
      prompt: "Add CSV export.",
      promptDraft: { attachedFilePaths: [], attachments: [] },
      turnActive: false,
      queued: false,
      turnOrigin: "conversation" as const,
      now: new Date("2026-10-01T09:00:00.000Z"),
      ...overrides,
    },
    state: () => state,
  };
}

afterEach(() => {
  registerAgentRunBridge(null);
  useAgentAssignmentsStore.setState({ byTaskId: {} });
  usePendingAutoRoutingStore.setState({ byTaskId: {} });
});

describe("agent run send path", () => {
  test("a Chat task sends a plain turn", async () => {
    const bridge = fakeBridge();
    const { args } = sendArgs();
    expect(await startAgentRunForSend(args)).toBeNull();
    expect(bridge.started).toEqual([]);
  });

  test("an Agent task without a run starts one with the implicit workflow and clears the draft", async () => {
    useAgentAssignmentsStore.setState({ byTaskId: { "task-1": AGENT } });
    const bridge = fakeBridge();
    const { args, state } = sendArgs();
    expect(await startAgentRunForSend(args)).toEqual({
      status: "run-started",
      taskId: "task-1",
      workspaceId: "ws-1",
      agentRunId: "run-1",
    });
    expect(bridge.started[0]).toMatchObject({
      leadTaskId: "task-1",
      assignment: "Add CSV export.",
      origin: "agent",
      workflow: { name: "Implementer", stages: [{ id: "work", title: "Work" }] },
      consent: { checkIns: "when-stuck", permissionMode: "manual" },
    });
    // The text goes; the route the draft carries stays for the run's turns.
    expect(state().promptDraftByTask["task-1"]).toEqual({
      text: "",
      attachedFilePaths: [],
      attachments: [],
      runtimeOverrides: { autoRouting: true },
    });
  });

  test("the account pool joins the start only when turned on, as subscription accounts confirmed signed in", async () => {
    const WORK = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", PERSONAL = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
    const GATEWAY = "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b", SPARE = "2b3c4d5e-6f70-4a8b-9c0d-1e2f3a4b5c6d";
    const UNCHECKED = "3c4d5e6f-7081-4b9c-8d1e-2f3a4b5c6d7e", FAILED = "4d5e6f70-8192-4c0d-9e2f-3a4b5c6d7e8f";
    const LATE = "5e6f7081-92a3-4d1e-8f3a-4b5c6d7e8f90";
    useProviderAccounts.setState({ loaded: true, profiles: [
      { id: "system-default", providerId: "claude-code", label: "System default", kind: "system" },
      { id: WORK, providerId: "claude-code", label: "Work", kind: "managed" },
      { id: PERSONAL, providerId: "claude-code", label: "Personal", kind: "managed" },
      { id: SPARE, providerId: "claude-code", label: "Spare", kind: "managed" },
      { id: UNCHECKED, providerId: "claude-code", label: "Unchecked", kind: "managed" },
      { id: FAILED, providerId: "claude-code", label: "Failed check", kind: "managed" },
      { id: LATE, providerId: "claude-code", label: "Checked at send", kind: "managed" },
      { id: GATEWAY, providerId: "claude-code", label: "Gateway", kind: "managed",
        gateway: { baseUrl: "https://ai-gateway.example/v1", secretId: "secret-1", models: ["anthropic/claude-sonnet-5"] } },
    ] });
    useProviderAccountIdentities.setState({ byKey: {
      [`claude-code:${PERSONAL}`]: { state: "signed-in", email: null, plan: null, checkedAt: 1 },
      [`claude-code:${SPARE}`]: { state: "signed-out", checkedAt: 1 },
      [`claude-code:${FAILED}`]: { state: "unknown", reason: "failed", checkedAt: 1 },
    } });
    // The sign-in check main answers for the accounts not checked yet: only LATE is signed in.
    const probed: string[] = [];
    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = { api: { providerAccounts: { identity: async ({ profileId }: { profileId: string }) => {
      probed.push(profileId);
      return { ok: true, identity: profileId === LATE
        ? { state: "signed-in", email: null, plan: null, checkedAt: 2 } : { state: "unknown", reason: "failed", checkedAt: 2 } };
    } } } };
    try {
      useAgentAssignmentsStore.setState({ byTaskId: { "task-1": AGENT } });
      const off = fakeBridge();
      await startAgentRunForSend(sendArgs({ accounts: { claudeAccountProfileId: WORK } }).args);
      expect("accountPool" in off.started[0]!).toBe(false);
      expect(probed).toEqual([]);

      usePendingAutoRoutingStore.setState({ byTaskId: {} });
      const on = fakeBridge();
      await startAgentRunForSend(sendArgs({ accounts: { claudeAccountProfileId: WORK }, promptDraft: { attachedFilePaths: [], attachments: [],
        runtimeOverrides: { agentRunAccountPool: { enabled: true, excludedAccountIds: ["system-default"] } } } }).args);
      // Only the unanswered, included subscription accounts were checked before the pool froze.
      expect(probed.sort()).toEqual([LATE, UNCHECKED].sort());
      expect(on.started[0]!.accountPool).toEqual({ accountIds: [WORK, PERSONAL, LATE] });
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
      useProviderAccounts.setState({ loaded: false, profiles: [] });
      useProviderAccountIdentities.setState({ byKey: {} });
    }
  });

  test("an Agent task with an active run sends a plain user turn", async () => {
    useAgentAssignmentsStore.setState({ byTaskId: { "task-1": AGENT } });
    const bridge = fakeBridge({ active: { id: "run-1", agentOrigin: true } });
    expect(await startAgentRunForSend(sendArgs().args)).toBeNull();
    expect(bridge.started).toEqual([]);
  });

  test("attachments start a run with frozen resolved context, including staged task references", async () => {
    useAgentAssignmentsStore.setState({ byTaskId: { "task-1": AGENT } });
    const bridge = fakeBridge();
    const context = {
      imageContexts: [{ dataUrl: "data:image/png;base64,aGVsbG8=", mimeType: "image/png", label: "Design" }],
      retrievedContextParts: [{ type: "retrieved_context" as const, sourceId: "task:source", title: "Research", content: "Verified result" }],
    };
    const attachment = { kind: "task-context" as const, id: "context-1", taskId: "source", workspaceId: "ws-1", title: "Research", scope: "latest-reply" as const };
    const { args } = sendArgs({
      promptDraft: { attachedFilePaths: [], attachments: [], promptBatch: [{ id: "batch-1", createdAt: "now", content: "Use research", attachments: [attachment] }] },
      resolveInitialContext: async () => structuredClone(context),
    });
    expect((await startAgentRunForSend(args))?.status).toBe("run-started");
    context.retrievedContextParts[0].content = "Later source reply";
    expect(bridge.started[0]?.initialContext?.retrievedContextParts?.[0]?.content).toBe("Verified result");
    expect(bridge.started[0]?.initialContext?.imageContexts).toEqual(context.imageContexts);
  });

  test("context resolution failure starts no run and restores the submitted attachments", async () => {
    useAgentAssignmentsStore.setState({ byTaskId: { "task-1": AGENT } });
    const bridge = fakeBridge();
    const { args, state } = sendArgs({ resolveInitialContext: async () => { throw new Error("Context unavailable"); } });
    const attachment = { kind: "image" as const, id: "image", label: "Design", dataUrl: "data:image/png;base64,aA==" };
    args.set((current) => ({ promptDraftByTask: { ...current.promptDraftByTask,
      "task-1": { ...current.promptDraftByTask["task-1"], attachments: [attachment] } } }));
    expect(await startAgentRunForSend(args)).toEqual({ status: "blocked", message: "Context unavailable" });
    expect(bridge.started).toEqual([]);
    expect(state().promptDraftByTask["task-1"]?.attachments).toEqual([attachment]);
    expect(pendingRow()).toBeUndefined();
  });

  test("a failed retry retains attachments even when it preserves the current composer", async () => {
    useAgentAssignmentsStore.setState({ byTaskId: { "task-1": AGENT } });
    fakeBridge({ refuse: "Unavailable" });
    const attachment = { kind: "image" as const, id: "image", label: "Design", dataUrl: "data:image/png;base64,aA==" };
    const { args, state } = sendArgs({ preservePromptDraft: true, promptDraft: { attachedFilePaths: ["design.png"], attachments: [attachment] } });
    expect((await startAgentRunForSend(args))?.status).toBe("blocked");
    expect(state().failedSendsByTask["task-1"]?.[0]).toMatchObject({ attachedFilePaths: ["design.png"], attachments: [attachment] });
    expect(state().promptDraftByTask["task-1"]?.text).toBe("Add CSV export.");
  });

  test("a refused run start blocks the send and restores its prompt", async () => {
    useAgentAssignmentsStore.setState({ byTaskId: { "task-1": AGENT } });
    const bridge = fakeBridge({ refuse: "The lead task was not found." });
    const { args, state } = sendArgs();
    expect(await startAgentRunForSend(args)).toEqual({ status: "blocked", message: "The lead task was not found." });
    expect(bridge.started).toHaveLength(1);
    expect(state().promptDraftByTask["task-1"]?.text).toBe("Add CSV export.");
    expect(pendingRow()).toBeUndefined();
    expect(bridge.watched).toEqual([]);
  });

  test("a refused start preserves text typed during startup and offers the original prompt for retry", async () => {
    useAgentAssignmentsStore.setState({ byTaskId: { "task-1": AGENT } });
    const bridge = fakeBridge({ refuse: "The task could not be saved." });
    const { args, state } = sendArgs();
    const pending = startAgentRunForSend(args);
    args.set((current) => ({ promptDraftByTask: { ...current.promptDraftByTask,
      "task-1": { ...current.promptDraftByTask["task-1"], text: "Another prompt" } } }));
    expect((await pending)?.status).toBe("blocked");
    expect(state().promptDraftByTask["task-1"]?.text).toBe("Another prompt");
    expect(state().failedSendsByTask["task-1"]?.[0]?.text).toBe("Add CSV export.");
    expect(bridge.started).toHaveLength(1);
  });

  test("the prompt shows as the run's row from the send until the run writes it", async () => {
    useAgentAssignmentsStore.setState({ byTaskId: { "task-1": AGENT } });
    const bridge = fakeBridge();
    const { args, state } = sendArgs();
    const sent = startAgentRunForSend(args);
    // Drawn before the start is even answered, so a new task leaves its start screen.
    expect(pendingRow()?.agentRun).toEqual({ agentRunId: null });
    expect(pendingRow()?.userMessage).toMatchObject({ role: "user", content: "Add CSV export." });
    // The run bar owns Stop; the composer keeps Send.
    expect(holdsComposerTurn(pendingRow())).toBe(false);
    await sent;
    expect(pendingRow()?.agentRun).toEqual({ agentRunId: "run-1" });
    expect(bridge.watched.map((watch) => watch.agentRunId)).toEqual(["run-1"]);
    bridge.watched[0]!.end({ outcome: "landed" });
    expect(pendingRow()).toBeUndefined();
    expect(state().promptDraftByTask["task-1"]?.text).toBe("");
  });

  test("a second send while the run is starting stays a plain turn", async () => {
    useAgentAssignmentsStore.setState({ byTaskId: { "task-1": AGENT } });
    const bridge = fakeBridge();
    await startAgentRunForSend(sendArgs().args);
    expect(await startAgentRunForSend(sendArgs().args)).toBeNull();
    expect(bridge.started).toHaveLength(1);
  });

  test("a run that ends before writing its prompt gives the prompt back", async () => {
    useAgentAssignmentsStore.setState({ byTaskId: { "task-1": AGENT } });
    const bridge = fakeBridge();
    const { args, state } = sendArgs();
    await startAgentRunForSend(args);
    bridge.watched[0]!.end({ outcome: "ended", reason: null });
    expect(pendingRow()).toBeUndefined();
    // The composer was still empty, so the prompt goes back into it.
    expect(state().promptDraftByTask["task-1"]).toMatchObject({ text: "Add CSV export.", runtimeOverrides: { autoRouting: true } });
  });
});

describe("unsent agent run prompt recovery", () => {
  const draft = { text: "Add CSV export.", attachedFilePaths: [], attachments: [], runtimeOverrides: { autoRouting: true } };
  const base = {
    activeWorkspaceId: "ws-1",
    tasks: [{ id: "task-1", archivedAt: null }],
    taskWorkspaceIdById: { "task-1": "ws-1" },
    workspaceRuntimeCacheById: {},
    failedSendsByTask: {},
  } as unknown as AppState;
  const recover = (state: AppState, submittedDraft: typeof draft | undefined) =>
    recoverUnsentAgentRunPrompt(state, {
      workspaceId: "ws-1",
      taskId: "task-1",
      prompt: "Add CSV export.",
      submittedDraft,
      reason: "The stage's turn could not start: offline",
    });

  test("text typed meanwhile is never overwritten: the prompt parks as a failed send", () => {
    const state = { ...base, promptDraftByTask: { "task-1": { ...draft, text: "Something else" } } } as AppState;
    const patch = recover(state, draft);
    expect(patch.promptDraftByTask).toBeUndefined();
    expect(patch.failedSendsByTask?.["task-1"]).toEqual([
      expect.objectContaining({ text: "Add CSV export.", reason: "The stage's turn could not start: offline" }),
    ]);
  });

  test("a retried failed send, or another workspace in view, parks it too", () => {
    const empty = { ...base, promptDraftByTask: {} } as unknown as AppState;
    expect(recover(empty, undefined).failedSendsByTask?.["task-1"]).toHaveLength(1);
    expect(recover({ ...empty, activeWorkspaceId: "ws-2" } as AppState, draft).failedSendsByTask?.["task-1"]).toHaveLength(1);
  });

  test("a task archived or closed meanwhile gets no draft and no failed send", () => {
    const empty = { ...base, promptDraftByTask: {} } as unknown as AppState;
    const archived = { ...empty, tasks: [{ id: "task-1", archivedAt: "2026-10-01T09:00:00.000Z" }] } as AppState;
    expect(recover(archived, draft)).toEqual({});
    expect(recover({ ...empty, tasks: [] } as unknown as AppState, draft)).toEqual({});
    // Another workspace in view and the task's workspace closed: no owner left.
    const closed = { ...empty, activeWorkspaceId: "ws-2", taskWorkspaceIdById: {} } as unknown as AppState;
    expect(recover(closed, draft)).toEqual({});
  });

  test("a running turn keeps the plain path", async () => {
    useAgentAssignmentsStore.setState({ byTaskId: { "task-1": AGENT } });
    const bridge = fakeBridge();
    expect(await startAgentRunForSend(sendArgs({ turnActive: true }).args)).toBeNull();
    expect(bridge.started).toEqual([]);
  });
});

describe("agent run stop", () => {
  test("cancels an active agent run before the turn is stopped", async () => {
    const bridge = fakeBridge({ active: { id: "run-1", agentOrigin: true } });
    let stops = 0;
    let resolveStop!: () => void;
    const stopped = new Promise<void>((resolve) => (resolveStop = resolve));
    const waits = cancelAgentRunBeforeStop({
      workspaceId: "ws-1",
      taskId: "task-1",
      stopTurn: () => {
        stops += 1;
        // The stop runs again, as `abortTaskTurn` does; it must not cancel twice.
        expect(cancelAgentRunBeforeStop({ workspaceId: "ws-1", taskId: "task-1", stopTurn: () => {} })).toBe(false);
        resolveStop();
      },
    });
    expect(waits).toBe(true);
    await stopped;
    expect(bridge.cancelled).toEqual(["run-1"]);
    expect(stops).toBe(1);
  });

  test("leaves a legacy run and a task without a run to the plain stop", () => {
    fakeBridge({ active: { id: "m-1", agentOrigin: false } });
    expect(cancelAgentRunBeforeStop({ workspaceId: "ws-1", taskId: "task-1", stopTurn: () => {} })).toBe(false);
    fakeBridge();
    expect(cancelAgentRunBeforeStop({ workspaceId: "ws-1", taskId: "task-1", stopTurn: () => {} })).toBe(false);
  });
});

test("an admitted queued Run consumes only its queue identity and freezes bounded routing intent", async () => {
  useAgentAssignmentsStore.setState({ byTaskId: { "task-1": AGENT } });
  const bridge = fakeBridge();
  const { args, state } = sendArgs({ queued: true, queuedTurnId: "queued-a", promptDraft: { attachedFilePaths: [], attachments: [],
    runtimeOverrides: { agentRunAdaptive: true, model: "claude-opus-5-5", claudeEffort: "high", boundSecretIds: ["secret-id"] } } });
  args.set(current => ({ workspaceSnapshotVersion: 2, promptDraftByTask: { ...current.promptDraftByTask,
    "task-1": { ...current.promptDraftByTask["task-1"]!, text: "A newer draft", queuedTurns: [
      { id: "queued-a", content: "Add CSV export.", queuedAt: "now", attachedFilePaths: [], attachments: [] },
      { id: "queued-b", content: "Other assignment", queuedAt: "now", attachedFilePaths: [], attachments: [] },
    ] } } }));
  expect((await startAgentRunForSend(args))?.status).toBe("run-started");
  expect(bridge.started[0]?.routingIntent).toMatchObject({ model: "claude-opus-5-5", claudeEffort: "high", modelProviderId: "claude-code" });
  expect(bridge.started[0]?.routingIntent).not.toHaveProperty("boundSecretIds");
  expect(state().promptDraftByTask["task-1"]?.queuedTurns?.map(t => t.id)).toEqual(["queued-b"]);
  expect(state().promptDraftByTask["task-1"]?.text).toBe("A newer draft");
  expect(state().workspaceSnapshotVersion).toBe(3);
});
