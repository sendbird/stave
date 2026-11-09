import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { createTarsRuntime, type TarsRuntimePorts } from "../electron/host-service/tars-runtime";
import { actTars } from "../electron/host-service/tars-control";
import type { TarsControlOperation } from "../src/lib/tars/conversation";
import type { TarsResponsibility } from "../src/lib/tars/types";
import { tarsWorkflow, tarsObservation } from "../electron/host-service/tars-execution";
import { assertTarsRun } from "../electron/host-service/tars-ownership";
import { WorkflowSchema } from "../src/lib/workflows/schema";
import { agentRunFixture } from "./fixtures/agent-run-fixtures";
import type { AgentRunDetail } from "../src/lib/agent-runs/api";

const NOW = "2026-11-05T00:00:00.000Z";
const input = (requestId = "one", priority = 50) => ({
  requestId, title: "Verify the search fix", instruction: "Fix and verify search within this repository.",
  acceptanceCriteria: ["Search returns the expected result."], workspaceId: "source", repositoryPath: "/tmp/tars-repository",
  providerId: "codex" as const, model: null, priority, maxTurns: 30,
});
function fixture(overrides: Partial<TarsRuntimePorts> = {}) {
  const database = new Database(":memory:");
  const store = new TarsStore(database);
  const calls: string[] = [];
  const ports: TarsRuntimePorts = {
    store, now: () => NOW, validateScope: async () => {},
    prepareWorkspace: async (row) => { calls.push(`workspace:${row.requestId}`); return `execution-${row.id}`; },
    prepareTask: async (row) => { calls.push(`task:${row.taskId}`); },
    findRun: async () => null,
    startRun: async (row) => { calls.push(`run:${row.requestId}`); return `run-${row.id}`; },
    observe: async () => ({ state: "running", detail: null }),
    controlRun: async (_row, action) => { calls.push(action); }, ...overrides,
  };
  const runtime = createTarsRuntime(ports);
  const tick = async () => { runtime.requestTick(); await runtime.drain(); await Promise.resolve(); };
  const conversations = new TarsConversationStore(database);
  let clicks = 0;
  // The click entry point: one request ID per click, settled through the admitted control path.
  const act = async (row: TarsResponsibility, operation: TarsControlOperation, target = runtime) =>
    (await actTars({ requestId: `click-${clicks++}`, responsibilityId: row.id, expectedRevision: row.revision, operation, source: "click" },
      { conversations, runtime: target, now: () => NOW })).record;
  return { store, calls, runtime, tick, database, ports, act };
}

