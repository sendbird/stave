import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import {
  createDelegatedTaskCoordinator,
  type DelegatedTaskHostPort,
  type DelegatedTaskLedgerPort,
} from "../electron/main/runs/delegated-task-coordinator";
import { buildDelegatedTaskRuntimeOptions } from "../src/lib/runs/delegated-task-runtime";
import { resolveManagedTaskRuntimeOptions } from "../src/lib/providers/managed-task-runtime";
import { DelegateTaskToolInputSchema, type DelegateTaskArgs, type DelegatedTaskEffort } from "../src/lib/runs/delegated-task";
import {
  resolveDelegationPermissionPolicy,
  type DelegationPermissionPolicy,
} from "../src/lib/runs/delegation-policy";

const REPOSITORY_PATH = "/tmp/stave";
const PARENT_WORKSPACE = "workspace-parent";
const PARENT_TASK = "parent-task-1";

type TaskStatus = {
  ok: true;
  activeTurnId: string | null;
  latestTurnId: string | null;
  latestTurnCompletedAt: string | null;
  latestTurnError: string | null;
  latestTurnOutcome?:
    | import("../electron/persistence/turn-terminal-receipt").TurnTerminalOutcome
    | null;
};

const IDLE_STATUS: TaskStatus = {
  ok: true,
  activeTurnId: null,
  latestTurnId: null,
  latestTurnCompletedAt: null,
  latestTurnError: null,
};

function createLedgerPort(store: RunLedgerStore): DelegatedTaskLedgerPort {
  return {
    getRunAggregate: (args) => store.getAggregate(args),
    claimRunStep: (args) => store.claimStep(args),
    markRunStepWaiting: (args) => store.markStepWaiting(args),
    completeRunStep: (args) => store.completeStep(args),
    failRunStep: (args) => store.failStep(args),
    cancelRunStep: (args) => store.cancelStep(args),
    interruptRunStep: (args) => store.interruptStep(args),
    setRunStepTarget: (args) => store.setStepTarget(args),
    listHeldWriterRunAggregates: () => store.listHeldWriterAggregates(),
    acquireRunWriterLease: (args) => store.acquireWriterLease(args),
    listRunReceipts: (args) => store.listReceipts(args),
    listRunAggregatesByOrigin: (args) => store.listAggregatesByOrigin(args),
    listActiveRunAggregatesByStepKind: (args) =>
      store.listActiveAggregatesByStepKind(args),
  };
}

function createHost(
  options: {
    runTask?: (args: {
      workspaceId: string;
      taskId: string;
      onStarted?: (turnId: string) => void;
    }) => Promise<{ turnId: string }>;
    knownWorkspaces?: Record<string, string>;
  } = {},
) {
  const runTaskCalls: Array<Record<string, unknown>> = [];
  const stopTaskCalls: Array<Record<string, unknown>> = [];
  const releaseTaskParentCalls: Array<Record<string, unknown>> = [];
  const createWorkspaceCalls: Array<Record<string, unknown>> = [];
  const statusByTaskId = new Map<string, TaskStatus>([
    [PARENT_TASK, IDLE_STATUS],
  ]);
  const statusByTurnId = new Map<string, TaskStatus>();
  let hostUnavailable = false;
  const knownWorkspaces = new Map(
    Object.entries(
      options.knownWorkspaces ?? {
        [PARENT_WORKSPACE]: `${REPOSITORY_PATH}/.stave/workspaces/parent`,
      },
    ),
  );

  const host: DelegatedTaskHostPort = {
    async resolveWorkspace({ workspaceId }) {
      const workspacePath = knownWorkspaces.get(workspaceId);
      return workspacePath
        ? { workspaceId, workspacePath, repositoryPath: REPOSITORY_PATH }
        : null;
    },
    async createWorkspace({ name }) {
      createWorkspaceCalls.push({ name });
      const workspaceId = `workspace-${name}`;
      const workspacePath = `${REPOSITORY_PATH}/.stave/workspaces/${name}`;
      knownWorkspaces.set(workspaceId, workspacePath);
      return { workspaceId, workspacePath, repositoryPath: REPOSITORY_PATH };
    },
    async getTaskStatus({ taskId, turnId }) {
      if (hostUnavailable) {
        return { ok: false, reason: "unavailable" };
      }
      return (
        (turnId ? statusByTurnId.get(turnId) : null) ??
        statusByTaskId.get(taskId) ?? { ok: false, reason: "missing" }
      );
    },
    async runTask(args) {
      runTaskCalls.push({ ...args });
      statusByTaskId.set(args.taskId, IDLE_STATUS);
      return options.runTask
        ? options.runTask(args)
        : { turnId: `turn-${runTaskCalls.length}` };
    },
    async stopTask(args) {
      stopTaskCalls.push({ ...args });
      return { stopped: true };
    },
    async releaseTaskParent(args) {
      releaseTaskParentCalls.push({ ...args });
      return { released: true };
    },
  };

  return {
    host,
    runTaskCalls,
    stopTaskCalls,
    releaseTaskParentCalls,
    createWorkspaceCalls,
    statusByTaskId,
    statusByTurnId,
    setHostUnavailable: (value: boolean) => {
      hostUnavailable = value;
    },
  };
}

function createHarness(
  options: Parameters<typeof createHost>[0] & { concurrencyLimit?: number; readOnly?: boolean;
    /** Resolve with the real policy, pinning it per delegated task like the host store does. */
    realPolicy?: boolean;
    parentDefaults?: { providerId: "claude-code" | "codex"; effort?: DelegatedTaskEffort } | null;
    canonicalWorkspacePath?: (workspacePath: string) => Promise<string>;
    readHead?: (workspacePath: string) => Promise<string | null>;
  } = {},
) {
  const store = new RunLedgerStore(new Database(":memory:"));
  const hostHarness = createHost(options);
  const recordedPolicies = new Map<string, DelegationPermissionPolicy>();
  const policyCalls: Array<Record<string, unknown>> = [];
  let clock = 0;
  const createCoordinator = () =>
    createDelegatedTaskCoordinator({
      getLedger: () => createLedgerPort(store),
      host: hostHarness.host,
      concurrencyLimit: options.concurrencyLimit ?? 3,
      canonicalWorkspacePath: options.canonicalWorkspacePath ?? (async (workspacePath) => workspacePath),
      readHead: options.readHead,
      resolvePermissionPolicy: options.realPolicy
        ? async (args) => {
            policyCalls.push({ ...args });
            const policy = resolveDelegationPermissionPolicy({
              providerId: args.providerId,
              permissionProfile: args.permissionProfile,
              access: args.access,
              requestedProfile: args.requestedProfile,
              recorded: recordedPolicies.get(args.delegatedTaskId) ?? null,
            });
            recordedPolicies.set(args.delegatedTaskId, policy);
            return policy;
          }
        : options.readOnly ? async () => ({ providerId: "codex", source: "provider-settings", requestedProfile: "inherit", options: { codexFileAccess: "read-only" } }) : undefined,
      ...(options.parentDefaults !== undefined
        ? { resolveParentDefaults: async () => options.parentDefaults ?? null }
        : {}),
      now: () => new Date(Date.UTC(2026, 7, 10, 0, 0, clock++)).toISOString(),
      createExecutionId: () => `execution-${clock}`,
    });
  return {
    store,
    policyCalls,
    coordinator: createCoordinator(),
    // A restart is a fresh coordinator over the same durable ledger: nothing of
    // the previous process's in-flight state survives.
    restart: createCoordinator,
    ...hostHarness,
  };
}

