import { afterEach, describe, expect, test } from "bun:test";
import type { MissionCommandResponse, MissionDetail, MissionStartArgs } from "../src/lib/missions/api";
import { useAgentAssignmentsStore, type TaskAgent } from "../src/store/agent-assignments-store";
import {
  cancelAgentRunBeforeStop,
  registerAgentRunBridge,
  startAgentRunForSend,
  type AgentRunBridge,
} from "../src/store/agent-run-send";
import type { AppState } from "../src/store/app-store.types";

const AGENT = { agentConfigId: "implementer", agentName: "Implementer" } as TaskAgent;

function fakeBridge(options: { active?: ReturnType<AgentRunBridge["activeMission"]>; refuse?: string } = {}) {
  const started: MissionStartArgs[] = [];
  const cancelled: string[] = [];
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
  };
  registerAgentRunBridge(bridge);
  return { started, cancelled };
}

function sendArgs(overrides: Partial<Parameters<typeof startAgentRunForSend>[0]> = {}) {
  let state = {
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
    const { args, state } = sendArgs();
    expect(await startAgentRunForSend(args)).toBeNull();
    expect(bridge.started).toHaveLength(1);
    // The draft is cleared before the start is requested, as for any send; the
    // send path then runs the captured prompt as a plain turn.
    expect(state().promptDraftByTask["task-1"]?.text).toBe("");
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