describe("Tars responsibility execution", () => {
  test("creates one execution, preserves ownership and does no work on unchanged ticks", async () => {
    const f = fixture();
    const row = f.store.create(input(), NOW);
    await f.tick(); await f.tick();
    expect(f.store.get(row.id)).toMatchObject({ state: "running", taskId: `tars-${row.id}`, agentRunId: `run-${row.id}` });
    expect(f.calls).toEqual(["workspace:one", `task:tars-${row.id}`, "run:one"]);
    f.database.close();
  });
  test("dispatches the highest priority queued responsibility and keeps other work queued", async () => {
    const f = fixture();
    f.store.create(input("low", 10), NOW); f.store.create(input("high", 90), NOW);
    await f.tick(); await f.tick();
    expect(f.calls.filter((call) => call.startsWith("run:"))).toEqual(["run:high"]);
    expect(f.store.snapshot().responsibilities.find((row) => row.requestId === "low")?.state).toBe("queued");
    f.database.close();
  });
  test("recovers a lost start acknowledgement by finding the existing terminal run", async () => {
    const f = fixture({ findRun: async () => "already-completed", observe: async () => ({ state: "completed", detail: null }) });
    const row = f.store.create(input(), NOW);
    f.store.patch(row.id, row.revision, { state: "preparing", taskId: `tars-${row.id}`, executionWorkspaceId: "existing-workspace" }, NOW);
    await f.tick(); await f.tick();
    expect(f.calls).toEqual([]);
    expect(f.store.get(row.id)?.state).toBe("completed");
    f.database.close();
  });
  test("scope denial cannot create a worktree or execution", async () => {
    const f = fixture({ validateScope: async () => { throw new Error("denied repository"); } });
    await expect(f.runtime.create(input())).rejects.toThrow("denied repository");
    expect(f.store.snapshot().responsibilities).toEqual([]);
    const row = f.store.create(input(), NOW); await f.tick();
    expect(f.store.get(row.id)?.state).toBe("blocked"); expect(f.calls).toEqual([]);
    f.database.close();
  });
  test("a pending cancel invalidates dispatch while workspace preparation awaits I/O", async () => {
    let release!: (id: string) => void;
    const f = fixture({ prepareWorkspace: () => new Promise((resolve) => { release = resolve; }) });
    const row = f.store.create(input(), NOW);
    f.runtime.requestTick();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const current = f.store.get(row.id)!;
    const cancelling = f.act(current, "cancel");
    release("created-workspace");
    expect((await cancelling).status).toBe("applied");
    expect(f.store.get(row.id)?.state).toBe("cancelled"); expect(f.calls).toEqual([]);
    f.database.close();
  });
  test("pause survives a runtime restart and stale or simultaneous controls are rejected", async () => {
    const f = fixture(); const row = f.store.create(input(), NOW); await f.tick();
    const current = f.store.get(row.id)!;
    const pause = f.act(current, "pause");
    expect(await f.act(current, "resume")).toMatchObject({ status: "rejected", error: expect.stringContaining("changed") });
    expect((await pause).status).toBe("applied");
    expect(await f.act(current, "cancel")).toMatchObject({ status: "rejected", error: expect.stringContaining("changed") });
    f.runtime.stop();
    const restarted = createTarsRuntime(f.ports);
    // A new runtime over the same persisted store must leave the manually paused row alone.
    restarted.requestTick(); await restarted.drain();
    expect(f.store.get(row.id)?.state).toBe("paused");
    restarted.stop();
    expect(f.calls.filter((call) => call === "pause")).toHaveLength(1);
    f.database.close();
  });
  test("a human wait yields scheduling to another responsibility, without replaying the waiting run", async () => {
    const f = fixture({ observe: async () => ({ state: "waiting", detail: "Needs a decision" }) });
    f.store.create(input("first", 90), NOW); f.store.create(input("second", 10), NOW);
    await f.tick(); await f.tick();
    expect(f.calls.filter((call) => call.startsWith("run:"))).toEqual(["run:first", "run:second"]);
    f.database.close();
  });
  test("observation failure stays visible, and no empty observation becomes success", async () => {
    const f = fixture({ observe: async () => { throw new Error("unreadable run"); } });
    const row = f.store.create(input(), NOW); await f.tick(); await f.tick();
    expect(f.store.get(row.id)).toMatchObject({ state: "blocked", detail: "unreadable run" });
    f.database.close();
  });
  test("an unknown running outcome retains its slot and is observed again after recovery", async () => {
    let readable = false;
    const f = fixture({ observe: async () => {
      if (!readable) throw new Error("temporarily unavailable");
      return { state: "completed", detail: null };
    } });
    const first = f.store.create(input("first", 90), NOW);
    f.store.create(input("second", 10), NOW);
    await f.tick(); await f.tick();
    expect(f.store.get(first.id)?.state).toBe("blocked");
    expect(f.calls.filter((call) => call.startsWith("run:"))).toEqual(["run:first"]);
    // A restarted runtime must recover without losing the ownership reservation.
    f.runtime.stop();
    const restarted = createTarsRuntime(f.ports);
    restarted.requestTick(); await restarted.drain(); await Promise.resolve();
    expect(f.calls.filter((call) => call.startsWith("run:"))).toEqual(["run:first"]);
    readable = true;
    restarted.requestTick(); await restarted.drain();
    expect(f.store.get(first.id)?.state).toBe("completed");
    expect(f.calls.filter((call) => call.startsWith("run:"))).toEqual(["run:first", "run:second"]);
    restarted.stop(); f.database.close();
  });
  test("snapshot reads do not wait for slow workspace preparation", async () => {
    let release!: (id: string) => void;
    const f = fixture({ prepareWorkspace: () => new Promise((resolve) => { release = resolve; }) });
    f.store.create(input(), NOW); f.runtime.requestTick();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    let read = false;
    const snapshot = f.runtime.get().then(() => { read = true; });
    await Promise.resolve(); await Promise.resolve();
    const readBeforeRelease = read;
    release("workspace"); await f.runtime.drain(); await snapshot;
    expect(readBeforeRelease).toBe(true);
    f.database.close();
  });
  test("a lost start response is reconciled before another responsibility starts", async () => {
    let created = false;
    const f = fixture({
      findRun: async (row) => row.requestId === "first" && created ? "lost-ack-run" : null,
      startRun: async () => { created = true; throw new Error("response lost"); },
    });
    const first = f.store.create(input("first", 90), NOW);
    const second = f.store.create(input("second", 10), NOW);
    await f.tick(); await f.tick();
    expect(f.store.get(first.id)).toMatchObject({ state: "running", agentRunId: "lost-ack-run" });
    expect(f.store.get(second.id)?.state).toBe("queued");
    f.database.close();
  });
  test("cancel reconciles a lost start response before cancelling the responsibility", async () => {
    let created = false;
    const f = fixture({ findRun: async () => created ? "lost-ack-run" : null,
      startRun: async () => { created = true; throw new Error("response lost"); } });
    const row = f.store.create(input(), NOW); await f.tick();
    expect((await f.act(f.store.get(row.id)!, "cancel")).status).toBe("applied");
    expect(f.calls).toContain("cancel");
    expect(f.store.get(row.id)).toMatchObject({ state: "cancelled", agentRunId: "lost-ack-run" });
    f.database.close();
  });
  test("cancel accepted during observation wins over its late completion", async () => {
    let release!: (value: { state: "completed"; detail: null }) => void;
    const f = fixture({ observe: () => new Promise((resolve) => { release = resolve; }) });
    const row = f.store.create(input(), NOW); await f.tick();
    f.runtime.requestTick(); await Promise.resolve(); await Promise.resolve();
    const cancel = f.act(f.store.get(row.id)!, "cancel");
    release({ state: "completed", detail: null });
    await cancel;
    expect(f.store.get(row.id)?.state).toBe("cancelled");
    f.database.close();
  });
  test("cancel invalidates run admission that is still waiting before creation", async () => {
    let release!: () => void;
    let entered!: () => void;
    const enteredStart = new Promise<void>((resolve) => { entered = resolve; });
    let creations = 0;
    const f = fixture({ startRun: async (_row, guard) => {
      entered(); await new Promise<void>((resolve) => { release = resolve; });
      guard?.(); creations += 1; return "late-run";
    } });
    const row = f.store.create(input(), NOW); f.runtime.requestTick();
    await enteredStart;
    const cancel = f.act(f.store.get(row.id)!, "cancel");
    release(); await cancel;
    expect(creations).toBe(0);
    expect(f.store.get(row.id)?.state).toBe("cancelled");
    f.database.close();
  });
});

