import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";
import { AgentRunStore } from "../electron/persistence/agent-run-store";
import { AgentAssignmentStore } from "../electron/persistence/agent-assignment-store";
import { createAssignRuntime } from "../electron/host-service/supervision/assign-runtime";
import type { AgentRunStageGrant } from "../electron/providers/agent-run-grants";
import type { BridgeEvent } from "../electron/providers/types";
import { getBuiltinAgent } from "../src/lib/agents/starters";
import { EMPTY_STAGE_FACTS } from "../src/lib/agent-runs/domain";
import { getDefaultModelForProvider } from "../src/lib/providers/model-catalog";
import { resolveDelegationPermissionPolicy } from "../src/lib/runs/delegation-policy";
import { emptyHandoffRecord } from "../src/lib/task-context/handoff-record";
import type { ChatMessage, Task } from "../src/types/chat";

// Two supervised helpers of one parent share the parent's workspace. A tick
// starts both turns at once: the real agent run runtime calls the real
// supervised-turn path into the real `runTask`, over one cached session per
// workspace. Persistence is an in-memory stand-in (better-sqlite3 cannot load
// under Bun); the provider runtime is patched in place and restored.

const WORKSPACE_ID = "ws-shared-helpers";
const WORKSPACE_PATH = "/tmp/stave-shared-helpers/worktree";
const REPOSITORY_PATH = "/tmp/stave-shared-helpers/project";
const PARENT_TASK = "parent-shared-helpers";
const MODEL = getDefaultModelForProvider({ providerId: "claude-code" });

type SavedTurn = { id: string; workspaceId: string; taskId: string; createdAt: string; completedAt: string | null };
const saved = {
  activeTaskId: "",
  tasks: [] as Task[],
  messagesByTask: {} as Record<string, ChatMessage[]>,
  promptDraftByTask: {} as Record<string, unknown>,
  providerSessionByTask: {} as Record<string, unknown>,
};
const turns = new Map<string, SavedTurn>();
/** Runs once inside the next prompt save, while that start still holds the workspace's session. */
let duringPromptSave: (() => void) | null = null;
const streamEvents = new Map<string, Array<{ sequence: number; event: BridgeEvent; eventType: string; truncated: false }>>();

function upsertMessages(taskId: string, messages: ChatMessage[]) {
  const rows = (saved.messagesByTask[taskId] ??= []);
  for (const message of messages) {
    const index = rows.findIndex((row) => row.id === message.id);
    if (index >= 0) rows[index] = message;
    else rows.push(message);
  }
}

function upsertTask(task: Task) {
  saved.tasks = saved.tasks.some((row) => row.id === task.id)
    ? saved.tasks.map((row) => (row.id === task.id ? task : row))
    : [task, ...saved.tasks];
}

