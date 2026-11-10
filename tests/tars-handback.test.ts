import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { createTarsRuntime } from "../electron/host-service/tars-runtime";
import { actTars } from "../electron/host-service/tars-control";
import { controlTarsRun } from "../electron/host-service/tars-ownership";
import { tarsObservation, tarsWorkflow } from "../electron/host-service/tars-execution";
import { cancelAgentRun, pauseAgentRun, restartStageAndResume, resumeAgentRun } from "../src/lib/agent-runs/commands";
import { createAgentRun, createStageRecord, type AgentRunAggregate, type AgentRunChange } from "../src/lib/agent-runs/domain";
import type { AgentRunDetail } from "../src/lib/agent-runs/api";
import type { TarsControlOperation } from "../src/lib/tars/conversation";

const databases: Database[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

/**
 * The real Tars runtime, run control and completion rule over an in-memory run
 * driven by the actual agent-run domain commands; only provider turns are simulated.
 */
function fixture(at: 0 | 1 | 2 = 2) {
  const database = new Database(":memory:"); databases.push(database);
  const store = new TarsStore(database); const conversations = new TarsConversationStore(database);
  let clock = Date.parse("2026-11-05T00:00:00.000Z");
  const now = () => new Date(clock += 1_000);
  const iso = () => now().toISOString();
  const created = store.create({ completionGoal: "implementation", requestId: "owned", title: "Fix search", instruction: "Fix and verify search.",
    acceptanceCriteria: ["Search works"], workspaceId: "source", repositoryPath: "/tmp/repository", providerId: "codex" }, iso());
  const row = store.patch(created.id, created.revision, { state: "running", taskId: `tars-${created.id}`,
    executionWorkspaceId: "execution", agentRunId: "owned-run" }, iso());
  const change = createAgentRun({ id: "owned-run", input: { workspaceId: "execution", leadTaskId: row.taskId!, origin: "agent",
    workflow: tarsWorkflow(row, iso()), assignment: row.instruction,
    consent: { checkIns: "when-stuck", permissionMode: "auto", authorizedEffectStageIds: [] } },
  repositoryPath: row.repositoryPath, fingerprint: { providerId: "codex", model: "test-model" }, now: now() });
  // The run reached the stage `at` (by default its final fix stage), which started before any takeover.
  const stageIds = change.agentRun.workflow.stages.map((stage) => stage.id);
  const verify = { id: stageIds[at]! };
  const done = (stageId: string) => ({ ...createStageRecord({ agentRunId: "owned-run", stageId, attempt: 1 }), status: "completed" as const, startedAt: iso(), endedAt: iso() });
  const run: AgentRunAggregate = { agentRun: { ...change.agentRun, currentStageIndex: at },
    stages: [...stageIds.slice(0, at).map(done), { ...createStageRecord({ agentRunId: "owned-run", stageId: verify.id, attempt: 1 }), status: "running", startedAt: iso() }] };
  let report: AgentRunDetail["report"] = null;
  const apply = (next: AgentRunChange) => {
    run.agentRun = next.agentRun;
    for (const record of next.upserts) {
      const index = run.stages.findIndex((item) => item.stageId === record.stageId && item.attempt === record.attempt);
      if (index >= 0) run.stages[index] = record; else run.stages.push(record);
    }
  };
  const detail = (): AgentRunDetail => ({ agentRun: run.agentRun, stages: [...run.stages], events: [], report });
  const command = (make: (aggregate: AgentRunAggregate) => AgentRunChange) => async (_args: unknown, guard?: (value: AgentRunAggregate["agentRun"]) => void) => {
    guard?.(run.agentRun); apply(make(run)); return detail();
  };
  const agentRuns = { get: async () => detail(),
    pause: command((aggregate) => pauseAgentRun({ aggregate, reason: "paused-by-user", now: now() })),
    takeOver: command((aggregate) => pauseAgentRun({ aggregate, reason: "taken-over", now: now() })),
    restartStageAndResume: command((aggregate) => restartStageAndResume({ aggregate, now: now() })),
    resume: command((aggregate) => resumeAgentRun({ aggregate, now: now() })),
    cancel: command((aggregate) => cancelAgentRun({ aggregate, now: now() })) };
  const runtime = createTarsRuntime({ store, now: iso, validateScope: async () => {}, prepareWorkspace: async () => "execution",
    prepareTask: async () => {}, findRun: async () => "owned-run", startRun: async () => "owned-run",
    observe: async (current) => tarsObservation(detail(), current.acceptanceCriteria, current.reverifyAfter, current),
    controlRun: (current, operation) => controlTarsRun(current, operation, { agentRuns, hasAssignment: () => true,
      readTask: async () => ({ activeTurnId: null }), readRun: () => run.agentRun, linkedTurns: () => [], userTurnIds: () => [], abortTurn: () => {} }) });
  let clicks = 0;
  const act = async (operation: TarsControlOperation) => {
    const current = store.get(row.id)!;
    return (await actTars({ requestId: `click-${clicks++}`, responsibilityId: row.id, expectedRevision: current.revision, operation, source: "click" },
      { conversations, runtime, now: iso })).record;
  };
  /** The agent's next turn continues the current stage exactly as the run policy does, then completes the run. */
  const finishCurrentStage = () => {
    const index = run.stages.length - 1;
    const record = run.stages[index]!;
    const startedAt = record.startedAt ?? iso();
    // The final stage reran the decisive check and Stave saw it pass on the current revision.
    run.stages[index] = { ...record, status: "completed", startedAt, endedAt: iso(),
      report: { outcome: "complete", summary: "Checked.", decisions: [], artifacts: [], reportedAt: iso(), turnId: "verify-turn",
        evidence: [{ label: "Tests pass", kind: "check", command: "bun test" }] } as never,
      facts: { currentTurnId: "verify-turn", workspaceRevision: { status: "known", revision: "r1" }, diff: null, toolCalls: [], action: null,
        commands: [{ command: "bun test", exitCode: 0, toolCallId: "c1", turnId: "verify-turn", outcome: "succeeded",
          provenance: "provider-structured", sourceRevision: { status: "known", revision: "r1" } }] } as never };
    run.agentRun = { ...run.agentRun, state: "completed" };
    report = { outcome: "completed", acceptanceCriteria: [{ text: "Search works", required: true, status: "met" }] } as AgentRunDetail["report"];
  };
  const tick = async () => { runtime.requestTick(); await runtime.drain(); await runtime.drain(); };
  return { store, row, run, act, finishCurrentStage, tick, runtime, verifyStageId: verify.id, iso, apply, now, setReport: (next: AgentRunDetail["report"]) => { report = next; },
    cancelRun: () => apply(cancelAgentRun({ aggregate: run, now: now() })),
    /** The old attempt files its completing report late, then the run completes on it. */
    reportOldAttempt: () => {
      const index = run.stages.findIndex((stage) => stage.stageId === verify.id && stage.attempt === 1);
      run.stages[index] = { ...run.stages[index]!, status: "completed", endedAt: iso(),
        report: { outcome: "complete", summary: "Checked.", reportedAt: iso() } as never };
      run.agentRun = { ...run.agentRun, state: "completed" };
      report = { outcome: "completed", acceptanceCriteria: [{ text: "Search works", required: true, status: "met" }] } as AgentRunDetail["report"];
    } };
}

test("takeover during final verification, hand-back, then a fresh verification completes the responsibility", async () => {
  const f = fixture();
  expect((await f.act("takeover")).status).toBe("applied");
  expect(f.run.agentRun.pauseReason).toBe("taken-over");
  expect((await f.act("handBack")).status).toBe("applied");
  const handedBack = f.store.get(f.row.id)!;
  expect(handedBack).toMatchObject({ state: "running", reverifyAfter: expect.any(String) });
  // The verification that started before the takeover is replaced by a fresh, not yet started attempt.
  const attempts = f.run.stages.filter((stage) => stage.stageId === f.verifyStageId);
  expect(attempts.map((stage) => [stage.attempt, stage.status])).toEqual([[1, "cancelled"], [2, "pending"]]);
  expect(attempts[1]!.startedAt).toBeNull();
  expect(f.run.agentRun.state).toBe("running");
  f.finishCurrentStage();
  await f.tick();
  expect(f.store.get(f.row.id)?.state).toBe("completed");
  f.runtime.stop();
});

test("a run that ended while taken over refuses hand-back with runEnded, and cancel remains the exit", async () => {
  const f = fixture();
  await f.act("takeover");
  f.cancelRun();
  expect(await f.act("handBack")).toMatchObject({ status: "rejected", reason: "runEnded" });
  expect(f.store.get(f.row.id)?.state).toBe("takenOver");
  expect((await f.act("cancel")).status).toBe("applied");
  expect(f.store.get(f.row.id)?.state).toBe("cancelled");
  f.runtime.stop();
});

test("a run the user resumed is held and restarted on hand-back; its old attempt reporting late never completes the work", async () => {
  const f = fixture();
  await f.act("takeover");
  // The user resumed the run from its own controls while Tars still records the takeover.
  f.apply(resumeAgentRun({ aggregate: f.run, now: f.now() }));
  expect(f.run.agentRun.state).toBe("running");
  expect((await f.act("handBack")).status).toBe("applied");
  const attempts = f.run.stages.filter((stage) => stage.stageId === f.verifyStageId);
  expect(attempts.map((stage) => [stage.attempt, stage.status])).toEqual([[1, "cancelled"], [2, "pending"]]);
  expect(f.run.agentRun).toMatchObject({ state: "running", pauseReason: null });
  f.finishCurrentStage(); await f.tick();
  expect(f.store.get(f.row.id)?.state).toBe("completed");
  f.runtime.stop();
});

test("verification that started before the hand-back cannot complete it, even if it reports afterwards", () => {
  const f = fixture();
  const reverifyAfter = f.iso();
  f.reportOldAttempt();
  const detail = { agentRun: f.run.agentRun, stages: f.run.stages, events: [], report: { outcome: "completed",
    acceptanceCriteria: [{ text: "Search works", required: true, status: "met" }] } } as unknown as AgentRunDetail;
  expect(tarsObservation(detail, ["Search works"], reverifyAfter)).toMatchObject({ state: "blocked" });
  f.runtime.stop();
});

test("a hand-back whose resume is not allowed changes nothing in the run", async () => {
  const f = fixture();
  await f.act("takeover");
  // The run is now held by its turn limit, which only its task can clear.
  f.run.agentRun = { ...f.run.agentRun, state: "paused", pauseReason: "limit-reached" };
  const before = structuredClone(f.run);
  expect(await f.act("handBack")).toMatchObject({ status: "rejected", reason: "runHeld" });
  expect(f.run).toEqual(before);
  expect(f.store.get(f.row.id)?.state).toBe("takenOver");
  f.runtime.stop();
});

test("a hand-back during a review that may end the run restarts it; a fresh pass completes the work with the fix stage skipped", async () => {
  const f = fixture(1);
  await f.act("takeover");
  expect((await f.act("handBack")).status).toBe("applied");
  const attempts = f.run.stages.filter((stage) => stage.stageId === f.verifyStageId);
  expect(attempts.map((stage) => [stage.attempt, stage.status])).toEqual([[1, "cancelled"], [2, "pending"]]);
  const index = f.run.stages.length - 1;
  const fresh = f.run.stages[index]!;
  f.run.stages[index] = { ...fresh, status: "completed", startedAt: f.iso(), endedAt: f.iso(),
    report: { outcome: "complete", summary: "Reviewed.", decisions: [], evidence: [], artifacts: [], reportedAt: f.iso(), turnId: null,
      reviewVerdict: "passed", workspaceRevision: { status: "known", revision: "r1" } } as never,
    facts: { currentTurnId: null, workspaceRevision: { status: "known", revision: "r1" }, diff: null, commands: [], toolCalls: [], action: null } as never };
  f.run.stages.push({ ...createStageRecord({ agentRunId: "owned-run", stageId: "fix-review", attempt: 1 }), status: "skipped", endedAt: f.iso() });
  f.run.agentRun = { ...f.run.agentRun, state: "completed" };
  f.setReport({ outcome: "completed", acceptanceCriteria: [{ text: "Search works", required: true, status: "met" }] } as AgentRunDetail["report"]);
  await f.tick();
  expect(f.store.get(f.row.id)?.state).toBe("completed");
  f.runtime.stop();
});

test("a hand-back during work resumes it in place; unchanged work Stave read afterwards completes it", async () => {
  const f = fixture(0);
  await f.act("takeover");
  expect((await f.act("handBack")).status).toBe("applied");
  // Restarting the whole work would repeat it; the review and checks after it run after the hand-back anyway.
  expect(f.run.stages.filter((stage) => stage.stageId === f.verifyStageId).map((stage) => [stage.attempt, stage.status])).toEqual([[1, "running"]]);
  expect(f.run.agentRun.state).toBe("running");
  f.run.stages[0] = { ...f.run.stages[0]!, status: "completed", endedAt: f.iso(), startHeadSha: "a".repeat(40),
    report: { outcome: "complete", summary: "Answered.", decisions: [], evidence: [], artifacts: [], reportedAt: f.iso(), turnId: null,
      workspaceRevision: { status: "known", revision: "r1" } } as never,
    facts: { currentTurnId: null, workspaceRevision: { status: "known", revision: "r1" }, diff: null, commands: [], toolCalls: [], action: null, changedPaths: [] } as never };
  for (const stageId of ["review", "fix-review"])
    f.run.stages.push({ ...createStageRecord({ agentRunId: "owned-run", stageId, attempt: 1 }), status: "skipped", endedAt: f.iso() });
  f.run.agentRun = { ...f.run.agentRun, state: "completed" };
  f.setReport({ outcome: "completed", acceptanceCriteria: [{ text: "Search works", required: true, status: "met" }] } as AgentRunDetail["report"]);
  await f.tick();
  expect(f.store.get(f.row.id)?.state).toBe("completed");
  f.runtime.stop();
});
