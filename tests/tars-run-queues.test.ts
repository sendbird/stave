import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { createAgentRunRuntime, type AgentRunRuntime, type AgentRunTurnRow } from "../electron/host-service/supervision/agent-run-runtime";
import type { TaskSupervisionSnapshot } from "../electron/host-service/local-mcp-runtime";
import { createTarsRuntime } from "../electron/host-service/tars-runtime";
import { actTars } from "../electron/host-service/tars-control";
import { applyTarsDecision } from "../electron/host-service/tars-decisions";
import { TarsRunEndedError, TarsTaskBusyError } from "../electron/host-service/tars-ownership";
import { AgentRunStore } from "../electron/persistence/agent-run-store";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import type { AgentRunStageGrant } from "../electron/providers/agent-run-grants";
import { currentStageRecord, EMPTY_STAGE_FACTS, type AgentRun } from "../src/lib/agent-runs/domain";
import { tarsConfirmationRequestId } from "../src/lib/tars/conversation";
import type { TarsResponsibility } from "../src/lib/tars/types";
import { WorkflowSchema } from "../src/lib/workflows/schema";

const NOW = "2026-11-10T09:00:00.000Z";
const closers: Array<() => void> = [];
afterEach(() => { for (const close of closers.splice(0).reverse()) close(); });

/**
 * Tars over the real AgentRun runtime and stores: two works, each owning its
 * own run and task. Queued words reach a run through the same reply path the
 * host uses (`deliverMessage` → `replyAsUser`), and every task read goes
 * through one reader that can hold one task, as a slow session read does.
 */
