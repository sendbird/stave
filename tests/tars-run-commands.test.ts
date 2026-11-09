import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { createTarsRuntime } from "../electron/host-service/tars-runtime";
import { actTars } from "../electron/host-service/tars-control";
import { controlTarsRun } from "../electron/host-service/tars-ownership";
import { tarsFollowUpRefusal } from "../electron/host-service/tars-follow-up-admission";
import { tarsObservation, tarsWorkflow, withTarsActiveStage } from "../electron/host-service/tars-execution";
import {
  extendAgentRun, pauseAgentRun, resumeAgentRun, retryStage, signOffStage, skipStage,
} from "../src/lib/agent-runs/commands";
import { createAgentRun, createStageRecord, currentStageRecord, type AgentRunAggregate, type AgentRunChange } from "../src/lib/agent-runs/domain";
import type { AgentRunDetail, AgentRunStageRef } from "../src/lib/agent-runs/api";
import { TARS_CONFIRMED_OPERATIONS, TARS_IRREVERSIBLE_OPERATIONS, type TarsControlOperation } from "../src/lib/tars/conversation";

const databases: Database[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

/**
 * The real Tars runtime and run control over an in-memory run driven by the
 * actual agent-run domain commands: what the user does in the task, asked of Tars.
 */
function fixture() {
  const database = new Database(":memory:"); databases.push(database);
  const store = new TarsStore(database); const conversations = new TarsConversationStore(database);
  let clock = Date.parse("2026-11-09T00:00:00.000Z");
  const now = () => new Date(clock += 1_000);
  const iso = () => now().toISOString();
  const created = store.create({ requestId: "owned", title: "Fix search", instruction: "Fix and verify search.",
    acceptanceCriteria: ["Search works"], workspaceId: "source", repositoryPath: "/tmp/repository", providerId: "codex" }, iso());
  const row = store.patch(created.id, created.revision, { state: "running", taskId: `tars-${created.id}`,
    executionWorkspaceId: "execution", agentRunId: "owned-run" }, iso());
  const change = createAgentRun({ id: "owned-run", input: { workspaceId: "execution", leadTaskId: row.taskId!, origin: "agent",
    workflow: tarsWorkflow(row, iso()), assignment: row.instruction,
    consent: { checkIns: "when-stuck", permissionMode: "auto", authorizedEffectStageIds: [] } },
  repositoryPath: row.repositoryPath, fingerprint: { providerId: "codex", model: "test-model" }, now: now() });
  const [work] = change.agentRun.workflow.stages;
  const run: AgentRunAggregate = { agentRun: { ...change.agentRun, currentStageIndex: 0 },
    stages: [{ ...createStageRecord({ agentRunId: "owned-run", stageId: work!.id, attempt: 1 }), status: "running", startedAt: iso() }] };
  const apply = (next: AgentRunChange) => {
    run.agentRun = next.agentRun;
    for (const record of next.upserts) {
      const index = run.stages.findIndex((item) => item.stageId === record.stageId && item.attempt === record.attempt);
      if (index >= 0) run.stages[index] = record; else run.stages.push(record);
    }
  };
  const detail = (): AgentRunDetail => ({ agentRun: run.agentRun, stages: [...run.stages], events: [], report: null });
  const command = (make: (aggregate: AgentRunAggregate) => AgentRunChange) => async (_args: unknown, guard?: (value: AgentRunAggregate["agentRun"]) => void) => {
    guard?.(run.agentRun); apply(make(run)); return detail();
  };
  const commands: string[] = [];
  /** Runs inside the run's command queue just before a command applies, like a takeover queued ahead of it. */
  let beforeCommand: (() => void) | null = null;
  type Guard = (value: AgentRunAggregate["agentRun"]) => void;
  const queued = (guard: Guard | undefined) => { beforeCommand?.(); beforeCommand = null; guard?.(run.agentRun); };
  const staged = (name: string, make: (aggregate: AgentRunAggregate, expected: { stageId: string; attempt: number }) => AgentRunChange) =>
    async (args: AgentRunStageRef, guard?: Guard) => { queued(guard); commands.push(`${name}:${args.stageId}#${args.attempt}`); apply(make(run, args)); return detail(); };
  const agentRuns = { get: async () => detail(),
    pause: command((aggregate) => pauseAgentRun({ aggregate, reason: "paused-by-user", now: now() })),
    takeOver: command((aggregate) => pauseAgentRun({ aggregate, reason: "taken-over", now: now() })),
    restartStageAndResume: command(() => { throw new Error("not used"); }),
    resume: command((aggregate) => resumeAgentRun({ aggregate, now: now() })),
    cancel: command(() => { throw new Error("not used"); }),
    extend: async (_args: unknown, guard?: Guard) => { queued(guard); commands.push("extend"); apply(extendAgentRun({ aggregate: run, now: now() })); return detail(); },
    retryStage: staged("retryStage", (aggregate, expected) => retryStage({ aggregate, expected, now: now() })),
    skipStage: staged("skipStage", (aggregate, expected) => skipStage({ aggregate, expected, now: now() })),
    signOff: staged("signOff", (aggregate, expected) => signOffStage({ aggregate, expected, now: now() })) };
  const runtime = createTarsRuntime({ store, now: iso, validateScope: async () => {}, prepareWorkspace: async () => "execution",
    prepareTask: async () => {}, findRun: async () => "owned-run", startRun: async () => "owned-run",
    // As the host observes: every look at a run still going names its current stage attempt.
    observe: async (current) => withTarsActiveStage(detail(), tarsObservation(detail(), current.acceptanceCriteria, current.reverifyAfter)),
    controlRun: (current, operation) => controlTarsRun(current, operation, { agentRuns, hasAssignment: () => true,
      readTask: async () => ({ activeTurnId: null }), readRun: () => run.agentRun, linkedTurns: () => [], userTurnIds: () => [], abortTurn: () => {} }) });
  let clicks = 0;
  const act = async (operation: TarsControlOperation) => {
    const current = store.get(row.id)!;
    return (await actTars({ requestId: `click-${clicks++}`, responsibilityId: row.id, expectedRevision: current.revision, operation, source: "click" },
      { conversations, runtime, now: iso })).record;
  };
  /** The current stage stops in the given status, as the run policy leaves it. */
  const stageStops = (status: "blocked" | "stuck" | "awaiting-sign-off") => {
    const index = run.stages.length - 1;
    run.stages[index] = { ...run.stages[index]!, status, detail: "Which index should search use?" };
  };
  const tick = async () => { runtime.requestTick(); await runtime.drain(); await runtime.drain(); };
  const setBeforeCommand = (hook: () => void) => { beforeCommand = hook; };
  return { store, row, run, act, apply, now, tick, runtime, commands, stageStops, setBeforeCommand, current: () => store.get(row.id)! };
}

test("retrying a blocked stage through Tars starts a fresh attempt of the current stage and the work runs again", async () => {
  const f = fixture();
  f.stageStops("blocked");
  await f.tick();
  expect(f.current()).toMatchObject({ state: "waiting", stageAsksUser: true });
  expect(await f.act("retryStage")).toMatchObject({ status: "applied", action: { operation: "retryStage" } });
  const stageId = f.run.stages[0]!.stageId;
  expect(f.commands).toEqual([`retryStage:${stageId}#1`]);
  expect(f.run.stages.map((stage) => [stage.attempt, stage.status])).toEqual([[1, "cancelled"], [2, "pending"]]);
  expect(f.current()).toMatchObject({ state: "running" });
  expect(f.current().stageAsksUser).toBeUndefined();
  f.runtime.stop();
});

test("a run paused at its turn limit gets more turns through Tars, and plain resume is refused with the run's reason", async () => {
  const f = fixture();
  f.apply(pauseAgentRun({ aggregate: f.run, reason: "limit-reached", now: f.now() }));
  await f.tick();
  expect(f.current().state).toBe("waiting");
  // Resume cannot clear a turn limit: the run refuses it and nothing changes.
  expect(await f.act("resume")).toMatchObject({ status: "rejected", reason: "runRefused" });
  expect(f.run.agentRun.state).toBe("paused");
  const before = f.run.agentRun.maxTurns;
  expect(await f.act("extend")).toMatchObject({ status: "applied" });
  expect(f.run.agentRun).toMatchObject({ state: "running", maxTurns: before + 10 });
  expect(f.current().state).toBe("running");
  f.runtime.stop();
});

test("waiting work resumes from a usage-limit pause, but resume over a running run that asks the user is refused", async () => {
  const f = fixture();
  f.apply(pauseAgentRun({ aggregate: f.run, reason: "usage-limit", now: f.now() }));
  await f.tick();
  expect(f.current().state).toBe("waiting");
  expect(await f.act("resume")).toMatchObject({ status: "applied" });
  expect(f.run.agentRun.state).toBe("running");
  f.stageStops("blocked");
  await f.tick();
  expect(f.current().state).toBe("waiting");
  // Nothing is paused: resuming would only pretend; the stage needs an answer, a retry or a skip.
  expect(await f.act("resume")).toMatchObject({ status: "rejected", reason: "runRefused" });
  expect(f.current().state).toBe("waiting");
  f.runtime.stop();
});

test("skip and sign-off use the run's own stage rules: a mismatch is refused and nothing changes", async () => {
  const f = fixture();
  await f.tick();
  // The running work stage waits for no sign-off.
  const revision = f.current().revision;
  expect(await f.act("signOff")).toMatchObject({ status: "rejected", reason: "runRefused" });
  expect(f.current().revision).toBe(revision);
  f.stageStops("awaiting-sign-off");
  await f.tick();
  expect(await f.act("signOff")).toMatchObject({ status: "applied" });
  expect(f.run.stages[0]!.status).toBe("running");
  f.stageStops("stuck");
  await f.tick();
  expect(await f.act("skipStage")).toMatchObject({ status: "applied" });
  expect(f.run.stages[0]!.status).toBe("skipped");
  expect(currentStageRecord(f.run).stageId).toBe(f.run.agentRun.workflow.stages[1]!.id);
  f.runtime.stop();
});

test("run commands never act on work the user holds", async () => {
  const f = fixture();
  f.stageStops("blocked");
  // Taken over in the task before Tars observed it: refused, never applied as a silent no-op.
  f.apply(pauseAgentRun({ aggregate: f.run, reason: "taken-over", now: f.now() }));
  expect(await f.act("retryStage")).toMatchObject({ status: "rejected", reason: "ownershipLost" });
  expect(f.commands).toEqual([]);
  f.apply(resumeAgentRun({ aggregate: f.run, now: f.now() }));
  await f.act("takeover");
  for (const operation of ["extend", "retryStage", "skipStage", "signOff"] as const)
    expect(await f.act(operation)).toMatchObject({ status: "rejected", reason: "takenOver" });
  expect(f.commands).toEqual([]);
  f.runtime.stop();
});

test("a takeover queued ahead of a run command inside the run's queue refuses the command", async () => {
  const f = fixture();
  f.stageStops("blocked");
  await f.tick();
  // Tars admitted and checked the run, then the user's takeover applied first in the run's own queue.
  f.setBeforeCommand(() => f.apply(pauseAgentRun({ aggregate: f.run, reason: "taken-over", now: f.now() })));
  expect(await f.act("retryStage")).toMatchObject({ status: "rejected", reason: "ownershipLost" });
  expect(f.commands).toEqual([]);
  expect(f.run.stages.map((stage) => stage.status)).toEqual(["blocked"]);
  f.runtime.stop();
});

test("a stage command applies only to the stage attempt the user saw, never to a later one", async () => {
  const f = fixture();
  f.stageStops("stuck");
  await f.tick();
  const seen = f.current();
  expect(seen.activeStage).toBe(`${f.run.stages[0]!.stageId}#1`);
  // The run moved on (the user retried in the task) before Tars looked again; the revision the user saw is unchanged.
  f.apply(retryStage({ aggregate: f.run, expected: { stageId: f.run.stages[0]!.stageId, attempt: 1 }, now: f.now() }));
  expect(f.current().revision).toBe(seen.revision);
  expect(await f.act("skipStage")).toMatchObject({ status: "rejected", reason: "stale" });
  expect(f.commands).toEqual([]);
  // Once Tars observed the new attempt, the revision moved, so anything proposed for the old one is stale too.
  await f.tick();
  expect(f.current()).toMatchObject({ activeStage: `${f.run.stages[0]!.stageId}#2` });
  expect(f.current().revision).toBeGreaterThan(seen.revision);
  f.runtime.stop();
});

test("work the user paused through Tars refuses run commands until resumed, so a run never finishes under a paused row", async () => {
  const f = fixture();
  f.stageStops("blocked");
  await f.tick();
  await f.act("pause");
  expect(f.current().state).toBe("paused");
  for (const operation of ["extend", "retryStage", "skipStage", "signOff"] as const)
    expect(await f.act(operation)).toMatchObject({ status: "rejected", reason: "resumeFirst" });
  expect(f.commands).toEqual([]);
  f.runtime.stop();
});

test("run commands wait for the user's Confirm when proposed from words; Start now applies like a queue change", () => {
  for (const operation of ["extend", "retryStage", "skipStage", "signOff"] as const) expect(TARS_CONFIRMED_OPERATIONS.has(operation)).toBe(true);
  expect(TARS_CONFIRMED_OPERATIONS.has("startNow")).toBe(false);
  // Skipping drops planned work and cannot be undone: never a default answer.
  expect(TARS_IRREVERSIBLE_OPERATIONS.has("skipStage")).toBe(true);
  expect(TARS_IRREVERSIBLE_OPERATIONS.has("retryStage")).toBe(false);
});

test("an automatic follow-up may propose a retry, more turns or a sign-off, but never a skip or Start now", () => {
  const row = { state: "waiting", detailCode: null } as never;
  const responsibilities = { get: () => row };
  const origin = { kind: "followUp", responsibilityId: "r", observedRevision: 3, reason: "stageAsksUser", summary: "" } as never;
  const control = (operation: TarsControlOperation) => ({ kind: "control" as const, responsibilityId: "r", expectedRevision: 3, operation });
  for (const operation of ["retryStage", "extend", "signOff"] as const) expect(tarsFollowUpRefusal(control(operation), origin, responsibilities)).toBeNull();
  for (const operation of ["skipStage", "startNow"] as const) expect(tarsFollowUpRefusal(control(operation), origin, responsibilities)).not.toBeNull();
  // Not as an option of its question either: only the user's own words lead to a skip.
  const ask = (operation: TarsControlOperation) => ({ kind: "ask" as const, question: "What next?", options: [
    { label: "Do it", rationale: "Moves on.", effect: control(operation) }, { label: "Wait", rationale: "Keeps it.", effect: { kind: "reply" as const } }] });
  expect(tarsFollowUpRefusal(ask("skipStage"), origin, responsibilities)).not.toBeNull();
  expect(tarsFollowUpRefusal(ask("retryStage"), origin, responsibilities)).toBeNull();
});