function delegateArgs(
  overrides: Partial<DelegateTaskArgs> = {},
): DelegateTaskArgs {
  return {
    repositoryPath: REPOSITORY_PATH,
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

describe("managed workspace writer admission", () => {
  test("real filesystem symlinks resolve to one physical writer workspace", async () => {
    await mkdir(REPOSITORY_PATH, { recursive: true });
    const directory = await mkdtemp(`${REPOSITORY_PATH}/writer-admission-`);
    try {
      await mkdir(`${directory}/work`);
      await symlink(`${directory}/work`, `${directory}/alias`);
      const harness = createHarness({ runTask: () => new Promise(() => {}), canonicalWorkspacePath: realpath,
        knownWorkspaces: { [PARENT_WORKSPACE]: `${directory}/work`, alias: `${directory}/alias` },
      });
      harness.statusByTaskId.set("second-parent", IDLE_STATUS);
      expect((await harness.coordinator.delegate(delegateArgs())).accepted).toBe(true);
      expect((await harness.restart().delegate(delegateArgs({ parentTaskId: "second-parent", parentWorkspaceId: "alias" }))).reason).toBe("workspace-writer-busy");
      expect(harness.runTaskCalls).toHaveLength(1);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test("separate coordinators atomically refuse simultaneous parents on one actual workspace", async () => {
    const harness = createHarness({
      runTask: () => new Promise(() => {}),
      knownWorkspaces: { [PARENT_WORKSPACE]: `${REPOSITORY_PATH}/work`, alias: `${REPOSITORY_PATH}/alias` },
      canonicalWorkspacePath: async () => `${REPOSITORY_PATH}/work`,
    });
    harness.statusByTaskId.set("second-parent", IDLE_STATUS);
    const responses = await Promise.all([
      harness.coordinator.delegate(delegateArgs()),
      harness.restart().delegate(delegateArgs({ parentTaskId: "second-parent", parentWorkspaceId: "alias" })),
    ]);
    expect(responses.filter((response) => response.accepted)).toHaveLength(1);
    const busy = responses.find((response) => !response.accepted)!;
    const holder = responses.find((response) => response.accepted)!;
    expect(busy.reason).toBe("workspace-writer-busy");
    expect(busy.message).toContain(holder.child!.delegatedTaskId);
    expect(busy.message).toContain("new worktree");
    expect(harness.runTaskCalls).toHaveLength(1);
    expect(harness.store.listHeldWriterAggregates()).toHaveLength(1);
    expect(harness.store.listAggregatesByOrigin({ originKind: "task", originId: busy === responses[0] ? PARENT_TASK : "second-parent", limit: 10 })).toEqual([]);
  });

  test("different worktrees run in parallel, including direct parent turns", async () => {
    const harness = createHarness({ runTask: () => new Promise(() => {}), knownWorkspaces: {
      [PARENT_WORKSPACE]: `${REPOSITORY_PATH}/first`, other: `${REPOSITORY_PATH}/second`,
    } });
    harness.statusByTaskId.set(PARENT_TASK, { ...IDLE_STATUS, activeTurnId: "direct-parent-turn" });
    harness.statusByTaskId.set("second-parent", IDLE_STATUS);
    expect((await harness.coordinator.delegate(delegateArgs())).accepted).toBe(true);
    expect((await harness.coordinator.delegate(delegateArgs({ parentTaskId: "second-parent", parentWorkspaceId: "other" }))).accepted).toBe(true);
    expect(harness.stopTaskCalls).toEqual([]);
    expect(harness.runTaskCalls).toHaveLength(2);
  });

  test("a newly created worktree is guarded when a later parent targets it", async () => {
    const harness = createHarness({ runTask: () => new Promise(() => {}) });
    const first = await harness.coordinator.delegate(delegateArgs({ workspace: { mode: "new-worktree", name: "writer" } }));
    harness.statusByTaskId.set("second-parent", IDLE_STATUS);
    const second = await harness.coordinator.delegate(delegateArgs({ parentTaskId: "second-parent", parentWorkspaceId: first.child!.delegatedWorkspaceId }));
    expect(second.reason).toBe("workspace-writer-busy");
    expect(harness.createWorkspaceCalls).toHaveLength(1);
    expect(harness.runTaskCalls).toHaveLength(1);
  });

  test("proven Codex read-only can run beside a Claude writer", async () => {
    const harness = createHarness({ readOnly: true, runTask: () => new Promise(() => {}) });
    expect((await harness.coordinator.delegate(delegateArgs({ providerId: "claude-code", permissionProfile: "manual", delegationKey: "writer" }))).accepted).toBe(true);
    expect((await harness.coordinator.delegate(delegateArgs({ providerId: "codex", delegationKey: "reader" }))).accepted).toBe(true);
    expect(harness.store.listHeldWriterAggregates()).toHaveLength(1);
  });

  test("two Claude read-only consults in one workspace run in parallel and hold no writer slot", async () => {
    const harness = createHarness({ realPolicy: true, runTask: () => new Promise(() => {}) });
    for (const model of ["claude-opus-4-5", "claude-sonnet-4-5"]) {
      const response = await harness.coordinator.delegate(delegateArgs({ providerId: "claude-code", access: "read-only", model, delegationKey: `consult-${model}` }));
      expect(response.accepted).toBe(true);
    }
    expect(harness.runTaskCalls).toHaveLength(2);
    expect(harness.store.listHeldWriterAggregates()).toEqual([]);
    for (const call of harness.runTaskCalls)
      expect(call.permissionPolicy).toMatchObject({ access: "read-only", options: { claudePermissionMode: "dontAsk", claudeSandboxReadOnly: true } });
  });

  test("a Claude read-only consult runs beside a writer; a second writer is still refused", async () => {
    const harness = createHarness({ realPolicy: true, runTask: () => new Promise(() => {}) });
    expect((await harness.coordinator.delegate(delegateArgs({ providerId: "claude-code", delegationKey: "writer" }))).accepted).toBe(true);
    expect((await harness.coordinator.delegate(delegateArgs({ providerId: "claude-code", access: "read-only", delegationKey: "reader" }))).accepted).toBe(true);
    // Profile names and plan mode do not prove read-only access.
    expect((await harness.coordinator.delegate(delegateArgs({ providerId: "claude-code", permissionProfile: "guided", delegationKey: "another-writer" }))).reason).toBe("workspace-writer-busy");
    expect((await harness.coordinator.delegate(delegateArgs({ providerId: "codex", permissionProfile: "manual", delegationKey: "codex-writer" }))).reason).toBe("workspace-writer-busy");
    expect(harness.store.listHeldWriterAggregates()).toHaveLength(1);
    expect(harness.runTaskCalls).toHaveLength(2);
  });

  test("a parked read-only consult takes its follow-up beside an active writer", async () => {
    let calls = 0;
    const harness = createHarness({ realPolicy: true, runTask: async ({ onStarted }) => {
      const turnId = `turn-${++calls}`; onStarted?.(turnId);
      return calls === 1 ? { turnId } : new Promise(() => {});
    } });
    const reader = await harness.coordinator.delegate(delegateArgs({ providerId: "claude-code", access: "read-only", lifecycle: "detached" }));
    await harness.coordinator.waitForInFlight();
    expect((await harness.coordinator.delegate(delegateArgs({ providerId: "claude-code", delegationKey: "writer" }))).accepted).toBe(true);
    const follow = await harness.coordinator.followUp({ parentTaskId: PARENT_TASK, delegationKey: "review-docs", prompt: "And the tests?", permissionProfile: "guided",
      expected: { delegatedTaskId: reader.child!.delegatedTaskId, delegatedWorkspaceId: reader.child!.delegatedWorkspaceId, attempt: 1 } });
    expect(follow.accepted).toBe(true);
    expect(harness.runTaskCalls.at(-1)!.permissionPolicy).toMatchObject({ access: "read-only", source: "recorded-delegation" });
    expect(harness.store.listHeldWriterAggregates()).toHaveLength(1);
  });

  test("failed startup releases admission so another child can start", async () => {
    let calls = 0;
    const harness = createHarness({ runTask: async () => {
      if (++calls === 1) throw new Error("Could not start provider");
      return { turnId: "second-turn" };
    } });
    await harness.coordinator.delegate(delegateArgs());
    await harness.coordinator.waitForInFlight();
    expect(harness.store.listHeldWriterAggregates()).toEqual([]);
    expect((await harness.coordinator.delegate(delegateArgs({ delegationKey: "second" }))).accepted).toBe(true);
    await harness.coordinator.waitForInFlight();
  });

  test("ledger stop keeps the writer guarded until actual turn completion", async () => {
    let finish!: (result: { turnId: string }) => void;
    const harness = createHarness({ runTask: async ({ onStarted }) => {
      onStarted?.("writing-turn");
      return new Promise((resolve) => { finish = resolve; });
    } });
    await harness.coordinator.delegate(delegateArgs());
    await harness.coordinator.stop({ parentTaskId: PARENT_TASK, delegationKey: "review-docs" });
    expect((await harness.coordinator.delegate(delegateArgs({ delegationKey: "second" }))).reason).toBe("workspace-writer-busy");
    finish({ turnId: "writing-turn" });
    await harness.coordinator.waitForInFlight();
    expect(harness.store.listHeldWriterAggregates()).toEqual([]);
    expect((await harness.coordinator.delegate(delegateArgs({ delegationKey: "second" }))).accepted).toBe(true);
    finish({ turnId: "writing-turn" });
    await harness.coordinator.waitForInFlight();
  });

  test("restart with unavailable host keeps a cancelled writer guarded", async () => {
    const harness = createHarness({ runTask: async ({ onStarted }) => {
      onStarted?.("writing-turn"); return new Promise(() => {});
    } });
    await harness.coordinator.delegate(delegateArgs());
    await harness.coordinator.stop({ parentTaskId: PARENT_TASK, delegationKey: "review-docs" });
    harness.setHostUnavailable(true);
    const restarted = harness.restart();
    expect((await restarted.reconcile()).deferred).toBe(1);
    expect(harness.store.listHeldWriterAggregates()).toHaveLength(1);
  });

  test("detach during startup keeps the child running and admission held", async () => {
    let started!: (turnId: string) => void;
    let finish!: (result: { turnId: string }) => void;
    const harness = createHarness({ runTask: async ({ onStarted }) => {
      started = onStarted!; return new Promise((resolve) => { finish = resolve; });
    } });
    await harness.coordinator.delegate(delegateArgs());
    await harness.coordinator.detach({ parentTaskId: PARENT_TASK, delegationKey: "review-docs" });
    started("detached-turn");
    expect(harness.stopTaskCalls).toEqual([]);
    expect((await harness.coordinator.delegate(delegateArgs({ delegationKey: "second" }))).reason).toBe("workspace-writer-busy");
    finish({ turnId: "detached-turn" });
    await harness.coordinator.waitForInFlight();
    expect(harness.store.listHeldWriterAggregates()).toEqual([]);
  });

  test("parked follow-up reacquires the same workspace and refuses an active writer", async () => {
    let calls = 0;
    let finish!: (result: { turnId: string }) => void;
    const harness = createHarness({ runTask: async ({ onStarted }) => {
      const turnId = `turn-${++calls}`; onStarted?.(turnId);
      if (calls === 2) return new Promise((resolve) => { finish = resolve; });
      return { turnId };
    } });
    const initial = await harness.coordinator.delegate(delegateArgs({ lifecycle: "detached" }));
    await harness.coordinator.waitForInFlight();
    const initialTarget = harness.store.getAggregate({ runId: initial.child!.runId, stepId: initial.child!.stepId })!.step.target!;
    await harness.coordinator.delegate(delegateArgs({ delegationKey: "writer" }));
    const follow = { parentTaskId: PARENT_TASK, delegationKey: "review-docs", prompt: "Follow up", expected: { delegatedTaskId: initial.child!.delegatedTaskId, delegatedWorkspaceId: initial.child!.delegatedWorkspaceId, attempt: 1 } };
    expect((await harness.coordinator.followUp(follow)).reason).toBe("workspace-writer-busy");
    finish({ turnId: "turn-2" });
    await harness.coordinator.waitForInFlight();
    expect((await harness.coordinator.followUp(follow)).accepted).toBe(true);
    await harness.coordinator.waitForInFlight();
    expect(harness.store.setStepTarget({ runId: initial.child!.runId, stepId: initial.child!.stepId, expectedExecutionId: "execution-1", expectedLeaseId: initialTarget.writerLease!.leaseId, target: initialTarget })).toBe(false);
    expect(harness.store.getAggregate({ runId: initial.child!.runId, stepId: initial.child!.stepId })!.step.target!.turnId).toBe("turn-3");
  });

  test("HEAD is rechecked after admission and moved work never starts", async () => {
    let leaseObserved = false;
    const harness = createHarness({ readHead: async () => {
      leaseObserved = harness.store.listHeldWriterAggregates().length === 1;
      return "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    } });
    const result = await harness.coordinator.delegate(delegateArgs({ expectedHead: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }));
    expect(leaseObserved).toBe(true);
    expect(result.reason).toBe("head-mismatch");
    expect(harness.runTaskCalls).toEqual([]);
    expect(harness.store.listHeldWriterAggregates()).toEqual([]);
  });

  test("legacy active rows guard aliases of the same workspace without a migration", async () => {
    const harness = createHarness({ runTask: async ({ onStarted }) => { onStarted?.("legacy-turn"); return new Promise(() => {}); },
      knownWorkspaces: { [PARENT_WORKSPACE]: `${REPOSITORY_PATH}/work`, alias: `${REPOSITORY_PATH}/alias` },
      canonicalWorkspacePath: async () => `${REPOSITORY_PATH}/work`,
    });
    const first = await harness.coordinator.delegate(delegateArgs());
    const aggregate = harness.store.getAggregate({ runId: first.child!.runId, stepId: first.child!.stepId })!;
    harness.store.setStepTarget({ runId: aggregate.run.id, stepId: aggregate.step.id, target: { ...aggregate.step.target!, writerLease: undefined, turnExecutionId: undefined } });
    harness.statusByTaskId.set(first.child!.delegatedTaskId, { ...IDLE_STATUS, activeTurnId: "legacy-turn" });
    harness.statusByTaskId.set("second-parent", IDLE_STATUS);
    const result = await harness.restart().delegate(delegateArgs({ parentTaskId: "second-parent", parentWorkspaceId: "alias" }));
    expect(result.reason).toBe("workspace-writer-busy");
    expect(harness.runTaskCalls).toHaveLength(1);
    expect(harness.store.getAggregate({ runId: aggregate.run.id, stepId: aggregate.step.id })!.step.target!.writerLease).toBeUndefined();
  });

  test("unavailable legacy child remains guarded while another workspace is usable", async () => {
    const harness = createHarness({ runTask: async ({ onStarted }) => { onStarted?.("legacy-turn"); return new Promise(() => {}); },
      knownWorkspaces: { [PARENT_WORKSPACE]: `${REPOSITORY_PATH}/work`, other: `${REPOSITORY_PATH}/other` },
    });
    const first = await harness.coordinator.delegate(delegateArgs());
    const aggregate = harness.store.getAggregate({ runId: first.child!.runId, stepId: first.child!.stepId })!;
    harness.store.setStepTarget({ runId: aggregate.run.id, stepId: aggregate.step.id, target: { ...aggregate.step.target!, writerLease: undefined, turnExecutionId: undefined } });
    const originalStatus = harness.host.getTaskStatus;
    harness.host.getTaskStatus = async (args) => args.taskId === first.child!.delegatedTaskId ? { ok: false, reason: "unavailable" } : originalStatus(args);
    harness.statusByTaskId.set("second-parent", IDLE_STATUS);
    const restarted = harness.restart();
    expect((await restarted.delegate(delegateArgs({ delegationKey: "same" }))).reason).toBe("workspace-writer-busy");
    expect((await restarted.delegate(delegateArgs({ parentTaskId: "second-parent", parentWorkspaceId: "other" }))).accepted).toBe(true);
    expect(harness.runTaskCalls).toHaveLength(2);
  });

  test("recorded read-only legacy child does not reserve a writer lease", async () => {
    const harness = createHarness({ readOnly: true, runTask: async ({ onStarted }) => { onStarted?.("legacy-reader"); return new Promise(() => {}); } });
    const first = await harness.coordinator.delegate(delegateArgs());
    const aggregate = harness.store.getAggregate({ runId: first.child!.runId, stepId: first.child!.stepId })!;
    harness.store.setStepTarget({ runId: aggregate.run.id, stepId: aggregate.step.id, target: { ...aggregate.step.target!, turnExecutionId: undefined } });
    harness.statusByTaskId.set(first.child!.delegatedTaskId, { ...IDLE_STATUS, activeTurnId: "legacy-reader" });
    expect((await harness.restart().delegate(delegateArgs({ providerId: "claude-code", delegationKey: "writer" }))).accepted).toBe(true);
    expect(harness.runTaskCalls).toHaveLength(2);
  });

  test("legacy completion arriving during admission settles before transactional writer claim", async () => {
    const harness = createHarness({ runTask: async ({ onStarted }) => { onStarted?.("legacy-turn"); return new Promise(() => {}); } });
    const first = await harness.coordinator.delegate(delegateArgs());
    const aggregate = harness.store.getAggregate({ runId: first.child!.runId, stepId: first.child!.stepId })!;
    harness.store.setStepTarget({ runId: aggregate.run.id, stepId: aggregate.step.id, target: { ...aggregate.step.target!, writerLease: undefined, turnExecutionId: undefined } });
    const originalStatus = harness.host.getTaskStatus;
    let reads = 0;
    harness.host.getTaskStatus = async (args) => args.taskId !== first.child!.delegatedTaskId ? originalStatus(args) : ++reads === 1
      ? { ...IDLE_STATUS, activeTurnId: "legacy-turn" }
      : { ...IDLE_STATUS, latestTurnId: "legacy-turn", latestTurnCompletedAt: "2026-08-11T00:00:00.000Z", latestTurnOutcome: "completed" };
    expect((await harness.restart().delegate(delegateArgs({ delegationKey: "second" }))).accepted).toBe(true);
    expect(harness.store.getAggregate({ runId: aggregate.run.id, stepId: aggregate.step.id })!.step.status).toBe("completed");
  });

  test("pinned follow-up rechecks HEAD after admission and preserves the parked identity", async () => {
    let head = "a".repeat(40);
    let heldDuringRead = false;
    const harness = createHarness({ readHead: async () => { heldDuringRead = harness.store.listHeldWriterAggregates().length === 1; return head; } });
    const first = await harness.coordinator.delegate(delegateArgs({ lifecycle: "detached", expectedHead: head }));
    await harness.coordinator.waitForInFlight();
    const parked = harness.store.getAggregate({ runId: first.child!.runId, stepId: first.child!.stepId })!.step.target;
    head = "b".repeat(40);
    const result = await harness.coordinator.followUp({ parentTaskId: PARENT_TASK, delegationKey: "review-docs", prompt: "Follow up", expected: {
      delegatedTaskId: first.child!.delegatedTaskId, delegatedWorkspaceId: first.child!.delegatedWorkspaceId, attempt: 1,
    } });
    expect(result.reason).toBe("head-mismatch");
    expect(heldDuringRead).toBe(true);
    expect(harness.runTaskCalls).toHaveLength(1);
    expect(harness.store.listHeldWriterAggregates()).toEqual([]);
    expect(harness.store.getAggregate({ runId: first.child!.runId, stepId: first.child!.stepId })!.step.target).toEqual(parked);
  });

  test("late failure of an older turn cannot fail or release a newer follow-up", async () => {
    let calls = 0;
    let rejectOld!: (error: Error) => void;
    let finishNew!: (result: { turnId: string }) => void;
    const harness = createHarness({ runTask: async ({ onStarted }) => {
      onStarted?.(`turn-${++calls}`);
      return calls === 1 ? new Promise((_resolve, reject) => { rejectOld = reject; })
        : new Promise((resolve) => { finishNew = resolve; });
    } });
    const initial = await harness.coordinator.delegate(delegateArgs({ lifecycle: "detached" }));
    const aggregate = harness.store.getAggregate({ runId: initial.child!.runId, stepId: initial.child!.stepId })!;
    harness.store.markStepWaiting({ runId: aggregate.run.id, stepId: aggregate.step.id, executionId: aggregate.step.executionId!, idempotencyKey: "observed-terminal", now: "2026-08-11T00:00:00.000Z" });
    harness.store.setStepTarget({ runId: aggregate.run.id, stepId: aggregate.step.id, target: { ...aggregate.step.target!, writerLease: { ...aggregate.step.target!.writerLease!, state: "released" } } });
    harness.statusByTurnId.set("turn-1", { ...IDLE_STATUS, latestTurnId: "turn-1", latestTurnCompletedAt: "2026-08-11T00:00:00.000Z", latestTurnOutcome: "completed" });
    const restarted = harness.restart();
    const follow = await restarted.followUp({ parentTaskId: PARENT_TASK, delegationKey: "review-docs", prompt: "Follow up", expected: {
      delegatedTaskId: initial.child!.delegatedTaskId, delegatedWorkspaceId: initial.child!.delegatedWorkspaceId, attempt: 1,
    } });
    expect(follow.accepted).toBe(true);
    rejectOld(new Error("Late transport failure"));
    await harness.coordinator.waitForInFlight();
    const fresh = harness.store.getAggregate({ runId: aggregate.run.id, stepId: aggregate.step.id })!;
    expect(fresh.step.status).toBe("waiting");
    expect(fresh.step.target!.turnId).toBe("turn-2");
    expect(fresh.step.target!.writerLease!.state).toBe("held");
    finishNew({ turnId: "turn-2" });
    await restarted.waitForInFlight();
    expect(harness.store.listHeldWriterAggregates()).toEqual([]);
  });
});

describe("delegated task coordinator", () => {
  test("a Claude parent delegates to a Codex child and the reverse", async () => {
    for (const providerId of ["codex", "claude-code"] as const) {
      const harness = createHarness();
      const response = await harness.coordinator.delegate(
        delegateArgs({ providerId, delegationKey: `to-${providerId}` }),
      );
      await harness.coordinator.waitForInFlight();

      expect(response.accepted).toBe(true);
      expect(response.child?.providerId).toBe(providerId);
      expect(harness.runTaskCalls).toHaveLength(1);
      expect(harness.runTaskCalls[0]).toMatchObject({
        providerId,
        permissionProfile: "guided",
        workspaceId: PARENT_WORKSPACE,
        taskId: response.child?.delegatedTaskId,
        // Denormalized onto the delegated task row so listing surfaces can tell a
        // delegated child from a peer task without reading the ledger.
        parentTaskId: PARENT_TASK,
      });
      const settled = await harness.coordinator.get({
        parentTaskId: PARENT_TASK,
        delegationKey: `to-${providerId}`,
      });
      expect(settled?.phase).toBe("completed");
      expect(settled?.delegatedTurnId).toBe("turn-1");
    }
  });

  test("a duplicate delegate call with the same idempotency key creates one child", async () => {
    const harness = createHarness();
    const first = await harness.coordinator.delegate(delegateArgs());
    const second = await harness.coordinator.delegate(delegateArgs());
    await harness.coordinator.waitForInFlight();
    const third = await harness.coordinator.delegate(delegateArgs());

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(third.duplicate).toBe(true);
    expect(harness.runTaskCalls).toHaveLength(1);
    expect(second.child?.delegatedTaskId).toBe(
      first.child?.delegatedTaskId ?? "",
    );
    expect(third.child?.delegatedTaskId).toBe(
      first.child?.delegatedTaskId ?? "",
    );
    expect(
      await harness.coordinator.list({ parentTaskId: PARENT_TASK }),
    ).toHaveLength(1);
  });

  test("the same key with a different prompt is refused instead of silently reused", async () => {
    const harness = createHarness();
    await harness.coordinator.delegate(delegateArgs());
    await harness.coordinator.waitForInFlight();

    const conflicting = await harness.coordinator.delegate(
      delegateArgs({ prompt: "Do something else entirely." }),
    );

    expect(conflicting.accepted).toBe(false);
    expect(conflicting.reason).toBe("input-mismatch");
    expect(harness.runTaskCalls).toHaveLength(1);
  });

  test("the concurrency limit bounds live children per parent", async () => {
    const harness = createHarness({
      readOnly: true,
      concurrencyLimit: 2,
      runTask: () => new Promise<{ turnId: string }>(() => {}),
    });
    await harness.coordinator.delegate(delegateArgs({ delegationKey: "one" }));
    await harness.coordinator.delegate(delegateArgs({ delegationKey: "two" }));

    const third = await harness.coordinator.delegate(
      delegateArgs({ delegationKey: "three" }),
    );

    expect(third.accepted).toBe(false);
    expect(third.reason).toBe("concurrency-limit-reached");
    expect(harness.runTaskCalls).toHaveLength(2);
  });

  test("a delegation is refused when the parent task or workspace is not the caller's", async () => {
    const harness = createHarness();

    const unknownWorkspace = await harness.coordinator.delegate(
      delegateArgs({ parentWorkspaceId: "workspace-unknown" }),
    );
    const foreignRepository = await harness.coordinator.delegate(
      delegateArgs({ repositoryPath: "/tmp/other-project" }),
    );
    const unknownParent = await harness.coordinator.delegate(
      delegateArgs({ parentTaskId: "parent-task-missing" }),
    );

    expect(unknownWorkspace.reason).toBe("invalid-ownership");
    expect(foreignRepository.reason).toBe("invalid-ownership");
    expect(unknownParent.reason).toBe("invalid-ownership");
    expect(harness.runTaskCalls).toHaveLength(0);
  });

  test("the new-worktree strategy runs the child in the workspace it created", async () => {
    const harness = createHarness();

    const response = await harness.coordinator.delegate(
      delegateArgs({
        workspace: { mode: "new-worktree", name: "docs-review" },
      }),
    );
    await harness.coordinator.waitForInFlight();

    expect(harness.createWorkspaceCalls).toEqual([{ name: "docs-review" }]);
    expect(response.child?.delegatedWorkspaceId).toBe("workspace-docs-review");
    expect(harness.runTaskCalls[0]).toMatchObject({
      workspaceId: "workspace-docs-review",
    });
  });

  test("a detached child parks in waiting and is closed by an explicit stop", async () => {
    const harness = createHarness();
    const started = await harness.coordinator.delegate(
      delegateArgs({ lifecycle: "detached" }),
    );
    await harness.coordinator.waitForInFlight();

    const parked = await harness.coordinator.get({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
    });
    const stopped = await harness.coordinator.stop({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
      reason: "no longer needed",
    });

    expect(started.child?.lifecycle).toBe("detached");
    expect(parked?.phase).toBe("waiting");
    expect(stopped.accepted).toBe(true);
    expect(stopped.child?.phase).toBe("cancelled");
    expect(harness.stopTaskCalls).toEqual([
      { workspaceId: PARENT_WORKSPACE, taskId: started.child?.delegatedTaskId },
    ]);
  });

  /**
   * The controls the parent renders carry the identity they were drawn against.
   * These cases pin that the coordinator actually applies that check before it
   * acts, so a control prepared against a delegation that has since moved is
   * refused with a reason instead of hitting whatever now holds the key.
   */
  test("a control carrying a stale expected identity is refused with a reason", async () => {
    const harness = createHarness();
    const started = await harness.coordinator.delegate(
      delegateArgs({ lifecycle: "detached" }),
    );
    await harness.coordinator.waitForInFlight();
    const child = await harness.coordinator.get({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
    });
    if (!child) {
      throw new Error("expected a delegated child");
    }

    const stopped = await harness.coordinator.stop({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
      expected: {
        delegatedTaskId: child.delegatedTaskId,
        delegatedWorkspaceId: child.delegatedWorkspaceId,
        // The control was drawn before a retry bumped the attempt.
        attempt: child.attempt + 1,
      },
    });

    expect(started.accepted).toBe(true);
    expect(stopped.accepted).toBe(false);
    expect(stopped.reason).toBe("stale-identity");
    expect(stopped.message?.length ?? 0).toBeGreaterThan(0);
    // The refusal must leave the live child untouched, not stop it anyway.
    expect(harness.stopTaskCalls).toEqual([]);
    expect(
      (
        await harness.coordinator.get({
          parentTaskId: PARENT_TASK,
          delegationKey: "review-docs",
        })
      )?.phase,
    ).toBe(child.phase);
  });

  test("a control carrying the live identity is accepted", async () => {
    const harness = createHarness();
    await harness.coordinator.delegate(delegateArgs({ lifecycle: "detached" }));
    await harness.coordinator.waitForInFlight();
    const child = await harness.coordinator.get({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
    });
    if (!child) {
      throw new Error("expected a delegated child");
    }

    const stopped = await harness.coordinator.stop({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
      expected: {
        delegatedTaskId: child.delegatedTaskId,
        delegatedWorkspaceId: child.delegatedWorkspaceId,
        attempt: child.attempt,
        phase: child.phase,
      },
    });

    expect(stopped.accepted).toBe(true);
    expect(stopped.child?.phase).toBe("cancelled");
  });

  test("stopping an unknown delegation reports not-found instead of inventing one", async () => {
    const harness = createHarness();
    const response = await harness.coordinator.stop({
      parentTaskId: PARENT_TASK,
      delegationKey: "never-delegated",
    });

    expect(response.accepted).toBe(false);
    expect(response.reason).toBe("not-found");
  });

  test("a restart mid-child reconciles to reality and never loses the child", async () => {
    const harness = createHarness({
      runTask: () => new Promise<{ turnId: string }>(() => {}),
    });
    const started = await harness.coordinator.delegate(delegateArgs());
    const delegatedTaskId = started.child?.delegatedTaskId ?? "";
    const restarted = harness.restart();

    // Still running after the restart: the ledger must not close the row, but
    // the pass must stay unsettled (deferred) — no watcher in this process
    // will settle the row when the child's turn ends, so reconciliation has to
    // run again on a later read.
    harness.statusByTaskId.set(delegatedTaskId, {
      ...IDLE_STATUS,
      activeTurnId: "turn-live",
    });
    expect(await restarted.reconcile()).toEqual({
      reconciled: 0,
      deferred: 1,
    });
    expect(
      (
        await restarted.get({
          parentTaskId: PARENT_TASK,
          delegationKey: "review-docs",
        })
      )?.phase,
    ).toBe("running");

    // Finished while Stave was down: reconciled to completed, referencing the
    // delegated task rather than carrying its output.
    harness.statusByTaskId.set(delegatedTaskId, {
      ok: true,
      activeTurnId: null,
      latestTurnId: "turn-7",
      latestTurnCompletedAt: "2026-08-10T01:00:00.000Z",
      latestTurnError: null,
    });
    expect(await restarted.reconcile()).toMatchObject({
      reconciled: 1,
    });
    const completed = await restarted.get({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
    });
    expect(completed?.phase).toBe("completed");
    expect(completed?.delegatedTurnId).toBe("turn-7");
    expect(
      harness.store.getAggregate({
        runId: completed?.runId ?? "",
        stepId: completed?.stepId ?? "",
      })?.step.resultArtifactRef,
    ).toBe(
      `stave://workspace/${PARENT_WORKSPACE}/task/${delegatedTaskId}/turn/turn-7`,
    );
  });

  test("a child that vanished across a restart is interrupted, not forgotten", async () => {
    const harness = createHarness({
      runTask: () => new Promise<{ turnId: string }>(() => {}),
    });
    const started = await harness.coordinator.delegate(delegateArgs());
    harness.statusByTaskId.delete(started.child?.delegatedTaskId ?? "");
    const restarted = harness.restart();

    expect(await restarted.reconcile()).toMatchObject({
      reconciled: 1,
    });
    const reconciled = await restarted.get({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
    });
    expect(reconciled?.phase).toBe("interrupted");
    expect(reconciled?.reason).toBe("The delegated task is no longer present.");
  });

  test("an unreachable task runtime defers reconciliation instead of closing the child", async () => {
    const harness = createHarness({
      runTask: () => new Promise<{ turnId: string }>(() => {}),
    });
    const started = await harness.coordinator.delegate(delegateArgs());
    const delegatedTaskId = started.child?.delegatedTaskId ?? "";
    const restarted = harness.restart();
    harness.setHostUnavailable(true);

    expect(await restarted.reconcile()).toEqual({
      reconciled: 0,
      deferred: 1,
    });
    expect(
      (
        await restarted.get({
          parentTaskId: PARENT_TASK,
          delegationKey: "review-docs",
        })
      )?.phase,
    ).toBe("running");

    // Once the task runtime answers again, the deferred pass runs on the next
    // read rather than leaving a stale row behind.
    harness.setHostUnavailable(false);
    harness.statusByTaskId.set(delegatedTaskId, {
      ok: true,
      activeTurnId: null,
      latestTurnId: "turn-3",
      latestTurnCompletedAt: "2026-08-10T02:00:00.000Z",
      latestTurnError: null,
    });
    const [summary] = await restarted.list({
      parentTaskId: PARENT_TASK,
    });
    expect(summary.phase).toBe("completed");
  });

  test("a failed delegation retries onto the same delegated task", async () => {
    let attempts = 0;
    const harness = createHarness({
      runTask: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("Provider exploded");
        }
        return { turnId: `turn-${attempts}` };
      },
    });
    const first = await harness.coordinator.delegate(delegateArgs());
    await harness.coordinator.waitForInFlight();
    const failed = await harness.coordinator.get({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
    });

    const retried = await harness.coordinator.delegate(
      delegateArgs({ retry: true }),
    );
    await harness.coordinator.waitForInFlight();
    const settled = await harness.coordinator.get({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
    });

    expect(failed?.phase).toBe("failed");
    expect(failed?.reason).toBe("Provider exploded");
    expect(retried.accepted).toBe(true);
    expect(retried.duplicate).toBe(false);
    expect(retried.child?.delegatedTaskId).toBe(
      first.child?.delegatedTaskId ?? "",
    );
    expect(settled?.phase).toBe("completed");
    expect(settled?.attempt).toBe(2);
  });

  test("a retry may carry new instructions and keeps the delegation's original inputs", async () => {
    let attempts = 0;
    const harness = createHarness({
      runTask: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("Provider exploded");
        }
        return { turnId: `turn-${attempts}` };
      },
    });
    await harness.coordinator.delegate(
      delegateArgs({
        workspace: { mode: "new-worktree", name: "docs-review" },
        model: "gpt-5.3-codex",
        effort: "high",
        permissionProfile: "auto",
      }),
    );
    await harness.coordinator.waitForInFlight();
    const failed = await harness.coordinator.get({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
    });
    expect(failed?.phase).toBe("failed");

    // The UI asks the user for retry instructions, so the prompt is new. That
    // must not be refused as an input mismatch, and it must not silently swap
    // the child onto a fresh workspace, default model, or default profile.
    const retried = await harness.coordinator.retry({
      repositoryPath: REPOSITORY_PATH,
      parentWorkspaceId: PARENT_WORKSPACE,
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
      prompt: "Try again, and read the checklist first.",
      expected: {
        delegatedTaskId: failed!.delegatedTaskId,
        delegatedWorkspaceId: failed!.delegatedWorkspaceId,
        attempt: failed!.attempt,
      },
    });
    await harness.coordinator.waitForInFlight();
    const settled = await harness.coordinator.get({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
    });

    expect(retried.accepted).toBe(true);
    expect(retried.duplicate).toBe(false);
    expect(settled?.phase).toBe("completed");
    expect(settled?.attempt).toBe(2);
    expect(harness.runTaskCalls[1]).toMatchObject({
      prompt: "Try again, and read the checklist first.",
      workspaceId: "workspace-docs-review",
      model: "gpt-5.3-codex",
      effort: "high",
      permissionProfile: "auto",
    });
    // The retry reused the delegation's worktree instead of cutting another.
    expect(harness.createWorkspaceCalls).toHaveLength(1);
  });

  test("an explicit permission profile on a retry overrides the recorded one", async () => {
    let attempts = 0;
    const harness = createHarness({
      runTask: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("Provider exploded");
        }
        return { turnId: `turn-${attempts}` };
      },
    });
    await harness.coordinator.delegate(
      delegateArgs({ permissionProfile: "auto" }),
    );
    await harness.coordinator.waitForInFlight();
    const failed = await harness.coordinator.get({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
    });

    await harness.coordinator.retry({
      repositoryPath: REPOSITORY_PATH,
      parentWorkspaceId: PARENT_WORKSPACE,
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
      prompt: "Try again under supervision.",
      permissionProfile: "manual",
      expected: {
        delegatedTaskId: failed!.delegatedTaskId,
        delegatedWorkspaceId: failed!.delegatedWorkspaceId,
        attempt: failed!.attempt,
      },
    });
    await harness.coordinator.waitForInFlight();

    expect(harness.runTaskCalls[1]).toMatchObject({
      permissionProfile: "manual",
    });
  });

  test("parallel delegates cannot exceed the concurrency limit", async () => {
    const harness = createHarness({
      readOnly: true,
      concurrencyLimit: 2,
      runTask: () => new Promise<{ turnId: string }>(() => {}),
    });

    // Sent together on purpose: the count-then-claim window is where a race
    // could admit a third live child past the limit.
    const responses = await Promise.all([
      harness.coordinator.delegate(delegateArgs({ delegationKey: "one" })),
      harness.coordinator.delegate(delegateArgs({ delegationKey: "two" })),
      harness.coordinator.delegate(delegateArgs({ delegationKey: "three" })),
    ]);

    expect(responses.filter((response) => response.accepted)).toHaveLength(2);
    const refused = responses.find((response) => !response.accepted);
    expect(refused?.reason).toBe("concurrency-limit-reached");
    expect(harness.runTaskCalls).toHaveLength(2);
  });

  test("a child still mid-turn at a restart is settled once its turn ends", async () => {
    const harness = createHarness({
      runTask: () => new Promise<{ turnId: string }>(() => {}),
    });
    const started = await harness.coordinator.delegate(delegateArgs());
    const delegatedTaskId = started.child?.delegatedTaskId ?? "";
    const restarted = harness.restart();

    // Mid-turn: the row stays running, and because no watcher in this process
    // will settle it, the reconcile pass must stay unsettled.
    harness.statusByTaskId.set(delegatedTaskId, {
      ...IDLE_STATUS,
      activeTurnId: "turn-live",
    });
    expect(await restarted.list({ parentTaskId: PARENT_TASK })).toMatchObject([
      { phase: "running" },
    ]);

    // The turn ends. The next read settles the row instead of leaving a ghost
    // `running` delegation occupying a concurrency slot forever.
    harness.statusByTaskId.set(delegatedTaskId, {
      ok: true,
      activeTurnId: null,
      latestTurnId: "turn-9",
      latestTurnCompletedAt: "2026-08-10T03:00:00.000Z",
      latestTurnError: null,
    });
    const [settled] = await restarted.list({ parentTaskId: PARENT_TASK });
    expect(settled.phase).toBe("completed");
    expect(settled.delegatedTurnId).toBe("turn-9");
  });

  test("reconcile never settles a retried attempt with an earlier attempt's turn", async () => {
    let attempts = 0;
    const harness = createHarness({
      runTask: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("Provider exploded");
        }
        // The retry's own turn never starts: the process dies first.
        return new Promise<{ turnId: string }>(() => {});
      },
    });
    await harness.coordinator.delegate(delegateArgs());
    await harness.coordinator.waitForInFlight();
    const failed = await harness.coordinator.get({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
    });
    await harness.coordinator.retry({
      repositoryPath: REPOSITORY_PATH,
      parentWorkspaceId: PARENT_WORKSPACE,
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
      prompt: "Try again.",
      expected: {
        delegatedTaskId: failed!.delegatedTaskId,
        delegatedWorkspaceId: failed!.delegatedWorkspaceId,
        attempt: failed!.attempt,
      },
    });

    const restarted = harness.restart();
    // The child's only finished turn predates the retry's claim, so it
    // belongs to attempt 1. Settling attempt 2 with it would close the retry
    // with results the retry never produced.
    harness.statusByTaskId.set(failed!.delegatedTaskId, {
      ok: true,
      activeTurnId: null,
      latestTurnId: "turn-old",
      latestTurnCompletedAt: "2026-08-09T23:00:00.000Z",
      latestTurnError: null,
    });
    await restarted.reconcile();

    const settled = await restarted.get({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
    });
    expect(settled?.phase).toBe("interrupted");
    expect(settled?.delegatedTurnId).not.toBe("turn-old");
  });

  test("a follow-up turn writes its own receipt instead of vanishing as a duplicate", async () => {
    const harness = createHarness();
    await harness.coordinator.delegate(delegateArgs({ lifecycle: "detached", model: "requested-model", effort: "high" }));
    await harness.coordinator.waitForInFlight();
    const parked = await harness.coordinator.get({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
    });
    expect(parked?.phase).toBe("waiting");
    expect(parked?.delegatedTurnId).toBe("turn-1");

    const followedUp = await harness.coordinator.followUp({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
      prompt: "One more pass, please.",
      permissionProfile: "guided",
      expected: {
        delegatedTaskId: parked!.delegatedTaskId,
        delegatedWorkspaceId: parked!.delegatedWorkspaceId,
        attempt: parked!.attempt,
      },
    });
    await harness.coordinator.waitForInFlight();
    expect(harness.runTaskCalls.at(-1)).toMatchObject({ model: "requested-model", effort: "high" });
    const settled = await harness.coordinator.get({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
    });

    expect(followedUp.accepted).toBe(true);
    expect(settled?.phase).toBe("waiting");
    // The completed follow-up is visible: the turn reference and `updatedAt`
    // both moved, and a second waiting receipt exists.
    expect(settled?.delegatedTurnId).toBe("turn-2");
    expect(Date.parse(settled!.updatedAt)).toBeGreaterThan(
      Date.parse(parked!.updatedAt),
    );
    expect(
      harness.store
        .listReceipts({ runId: parked!.runId })
        .filter((receipt) => receipt.type === "waiting"),
    ).toHaveLength(2);
  });

  test("detach releases the delegation stamp so the child re-enters ordinary listings", async () => {
    const harness = createHarness();
    await harness.coordinator.delegate(delegateArgs({ lifecycle: "detached" }));
    await harness.coordinator.waitForInFlight();
    const parked = await harness.coordinator.get({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
    });
    expect(parked?.phase).toBe("waiting");

    const identity = {
      delegatedTaskId: parked!.delegatedTaskId,
      delegatedWorkspaceId: parked!.delegatedWorkspaceId,
      attempt: parked!.attempt,
    };
    const detached = await harness.coordinator.detach({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
      expected: identity,
    });

    expect(detached.accepted).toBe(true);
    expect(detached.child?.phase).toBe("cancelled");
    // Detach ends the parent's claim, never the child's work…
    expect(harness.stopTaskCalls).toEqual([]);
    // …and clears the delegation stamp, otherwise the listing predicate
    // hides the still-running child from every workspace task listing
    // forever — the ghost-session shape detach must not create.
    expect(harness.releaseTaskParentCalls).toEqual([
      {
        workspaceId: parked!.delegatedWorkspaceId,
        taskId: parked!.delegatedTaskId,
      },
    ]);

    // A repeated detach finds no active delegation to release: refused, and
    // the delegation stamp is not touched a second time.
    const repeated = await harness.coordinator.detach({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
      expected: { ...identity, phase: "cancelled" },
    });
    expect(repeated.accepted).toBe(false);
    expect(repeated.reason).toBe("invalid-state");
    expect(harness.releaseTaskParentCalls).toHaveLength(1);
  });

  test("a cancelled delegation is not restarted by a retry", async () => {
    const harness = createHarness({
      runTask: () => new Promise<{ turnId: string }>(() => {}),
    });
    await harness.coordinator.delegate(delegateArgs());
    await harness.coordinator.stop({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
    });

    const retried = await harness.coordinator.delegate(
      delegateArgs({ retry: true }),
    );

    expect(retried.accepted).toBe(false);
    expect(retried.reason).toBe("cancelled");
    expect(harness.runTaskCalls).toHaveLength(1);
  });

  test("summaries carry identity, phase and reason and no child output", async () => {
    const harness = createHarness();
    await harness.coordinator.delegate(delegateArgs());
    await harness.coordinator.waitForInFlight();

    const [summary] = await harness.coordinator.list({
      parentTaskId: PARENT_TASK,
    });

    expect(Object.keys(summary).sort()).toEqual([
      "attempt",
      "completedAt",
      "createdAt",
      "delegatedTaskId",
      "delegatedTurnId",
      "delegatedWorkspaceId",
      "delegationKey",
      "lifecycle",
      "parentTaskId",
      "phase",
      "providerId",
      "reason",
      "runId",
      "stepId",
      "updatedAt",
    ]);
  });
});