describe("Tars acceptance boundary", () => {
  test("workflow is valid, always reviews, carries exact required criteria and grants no publication stage", () => {
    const f = fixture(); const row = f.store.create(input(), NOW);
    const workflow = WorkflowSchema.parse(tarsWorkflow(row, NOW));
    expect(workflow.stages.map((stage) => stage.id)).toEqual(["work", "review", "verify"]);
    expect(workflow.stages[0]?.acceptanceCriteria?.[0]?.text).toBe(row.acceptanceCriteria[0]);
    expect(workflow.stages.every((stage) => stage.kind === "ai")).toBe(true);
    f.database.close();
  });
  test("terminal execution without a required acceptance report is blocked", () => {
    const aggregate = agentRunFixture();
    const detail = { ...aggregate, agentRun: { ...aggregate.agentRun, state: "completed" }, report: null, events: [] } as AgentRunDetail;
    expect(tarsObservation(detail).state).toBe("blocked");
    const completed = { ...detail, report: { outcome: "completed", acceptanceCriteria: [{ text: "Required result", required: true, status: "met" }] } } as AgentRunDetail;
    // "Met" alone is the agent's own claim: Stave has no verified check or review for it.
    expect(tarsObservation(completed)).toMatchObject({ state: "blocked", detailCode: "unverifiedCompletion" });
    completed.report!.acceptanceCriteria[0]!.status = "unverified";
    expect(tarsObservation(completed)).toMatchObject({ state: "blocked", detailCode: "incompleteReport" });
  });

  // A2: completion needs evidence Stave verified or a passed independent review.
  const finalStageOf = (detail: AgentRunDetail) => detail.agentRun.workflow.stages.at(-1)!.id;
  const reported = (stages: AgentRunDetail["stages"]): AgentRunDetail => {
    const aggregate = agentRunFixture();
    return { ...aggregate, agentRun: { ...aggregate.agentRun, state: "completed" }, events: [], stages,
      report: { outcome: "completed", acceptanceCriteria: [{ text: "Required result", required: true, status: "met" }] } } as AgentRunDetail;
  };
  const revision = { status: "known", revision: "revision-1" } as const;
  const checkedStage = (detail: AgentRunDetail, outcome: { exitCode: number; revision: string }) => ({
    ...agentRunFixture().stages[0]!, stageId: finalStageOf(detail), status: "completed",
    report: { outcome: "complete", summary: "Checked.", decisions: [], artifacts: [], reportedAt: NOW, turnId: "turn-1",
      evidence: [{ label: "Tests pass", kind: "check", command: "bun test" }] },
    facts: { currentTurnId: "turn-1", workspaceRevision: revision, diff: null, toolCalls: [], action: null,
      commands: [{ command: "bun test", exitCode: outcome.exitCode, toolCallId: "call-1", turnId: "turn-1",
        outcome: outcome.exitCode === 0 ? "succeeded" : "failed", provenance: "provider-structured",
        sourceRevision: { status: "known", revision: outcome.revision } }] },
  }) as unknown as AgentRunDetail["stages"][number];

  test("a check Stave saw pass on the current revision in the final stage completes the work", () => {
    const base = reported([]);
    expect(tarsObservation(reported([checkedStage(base, { exitCode: 0, revision: "revision-1" })])).state).toBe("completed");
  });

  test("a failed or out-of-date check is not verification", () => {
    const base = reported([]);
    for (const outcome of [{ exitCode: 1, revision: "revision-1" }, { exitCode: 0, revision: "revision-0" }])
      expect(tarsObservation(reported([checkedStage(base, outcome)]))).toMatchObject({ state: "blocked", detailCode: "unverifiedCompletion" });
  });

  test("only the reviewer stage's latest verdict on the completed revision counts as review", () => {
    const aggregate = agentRunFixture();
    const aiStage = aggregate.agentRun.workflow.stages.find((stage) => stage.kind === "ai")!;
    const finalStage = { ...aiStage, id: "verify" };
    const workflow = { ...aggregate.agentRun.workflow, stages: [{ ...aiStage, id: "review", agentConfigId: "reviewer" }, finalStage] };
    const stageRecord = (stageId: string, report: Record<string, unknown> | null, facts: Record<string, unknown> | null, startedAt = NOW) =>
      ({ ...aggregate.stages[0]!, stageId, status: "completed", startedAt, report: report && { outcome: "complete", summary: "Done.", decisions: [], evidence: [],
        artifacts: [], reportedAt: NOW, turnId: null, ...report }, facts }) as unknown as AgentRunDetail["stages"][number];
    const verified = (review: Record<string, unknown>, reviewStartedAt = NOW, verifyRevision = "revision-2") => ({ ...reported([
      stageRecord("review", { reviewVerdict: "passed", workspaceRevision: { status: "known", revision: "revision-2" }, ...review }, null, reviewStartedAt),
      stageRecord(finalStage.id, {}, { currentTurnId: null, workspaceRevision: { status: "known", revision: verifyRevision }, diff: null, commands: [], toolCalls: [], action: null }),
    ]), agentRun: { ...aggregate.agentRun, state: "completed", workflow } }) as AgentRunDetail;
    expect(tarsObservation(verified({})).state).toBe("completed");
    const unverified = { state: "blocked", detailCode: "unverifiedCompletion" };
    expect(tarsObservation(verified({ reviewVerdict: "changes-requested" }))).toMatchObject(unverified);
    // The final stage changed the files after the review: that revision was never reviewed.
    expect(tarsObservation(verified({}, NOW, "revision-3"))).toMatchObject(unverified);
    // A verdict the final stage reports about itself is the agent's own claim.
    const selfReported = reported([stageRecord(finalStage.id, { reviewVerdict: "passed", workspaceRevision: { status: "known", revision: "revision-2" } },
      { currentTurnId: null, workspaceRevision: { status: "known", revision: "revision-2" }, diff: null, commands: [], toolCalls: [], action: null })]);
    expect(tarsObservation({ ...selfReported, agentRun: { ...selfReported.agentRun, workflow } } as AgentRunDetail)).toMatchObject(unverified);
    // A review from before a hand-back does not cover the user's changes.
    const reverifyAfter = "2026-11-06T00:00:00.000Z";
    expect(tarsObservation(verified({}, NOW), undefined, NOW)).toMatchObject({ state: "completed" });
    expect(tarsObservation(verified({}, NOW), undefined, reverifyAfter).state).toBe("blocked");
  });

});