function fixture() {
  const runDatabase = new Database(":memory:");
  const tarsDatabase = new Database(":memory:");
  closers.push(() => { runDatabase.close(); tarsDatabase.close(); });
  const runs = new AgentRunStore(runDatabase);
  const store = new TarsStore(tarsDatabase);
  const conversations = new TarsConversationStore(tarsDatabase);
  let clock = Date.parse(NOW);
  const turnsByTask = new Map<string, AgentRunTurnRow[]>();
  const turnsOf = (taskId: string) => turnsByTask.get(taskId) ?? turnsByTask.set(taskId, []).get(taskId)!;
  const grants = new Map<string, AgentRunStageGrant>();
  const said: string[] = [];
  const gates = new Map<string, Promise<void>>();
  const reads: string[] = [];
  let counter = 0;

  async function readTask(taskId: string): Promise<TaskSupervisionSnapshot> {
    reads.push(taskId);
    await gates.get(taskId);
    return { workspaceId: "ws-1", taskId, repositoryPath: "/tmp/repo", exists: true, archived: false, providerId: "codex", model: "test-model",
      activeTurnId: turnsOf(taskId).find((row) => !row.completedAt)?.id ?? null, pendingApprovalCount: 0, pendingUserInputCount: 0 };
  }

  let agentRuns!: AgentRunRuntime;
  agentRuns = createAgentRunRuntime({
    store: runs,
    getTaskSupervisionSnapshot: ({ taskId }) => readTask(taskId),
    listRecentTurns: ({ taskId }) => turnsOf(taskId).slice(0, 20),
    runSupervisedTurn: async (args) => {
      const turnId = args.turnId ?? `turn-${++counter}`;
      clock += 1_000;
      turnsOf(args.taskId).unshift({ id: turnId, createdAt: new Date(clock).toISOString(), completedAt: null });
      if (args.agentRunStage) grants.set(`key-${turnId}`, { ...args.agentRunStage, turnId, taskId: args.taskId });
      // A plain turn on the lead task is the user's reply; provider admission links it to the run's stage.
      else { said.push(`${args.taskId}: ${args.prompt}`); agentRuns.prepareUserTurn({ taskId: args.taskId, workspaceId: args.workspaceId, turnId }); }
      return { turnId };
    },
    completeInterruptedTurn: () => false,
    countActiveDelegatedTasks: () => 0,
    isReportingAvailable: async () => true,
    resolveAgentRunGrant: (key) => grants.get(key) ?? null,
    resolveWorkspacePath: async () => "/tmp/repo-ws",
    readHeadSha: async () => "abc1234",
    collectStageFacts: async () => EMPTY_STAGE_FACTS,
    now: () => new Date(clock),
    setInterval: (() => 0) as unknown as typeof globalThis.setInterval,
    clearInterval: () => {},
  });
  closers.push(() => agentRuns.stop());

  /** As the host's guard: the run is still this work's. */
  const guardFor = (row: TarsResponsibility) => (run: AgentRun) => {
    if (run.id !== row.agentRunId) throw new Error("This task's execution ownership changed.");
  };
  const tars = createTarsRuntime({
    store, now: () => NOW, validateScope: async () => {}, prepareWorkspace: async () => "ws-1", prepareTask: async () => {},
    findRun: async (row) => row.agentRunId ?? null, startRun: async () => { throw new Error("not used"); },
    observe: async () => ({ state: "running", detail: null, activeStage: "draft#1" }), controlRun: async () => {},
    async respondTask(row, request, options) {
      const task = await readTask(row.taskId!);
      if (task.activeTurnId || options?.queueBehind) { if (options?.canQueue) return "queued"; throw new TarsTaskBusyError(); }
      await agentRuns.replyAsUser({ agentRunId: row.agentRunId!, prompt: request.input!.text! }, guardFor(row));
    },
    messages: conversations,
    async deliverMessage(row, text, turnId) {
      const run = runs.getLatestAgentRunForTask(row.taskId!);
      if (!run || run.id !== row.agentRunId) throw new Error("This task's execution ownership changed.");
      if (run.state === "completed" || run.state === "cancelled" || run.state === "stopped") throw new TarsRunEndedError();
      const task = await readTask(row.taskId!);
      if (task.activeTurnId || task.pendingApprovalCount || task.pendingUserInputCount) return "busy";
      const aggregate = runs.getAggregate(run.id)!;
      if (aggregate.agentRun.state !== "running" || !["running", "blocked", "stuck"].includes(currentStageRecord(aggregate).status)) return "busy";
      await agentRuns.replyAsUser({ agentRunId: run.id, prompt: text, turnId }, guardFor(row));
      return "sent";
    },
    hasUserTurn: (agentRunId, turnId) => runs.hasUserTurn(agentRunId, turnId),
  });
  closers.push(() => tars.stop());

  /** A work Tars owns, with its run started on its own task. */
  async function work(name: string) {
    const taskId = `task-${name}`;
    const started = await agentRuns.startAgentRun({ workspaceId: "ws-1", leadTaskId: taskId, origin: "agent", assignment: `Fix ${name}.`,
      workflow: WorkflowSchema.parse({ version: 1, id: `workflow_${name}`, name: "Work", purpose: "Carry the assignment to a verified change.",
        checkIns: "when-stuck", team: "solo", stages: [{ id: "draft", title: "Draft", kind: "ai", instruction: "Draft it.", doneWhen: "Drafted." }],
        createdAt: NOW, updatedAt: NOW }),
      consent: { checkIns: "when-stuck", permissionMode: "auto", authorizedEffectStageIds: [] } });
    const created = store.create({ requestId: `request-${name}`, title: `Work ${name}`, instruction: `Fix ${name}.`, acceptanceCriteria: ["Done"],
      workspaceId: "source", repositoryPath: "/tmp/repo", providerId: "codex" }, NOW);
    return store.patch(created.id, created.revision, { state: "running", taskId, executionWorkspaceId: "ws-1",
      agentRunId: started.agentRun.id, activeStage: "draft#1" }, NOW);
  }

  let messages = 0;
  /** The user asks Tars to tell a work's run something and confirms the card. */
  async function tell(row: TarsResponsibility, text: string) {
    conversations.configure({ providerId: "codex", model: "test-model", maxTurns: 6 });
    const queued = conversations.create({ requestId: `message-${messages++}`, text: `Tell it: ${text}` }, NOW);
    const claimed = conversations.claim(queued.id, queued.revision, NOW);
    const revision = store.get(row.id)!.revision;
    const message = conversations.answer(claimed.id, claimed.revision, { reply: "Confirm on the card.",
      actions: [{ kind: "control", responsibilityId: row.id, expectedRevision: revision, operation: "message", input: { text } }] }, NOW);
    await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, {
      conversations, responsibilities: store, readRegistry: () => [], now: () => NOW, requestTick: () => tars.requestTick(), control: tars.act });
    const { record } = await actTars({ requestId: tarsConfirmationRequestId(message.id, 0), responsibilityId: row.id, expectedRevision: revision,
      operation: "message", source: "click" }, { conversations, runtime: tars, now: () => NOW });
    await tars.drain();
    return record.requestId;
  }

  return {
    runs, agentRuns, tars, conversations, said, reads, grants, work, tell,
    hold: (taskId: string) => {
      let release!: () => void;
      gates.set(taskId, new Promise<void>((resolve) => { release = resolve; }));
      return () => { gates.delete(taskId); release(); };
    },
    endTurn: (taskId: string) => { clock += 1_000; for (const row of turnsOf(taskId)) row.completedAt ??= new Date(clock).toISOString(); },
    turnKey: (taskId: string) => `key-${turnsOf(taskId)[0]!.id}`,
    delivery: (requestId: string) => conversations.getAction(requestId)?.delivery?.status,
  };
}