describe("child permission profiles", () => {
  test("a profile cannot widen provider defaults without a user policy", () => {
    expect(buildDelegatedTaskRuntimeOptions({ providerId: "codex", permissionProfile: "auto" })).toMatchObject({ codexApprovalPolicy: "untrusted", codexAutoApproveStaveLocalMcpTools: false });
    expect(buildDelegatedTaskRuntimeOptions({ providerId: "claude-code", permissionProfile: "auto" })).toMatchObject({ claudePermissionMode: "default", claudeAllowDangerouslySkipPermissions: false });
  });
  test("managed ownership preserves inherited native auto and scoped MCP settings", () => {
    const runtimeOptions = buildDelegatedTaskRuntimeOptions({ providerId: "claude-code", permissionPolicy: { providerId: "claude-code", source: "parent-turn", requestedProfile: "inherit", options: { claudePermissionMode: "auto", claudeAllowDangerouslySkipPermissions: false } } });
    expect(resolveManagedTaskRuntimeOptions({ providerId: "claude-code", runtimeOptions }).claudePermissionMode).toBe("auto");
    const codexOptions = buildDelegatedTaskRuntimeOptions({ providerId: "codex", permissionPolicy: { providerId: "codex", source: "parent-turn", requestedProfile: "inherit", options: { codexApprovalPolicy: "never", codexAutoApproveStaveLocalMcpTools: true } } });
    expect(resolveManagedTaskRuntimeOptions({ providerId: "codex", runtimeOptions: codexOptions }).codexAutoApproveStaveLocalMcpTools).toBe(true);
  });

  test("no secret binding can reach a child through its profile", () => {
    for (const permissionProfile of ["auto", "guided", "manual"] as const) {
      for (const providerId of ["claude-code", "codex"] as const) {
        const options = buildDelegatedTaskRuntimeOptions({
          providerId,
          permissionProfile,
        });
        expect(Object.keys(options)).not.toContain("boundSecretIds");
        expect(Object.keys(options)).not.toContain("secrets");
      }
    }
  });

  test("an explicit model overrides the provider default", () => {
    expect(
      buildDelegatedTaskRuntimeOptions({
        providerId: "codex",
        model: "gpt-5.3-codex",
        permissionProfile: "manual",
      }).model,
    ).toBe("gpt-5.3-codex");
  });
});