const fakeStore = {
  delegationPolicies: { loadSettings: () => null, loadTaskAccounts: () => undefined },
  taskHandoffs: { read: () => emptyHandoffRecord() },
  loadRepositoryRegistry: () => [{
    repositoryPath: REPOSITORY_PATH, repositoryName: "proj", lastOpenedAt: "2026-11-10T00:00:00.000Z", defaultBranch: "main",
    workspaces: [{ id: WORKSPACE_ID, name: "shared", updatedAt: "2026-11-10T00:00:00.000Z" }],
    activeWorkspaceId: WORKSPACE_ID, workspaceBranchById: { [WORKSPACE_ID]: "shared" },
    workspacePathById: { [WORKSPACE_ID]: WORKSPACE_PATH }, workspaceDefaultById: {},
  }],
  loadWorkspaceShell: ({ workspaceId }: { workspaceId: string }) => workspaceId !== WORKSPACE_ID ? null : {
    activeTaskId: saved.activeTaskId, tasks: saved.tasks, promptDraftByTask: saved.promptDraftByTask,
    providerSessionByTask: saved.providerSessionByTask,
    messageCountByTask: Object.fromEntries(Object.entries(saved.messagesByTask).map(([taskId, rows]) => [taskId, rows.length])),
  },
  // As the real store reads the `turns` table: a refreshed session keeps the workspace's running turns.
  listActiveTurnsForWorkspace: ({ workspaceId }: { workspaceId: string }) =>
    [...turns.values()].filter((turn) => turn.workspaceId === workspaceId && !turn.completedAt),
  loadTaskMessagesPage: ({ taskId }: { taskId: string }) => {
    const messages = saved.messagesByTask[taskId] ?? [];
    return { messages, totalCount: messages.length, limit: 120, offset: 0, hasMoreOlder: false };
  },
  listWorkspaceTasks: () => saved.tasks.map((task) => ({ ...task, archivedAt: task.archivedAt ?? null })),
  listTurns: ({ workspaceId, taskId, limit, turnId }: { workspaceId: string; taskId: string; limit?: number; turnId?: string }) =>
    [...turns.values()].filter((turn) => turn.workspaceId === workspaceId && turn.taskId === taskId && (!turnId || turn.id === turnId))
      .reverse().slice(0, limit ?? 5),
  getTurnReceipt: () => null,
  beginTurn: (turn: { id: string; workspaceId: string; taskId: string }) => {
    turns.set(turn.id, { ...turn, createdAt: new Date().toISOString(), completedAt: null });
  },
  completeTurn: ({ id }: { id: string }) => {
    const turn = turns.get(id);
    if (turn) turns.set(id, { ...turn, completedAt: new Date().toISOString() });
  },
  completeInterruptedTurn: () => false,
  saveStreamEvents: ({ turnId, events }: { turnId: string; events: Array<{ sequence: number; event: BridgeEvent }> }) => {
    const rows = streamEvents.get(turnId) ?? [];
    for (const entry of events) if (!rows.some((row) => row.sequence === entry.sequence)) rows.push({ ...entry, eventType: entry.event.type, truncated: false });
    streamEvents.set(turnId, rows);
  },
  getStreamEvents: ({ turnId }: { turnId: string }) => streamEvents.get(turnId) ?? [],
  createNotification: ({ notification }: { notification: unknown }) => ({ inserted: true, notification }),
  persistTaskTurnDelta: (args: { taskId: string; task?: Task; messages: ChatMessage[]; activeTaskId?: string }) => {
    const during = duringPromptSave;
    duringPromptSave = null;
    during?.();
    if (args.task) upsertTask(args.task);
    upsertMessages(args.taskId, args.messages);
    if (args.activeTaskId) saved.activeTaskId = args.activeTaskId;
    return { ok: true, messageCount: saved.messagesByTask[args.taskId]?.length ?? 0 };
  },
  upsertWorkspace: ({ snapshot }: { snapshot: { activeTaskId?: string; tasks?: Task[]; messagesByTask?: Record<string, ChatMessage[]>; promptDraftByTask?: Record<string, unknown> } }) => {
    if (snapshot.tasks) saved.tasks = snapshot.tasks;
    if (snapshot.activeTaskId !== undefined) saved.activeTaskId = snapshot.activeTaskId;
    if (snapshot.promptDraftByTask) saved.promptDraftByTask = snapshot.promptDraftByTask;
    for (const [taskId, messages] of Object.entries(snapshot.messagesByTask ?? {})) upsertMessages(taskId, messages);
  },
  loadAutomationProviderTimeoutMs: () => null,
  listRunAggregatesByOrigin: () => [],
  listRunAggregatesByOwnedTask: () => [],
  saveRepositoryRegistry: () => {},
};

mock.module("electron", () => ({ app: { getPath: () => "/tmp/stave-shared-helpers/user-data" } }));
mock.module("../electron/host-service/persistence", () => ({
  ensureHostServicePersistenceReady: () => fakeStore,
  resetHostServicePersistence: () => {},
  resolveHostServiceUserDataPath: () => "/tmp/stave-shared-helpers/user-data",
}));

const { providerRuntime } = await import("../electron/providers/runtime");
const localMcp = await import("../electron/host-service/local-mcp-runtime");
const { runSupervisedTurn } = await import("../electron/host-service/supervised-turn");
const { createAgentRunRuntime } = await import("../electron/host-service/supervision/agent-run-runtime");
const { prepareDelegatedAgentRun } = await import("../electron/host-service/supervision/delegated-agent-run-host");

