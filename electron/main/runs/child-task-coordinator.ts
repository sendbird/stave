import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import {
  buildChildTaskArtifactRef,
  buildChildTaskPolicy,
  buildChildTaskRunId,
  buildChildTaskStepId,
  ChildTaskActionResponseSchema,
  ChildTaskDelegateArgsSchema,
  ChildTaskDetachArgsSchema,
  ChildTaskFollowUpArgsSchema,
  ChildTaskListArgsSchema,
  ChildTaskListSchema,
  ChildTaskRetryArgsSchema,
  ChildTaskStopArgsSchema,
  ChildTaskSummarySchema,
  CHILD_TASK_DETACHED_REASON,
  CHILD_TASK_LIST_LIMIT,
  CHILD_TASK_RUN_KIND,
  CHILD_TASK_STEP_KIND,
  CHILD_TASK_STOPPED_REASON,
  describeChildTaskRejection,
  isActiveChildTaskPhase,
  resolveChildTaskControls,
  toChildTaskSummary,
  validateChildTaskIdentity,
  type ChildTaskActionResponse,
  type ChildTaskDelegateArgs,
  type ChildTaskExpectedIdentity,
  type ChildTaskLifecycle,
  type ChildTaskPermissionProfile,
  type ChildTaskRejectionReason,
  type ChildTaskSummary,
} from "../../../src/lib/runs/child-task";
import {
  createPendingRun,
  createPendingRunStep,
  RUN_LEDGER_SCHEMA_VERSION,
  type RunRecord,
  type RunStepRecord,
  type RunStepTarget,
} from "../../../src/lib/runs/run-domain";
import type { RunLedgerTransitionResult } from "../../persistence/run-ledger-store";

/**
 * The child-task half of the run ledger. It records delegation; it never
 * executes. Creating the child task and running its turns is the normal task
 * machinery's job, reached through the injected host port, so a child is a real
 * Stave task that survives a restart rather than an in-process worker.
 */

export interface ChildTaskLedgerPort {
  getRunAggregate(args: { runId: string; stepId: string }): {
    run: RunRecord;
    step: RunStepRecord;
  } | null;
  claimRunStep(args: {
    run: RunRecord;
    step: RunStepRecord;
    executionId: string;
    idempotencyKey: string;
    now: string;
  }): RunLedgerTransitionResult;
  markRunStepWaiting(args: {
    runId: string;
    stepId: string;
    executionId: string;
    idempotencyKey: string;
    detail?: unknown;
    now: string;
  }): RunLedgerTransitionResult;
  completeRunStep(args: {
    runId: string;
    stepId: string;
    executionId: string;
    idempotencyKey: string;
    resultArtifactRef: string;
    now: string;
  }): RunLedgerTransitionResult;
  failRunStep(args: {
    runId: string;
    stepId: string;
    executionId: string;
    idempotencyKey: string;
    error: string;
    detail?: unknown;
    now: string;
  }): RunLedgerTransitionResult;
  cancelRunStep(args: {
    runId: string;
    stepId: string;
    idempotencyKey: string;
    expectedExecutionId?: string;
    detail?: unknown;
    error?: string;
    now: string;
  }): RunLedgerTransitionResult;
  interruptRunStep(args: {
    runId: string;
    stepId: string;
    idempotencyKey: string;
    error: string;
    now: string;
  }): RunLedgerTransitionResult;
  setRunStepTarget(args: {
    runId: string;
    stepId: string;
    target: RunStepTarget;
  }): boolean;
  listRunAggregatesByOrigin(args: {
    originKind: string;
    originId: string;
    limit: number;
  }): Array<{ run: RunRecord; step: RunStepRecord }>;
  listActiveRunAggregatesByStepKind(args: { kind: "child-task-turn" }): Array<{
    run: RunRecord;
    step: RunStepRecord;
  }>;
  listRunAggregatesByOwnedTask(args: {
    taskId: string;
    limit: number;
  }): Array<{ run: RunRecord; step: RunStepRecord }>;
}