test("restart reconciles the delegated execution even when another turn is active", async () => {
  const harness = createHarness({
    runTask: (args) => {
      args.onStarted?.("delegated-turn");
      return new Promise(() => {});
    },
  });
  const started = await harness.coordinator.delegate(delegateArgs());
  const taskId = started.child!.delegatedTaskId;
  harness.statusByTaskId.set(taskId, {
    ...IDLE_STATUS,
    activeTurnId: "later-user-turn",
    latestTurnId: "later-user-turn",
  });
  harness.statusByTurnId.set("delegated-turn", {
    ...IDLE_STATUS,
    activeTurnId: "later-user-turn",
    latestTurnId: "delegated-turn",
    latestTurnCompletedAt: "2026-10-01T00:00:00Z",
    latestTurnError: "Provider exploded",
    latestTurnOutcome: "failed",
  });
  const restarted = harness.restart();
  await restarted.reconcile();
  expect(
    (
      await restarted.get({
        parentTaskId: PARENT_TASK,
        delegationKey: "review-docs",
      })
    )?.phase,
  ).toBe("failed");
});

test("restart interrupts legacy unknown evidence instead of declaring completion", async () => {
  const harness = createHarness({
    runTask: (args) => {
      args.onStarted?.("legacy-turn");
      return new Promise(() => {});
    },
  });
  await harness.coordinator.delegate(delegateArgs());
  harness.statusByTurnId.set("legacy-turn", {
    ...IDLE_STATUS,
    latestTurnId: "legacy-turn",
    latestTurnCompletedAt: "2026-10-01T00:00:00Z",
    latestTurnOutcome: "unknown",
  });
  const restarted = harness.restart();
  await restarted.reconcile();
  expect(
    (
      await restarted.get({
        parentTaskId: PARENT_TASK,
        delegationKey: "review-docs",
      })
    )?.phase,
  ).toBe("interrupted");
});

