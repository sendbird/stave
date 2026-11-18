import { afterEach, expect, test } from "bun:test";
import { TarsStorageBusyError } from "../electron/persistence/tars-conversation-store";
import { AgentRunStore } from "../electron/persistence/agent-run-store";
import { controlTarsRun } from "../electron/host-service/tars-ownership";
import { tarsWorkflow } from "../electron/host-service/tars-execution";
import { createAgentRunRuntime } from "../electron/host-service/supervision/agent-run-runtime";
import { createAgentRun, EMPTY_STAGE_FACTS, type AgentRunPauseReason } from "../src/lib/agent-runs/domain";
import { at, database, persisted, row, service } from "./fixtures/tars-clear-service";
import type { TarsResponsibility } from "../src/lib/tars/types";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
const reset = { requestId: "boundary-reset", scopes: ["conversation", "work"] as const, source: "click" as const };

function question(f: ReturnType<typeof service>, targets: TarsResponsibility[]) {
  const message = f.conversations.create({ requestId: "boundary-question", text: "Ask about work" }, f.now());
  const claimed = f.conversations.claim(message.id, message.revision, f.now());
  f.conversations.answer(message.id, claimed.revision, { reply: "Question", actions: [{ kind: "ask", question: "Stop this work?", options: [
    ...targets.map(target => ({ label: target.title, rationale: "Stop", effect: { kind: "control" as const, responsibilityId: target.id, expectedRevision: target.revision, operation: "cancel" as const } })),
    { label: "Keep", rationale: "Keep working", effect: { kind: "reply" } },
  ] }] }, f.now());
  return `ask:${message.id}:0`;
}

/** Actual Tars control, AgentRun command queue/domain and SQLite. No runtime is started and no provider is invoked. */
function ownedFixture(timing: "before-read" | "queued", reason: AgentRunPauseReason) {
  const runs = new AgentRunStore(database());
  const runId = "owned-run";
  const current = () => runs.getAggregate(runId)!;
  const hold = () => runs.apply({ agentRun: { ...current().agentRun, state: "paused", pauseReason: reason }, upserts: [], events: [] }, new Date(at(120)));
  const native = createAgentRunRuntime({
    store: runs, now: () => new Date(at(121)),
    getTaskSupervisionSnapshot: async () => ({ workspaceId: "execution", taskId: "owned-task", repositoryPath: "/tmp/project", exists: true,
      archived: false, providerId: "codex", model: "test-model", activeTurnId: null, pendingApprovalCount: 0, pendingUserInputCount: 0 }),
    listRecentTurns: () => [], runSupervisedTurn: async () => { throw new Error("No provider allowed"); },
    resolveAgentRunGrant: () => null, resolveWorkspacePath: async () => "/tmp/project", readHeadSha: async () => "abc1234",
    collectStageFacts: async () => EMPTY_STAGE_FACTS,
    readWorkspaceState: async () => ({ branch: "fixture", branchPushed: false, openPullRequest: null }), emitChanged: () => {},
  });
  cleanups.push(() => native.stop());
  let queueChanges = 0;
  const dispatch: NonNullable<Parameters<typeof service>[0]>["controlRun"] = async (entry, operation, max, commandId) => controlTarsRun(entry, operation, {
    commandId, commandEvents: id => runs.listEventsByKind(id, ["control-applied"]), autoExtendMaxTurns: max,
    hasAssignment: () => true, readTask: async () => ({ activeTurnId: null }), readRun: () => current().agentRun,
    linkedTurns: () => [], userTurnIds: () => [], abortTurn: () => { throw new Error("No turn to abort"); },
    agentRuns: { ...native, cancel: (args, guard) => {
      // cancel performs its first guard synchronously, then enqueues the second guard and mutation.
      const queued = native.cancel(args, guard);
      if (timing === "queued") { hold(); queueChanges++; }
      return queued;
    } },
  });
  const f = service({ controlRun: dispatch }); cleanups.push(() => f.service.stop()); f.service.start();
  const work = row(f.responsibilities, "owned", { state: "running", taskId: "owned-task", executionWorkspaceId: "execution", agentRunId: runId }, f.now());
  runs.create(createAgentRun({ id: runId, input: { workspaceId: "execution", leadTaskId: "owned-task", origin: "agent",
    workflow: tarsWorkflow(work, at(100)), assignment: work.instruction,
    consent: { checkIns: "when-stuck", permissionMode: "auto", authorizedEffectStageIds: [] } },
    repositoryPath: work.repositoryPath, fingerprint: { providerId: "codex", model: "test-model" }, now: new Date(at(100)) }), new Date(at(100)));
  return { f, runs, current, hold, work, dispatch, queueChanges: () => queueChanges };
}

