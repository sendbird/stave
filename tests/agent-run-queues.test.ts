import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  createAgentRunRuntime,
  type AgentRunRuntimeDependencies,
  type AgentRunTurnRow,
} from "../electron/host-service/supervision/agent-run-runtime";
import { createRunOperationQueues } from "../electron/host-service/supervision/run-operation-queues";
import { AgentRunStore } from "../electron/persistence/agent-run-store";
import type { AgentRunStageGrant } from "../electron/providers/agent-run-grants";
import { buildAgentRunStartInput } from "../src/lib/agent-runs/agent-run";
import { createAgentRun, currentStageRecord, EMPTY_STAGE_FACTS, type AgentRunStartInput } from "../src/lib/agent-runs/domain";
import { AdaptiveRunPolicySchema } from "../src/lib/agent-runs/resources";
import { WorkflowSchema, type WorkflowStage } from "../src/lib/workflows/schema";

const START = "2026-11-10T09:00:00.000Z";

const DRAFT: WorkflowStage = { id: "draft", title: "Draft", kind: "ai", instruction: "Draft the change.", doneWhen: "The change is drafted." };
const POLISH: WorkflowStage = { id: "polish", title: "Polish", kind: "ai", instruction: "Polish the change.", doneWhen: "The change is polished." };

function startInput(leadTaskId: string): AgentRunStartInput {
  return {
    workspaceId: "ws-1",
    leadTaskId,
    workflow: WorkflowSchema.parse({ version: 1, id: "workflow_queues", name: "Queues", purpose: "Carry the assignment to a verified change.",
      checkIns: "when-stuck", team: "solo", stages: [DRAFT, POLISH], createdAt: START, updatedAt: START }),
    assignment: `Fix ${leadTaskId}.`,
    consent: { checkIns: "when-stuck", permissionMode: "guided", authorizedEffectStageIds: [] },
  };
}

const COMPLETE = { summary: "Drafted.", decisions: [], evidence: [{ label: "Tests pass", kind: "check" as const, command: "bun test" }], artifacts: [] };

/**
 * The real runtime over the real store, with several tasks. A task's snapshot
 * read waits while that task is held, as a slow session read does.
 */
function createHarness(extra: Partial<AgentRunRuntimeDependencies> = {}, store = new AgentRunStore(new Database(":memory:"))) {
  let clock = new Date(START);
  const turnsByTask = new Map<string, AgentRunTurnRow[]>();
  const turnsOf = (taskId: string) => turnsByTask.get(taskId) ?? turnsByTask.set(taskId, []).get(taskId)!;
  const grants = new Map<string, AgentRunStageGrant>();
  const runCalls: Array<Parameters<AgentRunRuntimeDependencies["runSupervisedTurn"]>[0]> = [];
  /** What happened, in order: turns started and run states announced. */
  const log: string[] = [];
  const gates = new Map<string, Promise<void>>();
  /** The task of every snapshot read, in the order they began. */
  const reads: string[] = [];
  let counter = 0;
  const runtime = createAgentRunRuntime({
    store,
    getTaskSupervisionSnapshot: async ({ workspaceId, taskId }) => {
      reads.push(taskId);
      await gates.get(taskId);
      return { workspaceId, taskId, repositoryPath: "/tmp/repo", exists: true, archived: false, providerId: "claude-code", model: "sonnet",
        activeTurnId: turnsOf(taskId).find((row) => !row.completedAt)?.id ?? null, pendingApprovalCount: 0, pendingUserInputCount: 0 };
    },
    listRecentTurns: ({ taskId }) => turnsOf(taskId).slice(0, 20),
    runSupervisedTurn: async (args) => {
      runCalls.push(args);
      const turnId = args.turnId ?? `turn-${++counter}`;
      clock = new Date(clock.getTime() + 1_000);
      turnsOf(args.taskId).unshift({ id: turnId, createdAt: clock.toISOString(), completedAt: null });
      if (args.agentRunStage) grants.set(`key-${turnId}`, { ...args.agentRunStage, turnId, taskId: args.taskId });
      log.push(`turn:${args.taskId}:${args.agentRunStage ? args.agentRunStage.stageId : args.prompt}`);
      return { turnId };
    },
    completeInterruptedTurn: () => false,
    countActiveDelegatedTasks: () => 0,
    isReportingAvailable: async () => true,
    resolveAgentRunGrant: (key) => grants.get(key) ?? null,
    resolveWorkspacePath: async () => "/tmp/repo-ws",
    readHeadSha: async () => "abc1234",
    collectStageFacts: async () => EMPTY_STAGE_FACTS,
    emitChanged: (event) => { log.push(`${event.leadTaskId}:${event.state}`); },
    now: () => clock,
    setInterval: (() => 0) as unknown as typeof globalThis.setInterval,
    clearInterval: () => {},
    ...extra,
  });
  return {
    store, runtime, runCalls, log, reads, grants,
    /** Holds every snapshot read of the task until the returned release is called. */
    hold: (taskId: string) => {
      let release!: () => void;
      gates.set(taskId, new Promise<void>((resolve) => { release = resolve; }));
      return () => { gates.delete(taskId); release(); };
    },
    endTurn: (taskId: string) => {
      clock = new Date(clock.getTime() + 1_000);
      for (const row of turnsOf(taskId)) row.completedAt ??= clock.toISOString();
    },
    turnKey: (taskId: string) => `key-${turnsOf(taskId)[0]!.id}`,
    current: (agentRunId: string) => currentStageRecord(store.getAggregate(agentRunId)!),
    state: (agentRunId: string) => store.getAggregate(agentRunId)!.agentRun.state,
  };
}