export interface ChildTaskWorkspaceLocation {
  workspaceId: string;
  workspacePath: string;
  projectPath: string;
}

export interface ChildTaskHostPort {
  resolveWorkspace(args: {
    workspaceId: string;
  }): Promise<ChildTaskWorkspaceLocation | null>;
  createWorkspace(args: {
    projectPath: string;
    name: string;
    fromBranch?: string;
  }): Promise<ChildTaskWorkspaceLocation>;
  /**
   * "The task is gone" and "the task machinery could not be reached" are
   * different answers: the first closes a delegation, the second must never
   * close one. They are kept apart in the contract so a host that is still
   * starting up cannot be read as a child that disappeared.
   */
  getTaskStatus(args: { workspaceId: string; taskId: string }): Promise<
    | {
        ok: true;
        activeTurnId: string | null;
        latestTurnId: string | null;
        latestTurnCompletedAt: string | null;
        latestTurnError: string | null;
      }
    | { ok: false; reason: "missing" | "unavailable" }
  >;
  runTask(args: {
    workspaceId: string;
    taskId: string;
    title?: string;
    prompt: string;
    providerId: "claude-code" | "codex";
    model?: string;
    permissionProfile: ChildTaskDelegateArgs["permissionProfile"];
    /**
     * Stamped onto the child task row when the row is first created, so the
     * renderer can tell a delegated child from a peer task without reading the
     * ledger. The ledger remains the source of truth for the delegation itself.
     */
    parentTaskId: string;
  }): Promise<{ turnId: string }>;
  stopTask(args: { workspaceId: string; taskId: string }): Promise<unknown>;
}

interface ChildTaskCoordinatorDependencies {
  getLedger: (() => ChildTaskLedgerPort) | (() => Promise<ChildTaskLedgerPort>);
  host: ChildTaskHostPort;
  concurrencyLimit: number;
  now?: () => string;
  createExecutionId?: () => string;
  onError?: (error: unknown, context: { scope: string; runId: string }) => void;
  onChange?: (args: { parentTaskId: string }) => void;
}

function hashChildTaskInput(args: ChildTaskDelegateArgs) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        prompt: args.prompt,
        providerId: args.providerId,
        model: args.model ?? null,
        permissionProfile: args.permissionProfile,
        lifecycle: args.lifecycle,
        workspace: args.workspace,
      }),
    )
    .digest("hex");
}

/**
 * A deterministic task id keeps the delegation's identity outside the ledger
 * consistent with the identity inside it: the ledger row is written with the
 * child's id *before* the task exists, so a crash between the two leaves a
 * recorded child rather than an orphan.
 */
function deriveChildTaskId(runId: string) {
  const digest = createHash("sha256").update(runId).digest("hex");
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    digest.slice(12, 16),
    digest.slice(16, 20),
    digest.slice(20, 32),
  ].join("-");
}

function isPathOwnedByProject(args: { projectPath: string; cwd: string }) {
  if (!path.isAbsolute(args.projectPath) || !path.isAbsolute(args.cwd)) {
    return false;
  }
  const projectPath = path.resolve(args.projectPath);
  const cwd = path.resolve(args.cwd);
  if (projectPath === path.parse(projectPath).root) {
    return false;
  }
  const relative = path.relative(projectPath, cwd);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function sanitizeChildError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message.trim()
      : typeof error === "string"
        ? error.trim()
        : "";
  return (message || "The child task failed to start.").slice(0, 1_000);
}

const TRANSITION_REASONS: ReadonlySet<string> = new Set([
  "already-active",
  "already-completed",
  "attempt-limit-reached",
  "cancelled",
  "input-mismatch",
  "invalid-state",
  "not-found",
  "run-conflict",
  // A step whose execution moved on is a stale caller, not an unknown state:
  // the distinction is what lets a refused control say why it was refused.
  "stale-execution",
  "step-conflict",
]);

function toRejectionReason(reason: string): ChildTaskRejectionReason {
  return TRANSITION_REASONS.has(reason)
    ? (reason as ChildTaskRejectionReason)
    : "invalid-state";
}