async function settle(check: () => boolean, label: string) {
  for (let attempt = 0; attempt < 200 && !check(); attempt += 1) await Bun.sleep(5);
  if (!check()) throw new Error(`Never reached: ${label}`);
}

test("words kept for two works reach their runs independently while one work's run is slow", async () => {
  const f = fixture();
  const a = await f.work("a");
  const b = await f.work("b");
  // Both runs start their stage turn, so both tasks are busy and the words are kept.
  await f.agentRuns.requestTick();
  const forA = await f.tell(a, "Use the cached index.");
  const forB = await f.tell(b, "Keep the public API.");
  expect([f.delivery(forA), f.delivery(forB)]).toEqual(["queued", "queued"]);
  // Each stage stops for the user and its turn ends, so either run can take a reply.
  for (const taskId of ["task-a", "task-b"]) {
    await f.agentRuns.blockStage({ agentRunKey: f.turnKey(taskId), block: { missing: "Choose the index", kind: "input" } });
    f.endTurn(taskId);
  }
  await f.agentRuns.requestTick();

  // Run A's tick is slow: its task read does not come back.
  const release = f.hold("task-a");
  const readsBefore = f.reads.length;
  const slowTick = f.agentRuns.requestTick();
  await settle(() => f.reads.slice(readsBefore).includes("task-a"), "run A's held read");

  // Tars says both works' words; B's reach its run while A's run is still held.
  f.tars.requestTick();
  await settle(() => f.delivery(forB) === "delivered", "work B's words delivered");
  expect(f.said).toEqual(["task-b: Keep the public API."]);
  expect(f.delivery(forA)).not.toBe("delivered");

  release();
  await slowTick;
  await f.tars.drain();
  await f.agentRuns.whenIdle();
  await settle(() => f.delivery(forA) === "delivered", "work A's words delivered");
  // Each said exactly once, as its own run's user turn.
  expect(f.said.sort()).toEqual(["task-a: Use the cached index.", "task-b: Keep the public API."]);
  expect(f.runs.listEventsByKind(a.agentRunId!, ["user-turn"])).toHaveLength(1);
  expect(f.runs.listEventsByKind(b.agentRunId!, ["user-turn"])).toHaveLength(1);
  for (let tick = 0; tick < 2; tick++) { f.tars.requestTick(); await f.tars.drain(); }
  expect(f.said).toHaveLength(2);
});