for (const reason of ["paused-by-user", "taken-over"] as const) for (const timing of ["before-read", "queued"] as const) {
  test(`reset keeps actual ${reason} Run ${timing}, its responsibility and question`, async () => {
    const { f, work, hold, current, queueChanges } = ownedFixture(timing, reason);
    const decisionId = question(f, [work]); f.service.wake(); await f.service.whenIdle();
    if (timing === "before-read") hold();
    const result = await f.service.clear(reset);
    expect(current().agentRun).toMatchObject({ state: "paused", pauseReason: reason });
    expect(f.responsibilities.get(work.id)).toMatchObject({ state: "running", revision: work.revision });
    expect(result.work?.cancelled).toEqual([]);
    expect(result.work?.kept.some(entry => entry.responsibilityId === work.id)).toBe(true);
    expect(f.responsibilities.snapshot().cleared?.done).not.toContain(work.id);
    expect(f.conversations.getAnswer(decisionId)).toBeNull();
    expect(f.responsibilities.snapshot().pendingDecisions?.some(d => d.responsibilityId === work.id)).toBe(true);
    if (timing === "queued") expect(queueChanges()).toBe(1);
    expect(await f.service.clear(reset)).toEqual(result);
  });
}

test("ordinary explicit Cancel still cancels a user-paused Run", async () => {
  const { f, work, hold, current } = ownedFixture("before-read", "paused-by-user"); hold();
  const result = await f.act({ requestId: "explicit-cancel", responsibilityId: work.id, expectedRevision: work.revision, operation: "cancel", source: "click" });
  expect(result.record.status).toBe("applied");
  expect(current().agentRun.state).toBe("cancelled");
  expect(f.responsibilities.get(work.id)?.state).toBe("cancelled");
});

test.each(["paused-by-user", "taken-over"] as const)("already applied reset Run command reconciles after a newer %s hold without cancelling twice", async reason => {
  const { work, dispatch, hold, current, runs } = ownedFixture("before-read", reason);
  const key = "click:clear-work:lost-ack:owned";
  await dispatch!(work, "cancel", undefined, key);
  expect(current().agentRun.state).toBe("cancelled");
  expect(runs.listEventsByKind(work.agentRunId!, ["control-applied"])).toHaveLength(1);
  hold();
  await dispatch!(work, "cancel", undefined, key);
  expect(current().agentRun).toMatchObject({ state: "paused", pauseReason: reason });
  expect(runs.listEventsByKind(work.agentRunId!, ["control-applied"])).toHaveLength(1);
});

test("natural completion questions stay closed after clear, wake and closing/reopening SQLite", async () => {
  const filename = persisted(); const f = service({ filename }); f.service.start();
  const work = row(f.responsibilities, "ended", { state: "running" }, f.now());
  const decisionId = question(f, [work]); f.service.wake(); await f.service.whenIdle();
  f.responsibilities.patch(work.id, work.revision, { state: "completed" }, f.now());
  const result = await f.service.clear(reset);
  const closure = f.conversations.getAnswer(decisionId);
  f.service.wake(); await f.service.whenIdle();
  const afterWake = f.conversations.list(100).filter(m => m.origin?.kind === "reask");
  await f.service.stop(); f.db.close();
  const reopened = service({ filename, start: 1000 }); cleanups.push(() => reopened.service.stop());
  reopened.service.start(); reopened.service.wake(); await reopened.service.whenIdle();
  expect(result.work?.cancelled).toEqual([]);
  expect(closure?.effect.kind).toBe("dismiss");
  expect(afterWake).toEqual([]);
  expect(reopened.conversations.getAnswer(decisionId)?.effect.kind).toBe("dismiss");
  expect(reopened.conversations.list(100).filter(m => m.origin?.kind === "reask")).toEqual([]);
});