test("restart preserves cancellation rather than recording provider failure", async () => {
  const harness = createHarness({
    runTask: (args) => {
      args.onStarted?.("cancelled-turn");
      return new Promise(() => {});
    },
  });
  await harness.coordinator.delegate(delegateArgs());
  harness.statusByTurnId.set("cancelled-turn", {
    ...IDLE_STATUS,
    latestTurnId: "cancelled-turn",
    latestTurnCompletedAt: "2026-10-01T00:00:00Z",
    latestTurnError: "Provider turn was interrupted before it completed.",
    latestTurnOutcome: "cancelled",
  });
  const restarted = harness.restart();
  await restarted.reconcile();
  expect(
    (
      await restarted.get({
        parentTaskId: PARENT_TASK,
        delegationKey: "review-docs",
      })
    )?.phase,
  ).toBe("cancelled");
});

describe("stave_delegate_task defaults", () => {
  const toolInput = (overrides: Record<string, unknown> = {}) => ({
    repositoryPath: REPOSITORY_PATH,
    parentWorkspaceId: PARENT_WORKSPACE,
    parentTaskId: PARENT_TASK,
    prompt: "Review the docs.",
    ...overrides,
  });

  test("the tool schema requires only the ids and the prompt and offers access, not profiles", () => {
    const shape = DelegateTaskToolInputSchema.shape;
    const required = Object.entries(shape).filter(([, field]) => !field.isOptional()).map(([name]) => name);
    expect(required.sort()).toEqual(["parentTaskId", "parentWorkspaceId", "prompt", "repositoryPath"]);
    expect(shape.access.unwrap().options).toEqual(["inherit", "read-only"]);
    expect(shape.access.description).toContain("read-only");
    expect(shape.permissionProfile.description).toContain("Deprecated");
  });

  test("omitted provider, lifecycle, workspace and key resolve to the parent's defaults, idempotently", async () => {
    const harness = createHarness({ realPolicy: true, parentDefaults: { providerId: "claude-code", effort: "high" } });
    const first = await harness.coordinator.delegateFromTool(toolInput({ access: "read-only" }));
    expect(first).toMatchObject({ accepted: true, duplicate: false });
    expect(first.child).toMatchObject({ providerId: "claude-code", lifecycle: "one-turn", delegatedWorkspaceId: PARENT_WORKSPACE, requestedEffort: "high" });
    expect(first.child!.delegationKey).toMatch(/^review-the-docs-[0-9a-f]{12}$/);
    expect(harness.runTaskCalls[0]).toMatchObject({ providerId: "claude-code", effort: "high", workspaceId: PARENT_WORKSPACE });
    expect(harness.policyCalls[0]).toMatchObject({ access: "read-only" });
    await harness.coordinator.waitForInFlight();
    const second = await harness.coordinator.delegateFromTool(toolInput({ access: "read-only" }));
    expect(second).toMatchObject({ accepted: true, duplicate: true });
    expect(second.child!.delegatedTaskId).toBe(first.child!.delegatedTaskId);
    expect(harness.runTaskCalls).toHaveLength(1);
    // A different model is a different request, so a parallel consult gets its own child.
    const other = await harness.coordinator.delegateFromTool(toolInput({ access: "read-only", model: "claude-sonnet-4-5" }));
    expect(other).toMatchObject({ accepted: true, duplicate: false });
    expect(other.child!.delegationKey).not.toBe(first.child!.delegationKey);
  });

  test("effort is inherited only by a same-provider child and an explicit choice wins", async () => {
    const harness = createHarness({ parentDefaults: { providerId: "claude-code", effort: "max" } });
    await harness.coordinator.delegateFromTool(toolInput({ provider: "codex", workspace: { mode: "new-worktree", name: "codex-review" } }));
    await harness.coordinator.delegateFromTool(toolInput({ prompt: "Second opinion.", effort: "low", workspace: { mode: "new-worktree", name: "claude-review" } }));
    expect(harness.runTaskCalls[0]).toMatchObject({ providerId: "codex" });
    expect(harness.runTaskCalls[0]!.effort).toBeUndefined();
    expect(harness.runTaskCalls[1]).toMatchObject({ providerId: "claude-code", effort: "low" });
  });

  test("a legacy permissionProfile is accepted, recorded as provenance and not applied", async () => {
    const harness = createHarness({ realPolicy: true, parentDefaults: { providerId: "claude-code" } });
    const response = await harness.coordinator.delegateFromTool(toolInput({ permissionProfile: "guided" }));
    expect(response.accepted).toBe(true);
    expect(harness.policyCalls[0]).toMatchObject({ access: "inherit", requestedProfile: "guided" });
    expect(harness.policyCalls[0]!.permissionProfile).toBeUndefined();
    expect(harness.runTaskCalls[0]!.permissionPolicy).toMatchObject({ requestedProfile: "guided", access: "inherit", options: { claudePermissionMode: "default" } });
  });

  test("an unknown parent provider asks for one instead of guessing", async () => {
    const harness = createHarness({ parentDefaults: null });
    const response = await harness.coordinator.delegateFromTool(toolInput());
    expect(response).toMatchObject({ accepted: false, reason: "invalid-request" });
    expect(response.message).toContain("Name a provider");
    expect((await harness.coordinator.delegateFromTool(toolInput({ provider: "codex" }))).accepted).toBe(true);
  });
});

