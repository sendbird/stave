import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import {
  createChildTaskCoordinator,
  type ChildTaskHostPort,
  type ChildTaskLedgerPort,
} from "../electron/main/runs/child-task-coordinator";
import { buildChildTaskRuntimeOptions } from "../src/lib/runs/child-task-runtime";
import type { ChildTaskDelegateArgs } from "../src/lib/runs/child-task";

const PROJECT_PATH = "/tmp/stave";
const PARENT_WORKSPACE = "workspace-parent";
const PARENT_TASK = "parent-task-1";

type TaskStatus = {
  ok: true;
  activeTurnId: string | null;
  latestTurnId: string | null;
  latestTurnCompletedAt: string | null;
  latestTurnError: string | null;
};

const IDLE_STATUS: TaskStatus = {
  ok: true,
  activeTurnId: null,
  latestTurnId: null,
  latestTurnCompletedAt: null,
  latestTurnError: null,
};

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
    }) => Promise<{ turnId: string }>;
    knownWorkspaces?: Record<string, string>;
  } = {},
) {
  const runTaskCalls: Array<Record<string, unknown>> = [];
  const stopTaskCalls: Array<Record<string, unknown>> = [];
  const createWorkspaceCalls: Array<Record<string, unknown>> = [];
  const statusByTaskId = new Map<string, TaskStatus>([
    [PARENT_TASK, IDLE_STATUS],
  ]);
  let hostUnavailable = false;
  const knownWorkspaces = new Map(
    Object.entries(
      options.knownWorkspaces ?? {
        [PARENT_WORKSPACE]: `${PROJECT_PATH}/.stave/workspaces/parent`,
      },
    ),
  );

  const host: ChildTaskHostPort = {
    async resolveWorkspace({ workspaceId }) {
      const workspacePath = knownWorkspaces.get(workspaceId);
      return workspacePath
        ? { workspaceId, workspacePath, projectPath: PROJECT_PATH }
        : null;
    },
    async createWorkspace({ name }) {
      createWorkspaceCalls.push({ name });
      const workspaceId = `workspace-${name}`;
      const workspacePath = `${PROJECT_PATH}/.stave/workspaces/${name}`;
      knownWorkspaces.set(workspaceId, workspacePath);
      return { workspaceId, workspacePath, projectPath: PROJECT_PATH };
    },
    async getTaskStatus({ taskId }) {
      if (hostUnavailable) {
        return { ok: false, reason: "unavailable" };
      }
      return statusByTaskId.get(taskId) ?? { ok: false, reason: "missing" };
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
  };

  return {
    host,
    runTaskCalls,
    stopTaskCalls,
    createWorkspaceCalls,
    statusByTaskId,
    setHostUnavailable: (value: boolean) => {
      hostUnavailable = value;
    },
  };
}

function createHarness(
  options: Parameters<typeof createHost>[0] & { concurrencyLimit?: number } = {},
) {
  const store = new RunLedgerStore(new Database(":memory:"));
  const hostHarness = createHost(options);
  let clock = 0;
  const createCoordinator = () =>
    createChildTaskCoordinator({
      getLedger: () => createLedgerPort(store),
      host: hostHarness.host,
      concurrencyLimit: options.concurrencyLimit ?? 3,
      now: () => new Date(Date.UTC(2026, 7, 10, 0, 0, clock++)).toISOString(),
      createExecutionId: () => `execution-${clock}`,
    });
  return {
    store,
    coordinator: createCoordinator(),
    // A restart is a fresh coordinator over the same durable ledger: nothing of
    // the previous process's in-flight state survives.
    restart: createCoordinator,
    ...hostHarness,
  };
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

describe("child task coordinator", () => {
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
        taskId: response.child?.childTaskId,
      });
      const settled = await harness.coordinator.get({
        parentTaskId: PARENT_TASK,
        delegationKey: `to-${providerId}`,
      });
      expect(settled?.phase).toBe("completed");
      expect(settled?.childTurnId).toBe("turn-1");
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
    expect(second.child?.childTaskId).toBe(first.child?.childTaskId ?? "");
    expect(third.child?.childTaskId).toBe(first.child?.childTaskId ?? "");
    expect(await harness.coordinator.list({ parentTaskId: PARENT_TASK })).toHaveLength(
      1,
    );
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
    const foreignProject = await harness.coordinator.delegate(
      delegateArgs({ projectPath: "/tmp/other-project" }),
    );
    const unknownParent = await harness.coordinator.delegate(
      delegateArgs({ parentTaskId: "parent-task-missing" }),
    );

    expect(unknownWorkspace.reason).toBe("invalid-ownership");
    expect(foreignProject.reason).toBe("invalid-ownership");
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
    expect(response.child?.childWorkspaceId).toBe("workspace-docs-review");
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
      { workspaceId: PARENT_WORKSPACE, taskId: started.child?.childTaskId },
    ]);
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
    const childTaskId = started.child?.childTaskId ?? "";
    const restarted = harness.restart();

    // Still running after the restart: the ledger must not close the row.
    harness.statusByTaskId.set(childTaskId, {
      ...IDLE_STATUS,
      activeTurnId: "turn-live",
    });
    expect(await restarted.reconcile()).toEqual({
      reconciled: 0,
      deferred: 0,
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
    // child task rather than carrying its output.
    harness.statusByTaskId.set(childTaskId, {
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
    expect(completed?.childTurnId).toBe("turn-7");
    expect(
      harness.store.getAggregate({
        runId: completed?.runId ?? "",
        stepId: completed?.stepId ?? "",
      })?.step.resultArtifactRef,
    ).toBe(`stave://workspace/${PARENT_WORKSPACE}/task/${childTaskId}/turn/turn-7`);
  });

  test("a child that vanished across a restart is interrupted, not forgotten", async () => {
    const harness = createHarness({
      runTask: () => new Promise<{ turnId: string }>(() => {}),
    });
    const started = await harness.coordinator.delegate(delegateArgs());
    harness.statusByTaskId.delete(started.child?.childTaskId ?? "");
    const restarted = harness.restart();

    expect(await restarted.reconcile()).toMatchObject({
      reconciled: 1,
    });
    const reconciled = await restarted.get({
      parentTaskId: PARENT_TASK,
      delegationKey: "review-docs",
    });
    expect(reconciled?.phase).toBe("interrupted");
    expect(reconciled?.reason).toBe("The child task is no longer present.");
  });

  test("an unreachable task runtime defers reconciliation instead of closing the child", async () => {
    const harness = createHarness({
      runTask: () => new Promise<{ turnId: string }>(() => {}),
    });
    const started = await harness.coordinator.delegate(delegateArgs());
    const childTaskId = started.child?.childTaskId ?? "";
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
    harness.statusByTaskId.set(childTaskId, {
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

  test("a failed delegation retries onto the same child task", async () => {
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
    expect(retried.child?.childTaskId).toBe(first.child?.childTaskId ?? "");
    expect(settled?.phase).toBe("completed");
    expect(settled?.attempt).toBe(2);
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
      "childTaskId",
      "childTurnId",
      "childWorkspaceId",
      "completedAt",
      "createdAt",
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
  test("a profile is resolved from itself, never from the parent", () => {
    expect(
      buildChildTaskRuntimeOptions({
        providerId: "codex",
        permissionProfile: "guided",
      }),
    ).toMatchObject({
      codexApprovalPolicy: "untrusted",
      codexFileAccess: "workspace-write",
      codexNetworkAccess: false,
    });
    expect(
      buildChildTaskRuntimeOptions({
        providerId: "claude-code",
        permissionProfile: "guided",
      }),
    ).toMatchObject({
      claudePermissionMode: "default",
      claudeAllowUnsandboxedCommands: false,
      claudeAllowDangerouslySkipPermissions: false,
    });
    expect(
      buildChildTaskRuntimeOptions({
        providerId: "claude-code",
        permissionProfile: "auto",
      }),
    ).toMatchObject({ claudePermissionMode: "bypassPermissions" });
  });

  test("no secret binding can reach a child through its profile", () => {
    for (const permissionProfile of ["auto", "guided", "manual"] as const) {
      for (const providerId of ["claude-code", "codex"] as const) {
        const options = buildChildTaskRuntimeOptions({
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
      buildChildTaskRuntimeOptions({
        providerId: "codex",
        model: "gpt-5.3-codex",
        permissionProfile: "manual",
      }).model,
    ).toBe("gpt-5.3-codex");
  });
});