describe("Tars accept as done", () => {
  test("only unverified completion can be accepted; it completes the work without touching the run", async () => {
    const f = fixture();
    const created = f.store.create(input(), NOW);
    const running = f.store.patch(created.id, created.revision, { state: "running", taskId: "task", executionWorkspaceId: "execution", agentRunId: "run" }, NOW);
    expect(await f.act(running, "acceptCompletion")).toMatchObject({ status: "rejected", reason: "notAcceptable" });
    const otherBlock = f.store.patch(running.id, running.revision, { state: "blocked", detail: "Stopped.", detailCode: "runStopped" }, NOW);
    expect(await f.act(otherBlock, "acceptCompletion")).toMatchObject({ status: "rejected", reason: "notAcceptable" });
    const unverified = f.store.patch(otherBlock.id, otherBlock.revision, { state: "blocked", detail: "Unverified.", detailCode: "unverifiedCompletion" }, NOW);
    // Its run has ended: resuming, pausing or taking it over cannot help, so they are refused up front.
    for (const operation of ["resume", "pause", "takeover"] as const)
      expect(await f.act(unverified, operation)).toMatchObject({ status: "rejected", reason: "runEnded" });
    expect(f.store.get(unverified.id)).toEqual(unverified);
    expect(await f.act(unverified, "acceptCompletion")).toMatchObject({ status: "applied" });
    expect(f.store.get(unverified.id)).toMatchObject({ state: "completed", detailCode: "acceptedWithoutVerification" });
    expect(f.calls).toEqual([]);
    f.database.close();
  });
});