function summaryFromTransition(
  transition: RunLedgerTransitionResult,
): ChildTaskSummary | null {
  if (!transition.run || !transition.step) {
    return null;
  }
  return toChildTaskSummary({ run: transition.run, step: transition.step });
}

function rejected(
  reason: ChildTaskRejectionReason,
  child: ChildTaskSummary | null = null,
  message?: string,
): ChildTaskActionResponse {
  return ChildTaskActionResponseSchema.parse({
    accepted: false,
    duplicate: false,
    reason,
    message: message ?? describeChildTaskRejection(reason),
    child,
  });
}

function accepted(args: {
  duplicate: boolean;
  child: ChildTaskSummary | null;
}): ChildTaskActionResponse {
  return ChildTaskActionResponseSchema.parse({
    accepted: true,
    duplicate: args.duplicate,
    reason: null,
    message: null,
    child: args.child,
  });
}

export function createChildTaskCoordinator(
  dependencies: ChildTaskCoordinatorDependencies,
) {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const createExecutionId = dependencies.createExecutionId ?? randomUUID;
  const inFlightByStepId = new Map<string, Promise<void>>();

  const getLedger = async () => dependencies.getLedger();

  const reportError = (
    error: unknown,
    context: { scope: string; runId: string },
  ) => {
    dependencies.onError?.(error, context);
  };

  /**
   * A delegation changes phase on its own schedule — a turn ends, a restart
   * reconciles — so the parent surface is told rather than left to poll for it.
   */
  const notifyChanged = (parentTaskId: string) => {
    try {
      dependencies.onChange?.({ parentTaskId });
    } catch (error) {
      reportError(error, { scope: "notify-change", runId: parentTaskId });
    }
  };

  /**
   * Turn the child's terminal outcome into ledger receipts. `one-turn` closes
   * the run; `detached` parks it in `waiting` so the child task stays open for
   * follow-up turns until the parent stops it.
   */
  const settleAfterTurn = (args: {
    ledger: ChildTaskLedgerPort;
    runId: string;
    stepId: string;
    executionId: string;
    lifecycle: ChildTaskLifecycle;
    target: RunStepTarget;
    turnId: string;
    providerId: "claude-code" | "codex";
  }) => {
    const timestamp = now();
    args.ledger.setRunStepTarget({
      runId: args.runId,
      stepId: args.stepId,
      target: { ...args.target, turnId: args.turnId },
    });
    if (args.lifecycle === "detached") {
      return args.ledger.markRunStepWaiting({
        runId: args.runId,
        stepId: args.stepId,
        executionId: args.executionId,
        idempotencyKey: `child:${args.executionId}:turn`,
        detail: { code: "child-turn-completed", providerId: args.providerId },
        now: timestamp,
      });
    }
    return args.ledger.completeRunStep({
      runId: args.runId,
      stepId: args.stepId,
      executionId: args.executionId,
      idempotencyKey: `child:${args.executionId}:completed`,
      resultArtifactRef: buildChildTaskArtifactRef({
        workspaceId: args.target.workspaceId,
        taskId: args.target.taskId,
        turnId: args.turnId,
      }),
      now: timestamp,
    });
  };

  /**
   * Run one turn of a delegation and record what it did. The first turn of a
   * delegation and a later follow-up turn differ only in which execution owns
   * the step, so both go through here and settle the same way.
   */
  const runChildTurn = (args: {
    ledger: ChildTaskLedgerPort;
    runId: string;
    stepId: string;
    parentTaskId: string;
    executionId: string;
    target: RunStepTarget;
    scope: "start-child" | "follow-up-child";
    turn: {
      prompt: string;
      title?: string;
      model?: string;
      permissionProfile: ChildTaskPermissionProfile;
      lifecycle: ChildTaskLifecycle;
    };
  }) => {
    const started = (async () => {
      try {
        const result = await dependencies.host.runTask({
          workspaceId: args.target.workspaceId,
          taskId: args.target.taskId,
          parentTaskId: args.parentTaskId,
          title: args.turn.title,
          prompt: args.turn.prompt,
          providerId: args.target.providerId,
          model: args.turn.model,
          permissionProfile: args.turn.permissionProfile,
        });
        settleAfterTurn({
          ledger: args.ledger,
          runId: args.runId,
          stepId: args.stepId,
          executionId: args.executionId,
          lifecycle: args.turn.lifecycle,
          target: args.target,
          turnId: result.turnId,
          providerId: args.target.providerId,
        });
      } catch (error) {
        const current = args.ledger.getRunAggregate({
          runId: args.runId,
          stepId: args.stepId,
        });
        if (current && !isActiveChildTaskPhase(current.step.status)) {
          return;
        }
        args.ledger.failRunStep({
          runId: args.runId,
          stepId: args.stepId,
          executionId: args.executionId,
          idempotencyKey: `child:${args.executionId}:failed`,
          error: sanitizeChildError(error),
          detail: {
            code: "child-task-failure",
            providerId: args.target.providerId,
          },
          now: now(),
        });
      }
    })()
      .catch((error) => {
        reportError(error, { scope: args.scope, runId: args.runId });
      })
      .finally(() => {
        if (inFlightByStepId.get(args.stepId) === started) {
          inFlightByStepId.delete(args.stepId);
        }
        notifyChanged(args.parentTaskId);
      });
    inFlightByStepId.set(args.stepId, started);
  };

  /**
   * Restart recovery. A child is a real task, so the ledger cannot assume it
   * died with the app: every active delegation is compared against the live
   * task and settled to what actually happened — still running, finished while
   * Stave was down, failed, or genuinely interrupted.
   *
   * A delegation whose task machinery could not be reached is deferred, never
   * closed. `deferred > 0` means the pass has to run again before the ledger
   * matches reality.
   */
  const reconcile = async () => {
    const ledger = await getLedger();
    const aggregates = ledger.listActiveRunAggregatesByStepKind({
      kind: CHILD_TASK_STEP_KIND,
    });
    let reconciled = 0;
    let deferred = 0;
    for (const aggregate of aggregates) {
      const summary = toChildTaskSummary(aggregate);
      const target = aggregate.step.target;
      const executionId = aggregate.step.executionId;
      if (!summary || !target || !executionId) {
        const transition = ledger.interruptRunStep({
          runId: aggregate.run.id,
          stepId: aggregate.step.id,
          idempotencyKey: `restart:${aggregate.step.id}`,
          error: "The delegation lost its child task identity.",
          now: now(),
        });
        reconciled += transition.accepted ? 1 : 0;
        continue;
      }
      if (inFlightByStepId.has(aggregate.step.id)) {
        // This process is still running the turn; its own settlement is
        // authoritative.
        continue;
      }
      const status = await dependencies.host
        .getTaskStatus({
          workspaceId: target.workspaceId,
          taskId: target.taskId,
        })
        .catch(() => ({ ok: false, reason: "unavailable" }) as const);
      if (!status.ok) {
        if (status.reason === "unavailable") {
          deferred += 1;
          continue;
        }
        const transition = ledger.interruptRunStep({
          runId: aggregate.run.id,
          stepId: aggregate.step.id,
          idempotencyKey: `restart:${executionId}`,
          error: "The child task is no longer present.",
          now: now(),
        });
        reconciled += transition.accepted ? 1 : 0;
        continue;
      }
      if (status.activeTurnId) {
        continue;
      }
      if (summary.lifecycle === "detached" && summary.phase === "waiting") {
        continue;
      }
      if (status.latestTurnError) {
        const transition = ledger.failRunStep({
          runId: aggregate.run.id,
          stepId: aggregate.step.id,
          executionId,
          idempotencyKey: `restart:${executionId}:failed`,
          error: status.latestTurnError,
          detail: {
            code: "child-task-failure",
            providerId: target.providerId,
          },
          now: now(),
        });
        reconciled += transition.accepted ? 1 : 0;
        continue;
      }
      if (status.latestTurnId && status.latestTurnCompletedAt) {
        const transition = settleAfterTurn({
          ledger,
          runId: aggregate.run.id,
          stepId: aggregate.step.id,
          executionId,
          lifecycle: summary.lifecycle,
          target,
          turnId: status.latestTurnId,
          providerId: target.providerId,
        });
        reconciled += transition.accepted ? 1 : 0;
        continue;
      }
      const transition = ledger.interruptRunStep({
        runId: aggregate.run.id,
        stepId: aggregate.step.id,
        idempotencyKey: `restart:${executionId}`,
        error: "Stave restarted before the child task's turn finished.",
        now: now(),
      });
      reconciled += transition.accepted ? 1 : 0;
    }
    if (reconciled > 0) {
      for (const parentTaskId of new Set(
        aggregates.map((aggregate) => aggregate.run.origin.id),
      )) {
        notifyChanged(parentTaskId);
      }
    }
    return { reconciled, deferred };
  };

  /**
   * Reconciliation is retried on the next delegation read or write until one
   * pass completes with nothing deferred, so a host service that was still
   * starting up at boot does not leave stale rows behind.
   */
  let reconcileSettled = false;
  let reconcilePass: Promise<void> | null = null;
  const ensureReconciled = async () => {
    if (reconcileSettled) {
      return;
    }
    reconcilePass ??= reconcile()
      .then((result) => {
        reconcileSettled = result.deferred === 0;
      })
      .catch((error) => {
        reportError(error, { scope: "reconcile", runId: "*" });
      })
      .finally(() => {
        reconcilePass = null;
      });
    await reconcilePass;
  };

  const resolveChildWorkspace = async (args: {
    delegate: ChildTaskDelegateArgs;
    parentWorkspace: ChildTaskWorkspaceLocation;
  }) => {
    if (args.delegate.workspace.mode === "same-workspace") {
      return args.parentWorkspace;
    }
    return dependencies.host.createWorkspace({
      projectPath: args.parentWorkspace.projectPath,
      name: args.delegate.workspace.name,
      fromBranch: args.delegate.workspace.fromBranch,
    });
  };

  /**
   * Read one delegation back from the ledger and check it still is what the
   * caller thinks it is. Every control the parent surface offers goes through
   * here first, so a control prepared against an identity that has since moved
   * is refused with a reason instead of landing on the delegation that replaced
   * it.
   */
  const resolveForAction = async (args: {
    parentTaskId: string;
    delegationKey: string;
    expected?: ChildTaskExpectedIdentity;
  }) => {
    const runId = buildChildTaskRunId({
      parentTaskId: args.parentTaskId,
      delegationKey: args.delegationKey,
    });
    const stepId = buildChildTaskStepId(runId);
    const ledger = await getLedger();
    await ensureReconciled();
    const aggregate = ledger.getRunAggregate({ runId, stepId });
    const child = aggregate ? toChildTaskSummary(aggregate) : null;
    if (!child) {
      return { ok: false as const, rejection: rejected("not-found") };
    }
    if (args.expected) {
      const identity = validateChildTaskIdentity({
        expected: args.expected,
        child,
      });
      if (!identity.ok) {
        return {
          ok: false as const,
          rejection: rejected(identity.reason, child, identity.message),
        };
      }
    }
    return {
      ok: true as const,
      ledger,
      runId,
      stepId,
      child,
      step: aggregate!.step,
    };
  };

  const delegateChild = async (
    rawArgs: unknown,
  ): Promise<ChildTaskActionResponse> => {
    const parsed = ChildTaskDelegateArgsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return rejected("invalid-request");
    }
    const args = parsed.data;
    const runId = buildChildTaskRunId({
      parentTaskId: args.parentTaskId,
      delegationKey: args.delegationKey,
    });
    const stepId = buildChildTaskStepId(runId);
    const ledger = await getLedger();

    // ── Parent ownership ────────────────────────────────────────────────
    // A delegation is only legitimate if the caller's parent task really
    // lives in the workspace it names, and that workspace really belongs to
    // the project path the run will be recorded under.
    const parentWorkspace = await dependencies.host.resolveWorkspace({
      workspaceId: args.parentWorkspaceId,
    });
    if (
      !parentWorkspace ||
      !isPathOwnedByProject({
        projectPath: args.projectPath,
        cwd: parentWorkspace.workspacePath,
      })
    ) {
      return rejected("invalid-ownership");
    }
    const parentStatus = await dependencies.host
      .getTaskStatus({
        workspaceId: args.parentWorkspaceId,
        taskId: args.parentTaskId,
      })
      .catch(() => ({ ok: false, reason: "unavailable" }) as const);
    if (!parentStatus.ok) {
      return rejected(
        parentStatus.reason === "missing"
          ? "invalid-ownership"
          : "workspace-unavailable",
      );
    }
    await ensureReconciled();

    const existing = ledger.getRunAggregate({ runId, stepId });
    const existingSummary = existing ? toChildTaskSummary(existing) : null;

    // ── Concurrency ─────────────────────────────────────────────────────
    // Counted per parent task over live children only, and never against the
    // delegation being re-sent, so a retry of a finished child cannot be
    // blocked by its own row.
    const activeOthers = ledger
      .listRunAggregatesByOrigin({
        originKind: "task",
        originId: args.parentTaskId,
        limit: CHILD_TASK_LIST_LIMIT,
      })
      .flatMap((aggregate) => {
        const summary = toChildTaskSummary(aggregate);
        return summary && summary.runId !== runId ? [summary] : [];
      })
      .filter((summary) => isActiveChildTaskPhase(summary.phase));
    if (activeOthers.length >= dependencies.concurrencyLimit) {
      return rejected("concurrency-limit-reached", existingSummary);
    }

    if (existingSummary && !args.retry) {
      // The same key always names the same child. Re-sending it reports the
      // child that exists instead of starting a second one.
      if (isActiveChildTaskPhase(existingSummary.phase)) {
        return accepted({ duplicate: true, child: existingSummary });
      }
    }

    // A retry reuses the workspace the delegation already owns; only a first
    // attempt may cut a new worktree.
    const childWorkspaceId =
      existingSummary?.childWorkspaceId ??
      (
        await resolveChildWorkspace({ delegate: args, parentWorkspace }).catch(
          () => null,
        )
      )?.workspaceId;
    if (!childWorkspaceId) {
      return rejected("workspace-unavailable", existingSummary);
    }

    const childTaskId =
      existingSummary?.childTaskId ?? deriveChildTaskId(runId);
    const target: RunStepTarget = {
      taskId: childTaskId,
      workspaceId: childWorkspaceId,
      turnId: existingSummary?.childTurnId ?? null,
      providerId: args.providerId,
    };
    const timestamp = now();
    const executionId = createExecutionId();
    const attempt = existing ? existing.step.attempt : 0;
    const transition = ledger.claimRunStep({
      run: createPendingRun({
        id: runId,
        kind: CHILD_TASK_RUN_KIND,
        origin: { kind: "task", id: args.parentTaskId },
        ownership: {
          projectPath: args.projectPath,
          workspaceId: childWorkspaceId,
          taskId: childTaskId,
        },
        policy: buildChildTaskPolicy(args.lifecycle),
        provenance: {
          createdBy: "child-task-coordinator",
          schemaVersion: RUN_LEDGER_SCHEMA_VERSION,
        },
        now: timestamp,
      }),
      step: createPendingRunStep({
        id: stepId,
        runId,
        kind: CHILD_TASK_STEP_KIND,
        target,
        dependencyIds: [],
        inputHash: hashChildTaskInput(args),
        now: timestamp,
      }),
      executionId,
      idempotencyKey: args.retry
        ? `${args.delegationKey}:attempt-${attempt + 1}`
        : args.delegationKey,
      now: timestamp,
    });

    if (!transition.accepted) {
      return rejected(
        toRejectionReason(transition.reason),
        summaryFromTransition(transition) ?? existingSummary,
      );
    }
    const child = summaryFromTransition(transition);
    if (transition.duplicate || !child) {
      return accepted({
        duplicate: true,
        child: child ?? existingSummary,
      });
    }

    runChildTurn({
      ledger,
      runId,
      stepId,
      parentTaskId: args.parentTaskId,
      executionId,
      target,
      scope: "start-child",
      turn: {
        prompt: args.prompt,
        title: args.title,
        model: args.model,
        permissionProfile: args.permissionProfile,
        lifecycle: args.lifecycle,
      },
    });
    notifyChanged(args.parentTaskId);
    return accepted({ duplicate: false, child });
  };

  return {
    delegate: delegateChild,

    /**
     * A fresh attempt on a delegation that ended without succeeding. Provider,
     * lifecycle and workspace come from the delegation the ledger already
     * holds, so the retry stays the same delegation rather than a new one
     * borrowing its key.
     */
    async retry(rawArgs: unknown): Promise<ChildTaskActionResponse> {
      const parsed = ChildTaskRetryArgsSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return rejected("invalid-request");
      }
      const args = parsed.data;
      const resolved = await resolveForAction(args);
      if (!resolved.ok) {
        return resolved.rejection;
      }
      if (!resolveChildTaskControls(resolved.child).canRetry) {
        return rejected("invalid-state", resolved.child);
      }
      return delegateChild({
        projectPath: args.projectPath,
        parentWorkspaceId: args.parentWorkspaceId,
        parentTaskId: args.parentTaskId,
        delegationKey: args.delegationKey,
        prompt: args.prompt,
        providerId: resolved.child.providerId,
        permissionProfile: args.permissionProfile,
        lifecycle: resolved.child.lifecycle,
        // Ignored on a retry: the delegation keeps the workspace it owns.
        workspace: { mode: "same-workspace" },
        retry: true,
      });
    },

    /**
     * One more turn on a child that is parked open. The delegation stays in
     * `waiting` for the whole follow-up — the ledger records the delegation's
     * lifecycle, and the child's own task surface is where its turn-by-turn
     * state lives.
     */
    async followUp(rawArgs: unknown): Promise<ChildTaskActionResponse> {
      const parsed = ChildTaskFollowUpArgsSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return rejected("invalid-request");
      }
      const args = parsed.data;
      const resolved = await resolveForAction(args);
      if (!resolved.ok) {
        return resolved.rejection;
      }
      const target = resolved.step.target;
      const executionId = resolved.step.executionId;
      if (
        !resolveChildTaskControls(resolved.child).canFollowUp ||
        !target ||
        !executionId
      ) {
        return rejected("invalid-state", resolved.child);
      }
      if (inFlightByStepId.has(resolved.stepId)) {
        return rejected("already-active", resolved.child);
      }
      runChildTurn({
        ledger: resolved.ledger,
        runId: resolved.runId,
        stepId: resolved.stepId,
        parentTaskId: args.parentTaskId,
        executionId,
        target,
        scope: "follow-up-child",
        turn: {
          prompt: args.prompt,
          permissionProfile: args.permissionProfile,
          lifecycle: resolved.child.lifecycle,
        },
      });
      return accepted({ duplicate: false, child: resolved.child });
    },

    /**
     * Release the delegation and leave the child running. Only the parent's
     * claim ends here: the child task is never asked to stop, which is the one
     * thing that separates this from `stop`.
     */
    async detach(rawArgs: unknown): Promise<ChildTaskActionResponse> {
      const parsed = ChildTaskDetachArgsSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return rejected("invalid-request");
      }
      const args = parsed.data;
      const resolved = await resolveForAction(args);
      if (!resolved.ok) {
        return resolved.rejection;
      }
      if (!resolveChildTaskControls(resolved.child).canDetach) {
        return rejected("invalid-state", resolved.child);
      }
      const transition = resolved.ledger.cancelRunStep({
        runId: resolved.runId,
        stepId: resolved.stepId,
        idempotencyKey: `detach:${args.delegationKey}`,
        detail: {
          code: "child-task-detached",
          providerId: resolved.child.providerId,
        },
        error: CHILD_TASK_DETACHED_REASON,
        now: now(),
      });
      if (!transition.accepted) {
        return rejected(
          toRejectionReason(transition.reason),
          summaryFromTransition(transition) ?? resolved.child,
        );
      }
      notifyChanged(args.parentTaskId);
      return accepted({
        duplicate: transition.duplicate,
        child: summaryFromTransition(transition),
      });
    },

    async list(rawArgs: unknown) {
      const parsed = ChildTaskListArgsSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return ChildTaskListSchema.parse([]);
      }
      const ledger = await getLedger();
      await ensureReconciled();
      const summaries = ledger
        .listRunAggregatesByOrigin({
          originKind: "task",
          originId: parsed.data.parentTaskId,
          limit: CHILD_TASK_LIST_LIMIT,
        })
        .flatMap((aggregate) => {
          const summary = toChildTaskSummary(aggregate);
          return summary ? [summary] : [];
        })
        .filter(
          (summary) =>
            parsed.data.includeFinished ||
            isActiveChildTaskPhase(summary.phase),
        );
      return ChildTaskListSchema.parse(summaries);
    },

    async stop(rawArgs: unknown): Promise<ChildTaskActionResponse> {
      const parsed = ChildTaskStopArgsSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return rejected("invalid-request");
      }
      const args = parsed.data;
      const resolved = await resolveForAction(args);
      if (!resolved.ok) {
        return resolved.rejection;
      }
      const { ledger, runId, stepId } = resolved;
      const target = resolved.step.target;
      const transition = ledger.cancelRunStep({
        runId,
        stepId,
        idempotencyKey: `stop:${args.delegationKey}`,
        detail: {
          code: "child-task-stopped",
          message: args.reason,
          providerId: target?.providerId,
        },
        error: args.reason ?? CHILD_TASK_STOPPED_REASON,
        now: now(),
      });
      if (!transition.accepted) {
        return rejected(
          toRejectionReason(transition.reason),
          summaryFromTransition(transition),
        );
      }
      if (!transition.duplicate && target) {
        // Cancelling the ledger row is the durable half; asking the child task
        // to stop is best effort, because a child that already ended is a
        // successful stop.
        await dependencies.host
          .stopTask({
            workspaceId: target.workspaceId,
            taskId: target.taskId,
          })
          .catch((error) => {
            reportError(error, { scope: "stop-child", runId });
          });
      }
      notifyChanged(args.parentTaskId);
      return accepted({
        duplicate: transition.duplicate,
        child: summaryFromTransition(transition),
      });
    },

    reconcile,

    /**
     * Settle the delegations this process started but has not yet recorded a
     * terminal receipt for. The ledger is the durable record either way — this
     * only lets a caller wait for the in-process half rather than racing it.
     */
    async waitForInFlight() {
      await Promise.all([...inFlightByStepId.values()]);
    },

    /**
     * The delegation that owns a task, seen from the child's side. A child task
     * is an ordinary task, so the only way its own surface can show who
     * delegated it is to ask the ledger.
     */
    async getParentLink(args: { childTaskId: string }) {
      const ledger = await getLedger();
      const summaries = ledger
        .listRunAggregatesByOwnedTask({
          taskId: args.childTaskId,
          limit: CHILD_TASK_LIST_LIMIT,
        })
        .flatMap((aggregate) => {
          const summary = toChildTaskSummary(aggregate);
          return summary && summary.childTaskId === args.childTaskId
            ? [summary]
            : [];
        });
      return summaries[0] ?? null;
    },

    async get(args: { parentTaskId: string; delegationKey: string }) {
      const runId = buildChildTaskRunId(args);
      const ledger = await getLedger();
      const aggregate = ledger.getRunAggregate({
        runId,
        stepId: buildChildTaskStepId(runId),
      });
      const summary = aggregate ? toChildTaskSummary(aggregate) : null;
      return summary ? ChildTaskSummarySchema.parse(summary) : null;
    },
  };
}

export type ChildTaskCoordinator = ReturnType<
  typeof createChildTaskCoordinator
>;