const originals = {
  startTurnStream: providerRuntime.startTurnStream,
  abortTurn: providerRuntime.abortTurn,
  cleanupTask: providerRuntime.cleanupTask,
};
const providerTurns: Array<{ turnId: string; taskId: string; onEvent?: (event: BridgeEvent) => void }> = [];
const abortedTurnIds: string[] = [];

beforeAll(() => {
  providerRuntime.startTurnStream = ((params: { turnId: string; taskId: string }, handlers: { onEvent?: (event: BridgeEvent) => void }) => {
    providerTurns.push({ turnId: params.turnId, taskId: params.taskId, onEvent: handlers.onEvent });
    return { ok: true, streamId: `stream-${params.turnId}` };
  }) as unknown as typeof providerRuntime.startTurnStream;
  providerRuntime.abortTurn = (({ turnId }: { turnId: string }) => {
    abortedTurnIds.push(turnId);
    return { ok: true, message: "aborted" };
  }) as typeof providerRuntime.abortTurn;
  providerRuntime.cleanupTask = (() => ({ ok: true, message: "cleaned" })) as typeof providerRuntime.cleanupTask;
});

afterAll(async () => {
  Object.assign(providerRuntime, originals);
  await localMcp.cleanupLocalMcpRuntime();
});

/** Waits for a condition the code under test reaches on its own; fails instead of hanging when it never does. */
async function settle(check: () => boolean | Promise<boolean>, label: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await check()) return;
    await Bun.sleep(5);
  }
  throw new Error(`Never reached: ${label}`);
}