/** Waits for a condition the code under test reaches on its own; fails instead of hanging when it never does. */
async function settle(check: () => boolean, label: string) {
  for (let attempt = 0; attempt < 200 && !check(); attempt += 1) await Bun.sleep(5);
  if (!check()) throw new Error(`Never reached: ${label}`);
}

/** Resolves with the operation's result, or fails when it is still waiting after a second. */
async function within<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Still waiting: ${label}`)), 1_000); });
  try { return await Promise.race([promise, late]); } finally { clearTimeout(timer); }
}

describe("per-run operation queues", () => {
  test.each(["reply", "start"] as const)("a %s held on run A delays none of run B's tick, reply or control, nor another start", async (held) => {
    const h = createHarness();
    // Run B waits on the turn it reported from; its next tick moves it to Polish.
    const b = (await h.runtime.startAgentRun(startInput("task-b"))).agentRun.id;
    let a: string | null = null;
    if (held === "reply") a = (await h.runtime.startAgentRun(startInput("task-a"))).agentRun.id;
    await h.runtime.requestTick();
    await h.runtime.reportStage({ agentRunKey: h.turnKey("task-b"), report: COMPLETE });
    h.endTurn("task-b");
    if (a) h.endTurn("task-a");

    const release = h.hold("task-a");
    const readsBefore = h.reads.length;
    const logBefore = h.log.length;
    const blocked = held === "reply"
      ? h.runtime.replyAsUser({ agentRunId: a!, prompt: "Use the cached index." })
      : h.runtime.startAgentRun(startInput("task-a"));
    await settle(() => h.reads.slice(readsBefore).includes("task-a"), "run A's held read");

    // B's tick runs while A's read is held: its draft completes and Polish starts.
    void h.runtime.requestTick();
    await settle(() => h.current(b).stageId === "polish" && h.log.includes("turn:task-b:polish"), "run B's tick");
    h.endTurn("task-b");
    // A reply to B and a control on B land at once.
    await within(h.runtime.replyAsUser({ agentRunId: b, prompt: "Keep the public API." }), "run B's reply");
    expect(h.log).toContain("turn:task-b:Keep the public API.");
    expect((await within(h.runtime.pause({ agentRunId: b }), "run B's pause")).agentRun.state).toBe("paused");
    // So does another task's start.
    const c = await within(h.runtime.startAgentRun(startInput("task-c")), "run C's start");
    expect(h.store.getActiveAgentRunForTask("task-c")?.id).toBe(c.agentRun.id);
    // Nothing of A happened while its read was held.
    expect(h.log.slice(logBefore).some((line) => line.startsWith("turn:task-a") || line.startsWith("task-a:"))).toBe(false);

    release();
    await blocked;
    await h.runtime.whenIdle();
    if (held === "reply") expect(h.log).toContain("turn:task-a:Use the cached index.");
    else expect(h.store.getActiveAgentRunForTask("task-a")).not.toBeNull();
    h.runtime.stop();
  });

  test("operations on one run keep their order while it waits", async () => {
    const h = createHarness();
    const a = (await h.runtime.startAgentRun(startInput("task-a"))).agentRun.id;
    await h.runtime.requestTick();
    h.endTurn("task-a");
    const release = h.hold("task-a");
    const reply = h.runtime.replyAsUser({ agentRunId: a, prompt: "First words." });
    const paused = h.runtime.pause({ agentRunId: a });
    const resumed = h.runtime.resume({ agentRunId: a });
    await settle(() => h.reads.includes("task-a"), "the reply's read");
    await Bun.sleep(20);
    // The pause and resume wait behind the reply on the same run.
    expect(h.state(a)).toBe("running");
    expect(h.log).not.toContain("turn:task-a:First words.");
    release();
    await Promise.all([reply, paused, resumed]);
    const order = h.log.filter((line) => line === "turn:task-a:First words." || line === "task-a:paused" || line === "task-a:running");
    expect(order.slice(-3)).toEqual(["turn:task-a:First words.", "task-a:paused", "task-a:running"]);
    h.runtime.stop();
  });

  test("starts of different tasks run together, and the same task starts once with a consistent ledger", async () => {
    const h = createHarness();
    const releaseA = h.hold("task-a");
    const releaseB = h.hold("task-b");
    const startA = h.runtime.startAgentRun(startInput("task-a"));
    const startB = h.runtime.startAgentRun(startInput("task-b"));
    const secondA = h.runtime.startAgentRun(startInput("task-a"));
    // Both admissions are in flight at once; neither waits for the other's read.
    await settle(() => h.reads.includes("task-a") && h.reads.includes("task-b"), "both admissions reading");
    // The second start of task A waits for the first instead of reading beside it.
    expect(h.reads.filter((taskId) => taskId === "task-a")).toHaveLength(1);
    releaseB();
    const runB = await startB;
    releaseA();
    const runA = await startA;
    await expect(secondA).rejects.toThrow("already has an active run");
    await h.runtime.requestTick();
    await h.runtime.whenIdle();

    const active = h.store.listActiveAgentRuns();
    expect(active.map((run) => run.leadTaskId).sort()).toEqual(["task-a", "task-b"]);
    expect(active.map((run) => run.id).sort()).toEqual([runA.agentRun.id, runB.agentRun.id].sort());
    for (const run of active) {
      expect(h.store.listEventsByKind(run.id, ["agent-run-started"])).toHaveLength(1);
      expect(h.store.listEventsByKind(run.id, ["turn-started"])).toHaveLength(1);
      expect(h.store.listEventsByKind(run.id, ["turn-linked"])).toHaveLength(1);
      expect(h.store.getAggregate(run.id)!.agentRun.turnCount).toBe(1);
    }
    expect(h.runCalls.map((call) => call.taskId).sort()).toEqual(["task-a", "task-b"]);
    h.runtime.stop();
  });

  test("a helper's budget entry on the root's log during the root's turn preparation does not cancel that turn; the root's own event does", async () => {
    const policy = AdaptiveRunPolicySchema.parse({ version: 1, profile: "balanced", providerId: "codex", allowedModels: ["gpt-6.1-sol"], modelLocked: false,
      effortLocked: false, initialEffort: "medium", teamTurns: 30, concurrentHelpers: 2, totalHelpers: 4, parentReserve: 1, maxChanges: 2, cooldownTurns: 2 });
    for (const landed of ["helper-budget", "own-event"] as const) {
      const store = new AgentRunStore(new Database(":memory:"));
      const now = new Date(START);
      const root = createAgentRun({ id: "root", input: buildAgentRunStartInput({ workspaceId: "ws-1", taskId: "task-root", agent: { name: "Agent" }, assignment: "Integrate", now }),
        repositoryPath: "/tmp/repo", fingerprint: { providerId: "codex", model: "gpt-6.1-sol" }, now });
      Object.assign(root.events[0]!, { idempotencyKey: "root:start", detail: { ...root.events[0]!.detail, resources: policy } });
      store.create(root, now);
      const helper = store.reserveChildResources({ parentTaskId: "task-root", expectedRootRunId: "root", childRunId: "helper", executionId: "e-helper", requestedTurns: 2, now })!;
      let releasePreparation!: () => void;
      let preparing!: () => void;
      const preparation = new Promise<void>((resolve) => { preparing = resolve; });
      const h = createHarness({ readHeadSha: async () => { preparing(); await new Promise<void>((resolve) => { releasePreparation = resolve; }); return "abc1234"; } }, store);
      const tick = h.runtime.requestTick();
      await preparation;
      if (landed === "helper-budget") store.releaseResourceReservation(helper.link, now);
      else store.recordEvent("root", { kind: "user-turn", idempotencyKey: "root:user-turn:typed", detail: { turnId: "typed" } }, now);
      releasePreparation();
      await tick;
      expect(h.runCalls.filter((call) => call.taskId === "task-root")).toHaveLength(landed === "helper-budget" ? 1 : 0);
      h.runtime.stop();
    }
  });
});

describe("run operation queues", () => {
  test("an operation naming two keys waits for both, and later operations on either wait for it", async () => {
    const queues = createRunOperationQueues();
    const order: string[] = [];
    let releaseA!: () => void;
    const a = queues.enqueue("a", () => new Promise<void>((resolve) => { releaseA = () => { order.push("a"); resolve(); }; }));
    const b = queues.enqueue("b", () => { order.push("b"); });
    const both = queues.enqueue(["a", "b"], () => { order.push("both"); });
    const laterB = queues.enqueue("b", () => { order.push("later-b"); });
    const other = queues.enqueue("c", () => { order.push("c"); });
    await Promise.all([b, other]);
    // B's own operation and an unrelated key ran; the shared one waits for A.
    expect(order).toEqual(["b", "c"]);
    releaseA();
    await Promise.all([a, both, laterB]);
    expect(order).toEqual(["b", "c", "a", "both", "later-b"]);
    await queues.drain();
  });
});
