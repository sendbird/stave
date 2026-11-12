import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { AgentAssignmentStore } from "../electron/persistence/agent-assignment-store";
import { AgentRunStore } from "../electron/persistence/agent-run-store";
import { TarsStore } from "../electron/persistence/tars-store";
import { createAssignRuntime } from "../electron/host-service/supervision/assign-runtime";
import { assertTarsAssignment, assertTarsRun, controlTarsRun, TarsOwnershipLostError } from "../electron/host-service/tars-ownership";
import { tarsWorkflow } from "../electron/host-service/tars-execution";
import { compileStagePrompt } from "../src/lib/workflows/stage-prompt";
import { createAgentRun } from "../src/lib/agent-runs/domain";
import { getBuiltinAgent } from "../src/lib/agents/starters";
import type { AgentRunDetail } from "../src/lib/agent-runs/api";

const NOW = "2026-11-05T00:00:00.000Z";
function fixture() {
  const database = new Database(":memory:");
  const tars = new TarsStore(database);
  const initial = tars.create({ requestId: "one", title: "Fix search", instruction: "Fix and verify search.",
    acceptanceCriteria: ["Search works"], repositoryPath: "/tmp/repository", workspaceId: "source", providerId: "codex" }, NOW);
  const row = tars.patch(initial.id, initial.revision, { taskId: `tars-${initial.id}`,
    executionWorkspaceId: "execution", agentRunId: "owned-run", state: "running" }, NOW);
  const assignments = new AgentAssignmentStore(database);
  const assign = createAssignRuntime({ store: assignments });
  const record = () => assign.recordTaskAgent({ requestId: `tars-${row.id}`, taskId: row.taskId!,
    workspaceId: row.executionWorkspaceId!, repositoryPath: row.repositoryPath,
    agent: getBuiltinAgent("supervisor")!, providerId: "codex", model: null, assignment: row.instruction });
  const receipt = record();
  const runs = new AgentRunStore(database);
  const change = createAgentRun({ id: row.agentRunId!, input: { workspaceId: row.executionWorkspaceId!,
    leadTaskId: row.taskId!, origin: "agent", workflow: tarsWorkflow(row, NOW), assignment: row.instruction,
    consent: { checkIns: "when-stuck", permissionMode: "auto", authorizedEffectStageIds: [] } },
    repositoryPath: row.repositoryPath, fingerprint: { providerId: "codex", model: "test-model" }, now: new Date(NOW) });
  runs.create(change, new Date(NOW));
  const hasAssignment = () => assertTarsAssignment(row, assignments.getByTaskId(row.taskId!), assignments.getByRequestId(receipt.requestId));
  return { database, row, assignments, assign, receipt, record, runs, change, hasAssignment };
}

