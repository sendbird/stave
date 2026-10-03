import { afterEach, describe, expect, test } from "bun:test";
import type { MissionCommandResponse, MissionDetail, MissionStartArgs } from "../src/lib/missions/api";
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

function fakeBridge(options: { active?: ReturnType<AgentRunBridge["activeMission"]>; refuse?: string } = {}) {
  const started: MissionStartArgs[] = [];
  const cancelled: string[] = [];
  const watched: Array<{ missionId: string; end: (end: AgentRunFirstPromptEnd) => void }> = [];
  const bridge: AgentRunBridge = {
    activeMission: () => options.active ?? null,
    start: async (input) => {
      started.push(input);
      return options.refuse
        ? { ok: false, mission: null, code: "refused", message: options.refuse }
        : ({ ok: true, mission: { mission: { id: "run-1" } } as MissionDetail } satisfies MissionCommandResponse);
    },
    cancel: async (missionId) => {
      cancelled.push(missionId);
      return { ok: true, mission: null };
    },
    watchFirstPrompt: ({ missionId }, end) => {
      watched.push({ missionId, end });
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

  test("an Agent task without a run starts one with the implicit playbook and clears the draft", async () => {
    useAgentAssignmentsStore.setState({ byTaskId: { "task-1": AGENT } });
    const bridge = fakeBridge();
    const { args, state } = sendArgs();
    expect(await startAgentRunForSend(args)).toEqual({
      status: "run-started",
      taskId: "task-1",
      workspaceId: "ws-1",
      missionId: "run-1",
    });
    expect(bridge.started[0]).toMatchObject({
      leadTaskId: "task-1",
      assignment: "Add CSV export.",
      origin: "agent",
      playbook: { name: "Implementer", stages: [{ id: "work", title: "Work" }] },
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
    const bridge = fakeBridge({ active: { id: "run-1", agentRun: true } });
    expect(await startAgentRunForSend(sendArgs().args)).toBeNull();
    expect(bridge.started).toEqual([]);
  });

  test("a start the host refuses falls back to a plain turn", async () => {
    useAgentAssignmentsStore.setState({ byTaskId: { "task-1": AGENT } });
    const bridge = fakeBridge({ refuse: "Stave's local tools are off." });
    const { args, state } = sendArgs({ turnId: "turn-plain" });
    expect(await startAgentRunForSend(args)).toBeNull();
    expect(bridge.started).toHaveLength(1);
    // The draft is cleared before the start is requested, as for any send; the
    // send path then runs the captured prompt as a plain turn.
    expect(state().promptDraftByTask["task-1"]?.text).toBe("");
    // The prompt's row stays, handed to the plain turn's send, which ends it.
    expect(pendingRow()).toMatchObject({ id: "turn-plain", taskId: "task-1" });
    expect(pendingRow()?.agentRun).toBeUndefined();
    expect(bridge.watched).toEqual([]);
  });

  test("the prompt shows as the run's row from the send until the run writes it", async () => {
    useAgentAssignmentsStore.setState({ byTaskId: { "task-1": AGENT } });
    const bridge = fakeBridge();
    const { args, state } = sendArgs();
    const sent = startAgentRunForSend(args);
    // Drawn before the start is even answered, so a new task leaves its start screen.
    expect(pendingRow()?.agentRun).toEqual({ missionId: null });
    expect(pendingRow()?.userMessage).toMatchObject({ role: "user", content: "Add CSV export." });
    // The run bar owns Stop; the composer keeps Send.
    expect(holdsComposerTurn(pendingRow())).toBe(false);
    await sent;
    expect(pendingRow()?.agentRun).toEqual({ missionId: "run-1" });
    expect(bridge.watched.map((watch) => watch.missionId)).toEqual(["run-1"]);
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
    const bridge = fakeBridge({ active: { id: "run-1", agentRun: true } });
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

  test("leaves a playbook mission and a task without a run to the plain stop", () => {
    fakeBridge({ active: { id: "m-1", agentRun: false } });
    expect(cancelAgentRunBeforeStop({ workspaceId: "ws-1", taskId: "task-1", stopTurn: () => {} })).toBe(false);
    fakeBridge();
    expect(cancelAgentRunBeforeStop({ workspaceId: "ws-1", taskId: "task-1", stopTurn: () => {} })).toBe(false);
  });
});
