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
      extraContextCount: 0,
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

  test("an Agent task with an active run sends a plain user turn", async () => {
    useAgentAssignmentsStore.setState({ byTaskId: { "task-1": AGENT } });
    const bridge = fakeBridge({ active: { id: "run-1", agentOrigin: true } });
    expect(await startAgentRunForSend(sendArgs().args)).toBeNull();
    expect(bridge.started).toEqual([]);
  });

  test("attachments and extra context use the single-turn path, including attachments staged in the batch", async () => {
    useAgentAssignmentsStore.setState({ byTaskId: { "task-1": AGENT } });
    const bridge = fakeBridge();
    const taskAttachment = { kind: "task-context" as const, id: "context-1", taskId: "source", workspaceId: "ws-1", title: "Research", scope: "latest-reply" as const };
    const drafts = [

      { attachedFilePaths: [], attachments: [taskAttachment] },
      { attachedFilePaths: [], attachments: [], promptBatch: [{ id: "batch-1", createdAt: "now", content: "Use research", attachments: [taskAttachment] }] },
    ];
    for (const promptDraft of drafts) {
      expect(await startAgentRunForSend(sendArgs({ promptDraft }).args)).toBeNull();
    }
    expect(await startAgentRunForSend(sendArgs({ extraContextCount: 1 }).args)).toBeNull();
    expect(bridge.started).toEqual([]);
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

  test("attachments and a running turn keep the plain paths", async () => {
    useAgentAssignmentsStore.setState({ byTaskId: { "task-1": AGENT } });
    const bridge = fakeBridge();
    expect(await startAgentRunForSend(sendArgs({ extraContextCount: 1 }).args)).toBeNull();
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