test("a retry asks for the access and inherited effort the delegation was created with", async () => {
  let attempts = 0;
  const harness = createHarness({
    realPolicy: true,
    parentDefaults: { providerId: "codex", effort: "xhigh" },
    runTask: async () => {
      if (++attempts === 1) throw new Error("Provider exploded");
      return { turnId: `turn-${attempts}` };
    },
  });
  const created = await harness.coordinator.delegateFromTool({
    repositoryPath: REPOSITORY_PATH, parentWorkspaceId: PARENT_WORKSPACE, parentTaskId: PARENT_TASK,
    prompt: "Research the flaky test.", access: "read-only",
  });
  await harness.coordinator.waitForInFlight();
  const failed = await harness.coordinator.get({ parentTaskId: PARENT_TASK, delegationKey: created.child!.delegationKey });
  expect(failed?.phase).toBe("failed");
  // Renewed parent permissions do not reach the retry: the store pins it, and the request repeats it.
  const retried = await harness.coordinator.retry({
    repositoryPath: REPOSITORY_PATH, parentWorkspaceId: PARENT_WORKSPACE, parentTaskId: PARENT_TASK,
    delegationKey: created.child!.delegationKey, prompt: "Try again.",
    expected: { delegatedTaskId: failed!.delegatedTaskId, delegatedWorkspaceId: failed!.delegatedWorkspaceId, attempt: failed!.attempt },
  });
  expect(retried.accepted).toBe(true);
  await harness.coordinator.waitForInFlight();
  expect(harness.policyCalls.at(-1)).toMatchObject({ access: "read-only" });
  expect(harness.runTaskCalls[1]).toMatchObject({ effort: "xhigh", permissionPolicy: { access: "read-only", options: { codexFileAccess: "read-only", codexApprovalPolicy: "never" } } });
});