describe("Tars persisted ownership", () => {
  test("released assignment stays released across a retry and store reconstruction", () => {
    const f = fixture();
    f.assign.releaseTaskAgent(f.row.taskId!);
    expect(f.assign.assignmentForTask(f.row.taskId!)).toBeNull();
    expect(f.record().endedAt).toBeTruthy();
    const restored = new AgentAssignmentStore(f.database);
    expect(() => assertTarsAssignment(f.row, restored.getByTaskId(f.row.taskId!), restored.getByRequestId(f.receipt.requestId)))
      .toThrow("ownership changed");
    f.database.close();
  });
  test("an unreadable assignment receipt is not confirmed transfer", () => {
    const f = fixture();
    let failure: unknown;
    try { assertTarsAssignment(f.row, f.receipt, null); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(TarsOwnershipLostError);
    f.database.close();
  });
  test("another active assignment cannot be mistaken for the recorded assignment", () => {
    const f = fixture();
    f.assign.recordTaskAgent({ requestId: "human-reassignment", taskId: f.row.taskId!, workspaceId: f.row.executionWorkspaceId!,
      repositoryPath: f.row.repositoryPath, agent: getBuiltinAgent("reviewer")!, providerId: "codex", model: null, assignment: "Review" });
    expect(f.hasAssignment).toThrow("ownership changed");
    f.database.close();
  });
  test("restart can reconcile its own terminal run but refuses a same-task user run", () => {
    const f = fixture();
    f.runs.apply({ agentRun: { ...f.change.agentRun, state: "completed" }, upserts: [], events: [] }, new Date(NOW));
    const restored = new AgentRunStore(f.database);
    expect(restored.getActiveAgentRunForTask(f.row.taskId!)).toBeNull();
    expect(restored.getLatestAgentRunForTask(f.row.taskId!)?.state).toBe("completed");
    expect(() => assertTarsRun(f.row, restored.getLatestAgentRunForTask(f.row.taskId!)!)).not.toThrow();
    const owned = f.change.agentRun;
    for (const patch of [{ origin: "workflow" as const }, { workflow: { ...owned.workflow, id: "other" } },
      { assignment: "Different goal" }, { workspaceId: "other" }, { id: "another-run" }]) {
      expect(() => assertTarsRun(f.row, { ...owned, ...patch })).toThrow("identity changed");
    }
    const userRun = createAgentRun({ id: "user-run", input: {
      workspaceId: f.row.executionWorkspaceId!, leadTaskId: f.row.taskId!, origin: "agent",
      workflow: { ...owned.workflow, id: "user-workflow" }, assignment: f.row.instruction,
      consent: owned.consent,
    }, repositoryPath: f.row.repositoryPath, fingerprint: owned.fingerprint, now: new Date(Date.parse(NOW) + 1000) });
    f.runs.create(userRun, new Date(Date.parse(NOW) + 1000));
    const latest = new AgentRunStore(f.database).getLatestAgentRunForTask(f.row.taskId!)!;
    expect(latest.id).toBe("user-run");
    // Lost acknowledgements have no saved run id, so the durable workflow binding must still reject it.
    expect(() => assertTarsRun({ ...f.row, agentRunId: null }, latest)).toThrow("identity changed");
    f.database.close();
  });
  test("review prompt reviews the committed work in the same workspace at a pinned commit", () => {
    const f = fixture();
    const prompt = compileStagePrompt({ workflow: tarsWorkflow(f.row, NOW), stageIndex: 1, assignment: f.row.instruction,
      priorStages: [], acceptanceCriteria: [], attempt: 1 });
    // The work is committed on the execution branch so the review has a commit range; nothing is published.
    expect(prompt).toContain("commit only that work first");
    expect(prompt).toContain("Do not create an empty commit");
    expect(prompt).toContain("same-workspace");
    expect(prompt).toContain("expectedHead");
    expect(prompt).toContain("Do not push, open or update pull requests");
    f.database.close();
  });
});

describe("Tars control uses exact turn ownership", () => {
  for (const state of ["taken-over", "completed", "paused"] as const) {
    test(`pause/cancel never interrupts a manual turn when execution is ${state}`, async () => {
      const f = fixture();
      const run = { ...f.change.agentRun, state: state === "completed" ? "completed" as const : "paused" as const,
        pauseReason: state === "taken-over" ? "taken-over" as const : "paused-by-user" as const };
      const calls: string[] = [];
      const detail = (): AgentRunDetail => ({ agentRun: run, stages: f.change.upserts, events: [], report: null });
      const ports = { hasAssignment: f.hasAssignment, readTask: async () => ({ activeTurnId: "manual-turn" }),
        readRun: () => run, linkedTurns: () => ["old-owned-turn"], userTurnIds: () => [], abortTurn: (id: string) => { calls.push(`abort:${id}`); },
        agentRuns: { get: async () => detail(),
          pause: async () => { calls.push("pause"); return detail(); },
          resume: async () => { calls.push("resume"); return detail(); },
          cancel: async () => { calls.push("cancel"); return detail(); } } };
      await controlTarsRun(f.row, "pause", ports);
      await controlTarsRun(f.row, "cancel", ports);
      expect(calls.some((call) => call.startsWith("abort"))).toBe(false);
      if (state === "taken-over") {
        expect(calls).toEqual([]);
        await expect(controlTarsRun(f.row, "resume", ports)).rejects.toThrow("taken over");
        expect(run.pauseReason).toBe("taken-over");
      }
      f.database.close();
    });
  }
  test("never interrupts a manual turn replacing the automatic turn", async () => {
    const f = fixture(); const aborted: string[] = [];
    let activeTurnId = "owned-turn";
    const detail: AgentRunDetail = { agentRun: f.change.agentRun, stages: f.change.upserts, events: [], report: null };
    await controlTarsRun(f.row, "pause", { hasAssignment: f.hasAssignment,
      readTask: async () => ({ activeTurnId }), readRun: () => detail.agentRun,
      linkedTurns: () => ["owned-turn"], userTurnIds: () => [], abortTurn: (id) => { aborted.push(id); },
      agentRuns: { get: async () => detail, pause: async () => { activeTurnId = "manual-turn"; return detail; },
        resume: async () => detail, cancel: async () => detail } });
    expect(activeTurnId).toBe("manual-turn"); expect(aborted).toEqual([]);
    f.database.close();
  });
});

describe("Tars interrupts automatic work only", () => {
  test("a linked user reply is never aborted", async () => {
    const f = fixture(); const aborted: string[] = [];
    const detail: AgentRunDetail = { agentRun: f.change.agentRun, stages: f.change.upserts, events: [], report: null };
    const ports = { hasAssignment: f.hasAssignment,
      readTask: async () => ({ activeTurnId: "user-reply" }), readRun: () => detail.agentRun,
      linkedTurns: () => ["user-reply"], userTurnIds: () => ["user-reply"], abortTurn: (id: string) => { aborted.push(id); },
      agentRuns: { get: async () => detail, pause: async () => detail, resume: async () => detail, cancel: async () => detail } };
    await controlTarsRun(f.row, "cancel", ports);
    expect(aborted).toEqual([]);
    f.database.close();
  });
  test("an automatic turn started while the control queued is interrupted", async () => {
    const f = fixture(); const aborted: string[] = [];
    let activeTurnId: string | null = null;
    const detail: AgentRunDetail = { agentRun: f.change.agentRun, stages: f.change.upserts, events: [], report: null };
    const ports = { hasAssignment: f.hasAssignment,
      readTask: async () => ({ activeTurnId }), readRun: () => detail.agentRun,
      linkedTurns: () => ["late-automatic-turn"], userTurnIds: () => [], abortTurn: (id: string) => { aborted.push(id); },
      agentRuns: { get: async () => detail, pause: async () => detail, resume: async () => detail,
        cancel: async () => { activeTurnId = "late-automatic-turn"; return detail; } } };
    await controlTarsRun(f.row, "cancel", ports);
    expect(aborted).toEqual(["late-automatic-turn"]);
    f.database.close();
  });
});

describe("Tars takeover and hand-back use the run's own takeover semantics", () => {
  function runPorts(f: ReturnType<typeof fixture>, initial: AgentRunDetail["agentRun"], activeTurnId: string | null = null) {
    let run = initial; const calls: string[] = [];
    const detail = (): AgentRunDetail => ({ agentRun: run, stages: f.change.upserts, events: [], report: null });
    const apply = (name: string, next: Partial<AgentRunDetail["agentRun"]>) => async (_args: unknown, guard?: (value: typeof run) => void) => {
      guard?.(run); calls.push(name); run = { ...run, ...next }; return detail();
    };
    return { calls, current: () => run, ports: { hasAssignment: f.hasAssignment, readTask: async () => ({ activeTurnId }), readRun: () => run,
      linkedTurns: () => ["automatic-turn"], userTurnIds: () => [], abortTurn: (id: string) => { calls.push(`abort:${id}`); },
      agentRuns: { get: async () => detail(), pause: apply("pause", { state: "paused", pauseReason: "paused-by-user" }),
        resume: apply("resume", { state: "running", pauseReason: null }), cancel: apply("cancel", { state: "cancelled" }),
        takeOver: apply("takeOver", { state: "paused", pauseReason: "taken-over" }) } } };
  }
  test("takeover pauses the owned run as taken over and interrupts only its automatic turn", async () => {
    const f = fixture(); const run = runPorts(f, f.change.agentRun, "automatic-turn");
    await controlTarsRun(f.row, "takeover", run.ports);
    expect(run.calls).toEqual(["takeOver", "abort:automatic-turn"]);
    expect(run.current().pauseReason).toBe("taken-over");
    // Resume never reclaims it; an already human-owned run is left untouched by another stop.
    await expect(controlTarsRun(f.row, "resume", run.ports)).rejects.toBeInstanceOf(TarsOwnershipLostError);
    await controlTarsRun(f.row, "takeover", run.ports);
    expect(run.calls).toEqual(["takeOver", "abort:automatic-turn"]);
    f.database.close();
  });
  test("hand-back resumes a taken-over run only while its run and assignment are still Tars's", async () => {
    const f = fixture();
    const run = runPorts(f, { ...f.change.agentRun, state: "paused", pauseReason: "taken-over" });
    await controlTarsRun(f.row, "handBack", run.ports);
    expect(run.calls).toEqual(["resume"]);
    expect(run.current().state).toBe("running");
    const reassigned = fixture();
    reassigned.assign.recordTaskAgent({ requestId: "human-reassignment", taskId: reassigned.row.taskId!, workspaceId: reassigned.row.executionWorkspaceId!,
      repositoryPath: reassigned.row.repositoryPath, agent: getBuiltinAgent("reviewer")!, providerId: "codex", model: null, assignment: "Mine now" });
    const lost = runPorts(reassigned, { ...reassigned.change.agentRun, state: "paused", pauseReason: "taken-over" });
    await expect(controlTarsRun(reassigned.row, "handBack", lost.ports)).rejects.toThrow("ownership changed");
    expect(lost.calls).toEqual([]);
    f.database.close(); reassigned.database.close();
  });
});

test("automatic extension rechecks its budget inside the run command queue", async () => {
  const f = fixture();
  try {
    const run = { ...f.change.agentRun, state: "paused" as const, pauseReason: "limit-reached" as const, maxTurns: 50 };
    const detail: AgentRunDetail = { agentRun: run, stages: f.change.upserts, events: [], report: null };
    let extended = false;
    const ports = { autoExtendMaxTurns: 60, hasAssignment: f.hasAssignment,
      readTask: async () => ({ activeTurnId: null }), readRun: () => run, linkedTurns: () => [], userTurnIds: () => [], abortTurn: () => {},
      agentRuns: { get: async () => detail, extend: async (_input: unknown, guard: (current: typeof run) => void) => {
        // Another command used the last automatic allowance while this one waited.
        guard({ ...run, maxTurns: 60 });
        extended = true;
        return detail;
      } } };
    await expect(controlTarsRun(f.row, "extend", ports as never)).rejects.toThrow("needs your confirmation");
    expect(extended).toBe(false);
    // An explicit confirmation has no automatic allowance fence; the normal run ceiling still owns its budget.
    await controlTarsRun(f.row, "extend", { ...ports, autoExtendMaxTurns: undefined } as never);
    expect(extended).toBe(true);
  } finally { f.database.close(); }
});