for (const protectedState of ["running", "paused", "takenOver", "publishing"] as const) {
  test(`a naturally ended target never closes a mixed question with ${protectedState} work`, async () => {
    const f = service({ controlRun: async () => { throw new Error("Keep active work"); } }); cleanups.push(() => f.service.stop()); f.service.start();
    const ended = row(f.responsibilities, "ended", { state: "running" }, f.now());
    const publication = protectedState === "publishing" ? { state: "committing" as const, failedStep: null, commit: null, branch: "fixture", base: "main",
      commitMessage: "fix: fixture", title: "fix: fixture", url: null, number: null, error: null, reason: null, updatedAt: f.now() } : null;
    const kept = row(f.responsibilities, "kept", { state: protectedState === "publishing" ? "completed" : protectedState,
      taskId: "kept-task", executionWorkspaceId: "execution", agentRunId: "kept-run", ...(publication ? { publication } : {}) }, f.now());
    const id = question(f, [ended, kept]); f.service.wake(); await f.service.whenIdle();
    f.responsibilities.patch(ended.id, ended.revision, { state: "completed" }, f.now());
    await f.service.clear(reset);
    expect(f.conversations.getAnswer(id)).toBeNull();
    expect(f.responsibilities.get(kept.id)?.state).toBe(kept.state);
  });
}

test("a target completing while reset awaits another cancellation closes its question without being counted cancelled", async () => {
  let naturallyEnded!: TarsResponsibility;
  const f = service({ controlRun: async () => { const current = f.responsibilities.get(naturallyEnded.id)!;
    f.responsibilities.patch(current.id, current.revision, { state: "completed" }, f.now()); } }); cleanups.push(() => f.service.stop()); f.service.start();
  const stopping = row(f.responsibilities, "stop", { state: "running", taskId: "stop-task", executionWorkspaceId: "execution", agentRunId: "stop-run" }, f.now());
  naturallyEnded = row(f.responsibilities, "ends-during-reset", { state: "running" }, f.now());
  const id = question(f, [naturallyEnded]); f.service.wake(); await f.service.whenIdle();
  const result = await f.service.clear(reset);
  expect(result.work).toEqual({ cancelled: [stopping.id], kept: [] });
  expect(f.responsibilities.get(naturallyEnded.id)?.state).toBe("completed");
  expect(f.conversations.getAnswer(id)?.effect.kind).toBe("dismiss");
  f.service.wake(); await f.service.whenIdle();
  expect(f.conversations.list(100).filter(m => m.origin?.kind === "reask")).toEqual([]);
});


test("ordinary explicit Cancel retains taken-over Run semantics", async () => {
  const { f, work, hold, current } = ownedFixture("before-read", "taken-over"); hold();
  const result = await f.act({ requestId: "explicit-taken-over-cancel", responsibilityId: work.id, expectedRevision: work.revision, operation: "cancel", source: "click" });
  expect(result.record.status).toBe("applied");
  expect(current().agentRun).toMatchObject({ state: "paused", pauseReason: "taken-over" });
  expect(f.responsibilities.get(work.id)?.state).toBe("cancelled");
});

test("reset retries a lost receipt after the actual Run command applied, despite a newer hold", async () => {
  const { f, work, hold, current, runs } = ownedFixture("before-read", "paused-by-user");
  const apply = f.conversations.applyAction.bind(f.conversations);
  let refused = false;
  f.conversations.applyAction = (...args) => { if (!refused) { refused = true; throw new TarsStorageBusyError(); } return apply(...args); };
  await expect(f.service.clear(reset)).rejects.toThrow();
  expect(current().agentRun.state).toBe("cancelled");
  expect(f.responsibilities.get(work.id)?.state).toBe("running");
  hold();
  const result = await f.service.clear(reset);
  expect(result.work?.cancelled).toEqual([work.id]);
  expect(current().agentRun).toMatchObject({ state: "paused", pauseReason: "paused-by-user" });
  expect(runs.listEventsByKind(work.agentRunId!, ["control-applied"])).toHaveLength(1);
});
