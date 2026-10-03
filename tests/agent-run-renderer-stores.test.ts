import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { AgentRunChangedEvent, AgentRunCommandResponse, AgentRunDetail } from "../src/lib/agent-runs/api";
import { isOlderAgentRunDetail } from "../src/lib/agent-runs/agent-run-view";
import {
  dropEndedAgentRuns,
  ENDED_AGENT_RUN_RETENTION_MS,
  useFleetAgentRunsStore,
} from "../src/store/fleet-agent-runs-store";
import {
  isNewlyStartedAgentRun,
  agentRunTaskKey,
  selectAgentRunFailure,
  selectAgentRunTurnDivider,
  useAgentRunsStore,
} from "../src/store/agent-runs-store";
import { AGENT_RUN_NOW, agentRunDetail, agentRunEvent, agentRunFixture } from "./fixtures/agent-run-fixtures";

const originalWindow = globalThis.window;
const at = (minutes: number) => new Date(AGENT_RUN_NOW.getTime() + minutes * 60_000).toISOString();

/** An agent run detail as read at `minutes` past the start, with the given events. */
function readAt(
  minutes: number,
  events: AgentRunDetail["events"] = [],
  overrides: { id?: string; state?: AgentRunDetail["agentRun"]["state"]; createdAt?: string } = {},
): AgentRunDetail {
  const aggregate = agentRunFixture({ id: overrides.id ?? "agent-run-1" });
  return agentRunDetail(
    {
      ...aggregate,
      agentRun: {
        ...aggregate.agentRun,
        state: overrides.state ?? aggregate.agentRun.state,
        createdAt: overrides.createdAt ?? aggregate.agentRun.createdAt,
        updatedAt: at(minutes),
      },
    },
    events,
  );
}

/** Installs `window.api.agentRuns` with the given answers. */
function installAgentRunsApi(api: Record<string, (...args: never[]) => Promise<unknown>>) {
  Object.assign(globalThis, { window: { api: { agentRuns: { subscribeChanged: () => () => {}, ...api } } } });
}

function resetStores() {
  useAgentRunsStore.setState({
    workspaceId: "ws-1",
    loadedWorkspaceId: "ws-1",
    agentRunIdByTask: {},
    agentRunIdsByTask: {},
    details: {},
    dividersByAgentRun: {},
    failureByAgentRun: {},
    pendingByAgentRun: {},
  });
  useFleetAgentRunsStore.setState({ details: {}, loaded: false });
}

beforeEach(resetStores);
afterEach(() => {
  Object.assign(globalThis, { window: originalWindow });
  resetStores();
});