describe("Tars start now", () => {
  test("starts queued work at once beside running work, and the queue still waits for the slot", async () => {
    const f = fixture();
    const first = f.store.create(input("first", 90), NOW);
    await f.tick();
    expect(f.store.get(first.id)?.state).toBe("running");
    const second = f.store.create(input("second", 10), NOW);
    const third = f.store.create(input("third", 50), NOW);
    await f.tick();
    expect(f.store.get(second.id)?.state).toBe("queued");
    expect(await f.act(second, "startNow")).toMatchObject({ status: "applied" });
    await f.runtime.drain();
    expect(f.store.get(second.id)).toMatchObject({ state: "running", taskId: `tars-${second.id}`, agentRunId: `run-${second.id}` });
    // Only the named work skipped the queue: the rest still waits for the portfolio slot.
    await f.tick();
    expect(f.store.get(third.id)?.state).toBe("queued");
    expect(f.calls.filter((call) => call.startsWith("run:"))).toEqual(["run:first", "run:second"]);
    // A start now never controls a run: started work has one already and is refused.
    expect(await f.act(f.store.get(first.id)!, "startNow")).toMatchObject({ status: "rejected", reason: "notStartable" });
    expect(f.calls.filter((call) => !call.includes(":"))).toEqual([]);
    f.database.close();
  });
  test("starting queued work now starts its run with the attachments its message gave it", async () => {
    const started: Array<TarsResponsibility["attachments"]> = [];
    const f = fixture({ startRun: async (row) => { started.push(row.attachments); return `run-${row.id}`; } });
    const first = f.store.create(input("first", 90), NOW);
    await f.tick();
    const attachments = { messageId: "message-1", items: [{ index: 0, kind: "image" as const, name: "screen.png", type: "image/png", size: 6 }] };
    const second = f.store.create({ ...input("second", 10), attachments }, NOW);
    await f.tick();
    expect(f.store.get(first.id)?.state).toBe("running");
    expect(f.store.get(second.id)?.state).toBe("queued");
    expect(await f.act(second, "startNow")).toMatchObject({ status: "applied" });
    await f.runtime.drain();
    expect(f.store.get(second.id)).toMatchObject({ state: "running", agentRunId: `run-${second.id}` });
    expect(started).toEqual([undefined, attachments]);
    f.database.close();
  });
  test("refuses paused, taken-over, stale and out-of-scope work without starting anything", async () => {
    let denied = false;
    const f = fixture({ validateScope: async () => { if (denied) throw new Error("denied repository"); } });
    const created = f.store.create(input("held", 10), NOW);
    const paused = f.store.patch(created.id, created.revision, { state: "paused" }, NOW);
    expect(await f.act(paused, "startNow")).toMatchObject({ status: "rejected", reason: "notStartable" });
    const takenOver = f.store.patch(paused.id, paused.revision, { state: "takenOver" }, NOW);
    expect(await f.act(takenOver, "startNow")).toMatchObject({ status: "rejected", reason: "notStartable" });
    const queued = f.store.patch(takenOver.id, takenOver.revision, { state: "queued" }, NOW);
    expect(await f.act({ ...queued, revision: queued.revision - 1 }, "startNow")).toMatchObject({ status: "rejected", reason: "stale" });
    denied = true;
    expect(await f.act(queued, "startNow")).toMatchObject({ status: "rejected", reason: "outOfScope" });
    expect(f.store.get(queued.id)).toEqual(queued);
    expect(f.calls).toEqual([]);
    f.database.close();
  });
  test("a pause clicked while start now prepares the worktree is applied and no run starts", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const f = fixture({ prepareWorkspace: async (row) => { if (row.requestId === "second") await gate; return `execution-${row.id}`; } });
    const first = f.store.create(input("first", 90), NOW);
    await f.tick();
    const second = f.store.create(input("second", 10), NOW);
    expect(await f.act(second, "startNow")).toMatchObject({ status: "applied" });
    await Promise.resolve();
    // Preparation is still waiting on Git: the control has settled, so a pause is admitted, not refused as in flight.
    const pausing = f.act(f.store.get(second.id)!, "pause");
    release();
    expect(await pausing).toMatchObject({ status: "applied" });
    await f.runtime.drain();
    expect(f.store.get(second.id)?.state).toBe("paused");
    expect(f.calls.filter((call) => call.startsWith("run:"))).toEqual(["run:first"]);
    expect(f.store.get(first.id)?.state).toBe("running");
    f.database.close();
  });
  test("a failed preparation blocks the started work with its reason instead of leaving it queued", async () => {
    let failing = false;
    const f = fixture({ prepareWorkspace: async (row) => { if (failing) throw new Error("worktree failed"); return `execution-${row.id}`; } });
    const first = f.store.create(input("first", 90), NOW);
    await f.tick();
    failing = true;
    const second = f.store.create(input("second", 10), NOW);
    expect(await f.act(second, "startNow")).toMatchObject({ status: "applied" });
    await f.runtime.drain();
    expect(f.store.get(second.id)).toMatchObject({ state: "blocked", agentRunId: null });
    expect(f.store.get(first.id)?.state).toBe("running");
    f.database.close();
  });
});

