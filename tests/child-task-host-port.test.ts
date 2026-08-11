import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import {
  createChildTaskCoordinator,
  type ChildTaskLedgerPort,
} from "../electron/main/runs/child-task-coordinator";
import {
  createChildTaskHostPort,
  type ChildTaskTurnUpdate,
} from "../electron/main/runs/child-task-host-port";
import type { ChildTaskDelegateArgs } from "../src/lib/runs/child-task";

/**
 * The production adapter between the coordinator and the task machinery. The
 * point under test: the MCP `run-task` action resolves at turn *start*, but a
 * delegation must settle at the turn's *end* — so the adapter has to hold
 * `runTask` open for the whole child turn. These tests drive the adapter over
 * a fake turn feed and assert through the coordinator's durable ledger rows,
 * which is where a premature settle would be visible.
 */

const PROJECT_PATH = "/tmp/stave";
const PARENT_WORKSPACE = "workspace-parent";
const PARENT_TASK = "parent-task-1";
const STOP_NOTICE = "Managed run stopped from Stave before completion.";

interface FakeTurn {
  workspaceId: string;
  taskId: string;
  turnId: string;
  completedAt: string | null;
  error: string | null;
}

/** A miniature host: tasks, turns, and the persisted turn-update feed. */
function createFakeTaskBackend() {
  const listeners = new Set<(update: ChildTaskTurnUpdate) => void>();
  const turnsByTask = new Map<string, FakeTurn[]>();
  const knownTaskIds = new Set<string>([PARENT_TASK]);
  const stopTaskCalls: Array<{ workspaceId: string; taskId: string }> = [];
  const startedTurns: FakeTurn[] = [];
  let turnCounter = 0;

  const latestTurn = (taskId: string) => turnsByTask.get(taskId)?.at(-1) ?? null;
  const activeTurn = (taskId: string) => {
    const turn = latestTurn(taskId);
    return turn && !turn.completedAt ? turn : null;
  };

  const endTurn = (turn: FakeTurn, error: string | null) => {
    turn.completedAt = new Date().toISOString();
    turn.error = error;
    for (const listener of [...listeners]) {
      listener({
        workspaceId: turn.workspaceId,
        taskId: turn.taskId,
        turnId: turn.turnId,
        done: true,
      });
    }
  };

  return {
    stopTaskCalls,
    startedTurns,
    /** Resolves once the adapter has actually started turn N (1-based). */
    async waitForTurnStart(count: number) {
      for (let attempt = 0; attempt < 50 && startedTurns.length < count; attempt += 1) {
        await Bun.sleep(0);
      }
      if (startedTurns.length < count) {
        throw new Error(`turn ${count} never started`);
      }
      return startedTurns[count - 1]!;
    },
    endTurn(turnId: string, options: { error?: string | null } = {}) {
      const turn = startedTurns.find((candidate) => candidate.turnId === turnId);
      if (!turn || turn.completedAt) {
        throw new Error(`no active turn ${turnId}`);
      }
      endTurn(turn, options.error ?? null);
    },

    // ── ChildTaskHostPortDependencies ─────────────────────────────────────
    listKnownProjects: async () => [
      {
        projectPath: PROJECT_PATH,
        workspaces: [
          {
            id: PARENT_WORKSPACE,
            path: `${PROJECT_PATH}/.stave/workspaces/parent`,
          },
        ],
      },
    ],
    createWorkspace: async (args: { projectPath: string; name: string }) => ({
      workspaceId: `workspace-${args.name}`,
      workspacePath: `${args.projectPath}/.stave/workspaces/${args.name}`,
      projectPath: args.projectPath,
    }),
    getTaskStatus: async (args: { workspaceId: string; taskId: string }) => {
      if (!knownTaskIds.has(args.taskId)) {
        throw new Error(`Task not found: ${args.taskId}`);
      }
      const latest = latestTurn(args.taskId);
      return {
        activeTurnId: activeTurn(args.taskId)?.turnId ?? null,
        latestTurnId: latest?.turnId ?? null,
        latestTurnCompletedAt: latest?.completedAt ?? null,
        latestTurnError: latest?.error ?? null,
      };
    },
    startTaskTurn: async (args: { workspaceId: string; taskId: string }) => {
      if (activeTurn(args.taskId)) {
        throw new Error(`Task already has an active turn: ${args.taskId}`);
      }
      knownTaskIds.add(args.taskId);
      turnCounter += 1;
      const turn: FakeTurn = {
        workspaceId: args.workspaceId,
        taskId: args.taskId,
        turnId: `turn-${turnCounter}`,
        completedAt: null,
        error: null,
      };
      const turns = turnsByTask.get(args.taskId) ?? [];
      turns.push(turn);
      turnsByTask.set(args.taskId, turns);
      startedTurns.push(turn);
      return { turnId: turn.turnId };
    },
    stopTask: async (args: { workspaceId: string; taskId: string }) => {
      stopTaskCalls.push({ ...args });
      const turn = activeTurn(args.taskId);
      if (turn) {
        endTurn(turn, STOP_NOTICE);
      }
      return { stopped: Boolean(turn) };
    },
    releaseTaskParent: async (_args: {
      workspaceId: string;
      taskId: string;
    }) => ({ released: true }),
    subscribeTaskTurnUpdated: (
      listener: (update: ChildTaskTurnUpdate) => void,
    ) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function createLedgerPort(store: RunLedgerStore): ChildTaskLedgerPort {
  return {
    getRunAggregate: (args) => store.getAggregate(args),
    claimRunStep: (args) => store.claimStep(args),
    markRunStepWaiting: (args) => store.markStepWaiting(args),
    completeRunStep: (args) => store.completeStep(args),
    failRunStep: (args) => store.failStep(args),
    cancelRunStep: (args) => store.cancelStep(args),
    interruptRunStep: (args) => store.interruptStep(args),
    setRunStepTarget: (args) => store.setStepTarget(args),
    listRunReceipts: (args) => store.listReceipts(args),
    listRunAggregatesByOrigin: (args) => store.listAggregatesByOrigin(args),
    listActiveRunAggregatesByStepKind: (args) =>
      store.listActiveAggregatesByStepKind(args),
    listRunAggregatesByOwnedTask: (args) =>
      store.listAggregatesByOwnedTask(args),
  };
}

function createHarness() {
  const store = new RunLedgerStore(new Database(":memory:"));
  const backend = createFakeTaskBackend();
  let clock = 0;
  const coordinator = createChildTaskCoordinator({
    getLedger: () => createLedgerPort(store),
    host: createChildTaskHostPort({
      ...backend,
      // Fast poll so the poll backstop cannot slow a test down; the event
      // feed is still what settles these tests.
      pollIntervalMs: 20,
    }),
    concurrencyLimit: 3,
    now: () => new Date(Date.UTC(2026, 7, 10, 0, 0, clock++)).toISOString(),
    createExecutionId: () => `execution-${clock}`,
  });
  return { store, backend, coordinator };
}

function delegateArgs(
  overrides: Partial<ChildTaskDelegateArgs> = {},
): ChildTaskDelegateArgs {
  return {
    projectPath: PROJECT_PATH,
    parentWorkspaceId: PARENT_WORKSPACE,
    parentTaskId: PARENT_TASK,
    delegationKey: "review-docs",
    prompt: "Review the docs.",
    providerId: "codex",
    permissionProfile: "guided",
    lifecycle: "one-turn",
    workspace: { mode: "same-workspace" },
    retry: false,
    ...overrides,
  };
}

async function getChild(
  coordinator: ReturnType<typeof createHarness>["coordinator"],
  delegationKey = "review-docs",
) {
  const child = await coordinator.get({
    parentTaskId: PARENT_TASK,
    delegationKey,
  });
  if (!child) {
    throw new Error("expected a delegated child");
  }
  return child;
}

describe("child task host port", () => {
  test("a one-turn delegation settles only after the child's turn ends", async () => {
    const harness = createHarness();
    const response = await harness.coordinator.delegate(delegateArgs());
    expect(response.accepted).toBe(true);

    // The turn has started (the MCP call has resolved) but has not ended:
    // the delegation must still be running, not completed.
    const turn = await harness.backend.waitForTurnStart(1);
    expect((await getChild(harness.coordinator)).phase).toBe("running");

    harness.backend.endTurn(turn.turnId);
    await harness.coordinator.waitForInFlight();

    const settled = await getChild(harness.coordinator);
    expect(settled.phase).toBe("completed");
    expect(settled.childTurnId).toBe(turn.turnId);
  });

  test("a detached delegation parks waiting only after the turn ends", async () => {
    const harness = createHarness();
    await harness.coordinator.delegate(
      delegateArgs({ lifecycle: "detached" }),
    );
    const turn = await harness.backend.waitForTurnStart(1);
    expect((await getChild(harness.coordinator)).phase).toBe("running");

    harness.backend.endTurn(turn.turnId);
    await harness.coordinator.waitForInFlight();
    expect((await getChild(harness.coordinator)).phase).toBe("waiting");
  });

  test("stop during the running turn stops the child task and never records failed", async () => {
    const harness = createHarness();
    await harness.coordinator.delegate(delegateArgs());
    await harness.backend.waitForTurnStart(1);

    const stopped = await harness.coordinator.stop({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
    });
    await harness.coordinator.waitForInFlight();

    expect(stopped.accepted).toBe(true);
    // The child task was really asked to stop — the durable cancel is not
    // allowed to leave a ghost provider turn running.
    expect(harness.backend.stopTaskCalls).toHaveLength(1);
    const settled = await getChild(harness.coordinator);
    expect(settled.phase).toBe("cancelled");
    const receipts = harness.store.listReceipts({ runId: settled.runId });
    expect(
      receipts.filter((receipt) => receipt.type === "failed"),
    ).toHaveLength(0);
  });

  test("a follow-up during the active turn is refused without a terminal failed row", async () => {
    const harness = createHarness();
    await harness.coordinator.delegate(
      delegateArgs({ lifecycle: "detached" }),
    );
    const firstTurn = await harness.backend.waitForTurnStart(1);
    harness.backend.endTurn(firstTurn.turnId);
    await harness.coordinator.waitForInFlight();
    const parked = await getChild(harness.coordinator);
    expect(parked.phase).toBe("waiting");

    // Follow-ups carry the identity the control was rendered against
    // (identity freeze): omitting `expected` is an invalid request, not a
    // permissive default.
    const identityOf = (child: typeof parked) => ({
      childTaskId: child.childTaskId!,
      childWorkspaceId: child.childWorkspaceId!,
      attempt: child.attempt,
    });

    // First follow-up: starts a real turn that keeps running.
    const followedUp = await harness.coordinator.followUp({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
      prompt: "One more pass, please.",
      permissionProfile: "guided",
      expected: identityOf(parked),
    });
    expect(followedUp.accepted).toBe(true);
    const secondTurn = await harness.backend.waitForTurnStart(2);

    // Second follow-up while that turn is still streaming: refused with a
    // reason, and the delegation must not gain a terminal failed row while a
    // genuine turn is running.
    const collided = await harness.coordinator.followUp({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
      prompt: "And another.",
      permissionProfile: "guided",
      expected: identityOf(await getChild(harness.coordinator)),
    });
    expect(collided.accepted).toBe(false);
    expect(collided.reason).toBe("already-active");
    const during = await getChild(harness.coordinator);
    expect(["waiting", "running"]).toContain(during.phase);

    harness.backend.endTurn(secondTurn.turnId);
    await harness.coordinator.waitForInFlight();
    const settled = await getChild(harness.coordinator);
    expect(settled.phase).toBe("waiting");
    expect(settled.childTurnId).toBe(secondTurn.turnId);
    expect(
      harness.store
        .listReceipts({ runId: settled.runId })
        .filter((receipt) => receipt.type === "failed"),
    ).toHaveLength(0);
  });

  test("a turn that ends with a terminal error fails the delegation with that error", async () => {
    const harness = createHarness();
    await harness.coordinator.delegate(delegateArgs());
    const turn = await harness.backend.waitForTurnStart(1);

    harness.backend.endTurn(turn.turnId, { error: "Provider exploded" });
    await harness.coordinator.waitForInFlight();

    const settled = await getChild(harness.coordinator);
    expect(settled.phase).toBe("failed");
    expect(settled.reason).toBe("Provider exploded");
  });

  test("a turn end missed by the event feed is caught by the status poll", async () => {
    const harness = createHarness();
    // No event feed at all: the poll backstop must settle the delegation.
    const silentBackend = {
      ...harness.backend,
      subscribeTaskTurnUpdated: () => () => {},
    };
    const coordinator = createChildTaskCoordinator({
      getLedger: () => createLedgerPort(harness.store),
      host: createChildTaskHostPort({
        ...silentBackend,
        pollIntervalMs: 5,
      }),
      concurrencyLimit: 3,
      createExecutionId: () => "execution-poll",
    });
    await coordinator.delegate(delegateArgs({ delegationKey: "poll-only" }));
    const turn = await harness.backend.waitForTurnStart(1);
    harness.backend.endTurn(turn.turnId);
    await coordinator.waitForInFlight();

    const settled = await coordinator.get({
      parentTaskId: PARENT_TASK,
      delegationKey: "poll-only",
    });
    expect(settled?.phase).toBe("completed");
    expect(settled?.childTurnId).toBe(turn.turnId);
  });
});