describe("two agent runs in one workspace", () => {
  test("starting at once keeps both turns active and their output, and Stop aborts each provider", async () => {
    const db = new Database(":memory:");
    const runs = new AgentRunStore(db);
    const assignments = createAssignRuntime({ store: new AgentAssignmentStore(db) });
    const grants = new Map<string, AgentRunStageGrant>();
    // The tick reaches both first turn starts before either begins, as two runs evaluated at once do.
    const arrived: Array<() => void> = [];
    const bothArrived = () => arrived.length >= 2 ? Promise.resolve() : new Promise<void>((resolve) => {
      arrived.push(resolve);
      if (arrived.length === 2) for (const go of arrived) go();
    });
    // Provider output and a Stop arrive right after the turns start, before any later read.
    let releaseAfterStart!: () => void;
    const afterStart = new Promise<void>((resolve) => { releaseAfterStart = resolve; });
    const started: string[] = [];
    const runtime = createAgentRunRuntime({
      store: runs,
      delegatedAssignment: assignments.assignmentForTask,
      delegatedExecutionCurrent: () => true,
      getTaskSupervisionSnapshot: localMcp.getTaskSupervisionSnapshot,
      listRecentTurns: (args) => fakeStore.listTurns(args).map((turn) => ({ id: turn.id, createdAt: turn.createdAt, completedAt: turn.completedAt })),
      runSupervisedTurn: async (args) => {
        await bothArrived();
        const result = await runSupervisedTurn(args);
        if (args.agentRunStage) grants.set(result.turnId, { ...args.agentRunStage, turnId: result.turnId, taskId: args.taskId });
        started.push(args.taskId);
        await afterStart;
        return result;
      },
      completeInterruptedTurn: () => false,
      countActiveDelegatedTasks: () => 0,
      isReportingAvailable: async () => true,
      resolveAgentRunGrant: (key) => grants.get(key) ?? null,
      resolveWorkspacePath: async () => WORKSPACE_PATH,
      readHeadSha: async () => "abc1234",
      collectStageFacts: async () => EMPTY_STAGE_FACTS,
      readTurnEnding: () => "completed",
      emitChanged: () => {},
      setInterval: (() => 0) as unknown as typeof globalThis.setInterval,
      clearInterval: () => {},
    });

    const agent = { ...getBuiltinAgent("reviewer")!, workflow: undefined };
    const permissionPolicy = resolveDelegationPermissionPolicy({ providerId: "claude-code", access: "read-only" });
    const helpers = ["a", "b"].map((name) => ({ agentRunId: `run-${name}`, taskId: `helper-${name}`, executionId: `execution-${name}` }));
    for (const helper of helpers) {
      const assignment = assignments.recordTaskAgent({ requestId: `delegated:${helper.executionId}`, taskId: helper.taskId,
        workspaceId: WORKSPACE_ID, repositoryPath: REPOSITORY_PATH, agent, role: "delegate", assignment: "Review the change.",
        providerId: "claude-code", model: MODEL });
      await prepareDelegatedAgentRun({
        runtime, assignmentForTask: assignments.assignmentForTask, createTask: localMcp.createIdleTask,
        start: { agentRunId: helper.agentRunId, workspaceId: WORKSPACE_ID, taskId: helper.taskId, title: `Helper ${helper.taskId}`,
          prompt: "Review the change.", model: MODEL, maxTurns: 5,
          authority: { parentTaskId: PARENT_TASK, executionId: helper.executionId, agentConfigId: assignment.agentConfigId,
            agentContentHash: assignment.agentContentHash, permissionPolicy } },
      });
    }
    for (const helper of helpers) await runtime.activateDelegatedAgentRun({ agentRunId: helper.agentRunId, executionId: helper.executionId });
    await settle(() => started.length === 2, "both turns started");

    // Both turns are the tasks' active turns.
    const turnOf = (taskId: string) => providerTurns.find((turn) => turn.taskId === taskId)!;
    for (const helper of helpers) {
      const status = await localMcp.getTaskStatus({ workspaceId: WORKSPACE_ID, taskId: helper.taskId });
      expect({ taskId: helper.taskId, activeTurnId: status.activeTurnId }).toEqual({ taskId: helper.taskId, activeTurnId: turnOf(helper.taskId).turnId });
    }

    // Each provider's output reaches its own task.
    for (const helper of helpers) turnOf(helper.taskId).onEvent?.({ type: "text", text: `Output of ${helper.taskId}` });
    const outputOf = async (taskId: string) => (await localMcp.getTaskStatus({ workspaceId: WORKSPACE_ID, taskId })).latestAssistantText;
    // One queue applies the workspace's events in order: once B's output is in, A's was handled.
    await settle(async () => (await outputOf("helper-b")) !== null, "the later output applied");
    expect(await Promise.all(helpers.map((helper) => outputOf(helper.taskId)))).toEqual(["Output of helper-a", "Output of helper-b"]);

    // Stop finds each running turn and aborts its provider.
    for (const helper of helpers) {
      expect(await localMcp.stopManagedTaskTurn({ workspaceId: WORKSPACE_ID, taskId: helper.taskId }))
        .toMatchObject({ stopped: true, turnId: turnOf(helper.taskId).turnId });
    }
    expect(abortedTurnIds.sort()).toEqual(helpers.map((helper) => turnOf(helper.taskId).turnId).sort());

    releaseAfterStart();
    await runtime.whenIdle();
    runtime.stop();
  });

  test("a supervision read while a start saves its prompt keeps that start's turn", async () => {
    // The read refreshes from saved rows, where the starting turn is not yet.
    const { taskId } = await localMcp.createIdleTask({ workspaceId: WORKSPACE_ID, title: "Read during start", provider: "claude-code", model: MODEL });
    const { taskId: otherTaskId } = await localMcp.createIdleTask({ workspaceId: WORKSPACE_ID, title: "Other run", provider: "claude-code", model: MODEL });
    let read: ReturnType<typeof localMcp.getTaskSupervisionSnapshot> | null = null;
    duringPromptSave = () => { read = localMcp.getTaskSupervisionSnapshot({ workspaceId: WORKSPACE_ID, taskId: otherTaskId }); };
    const result = await localMcp.runTask({ workspaceId: WORKSPACE_ID, taskId, prompt: "Start while another run reads." });
    expect(read).not.toBeNull();
    expect((await read!).exists).toBe(true);
    expect((await localMcp.getTaskStatus({ workspaceId: WORKSPACE_ID, taskId })).activeTurnId).toBe(result.turnId);
  });
});