describe("Tars confirmed ownership transfer", () => {
  function transferred(row: Parameters<TarsRuntimePorts["findRun"]>[0]): never {
    const userRun = { ...agentRunFixture({ leadTaskId: row.taskId! }).agentRun,
      workspaceId: row.executionWorkspaceId!, repositoryPath: row.repositoryPath, origin: "agent" as const };
    assertTarsRun(row, userRun);
    throw new Error("Expected a different workflow to be rejected");
  }
  for (const hasReceipt of [false, true]) {
    test(`confirmed transfer yields the slot with saved run receipt = ${hasReceipt}`, async () => {
      const f = fixture({ findRun: async (row) => row.requestId === "first" ? transferred(row) : null,
        observe: async (row) => row.requestId === "first" ? transferred(row) : { state: "running", detail: null } });
      const first = f.store.create(input("first", 90), NOW);
      f.store.patch(first.id, first.revision, { state: "blocked", taskId: "first-task", executionWorkspaceId: "first-execution",
        ...(hasReceipt ? { agentRunId: "old-run" } : {}) }, NOW);
      f.store.create(input("second", 10), NOW);
      await f.tick();
      expect(f.calls.filter((call) => call.startsWith("run:"))).toEqual(["run:second"]);
      expect(f.calls.some((call) => ["pause", "resume", "cancel"].includes(call))).toBe(false);
      f.database.close();
    });
  }
  for (const action of ["pause", "cancel"] as const) {
    test(`${action} only changes the responsibility after confirmed transfer`, async () => {
      const f = fixture({ findRun: async (row) => transferred(row) });
      const first = f.store.create(input(), NOW);
      const row = f.store.patch(first.id, first.revision, { state: "blocked", taskId: "first-task", executionWorkspaceId: "execution" }, NOW);
      expect((await f.act(row, action)).status).toBe("applied");
      expect(f.store.get(row.id)?.state).toBe(action === "pause" ? "paused" : "cancelled");
      expect(f.calls).toEqual([]);
      if (action === "pause") expect((await f.act(f.store.get(row.id)!, "resume")).status).toBe("rejected");
      f.database.close();
    });
  }
  test("confirmed transfer of a saved execution allows cancellation without controlling its replacement", async () => {
    const f = fixture({ controlRun: async (row) => transferred(row) });
    const first = f.store.create(input(), NOW);
    const row = f.store.patch(first.id, first.revision, { state: "blocked", taskId: "first-task", executionWorkspaceId: "execution", agentRunId: "former-run" }, NOW);
    expect((await f.act(row, "resume")).status).toBe("rejected");
    expect((await f.act(row, "cancel")).status).toBe("applied");
    expect(f.store.get(row.id)).toMatchObject({ state: "cancelled", agentRunId: "former-run" });
    expect(f.calls).toEqual([]);
    f.database.close();
  });
  test("a transient receipt read failure retains its slot and refuses cancellation", async () => {
    const f = fixture({ findRun: async () => { throw new Error("The owned run identity changed."); } });
    const first = f.store.create(input("first", 90), NOW);
    const row = f.store.patch(first.id, first.revision, { state: "blocked", taskId: "first-task", executionWorkspaceId: "execution" }, NOW);
    f.store.create(input("second", 10), NOW);
    await f.tick();
    expect(f.calls).toEqual([]);
    expect((await f.act(f.store.get(row.id)!, "cancel")).status).toBe("rejected");
    expect(f.store.get(row.id)?.state).toBe("blocked");
    // Matching wording is not ownership evidence; only the typed host result releases a slot.
    expect(f.calls).toEqual([]);
    f.database.close();
  });
  test("preparing receipt recovery precedes a higher priority queued responsibility", async () => {
    const f = fixture({ findRun: async (row) => row.requestId === "first" ? "created-before-crash" : null });
    const first = f.store.create(input("first", 10), NOW);
    f.store.patch(first.id, first.revision, { state: "preparing", taskId: "first-task", executionWorkspaceId: "execution" }, NOW);
    f.store.create(input("second", 90), NOW);
    await f.tick();
    expect(f.store.get(first.id)).toMatchObject({ agentRunId: "created-before-crash", state: "running" });
    expect(f.calls).toEqual([]);
    f.database.close();
  });
  test("resume validates the surviving execution workspace after source removal", async () => {
    const f = fixture({ validateScope: async (row) => { if (row.workspaceId === "source") throw new Error("source removed"); } });
    const first = f.store.create(input(), NOW);
    const row = f.store.patch(first.id, first.revision, { state: "paused", taskId: "first-task", executionWorkspaceId: "execution", agentRunId: "own-run" }, NOW);
    expect((await f.act(row, "resume")).status).toBe("applied");
    expect(f.store.get(row.id)?.state).toBe("running");
    expect(f.calls).toEqual(["resume"]);
    f.database.close();
  });
});