describe("run details in the renderer", () => {
  test("an older read of a run is recognized, with equal times settled by the last event", () => {
    const newer = readAt(5, [agentRunEvent("agent-run-started", {}), agentRunEvent("stage-completed", {})]);
    const older = readAt(3, newer.events.slice(0, 1));
    expect(isOlderAgentRunDetail(older, newer)).toBe(true);
    expect(isOlderAgentRunDetail(newer, older)).toBe(false);
    expect(isOlderAgentRunDetail(older, undefined)).toBe(false);
    // Same time: fewer events is older; the same read replaces itself (it may carry the report).
    expect(isOlderAgentRunDetail(readAt(5, newer.events.slice(0, 1)), newer)).toBe(true);
    expect(isOlderAgentRunDetail(readAt(5, newer.events), newer)).toBe(false);
    expect(isOlderAgentRunDetail(readAt(1, [], { id: "agent-run-2" }), newer)).toBe(false);
  });

  test("a response that arrives after a newer one does not replace it, in either store", async () => {
    const newer = readAt(5);
    const older = readAt(3);
    installAgentRunsApi({
      signOff: async () => ({ ok: true, agentRun: newer }) satisfies AgentRunCommandResponse,
      get: async () => ({ ok: true, agentRun: older }) satisfies AgentRunCommandResponse,
    });
    await useAgentRunsStore.getState().runCommand("signOff", { agentRunId: "agent-run-1", stageId: "understand", attempt: 1 });
    await useAgentRunsStore.getState().refreshAgentRun("agent-run-1");
    expect(useAgentRunsStore.getState().details["agent-run-1"]).toBe(newer);

    useFleetAgentRunsStore.setState({ details: { "agent-run-1": newer } });
    await useFleetAgentRunsStore.getState().refresh("agent-run-1");
    expect(useFleetAgentRunsStore.getState().details["agent-run-1"]).toBe(newer);
  });

  test("a failed command belongs to the stage it was about, not to the next stage's card", async () => {
    installAgentRunsApi({
      signOff: async () => ({ ok: false, agentRun: null, code: "failed", message: "gh is signed out." }),
      pause: async () => ({ ok: false, agentRun: null, code: "failed", message: "Could not pause." }),
      get: async () => ({ ok: true, agentRun: readAt(1) }),
    });
    const store = useAgentRunsStore.getState();
    await store.runCommand("signOff", { agentRunId: "agent-run-1", stageId: "understand", attempt: 1 });
    let state = useAgentRunsStore.getState();
    expect(selectAgentRunFailure(state, "agent-run-1", "understand:1")).toBe("gh is signed out.");
    expect(selectAgentRunFailure(state, "agent-run-1", "build:1")).toBeNull();
    expect(selectAgentRunFailure(state, "agent-run-1", "understand:2")).toBeNull();
    expect(selectAgentRunFailure(state, "agent-run-1", null)).toBe("gh is signed out.");

    // An agent-run-wide command is scoped to the stage the agent run was on.
    await store.refreshAgentRun("agent-run-1");
    await store.runCommand("pause", { agentRunId: "agent-run-1" });
    state = useAgentRunsStore.getState();
    expect(state.failureByAgentRun["agent-run-1"]?.stageKey).toBe("understand:1");
    expect(selectAgentRunFailure(state, "agent-run-1", "build:1")).toBeNull();
  });

  test("an earlier run's transcript dividers stay once a second run starts on the task", async () => {
    const first = readAt(
      10,
      [
        agentRunEvent("agent-run-started", {}),
        agentRunEvent("turn-started", { stageId: "understand", attempt: 1, reason: "stage-start" }, { idempotencyKey: "m:understand:1:turn:1" }),
        agentRunEvent("turn-linked", { stageId: "understand", attempt: 1, turnId: "turn-1" }, { idempotencyKey: "m:understand:1:turn:1:linked" }),
      ],
      { state: "cancelled" },
    );
    const second = readAt(
      20,
      [
        agentRunEvent("agent-run-started", {}),
        agentRunEvent("turn-started", { stageId: "understand", attempt: 1, reason: "stage-start" }, { idempotencyKey: "n:understand:1:turn:1" }),
        agentRunEvent("turn-linked", { stageId: "understand", attempt: 1, turnId: "turn-9" }, { idempotencyKey: "n:understand:1:turn:1:linked" }),
      ],
      { id: "agent-run-2", createdAt: at(15) },
    );
    const byId: Record<string, AgentRunDetail> = { "agent-run-1": first, "agent-run-2": second };
    installAgentRunsApi({ get: async ({ agentRunId }: { agentRunId: string }) => ({ ok: true, agentRun: byId[agentRunId] }) });
    await useAgentRunsStore.getState().refreshAgentRun("agent-run-1");
    await useAgentRunsStore.getState().refreshAgentRun("agent-run-2");
    const state = useAgentRunsStore.getState();
    expect(state.agentRunIdByTask[agentRunTaskKey("ws-1", "task-1")]).toBe("agent-run-2");
    expect(selectAgentRunTurnDivider(state, "ws-1", "task-1", "turn-1")).toBe("Stage 1 · Understand — run started");
    expect(selectAgentRunTurnDivider(state, "ws-1", "task-1", "turn-9")).toBe("Stage 1 · Understand — run started");
    expect(selectAgentRunTurnDivider(state, "ws-1", "task-1", "turn-unknown")).toBeNull();
  });

  test("a change event while the workspace is still loading does not count as a run that just started", () => {
    const event: AgentRunChangedEvent = {
      agentRunId: "agent-run-1",
      workspaceId: "ws-1",
      leadTaskId: "task-1",
      state: "running",
      currentStageIndex: 0,
      updatedAt: at(1),
    };
    const loaded = { workspaceId: "ws-1", loadedWorkspaceId: "ws-1", agentRunIdByTask: {} };
    expect(isNewlyStartedAgentRun(loaded, event)).toBe(true);
    expect(isNewlyStartedAgentRun({ ...loaded, loadedWorkspaceId: null }, event)).toBe(false);
    expect(isNewlyStartedAgentRun({ ...loaded, workspaceId: "ws-2", loadedWorkspaceId: "ws-2" }, event)).toBe(false);
    expect(
      isNewlyStartedAgentRun({ ...loaded, agentRunIdByTask: { [agentRunTaskKey("ws-1", "task-1")]: "agent-run-1" } }, event),
    ).toBe(false);
    expect(isNewlyStartedAgentRun(loaded, { ...event, state: "completed" })).toBe(false);
  });

  test("Fleet keeps an ended run for half an hour after it ends, and active ones always", () => {
    const ended = readAt(0, [], { id: "ended", state: "stopped" });
    const running = readAt(0, [], { id: "running" });
    const details = { ended, running };
    const end = AGENT_RUN_NOW.getTime();
    expect(dropEndedAgentRuns(details, end + ENDED_AGENT_RUN_RETENTION_MS)).toBe(details);
    expect(Object.keys(dropEndedAgentRuns(details, end + ENDED_AGENT_RUN_RETENTION_MS + 1))).toEqual(["running"]);

    useFleetAgentRunsStore.setState({ details });
    useFleetAgentRunsStore.getState().pruneEnded(end + 2 * ENDED_AGENT_RUN_RETENTION_MS);
    expect(Object.keys(useFleetAgentRunsStore.getState().details)).toEqual(["running"]);
  });
});