describe("Tars storage lock waits", () => {
  const busy = () => Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
  test("a lock wait during preparation leaves the row for the next tick instead of blocking it", async () => {
    let failNext = true;
    const f = fixture();
    const patch = f.store.patch.bind(f.store);
    f.store.patch = (id, revision, value, at) => {
      if (failNext && value.state === "preparing") { failNext = false; throw busy(); }
      return patch(id, revision, value, at);
    };
    const row = f.store.create(input(), NOW);
    await f.tick();
    expect(f.store.get(row.id)).toMatchObject({ state: "queued", detail: null });
    await f.tick();
    expect(f.store.get(row.id)).toMatchObject({ state: "running", agentRunId: `run-${row.id}`, detail: null });
    expect(f.calls.filter((call) => call.startsWith("run:"))).toEqual(["run:one"]);
    f.database.close();
  });
  test("a lock wait while observing keeps the slot and never records a blocked verdict", async () => {
    let locked = true;
    const f = fixture({ observe: async () => { if (locked) throw busy(); return { state: "completed", detail: null }; } });
    const first = f.store.create(input("first", 90), NOW); f.store.create(input("second", 10), NOW);
    await f.tick(); await f.tick();
    expect(f.store.get(first.id)).toMatchObject({ state: "running", detail: null });
    expect(f.calls.filter((call) => call.startsWith("run:"))).toEqual(["run:first"]);
    locked = false; await f.tick();
    expect(f.store.get(first.id)?.state).toBe("completed");
    f.database.close();
  });
});

test("a window's snapshot leaves out the run-only mandate while the runtime still starts the run with it", async () => {
  const seen: (string | undefined)[] = [];
  const f = fixture({ startRun: async (row) => { seen.push(row.mandate); return `run-${row.id}`; } });
  const mandate = "m".repeat(20_000);
  f.store.create({ ...input("long"), mandate, branchName: "feat/long-request-0a1b2c3d" }, NOW);
  await f.tick(); await f.tick(); await f.tick();
  expect(seen).toEqual([mandate]);
  const windowed = await f.runtime.get();
  expect(windowed.responsibilities[0]).not.toHaveProperty("mandate");
  expect(windowed.responsibilities[0]?.branchName).toBe("feat/long-request-0a1b2c3d");
  expect(f.store.get(windowed.responsibilities[0]!.id)?.mandate).toBe(mandate);
  f.database.close();
});
