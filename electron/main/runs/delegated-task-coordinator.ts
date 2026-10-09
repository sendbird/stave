import { isReadOnlyDelegationPolicy, type DelegationPermissionPolicy } from "../../../src/lib/runs/delegation-policy";
import type { AgentSnapshot } from "../../../src/lib/agents/compile";
import type { AgentPermission } from "../../../src/lib/agents/schema";
import { DelegatedTaskTurnError } from "./delegated-task-turn-error";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import {
  buildDelegatedTaskArtifactRef,
  buildDelegatedTaskPolicy,
  buildDelegatedTaskRunId,
  buildDelegatedTaskStepId,
  DelegatedTaskActionResponseSchema,
  DelegateTaskArgsSchema,
  DelegateTaskToolInputSchema,
  DelegatedTaskDetachArgsSchema,
  DelegatedTaskFollowUpArgsSchema,
  DelegatedTaskListArgsSchema,
  DelegatedTaskListSchema,
  DelegatedTaskRetryArgsSchema,
  DelegatedTaskStopArgsSchema,
  DelegatedTaskSummarySchema,
  DELEGATED_TASK_DETACHED_REASON,
  DELEGATED_TASK_LIST_LIMIT,
  DELEGATED_TASK_RUN_KIND,
  DELEGATED_TASK_STEP_KIND,
  DELEGATED_TASK_STOPPED_REASON,
  delegatedTaskResultText,
  delegatedTaskWaitingReason,
  resolveDelegatedTaskWaitSeconds,
  describeDelegatedTaskRejection,
  isActiveDelegatedTaskPhase,
  isReservedDelegationKey,
  resolveDelegatedTaskControls,
  toDelegatedTaskSummary,
  validateDelegatedTaskIdentity,
  type DelegatedTaskActionResponse,
  type DelegateTaskArgs,
  type DelegatedTaskAccess,
  type DelegatedTaskEffort,
  type DelegatedTaskExpectedIdentity,
  type DelegatedTaskLifecycle,
  type DelegatedTaskPermissionProfile,
  type DelegatedTaskRejectionReason,
  type DelegatedTaskSummary,
} from "../../../src/lib/runs/delegated-task";
import {
  createPendingRun,
  createPendingRunStep,
  RUN_LEDGER_SCHEMA_VERSION,
  type RunReceiptRecord,
  type RunRecord,
  type RunStepRecord,
  type RunStepTarget,
  boundResponseText,
} from "../../../src/lib/runs/run-domain";
import type { RunLedgerTransitionResult } from "../../persistence/run-ledger-store";
import { ReviewRevisionArgsSchema } from "../../../src/lib/reviews/review-revision";
import type { WorkspaceRevision } from "../../../src/lib/agent-runs/verification-contract";
import { captureReviewRevision, reviewRevisionState } from "./review-workspace-revisions";
import type { AgentRunDetail } from "../../../src/lib/agent-runs/api";
import type { DelegatedAgentRunStart, DelegatedAgentRunRead } from "../../../src/lib/agent-runs/delegated-run";
import { readDelegatedAgentCompletion } from "../../../src/lib/agent-runs/delegated-completion";
import { buildDelegatedTaskRuntimeOptions } from "../../../src/lib/runs/delegated-task-runtime";
import { formatAgentRunReportMarkdown } from "../../../src/lib/agent-runs/report-markdown";
import { currentStageRecord } from "../../../src/lib/agent-runs/domain";

/**
 * The delegated-task half of the run ledger. It records delegation; it never
 * executes. Creating the delegated task and running its turns is the normal task
 * machinery's job, reached through the injected host port, so a child is a real
 * Stave task that survives a restart rather than an in-process worker.
 */

export interface DelegatedTaskLedgerPort {
  resumeRunStep?: (args: { runId: string; stepId: string; executionId: string; idempotencyKey: string; now: string; detail?: unknown; reenter?: boolean }) => RunLedgerTransitionResult;
  getRunAggregate(args: { runId: string; stepId: string }): {
    run: RunRecord;
    step: RunStepRecord;
  } | null;
  claimRunStep(args: {
    run: RunRecord;
    step: RunStepRecord;
    executionId: string;
    idempotencyKey: string;
    detail?: unknown;
    now: string;
  }): RunLedgerTransitionResult;
  markRunStepWaiting(args: {
    runId: string;
    stepId: string;
    executionId: string;
    idempotencyKey: string;
    detail?: unknown;
    reenter?: boolean;
    now: string;
  }): RunLedgerTransitionResult;
  listRunReceipts(args: { runId: string }): RunReceiptRecord[];
  completeRunStep(args: {
    runId: string;
    stepId: string;
    executionId: string;
    idempotencyKey: string;
    resultArtifactRef: string;
    detail?: unknown;
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
    expectedExecutionId?: string;
    expectedTurnExecutionId?: string;
  }): boolean;
  listRunAggregatesByOrigin(args: {
    originKind: string;
    originId: string;
    limit: number;
  }): Array<{ run: RunRecord; step: RunStepRecord }>;
  listActiveRunAggregatesByStepKind(args: { kind: "delegated-task-turn" }): Array<{
    run: RunRecord;
    step: RunStepRecord;
  }>;
  listRunAggregatesByOwnedTask(args: {
    taskId: string;
    limit: number;
  }): Array<{ run: RunRecord; step: RunStepRecord }>;
}

export interface DelegatedTaskWorkspaceLocation {
  workspaceId: string;
  workspacePath: string;
  repositoryPath: string;
}

export interface DelegatedTaskHostPort {
  runAgentRun?: (args: DelegatedAgentRunStart & { onPrepared: () => Promise<boolean> }) => Promise<AgentRunDetail>;
  readAgentRun?: (args: { agentRunId: string }) => Promise<DelegatedAgentRunRead | null>;
  stopAgentRun?: (args: { agentRunId: string; workspaceId: string; taskId: string }) => Promise<unknown>;
  resolveWorkspace(args: {
    workspaceId: string;
  }): Promise<DelegatedTaskWorkspaceLocation | null>;
  createWorkspace(args: {
    repositoryPath: string;
    name: string;
    fromBranch?: string;
  }): Promise<DelegatedTaskWorkspaceLocation>;
  /**
   * "The task is gone" and "the task machinery could not be reached" are
   * different answers: the first closes a delegation, the second must never
   * close one. They are kept apart in the contract so a host that is still
   * starting up cannot be read as a child that disappeared.
   */
  getTaskStatus(args: {
    workspaceId: string;
    taskId: string;
    turnId?: string;
  }): Promise<
    | {
        ok: true;
        activeTurnId: string | null;
        latestTurnId: string | null;
        latestTurnCompletedAt: string | null;
        latestTurnError: string | null;
        latestTurnOutcome?:
          | import("../../persistence/turn-terminal-receipt").TurnTerminalOutcome
          | null;
        /** The targeted turn's final answer, when it wrote one. */
        latestAssistantText?: string | null;
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
    effort?: DelegateTaskArgs["effort"];
    permissionProfile: DelegateTaskArgs["permissionProfile"];
    permissionPolicy?: DelegationPermissionPolicy;
    /**
     * Stamped onto the delegated task row when the row is first created, so the
     * renderer can tell a delegated child from a peer task without reading the
     * ledger. The ledger remains the source of truth for the delegation itself.
     */
    parentTaskId: string;
    /** Persist the exact execution identity before waiting for completion. */
    onStarted?: (turnId: string) => void;
  }): Promise<{ turnId: string; responseText?: string }>;
  stopTask(args: { workspaceId: string; taskId: string }): Promise<unknown>;
  /**
   * Clears the `parentTaskId` stamped by `runTask`, so a detached child
   * re-enters ordinary workspace task listings. Without it the listing
   * predicate keeps the task hidden forever — a possibly still-running
   * session nobody can find once the parent is archived.
   */
  releaseTaskParent(args: {
    workspaceId: string;
    taskId: string;
  }): Promise<unknown>;
}

interface DelegatedTaskCoordinatorDependencies {
  getLedger: (() => DelegatedTaskLedgerPort) | (() => Promise<DelegatedTaskLedgerPort>);
  host: DelegatedTaskHostPort;
  concurrencyLimit: number;
  readResourceRoot?: (parentTaskId: string) => string | null | Promise<string | null>;
  now?: () => string;
  createExecutionId?: () => string;
  onError?: (error: unknown, context: { scope: string; runId: string }) => void;
  onChange?: (args: { parentTaskId: string }) => void;
  /**
   * Applies `agentConfigId` to a delegation: the agent's options on the
   * request, or a refusal with the reason. Absent, a delegation naming an
   * agent is refused, because it cannot be honoured.
   */
  /** The commit checked out at a path; null when it cannot be read. Needed for `expectedHead`. */
  resolvePermissionPolicy?: (args: { parentTaskId: string; delegatedTaskId: string; providerId: "claude-code" | "codex"; permissionProfile?: DelegatedTaskPermissionProfile; access?: DelegatedTaskAccess; requestedProfile?: DelegatedTaskPermissionProfile; agentConfigId?: string; agentPermission?: AgentPermission }) => Promise<DelegationPermissionPolicy>;
  /**
   * The provider and effort of the parent's latest turn, for what a tool call
   * leaves out. Null (or absent) when unknown: the call must then name a provider.
   */
  resolveParentDefaults?: (args: { parentTaskId: string }) => Promise<{
    providerId: "claude-code" | "codex";
    effort?: DelegatedTaskEffort;
  } | null>;
  recordAgentAssignment?: (args: {
    snapshot: AgentSnapshot; standards?: string; executionId: string;
    target: RunStepTarget; repositoryPath: string; prompt: string; model?: string;
  }) => Promise<void>;
  readHead?: (workspacePath: string) => Promise<string | null>;
  readWorkspaceRevision?: (workspacePath: string) => Promise<WorkspaceRevision>;
  applyAgent?: (
    args: DelegateTaskArgs,
  ) => Promise<
    | { ok: true; args: DelegateTaskArgs; agentContentHash: string; snapshot?: AgentSnapshot; standards?: string }
    | { ok: false; message: string }
  >;
}

function hashDelegatedTaskInput(args: DelegateTaskArgs, agentContentHash?: string | null) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        prompt: args.prompt,
        providerId: args.providerId,
        model: args.model ?? null,
        effort: args.effort ?? null,
        permissionProfile: args.permissionProfile ?? "inherit",
        // Only when narrowed, so hashes recorded before `access` existed still match.
        ...(args.access === "read-only" ? { access: args.access } : {}),
        lifecycle: args.lifecycle,
        ...(args.lifecycle === "supervised" ? { maxTurns: args.maxTurns ?? 30 } : {}),
        workspace: args.workspace,
        ...(agentContentHash ? { agentContentHash } : {}),
      }),
    )
    .digest("hex");
}

/**
 * The key a tool call gets when it names none: readable from the prompt, and
 * fixed by everything that makes it a different request — the parent, the
 * provider, the model and the prompt — so sending the same call again names
 * the same child instead of starting a second one.
 */
export function deriveDelegationKey(args: {
  parentTaskId: string;
  providerId: "claude-code" | "codex";
  model?: string;
  prompt: string;
}) {
  const digest = createHash("sha256")
    .update(JSON.stringify([args.parentTaskId, args.providerId, args.model ?? null, args.prompt]))
    .digest("hex");
  const slug = args.prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");
  const key = `${slug || "task"}-${digest.slice(0, 12)}`;
  // A prompt that reads "Stave review …" must not land on the composer's keys.
  return isReservedDelegationKey(key) ? `task-${key}` : key;
}

/**
 * A deterministic task id keeps the delegation's identity outside the ledger
 * consistent with the identity inside it: the ledger row is written with the
 * child's id *before* the task exists, so a crash between the two leaves a
 * recorded child rather than an orphan.
 */
function deriveDelegatedTaskId(runId: string) {
  const digest = createHash("sha256").update(runId).digest("hex");
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    digest.slice(12, 16),
    digest.slice(16, 20),
    digest.slice(20, 32),
  ].join("-");
}

function isPathOwnedByRepository(args: { repositoryPath: string; cwd: string }) {
  if (!path.isAbsolute(args.repositoryPath) || !path.isAbsolute(args.cwd)) {
    return false;
  }
  const repositoryPath = path.resolve(args.repositoryPath);
  const cwd = path.resolve(args.cwd);
  if (repositoryPath === path.parse(repositoryPath).root) {
    return false;
  }
  const relative = path.relative(repositoryPath, cwd);
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
  return (message || "The delegated task failed to start.").slice(0, 1_000);
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
  "workspace-writer-busy",
]);

function toRejectionReason(reason: string): DelegatedTaskRejectionReason {
  return TRANSITION_REASONS.has(reason)
    ? (reason as DelegatedTaskRejectionReason)
    : "invalid-state";
}

function acceptedReceiptForRun(
  ledger: Pick<DelegatedTaskLedgerPort, "listRunReceipts">,
  runId: string,
  attempt: number,
) {
  return ledger
    .listRunReceipts({ runId })
    .find(
      (receipt) =>
        receipt.type === "accepted" && receipt.detail?.attempt === attempt,
    );
}

function summaryFromTransition(
  ledger: Pick<DelegatedTaskLedgerPort, "listRunReceipts">,
  transition: RunLedgerTransitionResult,
): DelegatedTaskSummary | null {
  if (!transition.run || !transition.step) {
    return null;
  }
  return summaryFromAggregate(ledger, { run: transition.run, step: transition.step });
}

function summaryFromAggregate(
  ledger: Pick<DelegatedTaskLedgerPort, "listRunReceipts">,
  aggregate: { run: RunRecord; step: RunStepRecord },
): DelegatedTaskSummary | null {
  const receipts = ledger.listRunReceipts({ runId: aggregate.run.id });
  return toDelegatedTaskSummary({
    run: aggregate.run,
    step: aggregate.step,
    acceptedReceipt: receipts.find(
      (receipt) => receipt.type === "accepted" && receipt.detail?.attempt === aggregate.step.attempt,
    ),
    resultText: delegatedTaskResultText(receipts, aggregate.step),
    waitingReason: delegatedTaskWaitingReason(receipts, aggregate.step),
  });
}

function rejected(
  reason: DelegatedTaskRejectionReason,
  child: DelegatedTaskSummary | null = null,
  message?: string,
): DelegatedTaskActionResponse {
  return DelegatedTaskActionResponseSchema.parse({
    accepted: false,
    duplicate: false,
    reason,
    message: message ?? describeDelegatedTaskRejection(reason),
    child,
  });
}

function accepted(args: {
  duplicate: boolean;
  child: DelegatedTaskSummary | null;
}): DelegatedTaskActionResponse {
  return DelegatedTaskActionResponseSchema.parse({
    accepted: true,
    duplicate: args.duplicate,
    reason: null,
    message: null,
    child: args.child,
  });
}

export function createDelegatedTaskCoordinator(
  dependencies: DelegatedTaskCoordinatorDependencies,
) {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const createExecutionId = dependencies.createExecutionId ?? randomUUID;
  const inFlightByStepId = new Map<string, Promise<void>>();

  const getLedger = async () => dependencies.getLedger();
  // Read-only source watermarks suppress out-of-order observations without a receipt per event.
  const supervisorSequences = new Map<string, number>();

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

  /** A fresh turn identity, so a late settle of an earlier turn cannot land on this one. */
  const nextTurnTarget = (target: RunStepTarget): RunStepTarget =>
    ({ ...target, turnExecutionId: randomUUID(), turnId: null });

  /**
   * Writers no longer share a checkout: a writing subagent gets its own
   * worktree unless the caller explicitly asks for the same workspace, and
   * then only while no other writing subagent is live there. Read-only
   * subagents run beside anything.
   */
  const sameWorkspaceWriter = (ledger: DelegatedTaskLedgerPort, args: {
    workspaceId: string; runId: string; policy?: DelegationPermissionPolicy; providerId: "claude-code" | "codex";
  }) => {
    if (isReadOnlyDelegationPolicy(args.providerId, args.policy)) return null;
    return ledger.listActiveRunAggregatesByStepKind({ kind: DELEGATED_TASK_STEP_KIND }).find((aggregate) => {
      const target = aggregate.step.target;
      if (!target || aggregate.run.id === args.runId || target.workspaceId !== args.workspaceId) return false;
      // A parked detached subagent is not writing between its turns.
      if (aggregate.step.status === "waiting" && !inFlightByStepId.has(aggregate.step.id) &&
          !acceptedReceiptForRun(ledger, aggregate.run.id, aggregate.step.attempt)?.detail?.agentRunId) return false;
      const policy = acceptedReceiptForRun(ledger, aggregate.run.id, aggregate.step.attempt)?.detail?.permissionPolicy;
      return !isReadOnlyDelegationPolicy(target.providerId, policy);
    }) ?? null;
  };

  const writerBusy = (holder: { run: RunRecord; step: RunStepRecord }, child: DelegatedTaskSummary | null) =>
    rejected("workspace-writer-busy", child,
      `Subagent ${holder.step.target?.taskId ?? holder.step.id} is already writing in this workspace. Run this one in a new worktree, or wait for it to finish.`);

  /**
   * Turn the child's terminal outcome into ledger receipts. `one-turn` closes
   * the run; `detached` parks it in `waiting` so the delegated task stays open for
   * follow-up turns until the parent stops it.
   */
  const settleAfterTurn = (args: {
    ledger: DelegatedTaskLedgerPort;
    runId: string;
    stepId: string;
    executionId: string;
    lifecycle: DelegatedTaskLifecycle;
    target: RunStepTarget;
    turnId: string;
    providerId: "claude-code" | "codex";
    permissionPolicy?: DelegationPermissionPolicy;
    /** The turn's final answer, recorded bounded so the caller gets it back. */
    responseText?: string | null;
    reviewCompletedRevision?: WorkspaceRevision;
  }) => {
    const timestamp = now();
    const responseText = boundResponseText(args.responseText);
    const current = args.ledger.getRunAggregate({ runId: args.runId, stepId: args.stepId });
    if (!current || current.step.executionId !== args.executionId || current.step.target?.turnExecutionId !== args.target.turnExecutionId)
      return { accepted: false as const, reason: "stale-execution" as const, run: current?.run ?? null, step: current?.step ?? null, receipts: [] as [] };
    args.ledger.setRunStepTarget({
      runId: args.runId,
      stepId: args.stepId,
      target: { ...args.target, turnId: args.turnId },
      expectedExecutionId: args.executionId,
      expectedTurnExecutionId: args.target.turnExecutionId,
    });
    if (args.lifecycle === "detached") {
      // Keyed per turn and allowed to re-enter `waiting`: a detached child
      // parks in `waiting` between turns, so a follow-up turn's completion
      // must still write its own receipt and move `updatedAt` instead of
      // short-circuiting as a duplicate of the first turn's settle.
      return args.ledger.markRunStepWaiting({
        runId: args.runId,
        stepId: args.stepId,
        executionId: args.executionId,
        idempotencyKey: `child:${args.executionId}:turn:${args.turnId}`,
        detail: { code: "child-turn-completed", providerId: args.providerId, ...(args.permissionPolicy ? { permissionPolicy: args.permissionPolicy } : {}), ...(responseText ? { responseText } : {}) },
        reenter: true,
        now: timestamp,
      });
    }
    return args.ledger.completeRunStep({
      runId: args.runId,
      stepId: args.stepId,
      executionId: args.executionId,
      idempotencyKey: `child:${args.executionId}:completed`,
      resultArtifactRef: buildDelegatedTaskArtifactRef({
        workspaceId: args.target.workspaceId,
        taskId: args.target.taskId,
        turnId: args.turnId,
      }),
      detail: { code: "child-turn-completed", providerId: args.providerId,
        ...(responseText ? { responseText } : {}),
        ...(args.reviewCompletedRevision ? { reviewCompletedRevision: args.reviewCompletedRevision } : {}) },
      now: timestamp,
    });
  };

  const settleAgentRun = (args: {
    ledger: DelegatedTaskLedgerPort; runId: string; stepId: string; executionId: string;
    target: RunStepTarget; detail: AgentRunDetail | null;
  }) => {
    const current = args.ledger.getRunAggregate({ runId: args.runId, stepId: args.stepId });
    if (!current || current.step.executionId !== args.executionId ||
        current.step.target?.turnExecutionId !== args.target.turnExecutionId || !isActiveDelegatedTaskPhase(current.step.status)) return null;
    const claim = acceptedReceiptForRun(args.ledger, args.runId, current.step.attempt);
    const agentRunId = claim?.detail?.agentRunId;
    if (!agentRunId) return null;
    const completion = readDelegatedAgentCompletion({ expected: { agentRunId, taskId: args.target.taskId, workspaceId: args.target.workspaceId }, detail: args.detail });
    const sequence = args.detail?.events.at(-1)?.sequence ?? 0;
    const latest = [...args.ledger.listRunReceipts({ runId: args.runId })].reverse()
      .find((receipt) => receipt.executionId === args.executionId && receipt.detail?.agentRunId === agentRunId && receipt.detail.supervisorSequence);
    const knownSequence = Math.max(latest?.detail?.supervisorSequence ?? 0, supervisorSequences.get(args.executionId) ?? 0);
    if (sequence && sequence < knownSequence) return null;
    if (completion.kind !== "unknown" && sequence) {
      supervisorSequences.delete(args.executionId);
      supervisorSequences.set(args.executionId, sequence);
      if (supervisorSequences.size > 500) supervisorSequences.delete(supervisorSequences.keys().next().value!);
    }
    if (completion.kind === "completed") {
      const linked = args.detail!.events.filter((event) => event.kind === "turn-linked" && typeof event.detail.turnId === "string").at(-1);
      const turnId = typeof linked?.detail.turnId === "string" ? linked.detail.turnId : null;
      args.ledger.setRunStepTarget({ runId: args.runId, stepId: args.stepId, target: { ...args.target, turnId },
        expectedExecutionId: args.executionId, expectedTurnExecutionId: args.target.turnExecutionId });
      return args.ledger.completeRunStep({ runId: args.runId, stepId: args.stepId, executionId: args.executionId,
        idempotencyKey: `child:${args.executionId}:completed`,
        resultArtifactRef: buildDelegatedTaskArtifactRef({ workspaceId: args.target.workspaceId, taskId: args.target.taskId, turnId }),
        detail: { code: "child-agent-run-completed", agentRunId, ...(sequence ? { supervisorSequence: sequence } : {}),
          responseText: boundResponseText(formatAgentRunReportMarkdown(completion.report)) }, now: now() });
    }
    if (completion.kind === "cancelled")
      return args.ledger.cancelRunStep({ runId: args.runId, stepId: args.stepId, expectedExecutionId: args.executionId,
        idempotencyKey: `child:${args.executionId}:cancelled`, error: args.detail?.agentRun.reasonDetail ?? "The delegated Agent run was cancelled.", now: now() });
    if (completion.kind === "stopped")
      return args.ledger.failRunStep({ runId: args.runId, stepId: args.stepId, executionId: args.executionId,
        idempotencyKey: `child:${args.executionId}:stopped`, error: args.detail?.agentRun.reasonDetail ?? "The delegated Agent reached its execution limit before completion.",
        detail: { code: "child-agent-run-stopped", agentRunId }, now: now() });
    if (completion.kind === "waiting") {
      const message = args.detail?.agentRun.reasonDetail ?? (args.detail ? currentStageRecord(args.detail).detail : null) ?? `Delegated Agent ${completion.reason}; open its task to respond or resume.`;
      if (current.step.status === "waiting" && (sequence <= (latest?.detail?.supervisorSequence ?? 0) || latest?.detail?.message === message)) return null;
      return args.ledger.markRunStepWaiting({ runId: args.runId, stepId: args.stepId, executionId: args.executionId,
        idempotencyKey: `child:${args.executionId}:waiting:${sequence}`,
        detail: { code: "child-agent-run-waiting", agentRunId, ...(sequence ? { supervisorSequence: sequence } : {}),
          message }, reenter: true, now: now() });
    }
    if (completion.kind === "running" && current.step.status === "waiting")
      return args.ledger.resumeRunStep?.({ runId: args.runId, stepId: args.stepId, executionId: args.executionId,
        idempotencyKey: `child:${args.executionId}:resumed:${sequence}`, detail: { agentRunId, ...(sequence ? { supervisorSequence: sequence } : {}) }, reenter: true, now: now() }) ?? null;
    return null;
  };

  /**
   * Run one turn of a delegation and record what it did. The first turn of a
   * delegation and a later follow-up turn differ only in which execution owns
   * the step, so both go through here and settle the same way.
   */
  const runChildTurn = (args: {
    ledger: DelegatedTaskLedgerPort;
    runId: string;
    stepId: string;
    parentTaskId: string;
    executionId: string;
    target: RunStepTarget;
    scope: "start-child" | "follow-up-child";
    agentAssignment?: {
      snapshot: AgentSnapshot; standards?: string; repositoryPath: string;
    };
    turn: {
      prompt: string;
      title?: string;
      model?: string;
      effort?: DelegateTaskArgs["effort"];
      effortPinned?: boolean;
      permissionProfile?: DelegatedTaskPermissionProfile;
      permissionPolicy?: DelegationPermissionPolicy;
      lifecycle: DelegatedTaskLifecycle;
      agentRunId?: string;
      maxTurns?: number;
      resourceRootRunId?: string;
    };
  }) => {
    args.target = { ...args.target, turnId: null };
    args.ledger.setRunStepTarget({
      runId: args.runId,
      stepId: args.stepId,
      target: args.target,
      expectedExecutionId: args.executionId,
      expectedTurnExecutionId: args.target.turnExecutionId,
    });
    const started = (async () => {
      try {
        // The claim is durable before this host read. Root admission sees it,
        // or this read sees a root created before the claim reached persistence.
        if (dependencies.readResourceRoot && (await dependencies.readResourceRoot(args.parentTaskId)) !== (args.turn.resourceRootRunId ?? null))
          throw new Error("The parent resource Run changed before helper execution.");
        if (args.agentAssignment) {
          if (!dependencies.recordAgentAssignment) throw new Error("Delegated Agent snapshots cannot be recorded.");
          await dependencies.recordAgentAssignment({
            ...args.agentAssignment, executionId: args.executionId, target: args.target,
            prompt: args.turn.prompt, model: args.turn.model,
          });
        }
        if (args.turn.lifecycle === "supervised") {
          if (!args.turn.agentRunId || !args.agentAssignment || !args.turn.permissionPolicy || !dependencies.host.runAgentRun)
            throw new Error("Supervised delegated Agent execution is unavailable.");
          const detail = await dependencies.host.runAgentRun({
            agentRunId: args.turn.agentRunId, workspaceId: args.target.workspaceId, taskId: args.target.taskId,
            title: args.turn.title ?? args.agentAssignment.snapshot.agent.name, prompt: args.turn.prompt,
            model: buildDelegatedTaskRuntimeOptions({ providerId: args.target.providerId, model: args.turn.model }).model!,
            maxTurns: args.turn.maxTurns ?? 30,
            authority: { parentTaskId: args.parentTaskId, executionId: args.executionId,
              ...(args.turn.resourceRootRunId ? { resourceRootRunId: args.turn.resourceRootRunId } : {}),
              agentConfigId: args.agentAssignment.snapshot.agentConfigId, agentContentHash: args.agentAssignment.snapshot.contentHash,
              permissionPolicy: args.turn.permissionPolicy, modelPinned: Boolean(args.turn.model), effortPinned: args.turn.effortPinned === true, ...(args.turn.effort ? { effort: args.turn.effort } : {}) },
            onPrepared: async () => {
              const current = args.ledger.getRunAggregate({ runId: args.runId, stepId: args.stepId });
              return Boolean(current && current.step.executionId === args.executionId &&
                current.step.target?.turnExecutionId === args.target.turnExecutionId && isActiveDelegatedTaskPhase(current.step.status));
            },
          });
          settleAgentRun({ ...args, detail });
          return;
        }
        const result = await dependencies.host.runTask({
          workspaceId: args.target.workspaceId,
          taskId: args.target.taskId,
          parentTaskId: args.parentTaskId,
          title: args.turn.title,
          prompt: args.turn.prompt,
          providerId: args.target.providerId,
          model: args.turn.model,
          effort: args.turn.effort,
          permissionProfile: args.turn.permissionProfile,
          permissionPolicy: args.turn.permissionPolicy,
          onStarted: (turnId) => {
            const current = args.ledger.getRunAggregate({
              runId: args.runId,
              stepId: args.stepId,
            });
            if (
              current?.step.executionId !== args.executionId ||
              current.step.target?.turnExecutionId !== args.target.turnExecutionId
            )
              return;
            args.target.turnId = turnId;
            args.ledger.setRunStepTarget({
              runId: args.runId,
              stepId: args.stepId,
              target: { ...args.target, turnId },
              expectedExecutionId: args.executionId,
              expectedTurnExecutionId: args.target.turnExecutionId,
            });
            if (current.step.status === "cancelled" && current.step.error !== DELEGATED_TASK_DETACHED_REASON)
              void dependencies.host.stopTask({ workspaceId: args.target.workspaceId, taskId: args.target.taskId }).catch((error) => reportError(error, { scope: "cancel-started-child", runId: args.runId }));
          },
        });
        const currentRun = args.ledger.getRunAggregate({ runId: args.runId, stepId: args.stepId });
        const reviewCompletedRevision = currentRun && acceptedReceiptForRun(args.ledger, args.runId, currentRun.step.attempt)?.detail?.reviewSourceRevision
          ? await captureReviewRevision({ workspaceId: args.target.workspaceId, repositoryPath: currentRun.run.ownership.repositoryPath,
            resolveWorkspace: dependencies.host.resolveWorkspace, readRevision: dependencies.readWorkspaceRevision }) : undefined;
        settleAfterTurn({
          ledger: args.ledger,
          runId: args.runId,
          stepId: args.stepId,
          executionId: args.executionId,
          lifecycle: args.turn.lifecycle,
          target: args.target,
          turnId: result.turnId,
          providerId: args.target.providerId,
          permissionPolicy: args.turn.permissionPolicy,
          responseText: result.responseText,
          reviewCompletedRevision,
        });
      } catch (error) {
        if (args.turn.agentRunId) {
          await dependencies.host.stopAgentRun?.({ agentRunId: args.turn.agentRunId, workspaceId: args.target.workspaceId, taskId: args.target.taskId })
            .catch((stopError) => reportError(stopError, { scope: "stop-failed-supervisor", runId: args.runId }));
        }
        const current = args.ledger.getRunAggregate({
          runId: args.runId,
          stepId: args.stepId,
        });
        if (!current || current.step.executionId !== args.executionId || current.step.target?.turnExecutionId !== args.target.turnExecutionId || !isActiveDelegatedTaskPhase(current.step.status)) {
          return;
        }
        if (error instanceof DelegatedTaskTurnError) {
          if (error.outcome === "cancelled")
            args.ledger.cancelRunStep({
              runId: args.runId,
              stepId: args.stepId,
              expectedExecutionId: args.executionId,
              idempotencyKey: `child:${args.executionId}:cancelled`,
              error: error.message,
              now: now(),
            });
          else
            args.ledger.interruptRunStep({
              runId: args.runId,
              stepId: args.stepId,
              idempotencyKey: `child:${args.executionId}:unknown`,
              error: error.message,
              now: now(),
            });
          return;
        }
        args.ledger.failRunStep({
          runId: args.runId,
          stepId: args.stepId,
          executionId: args.executionId,
          idempotencyKey: `child:${args.executionId}:failed`,
          error: sanitizeChildError(error),
          detail: {
            code: "delegated-task-failure",
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
  const reconcile = async (scope?: { taskId: string; agentRunId: string }) => {
    const ledger = await getLedger();
    const aggregates = ledger.listActiveRunAggregatesByStepKind({
      kind: DELEGATED_TASK_STEP_KIND,
    }).filter(({ run, step }) => !scope || (step.target?.taskId === scope.taskId &&
      acceptedReceiptForRun(ledger, run.id, step.attempt)?.detail?.agentRunId === scope.agentRunId));
    let reconciled = 0;
    let deferred = 0;
    for (const aggregate of aggregates) {
      const summary = summaryFromAggregate(ledger, aggregate);
      const target = aggregate.step.target;
      const executionId = aggregate.step.executionId;
      if (!summary || !target || !executionId) {
        const transition = ledger.interruptRunStep({
          runId: aggregate.run.id,
          stepId: aggregate.step.id,
          idempotencyKey: `restart:${aggregate.step.id}`,
          error: "The delegation lost its delegated task identity.",
          now: now(),
        });
        reconciled += transition.accepted ? 1 : 0;
        continue;
      }
      if (inFlightByStepId.has(aggregate.step.id) && !summary.agentRunId) {
        // This process is still running the turn; its own settlement is
        // authoritative.
        continue;
      }
      if (summary.agentRunId) {
        const observation = await dependencies.host.readAgentRun?.({ agentRunId: summary.agentRunId }).catch(() => null) ?? null;
        if (observation && "missing" in observation && !inFlightByStepId.has(aggregate.step.id)) {
          const transition = ledger.interruptRunStep({ runId: aggregate.run.id, stepId: aggregate.step.id,
            idempotencyKey: `child:${executionId}:missing-supervisor`, error: "Delegation preparation was interrupted before its supervisor was saved. Retry explicitly.", now: now() });
          if (transition.accepted) reconciled += 1;
          continue;
        }
        const detail = observation && !("missing" in observation) ? observation : null;
        if (detail?.delegationActivated === false && inFlightByStepId.has(aggregate.step.id)) continue;
        if (detail?.agentRun.id === summary.agentRunId && detail.agentRun.leadTaskId === target.taskId &&
            detail.agentRun.workspaceId === target.workspaceId && !inFlightByStepId.has(aggregate.step.id) &&
            detail.agentRun.state === "paused" && detail.agentRun.turnCount === 0 &&
            detail.delegationActivated === false) {
          // A crash before admission acknowledged preparation cannot authorize replay.
          const interrupted = ledger.interruptRunStep({ runId: aggregate.run.id, stepId: aggregate.step.id,
            idempotencyKey: `child:${executionId}:unactivated`, error: "Delegation preparation was interrupted before activation. Retry explicitly.", now: now() });
          await dependencies.host.stopAgentRun?.({ agentRunId: summary.agentRunId, workspaceId: target.workspaceId, taskId: target.taskId }).catch(() => undefined);
          if (interrupted.accepted) reconciled += 1;
          continue;
        }
        const transition = settleAgentRun({ ledger, runId: aggregate.run.id, stepId: aggregate.step.id,
          executionId, target, detail });
        if (transition?.accepted) reconciled += 1;
        else deferred += 1;
        continue;
      }
      const status = await dependencies.host
        .getTaskStatus({
          workspaceId: target.workspaceId,
          taskId: target.taskId,
          ...(target.turnId ? { turnId: target.turnId } : {}),
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
          error: "The delegated task is no longer present.",
          now: now(),
        });
        reconciled += transition.accepted ? 1 : 0;
        continue;
      }
      if (summary.lifecycle === "detached" && summary.phase === "waiting") {
        // Parked open on purpose; whatever the child does next belongs to its
        // own task surface, not to this delegation's receipts.
        continue;
      }
      if (
        status.activeTurnId &&
        (!target.turnId || status.activeTurnId === target.turnId)
      ) {
        // The child is genuinely still working — typically across a restart,
        // where no in-process watcher will settle the row when its turn ends.
        // Counting it as deferred keeps `ensureReconciled` unsettled, so the
        // next list/delegate/control read reconciles again and eventually
        // records the turn's outcome instead of leaving a `running` row (and
        // its concurrency slot) occupied forever.
        deferred += 1;
        continue;
      }
      // A turn that finished before this attempt was claimed belongs to an
      // earlier attempt. Settling attempt N from attempt N-1's turn would
      // close a retry with results the retry never produced, so such a row
      // falls through to the interrupted receipt instead.
      const claimedAt = aggregate.step.startedAt;
      const staleLatestTurn = Boolean(
        claimedAt &&
        status.latestTurnCompletedAt &&
        Date.parse(status.latestTurnCompletedAt) < Date.parse(claimedAt),
      );
      if (!staleLatestTurn && status.latestTurnOutcome === "cancelled") {
        const transition = ledger.cancelRunStep({
          runId: aggregate.run.id,
          stepId: aggregate.step.id,
          expectedExecutionId: executionId,
          idempotencyKey: `restart:${executionId}:cancelled`,
          error:
            status.latestTurnError ??
            "Provider turn was interrupted before it completed.",
          now: now(),
        });
        reconciled += transition.accepted ? 1 : 0;
        continue;
      }
      if (!staleLatestTurn && status.latestTurnError) {
        const transition = ledger.failRunStep({
          runId: aggregate.run.id,
          stepId: aggregate.step.id,
          executionId,
          idempotencyKey: `restart:${executionId}:failed`,
          error: status.latestTurnError,
          detail: {
            code: "delegated-task-failure",
            providerId: target.providerId,
          },
          now: now(),
        });
        reconciled += transition.accepted ? 1 : 0;
        continue;
      }
      if (
        !staleLatestTurn &&
        status.latestTurnId &&
        status.latestTurnCompletedAt &&
        status.latestTurnOutcome !== "unknown" &&
        (!target.turnId || status.latestTurnId === target.turnId)
      ) {
        const transition = settleAfterTurn({
          ledger,
          runId: aggregate.run.id,
          stepId: aggregate.step.id,
          executionId,
          lifecycle: summary.lifecycle,
          target,
          turnId: status.latestTurnId,
          providerId: target.providerId,
          responseText: status.latestAssistantText,
        });
        reconciled += transition.accepted ? 1 : 0;
        continue;
      }
      const transition = ledger.interruptRunStep({
        runId: aggregate.run.id,
        stepId: aggregate.step.id,
        idempotencyKey: `restart:${executionId}`,
        error: "Stave restarted before the delegated task's turn finished.",
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
    delegate: DelegateTaskArgs;
    parentWorkspace: DelegatedTaskWorkspaceLocation;
  }) => {
    if (args.delegate.workspace.mode === "same-workspace") {
      return args.parentWorkspace;
    }
    return dependencies.host.createWorkspace({
      repositoryPath: args.parentWorkspace.repositoryPath,
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
    expected?: DelegatedTaskExpectedIdentity;
  }) => {
    const runId = buildDelegatedTaskRunId({
      parentTaskId: args.parentTaskId,
      delegationKey: args.delegationKey,
    });
    const stepId = buildDelegatedTaskStepId(runId);
    const ledger = await getLedger();
    await ensureReconciled();
    const aggregate = ledger.getRunAggregate({ runId, stepId });
    const child = aggregate ? summaryFromAggregate(ledger, aggregate) : null;
    if (!child) {
      return { ok: false as const, rejection: rejected("not-found") };
    }
    if (args.expected) {
      const identity = validateDelegatedTaskIdentity({
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

  /**
   * One delegation admission at a time per parent task. The admission path
   * counts live children, resolves a workspace, and only then claims the
   * ledger row — with awaits in between, two parallel delegates could both
   * pass the concurrency check (or both cut a worktree for the same key)
   * before either claim lands. Serializing per parent makes the count that is
   * checked the count that is claimed against. The map entry is removed once
   * its chain drains so an idle parent leaves no state behind.
   */
  const delegationLocksByParent = new Map<string, Promise<void>>();
  const withParentDelegationLock = <T>(
    parentTaskId: string,
    operation: () => Promise<T>,
  ): Promise<T> => {
    const previous =
      delegationLocksByParent.get(parentTaskId) ?? Promise.resolve();
    const run = previous.then(operation, operation);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    delegationLocksByParent.set(parentTaskId, tail);
    void tail.then(() => {
      if (delegationLocksByParent.get(parentTaskId) === tail) {
        delegationLocksByParent.delete(parentTaskId);
      }
    });
    return run;
  };

  const delegateChild = async (
    rawArgs: unknown,
    defaults: { inheritedEffort?: DelegatedTaskEffort } = {},
  ): Promise<DelegatedTaskActionResponse> => {
    const parsed = DelegateTaskArgsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return rejected("invalid-request", null, parsed.error.issues.map(issue => issue.message).join("; ").slice(0, 500));
    }
    let args = parsed.data;
    let agentContentHash: string | null = null;
    let agentAssignment: { snapshot: AgentSnapshot; standards?: string } | undefined;
    if (args.agentConfigId) {
      const applied = dependencies.applyAgent
        ? await dependencies.applyAgent(args).catch((error: unknown) => ({ ok: false as const, message: String(error) }))
        : { ok: false as const, message: "Agents are not available here." };
      if (!applied.ok) return rejected("agent-refused", null, applied.message.slice(0, 500));
      args = applied.args;
      agentContentHash = applied.agentContentHash;
      if (applied.snapshot) agentAssignment = { snapshot: applied.snapshot, standards: applied.standards };
    }
    // An effort the agent fixed is explicit; the parent's only fills a gap.
    const resourceRootRunId = await dependencies.readResourceRoot?.(args.parentTaskId);
    if (resourceRootRunId && (args.lifecycle !== "supervised" || !args.agentConfigId))
      return rejected("agent-refused", null, "This adaptive Run admits only saved-Agent supervised helpers. Native, one-turn and detached helpers cannot share its turn budget.");
    const effort = args.effort ?? defaults.inheritedEffort;
    return withParentDelegationLock(args.parentTaskId, () =>
      admitDelegation(args, agentContentHash, agentAssignment, effort, resourceRootRunId),
    );
  };

  /**
   * `effort` is the tier the child runs at: the requested one, or the one it
   * inherited. Only the requested one is part of the input hash, the same way
   * an inherited permission policy is not, so a retry sent after the parent
   * changed effort still names the same delegation.
   */
  const admitDelegation = async (
    args: DelegateTaskArgs,
    agentContentHash: string | null = null,
    agentAssignment?: { snapshot: AgentSnapshot; standards?: string },
    effort: DelegatedTaskEffort | undefined = args.effort,
    expectedResourceRoot?: string | null,
  ): Promise<DelegatedTaskActionResponse> => {
    const runId = buildDelegatedTaskRunId({
      parentTaskId: args.parentTaskId,
      delegationKey: args.delegationKey,
    });
    const stepId = buildDelegatedTaskStepId(runId);
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
      !isPathOwnedByRepository({
        repositoryPath: args.repositoryPath,
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
    const existingSummary = existing
      ? summaryFromAggregate(ledger, existing)
      : null;

    // ── Concurrency ─────────────────────────────────────────────────────
    // Counted per parent task over live children only, and never against the
    // delegation being re-sent, so a retry of a finished child cannot be
    // blocked by its own row.
    const activeOthers = ledger
      .listRunAggregatesByOrigin({
        originKind: "task",
        originId: args.parentTaskId,
        limit: DELEGATED_TASK_LIST_LIMIT,
      })
      .flatMap((aggregate) => {
        const summary = summaryFromAggregate(ledger, aggregate);
        return summary && summary.runId !== runId ? [summary] : [];
      })
      .filter((summary) => isActiveDelegatedTaskPhase(summary.phase));
    if (activeOthers.length >= dependencies.concurrencyLimit) {
      return rejected("concurrency-limit-reached", existingSummary);
    }

    if (existingSummary && !args.retry) {
      // The same key always names the same child. Re-sending it reports the
      // child that exists instead of starting a second one.
      if (isActiveDelegatedTaskPhase(existingSummary.phase)) {
        return accepted({ duplicate: true, child: existingSummary });
      }
    }

    // ── Pinned commit ───────────────────────────────────────────────────
    // Work meant for one commit never starts against another: a review that
    // ran on a later HEAD would report on code nobody asked about.
    if (args.expectedHead && args.workspace.mode !== "same-workspace") {
      return rejected("invalid-request", null, "A pinned commit needs the child to work in the same workspace.");
    }
    // A retry reuses the workspace the delegation already owns; only a first
    // attempt may cut a new worktree.
    const delegatedWorkspaceId =
      existingSummary?.delegatedWorkspaceId ??
      (
        await resolveChildWorkspace({ delegate: args, parentWorkspace }).catch(
          () => null,
        )
      )?.workspaceId;
    if (!delegatedWorkspaceId) {
      return rejected("workspace-unavailable", existingSummary);
    }

    const delegatedTaskId =
      existingSummary?.delegatedTaskId ?? deriveDelegatedTaskId(runId);
    let target: RunStepTarget = {
      taskId: delegatedTaskId,
      workspaceId: delegatedWorkspaceId,
      turnId: null,
      providerId: args.providerId,
    };
    const permissionPolicy = await dependencies.resolvePermissionPolicy?.({ parentTaskId: args.parentTaskId, delegatedTaskId, providerId: args.providerId, permissionProfile: args.permissionProfile, ...(args.access ? { access: args.access } : {}), ...(args.requestedPermissionProfile ? { requestedProfile: args.requestedPermissionProfile } : {}), agentConfigId: args.agentConfigId, agentPermission: agentAssignment?.snapshot.agent.permission });
    if (args.lifecycle === "supervised" && (!agentAssignment || !permissionPolicy || !dependencies.host.runAgentRun))
      return rejected("agent-refused", existingSummary, "Supervised saved-Agent execution is unavailable. No one-turn fallback was started.");
    target = nextTurnTarget(target);
    const writer = sameWorkspaceWriter(ledger, { workspaceId: delegatedWorkspaceId, runId, policy: permissionPolicy, providerId: args.providerId });
    if (writer) return writerBusy(writer, existingSummary);
    const timestamp = now();
    const executionId = createExecutionId();
    const agentRunId = args.lifecycle === "supervised" ? deriveDelegatedTaskId(`supervised:${executionId}`) : undefined;
    const attempt = existing ? existing.step.attempt : 0;
    const reviewSourceRevision = isReservedDelegationKey(args.delegationKey)
      ? await captureReviewRevision({ workspaceId: delegatedWorkspaceId, repositoryPath: args.repositoryPath,
        resolveWorkspace: dependencies.host.resolveWorkspace, readRevision: dependencies.readWorkspaceRevision }) : undefined;
    const resourceRootRunId = expectedResourceRoot === undefined ? await dependencies.readResourceRoot?.(args.parentTaskId) : expectedResourceRoot;
    if (dependencies.readResourceRoot && (await dependencies.readResourceRoot(args.parentTaskId)) !== resourceRootRunId)
      return rejected("agent-refused", existingSummary, "The parent's adaptive Run changed during admission. Submit a new helper request.");
    if (resourceRootRunId && args.lifecycle !== "supervised") return rejected("agent-refused", existingSummary, "Adaptive helpers must be supervised.");
    const transition = ledger.claimRunStep({
      run: createPendingRun({
        id: runId,
        kind: DELEGATED_TASK_RUN_KIND,
        origin: { kind: "task", id: args.parentTaskId },
        ownership: {
          repositoryPath: args.repositoryPath,
          workspaceId: delegatedWorkspaceId,
          taskId: delegatedTaskId,
        },
        policy: buildDelegatedTaskPolicy(args.lifecycle),
        provenance: {
          createdBy: "delegated-task-coordinator",
          schemaVersion: RUN_LEDGER_SCHEMA_VERSION,
        },
        now: timestamp,
      }),
      step: createPendingRunStep({
        id: stepId,
        runId,
        kind: DELEGATED_TASK_STEP_KIND,
        target,
        dependencyIds: [],
        inputHash: hashDelegatedTaskInput(args, agentContentHash),
        now: timestamp,
      }),
      executionId,
      idempotencyKey: args.retry
        ? `${args.delegationKey}:attempt-${attempt + 1}`
        : args.delegationKey,
      // Recorded on the claim receipt so a later retry can preserve the
      // delegation's original model, effort, posture and workspace strategy —
      // the step row itself only keeps a hash of the inputs.
      detail: {
        providerId: args.providerId,
        ...(args.model ? { model: args.model } : {}),
        ...(effort ? { effort } : {}),
        permissionProfile: args.permissionProfile,
        ...(args.access ? { access: args.access } : {}),
        ...(permissionPolicy ? { permissionPolicy } : {}),
        workspaceMode: args.workspace.mode,
        ...(args.agentConfigId ? { agentConfigId: args.agentConfigId } : {}),
        ...(agentContentHash ? { agentContentHash } : {}),
        ...(agentRunId ? { agentRunId, supervisorMaxTurns: args.maxTurns ?? 30 } : {}),
        ...(resourceRootRunId ? { resourceRootRunId } : {}),
        ...(args.expectedHead ? { expectedHead: args.expectedHead } : {}),
        ...(reviewSourceRevision ? { reviewSourceRevision } : {}),
      },
      now: timestamp,
    });

    if (!transition.accepted) {
      return rejected(
        toRejectionReason(transition.reason),
        summaryFromTransition(ledger, transition) ?? existingSummary,
      );
    }
    const child = summaryFromTransition(ledger, transition);
    if (transition.duplicate || !child) {
      return accepted({
        duplicate: true,
        child: child ?? existingSummary,
      });
    }

    if (args.expectedHead) {
      const workspace = await dependencies.host.resolveWorkspace({ workspaceId: delegatedWorkspaceId });
      const head = workspace && dependencies.readHead ? await dependencies.readHead(workspace.workspacePath).catch(() => null) : null;
      const expected = args.expectedHead.toLowerCase();
      if (!head || !(head.toLowerCase().startsWith(expected) || expected.startsWith(head.toLowerCase()))) {
        ledger.failRunStep({ runId, stepId, executionId, idempotencyKey: `child:${executionId}:head-mismatch`, error: "The workspace commit changed before admitted work could start.", now: now() });
        return rejected("head-mismatch", summaryFromAggregate(ledger, ledger.getRunAggregate({ runId, stepId })!), "The workspace commit changed before admitted work could start. Nothing was started.");
      }
    }

    runChildTurn({
      ledger,
      runId,
      stepId,
      parentTaskId: args.parentTaskId,
      executionId,
      target,
      scope: "start-child",
      ...(agentAssignment ? { agentAssignment: { ...agentAssignment, repositoryPath: args.repositoryPath } } : {}),
      turn: {
        prompt: args.prompt,
        title: args.title,
        model: args.model,
        effort,
        effortPinned: args.effort !== undefined,
        permissionProfile: args.permissionProfile,
        permissionPolicy,
        lifecycle: args.lifecycle,
        ...(agentRunId ? { agentRunId, maxTurns: args.maxTurns ?? 30 } : {}),
        ...(resourceRootRunId ? { resourceRootRunId } : {}),
      },
    });
    notifyChanged(args.parentTaskId);
    return accepted({ duplicate: false, child });
  };

  const getParentLink = async (args: { delegatedTaskId: string }) => {
    const ledger = await getLedger();
    const summaries = ledger
      .listRunAggregatesByOwnedTask({
        taskId: args.delegatedTaskId,
        limit: DELEGATED_TASK_LIST_LIMIT,
      })
      .flatMap((aggregate) => {
        const summary = summaryFromAggregate(ledger, aggregate);
        return summary && summary.delegatedTaskId === args.delegatedTaskId
          ? [summary]
          : [];
      });
    return summaries[0] ?? null;
  };

  /**
   * `stave_delegate_task`: a model supplies only what matters. The provider
   * and effort default to the parent's, the child to one turn in the same
   * workspace, and the key to one derived from the request. A legacy
   * `permissionProfile` is accepted but no longer applied — `guided` and
   * `manual` made every child tool call prompt — and is kept as provenance.
   */
  const delegateFromTool = async (
    rawInput: unknown,
    caller?: { taskId: string; workspaceId: string | null },
  ): Promise<DelegatedTaskActionResponse> => {
    const parsed = DelegateTaskToolInputSchema.safeParse(rawInput);
    if (!parsed.success) return rejected("invalid-request");
    const input = parsed.data;
    // A Stave turn acts for its own task: the host's grant names it, and an id
    // the model typed for any other task or workspace is refused.
    if (caller && input.parentTaskId?.trim() && input.parentTaskId.trim() !== caller.taskId)
      return rejected("invalid-ownership", null, "parentTaskId must be the calling task. A turn can only start subagents for its own task.");
    if (caller?.workspaceId && input.parentWorkspaceId?.trim() && input.parentWorkspaceId.trim() !== caller.workspaceId)
      return rejected("invalid-ownership", null, "parentWorkspaceId must be the calling task's workspace.");
    const parentTaskId = caller?.taskId ?? input.parentTaskId?.trim();
    const parentWorkspaceId = caller?.workspaceId ?? input.parentWorkspaceId?.trim();
    if (!parentTaskId || !parentWorkspaceId)
      return rejected("invalid-request", null, "Name the calling task and its workspace (parentTaskId, parentWorkspaceId).");
    // One level deep: a subagent's own work stays in its turn.
    if (caller && (await getParentLink({ delegatedTaskId: parentTaskId }).catch(() => null)))
      return rejected("invalid-request", null, "A subagent cannot start subagents of its own.");
    const repositoryPath = input.repositoryPath?.trim() ||
      (await dependencies.host.resolveWorkspace({ workspaceId: parentWorkspaceId }).catch(() => null))?.repositoryPath;
    if (!repositoryPath) return rejected("workspace-unavailable");
    const parent =
      input.provider && input.effort
        ? null
        : await (dependencies.resolveParentDefaults?.({ parentTaskId }) ?? Promise.resolve(null))
            .catch(() => null);
    const providerId = input.provider ?? parent?.providerId;
    if (!providerId)
      return rejected("invalid-request", null, "Name a provider: this task's provider could not be determined.");
    const prompt = input.prompt.trim();
    const model = input.model?.trim() || undefined;
    const legacyProfile = input.permissionProfile;
    if (input.delegationKey && isReservedDelegationKey(input.delegationKey))
      return rejected("invalid-request", null, "Delegation keys starting with \"stave-review-\" are reserved for reviews the user starts from the composer.");
    const delegationKey = input.delegationKey ??
      deriveDelegationKey({ parentTaskId, providerId, model, prompt });
    const response = await delegateChild(
      {
        repositoryPath,
        parentWorkspaceId,
        parentTaskId,
        delegationKey,
        prompt,
        ...(input.title ? { title: input.title } : {}),
        providerId,
        ...(model ? { model } : {}),
        ...(input.effort ? { effort: input.effort } : {}),
        access: input.access ?? "inherit",
        ...(legacyProfile === "guided" || legacyProfile === "manual"
          ? { requestedPermissionProfile: legacyProfile }
          : {}),
        lifecycle: input.lifecycle ?? (input.agentConfigId ? "supervised" : "one-turn"),
        ...(input.maxTurns !== undefined ? { maxTurns: input.maxTurns } : {}),
        // A writer gets its own worktree; a read-only subagent, or work pinned
        // to the commit checked out here, runs in this workspace.
        workspace: input.workspace ?? (input.access === "read-only" || input.expectedHead
          ? { mode: "same-workspace" }
          : { mode: "new-worktree", name: `subagent-${delegationKey}`.slice(0, 120) }),
        ...(input.expectedHead ? { expectedHead: input.expectedHead } : {}),
        ...(input.agentConfigId ? { agentConfigId: input.agentConfigId } : {}),
        retry: input.retry ?? false,
      },
      { inheritedEffort: parent?.providerId === providerId ? parent.effort : undefined },
    );
    const waitSeconds = resolveDelegatedTaskWaitSeconds(input.wait, input.access);
    if (!waitSeconds || !response.accepted || !response.child) return response;
    return waitForAnswer(response, waitSeconds * 1_000);
  };

  /**
   * Hold the caller until the subagent's turn settles or the wait ends, then
   * answer with the fresh row, whose `result` carries the bounded answer. A
   * subagent still working keeps running; nothing is cancelled by the wait.
   */
  const waitForAnswer = async (
    response: DelegatedTaskActionResponse,
    waitMs: number,
  ): Promise<DelegatedTaskActionResponse> => {
    const child = response.child!;
    const inFlight = inFlightByStepId.get(child.stepId);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settled = inFlight
      ? await Promise.race([
          inFlight.then(() => true),
          new Promise<boolean>((resolve) => {
            timer = setTimeout(() => resolve(false), waitMs);
            timer.unref?.();
          }),
        ]).finally(() => clearTimeout(timer))
      : true;
    const ledger = await getLedger();
    const aggregate = ledger.getRunAggregate({ runId: child.runId, stepId: child.stepId });
    const fresh = (aggregate && summaryFromAggregate(ledger, aggregate)) ?? child;
    return DelegatedTaskActionResponseSchema.parse({
      ...response,
      child: fresh,
      message: settled
        ? null
        : "The subagent is still working. Its answer arrives with this task's next turn under Subagent results.",
    });
  };

  return {
    delegate: delegateChild,
    delegateFromTool,
    async reviewRevision(rawArgs: unknown) {
      const parsed = ReviewRevisionArgsSchema.safeParse(rawArgs);
      if (!parsed.success || !isReservedDelegationKey(parsed.data.delegationKey)) return null;
      const resolved = await resolveForAction(parsed.data);
      if (!resolved.ok) return null;
      const aggregate = resolved.ledger.getRunAggregate({ runId: resolved.runId, stepId: resolved.stepId });
      if (!aggregate) return null;
      const current = await captureReviewRevision({ workspaceId: resolved.child.delegatedWorkspaceId,
        repositoryPath: aggregate.run.ownership.repositoryPath, resolveWorkspace: dependencies.host.resolveWorkspace,
        readRevision: dependencies.readWorkspaceRevision });
      const latest = resolved.ledger.getRunAggregate({ runId: resolved.runId, stepId: resolved.stepId });
      if (!latest || latest.step.attempt !== aggregate.step.attempt || latest.step.executionId !== aggregate.step.executionId) return null;
      return reviewRevisionState(resolved.ledger.listRunReceipts({ runId: resolved.runId }), aggregate.step, current);
    },

    /**
     * A fresh attempt on a delegation that ended without succeeding. Provider
     * and lifecycle come from the delegation the ledger already holds; model,
     * effort and permission profile come from the original claim receipt unless the
     * caller explicitly overrides the profile; and the retry always reuses the
     * workspace the delegation already owns. That keeps the retry the same
     * delegation rather than a new one borrowing its key — only the prompt is
     * expected to change.
     */
    async retry(rawArgs: unknown): Promise<DelegatedTaskActionResponse> {
      const parsed = DelegatedTaskRetryArgsSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return rejected("invalid-request");
      }
      const args = parsed.data;
      const resolved = await resolveForAction(args);
      if (!resolved.ok) {
        return resolved.rejection;
      }
      if (!resolveDelegatedTaskControls(resolved.child).canRetry) {
        return rejected("invalid-state", resolved.child);
      }
      // The first claim receipt carries the inputs the delegation was created
      // with. Best effort on purpose: a delegation claimed before the receipt
      // recorded them simply falls back to the defaults it used to get.
      let originalClaim: RunReceiptRecord | undefined;
      try {
        originalClaim = resolved.ledger
          .listRunReceipts({ runId: resolved.runId })
          .find((receipt) => receipt.type === "accepted");
      } catch (error) {
        reportError(error, { scope: "retry-child", runId: resolved.runId });
      }
      return delegateChild({
        repositoryPath: args.repositoryPath,
        parentWorkspaceId: args.parentWorkspaceId,
        parentTaskId: args.parentTaskId,
        delegationKey: args.delegationKey,
        prompt: args.prompt,
        providerId: resolved.child.providerId,
        ...(originalClaim?.detail?.model
          ? { model: originalClaim.detail.model }
          : {}),
        ...(originalClaim?.detail?.effort
          ? { effort: originalClaim.detail.effort }
          : {}),
        permissionProfile:
          args.permissionProfile ??
          originalClaim?.detail?.permissionProfile ??
          "inherit",
        ...(originalClaim?.detail?.access ? { access: originalClaim.detail.access } : {}),
        // The retry runs as the same agent, applied to the new prompt again.
        ...(originalClaim?.detail?.agentConfigId ? { agentConfigId: originalClaim.detail.agentConfigId } : {}),
        // A pinned delegation stays pinned: a retry after the workspace moved is refused.
        ...(originalClaim?.detail?.expectedHead ? { expectedHead: originalClaim.detail.expectedHead } : {}),
        lifecycle: resolved.child.lifecycle,
        ...(originalClaim?.detail?.supervisorMaxTurns ? { maxTurns: originalClaim.detail.supervisorMaxTurns } : {}),
        // Inert on a retry — the delegation keeps the workspace it already
        // owns (`delegatedWorkspaceId` is reused), so a new-worktree delegation
        // retries inside its original worktree and never cuts a second one.
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
    async followUp(rawArgs: unknown): Promise<DelegatedTaskActionResponse> {
      const parsed = DelegatedTaskFollowUpArgsSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return rejected("invalid-request");
      }
      const args = parsed.data;
      const resolved = await resolveForAction(args);
      if (!resolved.ok) {
        return resolved.rejection;
      }
      let target = resolved.step.target;
      const previousTarget = target;
      const executionId = resolved.step.executionId;
      if (
        !resolveDelegatedTaskControls(resolved.child).canFollowUp ||
        !target ||
        !executionId
      ) {
        return rejected("invalid-state", resolved.child);
      }
      if (inFlightByStepId.has(resolved.stepId)) {
        return rejected("already-active", resolved.child);
      }
      const originalClaim = [...resolved.ledger.listRunReceipts({ runId: resolved.runId })]
        .reverse().find((receipt) => receipt.type === "accepted");
      const permissionPolicy = await dependencies.resolvePermissionPolicy?.({ parentTaskId: args.parentTaskId, delegatedTaskId: target.taskId, providerId: target.providerId, permissionProfile: args.permissionProfile, agentConfigId: originalClaim?.detail?.agentConfigId });
      if (inFlightByStepId.has(resolved.stepId)) return rejected("already-active", resolved.child);
      const fresh = resolved.ledger.getRunAggregate({ runId: resolved.runId, stepId: resolved.stepId });
      if (!fresh || fresh.step.executionId !== executionId || fresh.step.status !== "waiting") return rejected("stale-execution", resolved.child);
      target = nextTurnTarget(target);
      const writer = sameWorkspaceWriter(resolved.ledger, { workspaceId: target.workspaceId, runId: resolved.runId, policy: permissionPolicy, providerId: target.providerId });
      if (writer) return writerBusy(writer, resolved.child);
      if (!resolved.ledger.setRunStepTarget({ runId: resolved.runId, stepId: resolved.stepId, target, expectedExecutionId: executionId }))
        return rejected("stale-execution", resolved.child);
      if (originalClaim?.detail?.expectedHead) {
        const workspace = await dependencies.host.resolveWorkspace({ workspaceId: target.workspaceId });
        const head = workspace && dependencies.readHead ? await dependencies.readHead(workspace.workspacePath).catch(() => null) : null;
        const expected = originalClaim.detail.expectedHead.toLowerCase();
        const current = resolved.ledger.getRunAggregate({ runId: resolved.runId, stepId: resolved.stepId });
        if (!current || current.step.executionId !== executionId || current.step.target?.turnExecutionId !== target.turnExecutionId || current.step.status !== "waiting") {
          return rejected("stale-execution", resolved.child);
        }
        if (!head || !(head.toLowerCase().startsWith(expected) || expected.startsWith(head.toLowerCase()))) {
          resolved.ledger.setRunStepTarget({ runId: resolved.runId, stepId: resolved.stepId, target: previousTarget!, expectedExecutionId: executionId, expectedTurnExecutionId: target.turnExecutionId });
          return rejected("head-mismatch", resolved.child);
        }
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
          model: originalClaim?.detail?.model,
          effort: originalClaim?.detail?.effort,
          permissionProfile: args.permissionProfile,
          permissionPolicy,
          lifecycle: resolved.child.lifecycle,
        },
      });
      return accepted({ duplicate: false, child: resolved.child });
    },

    /**
     * Release the delegation and leave the child running. Only the parent's
     * claim ends here: the delegated task is never asked to stop, which is the one
     * thing that separates this from `stop`.
     */
    async detach(rawArgs: unknown): Promise<DelegatedTaskActionResponse> {
      const parsed = DelegatedTaskDetachArgsSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return rejected("invalid-request");
      }
      const args = parsed.data;
      const resolved = await resolveForAction(args);
      if (!resolved.ok) {
        return resolved.rejection;
      }
      if (!resolveDelegatedTaskControls(resolved.child).canDetach) {
        return rejected("invalid-state", resolved.child);
      }
      const transition = resolved.ledger.cancelRunStep({
        runId: resolved.runId,
        stepId: resolved.stepId,
        idempotencyKey: `detach:${args.delegationKey}`,
        detail: {
          code: "delegated-task-detached",
          providerId: resolved.child.providerId,
        },
        error: DELEGATED_TASK_DETACHED_REASON,
        now: now(),
      });
      if (!transition.accepted) {
        return rejected(
          toRejectionReason(transition.reason),
          summaryFromTransition(resolved.ledger, transition) ?? resolved.child,
        );
      }
      // The child is an ordinary task from here on, so its delegation stamp
      // must go too — that stamp is what hides it from workspace task
      // listings. Best effort: the ledger release above is the authority, and
      // an unreachable host must not turn a completed detach into a refusal.
      const target = resolved.step.target;
      if (target && !transition.duplicate) {
        try {
          await dependencies.host.releaseTaskParent({
            workspaceId: target.workspaceId,
            taskId: target.taskId,
          });
        } catch (error) {
          reportError(error, { scope: "detach-child", runId: resolved.runId });
        }
      }
      notifyChanged(args.parentTaskId);
      return accepted({
        duplicate: transition.duplicate,
        child: summaryFromTransition(resolved.ledger, transition),
      });
    },

    async list(rawArgs: unknown) {
      const parsed = DelegatedTaskListArgsSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return DelegatedTaskListSchema.parse([]);
      }
      const ledger = await getLedger();
      await ensureReconciled();
      const summaries = ledger
        .listRunAggregatesByOrigin({
          originKind: "task",
          originId: parsed.data.parentTaskId,
          limit: DELEGATED_TASK_LIST_LIMIT,
        })
        .flatMap((aggregate) => {
          const summary = summaryFromAggregate(ledger, aggregate);
          return summary ? [summary] : [];
        })
        .filter(
          (summary) =>
            parsed.data.includeFinished ||
            isActiveDelegatedTaskPhase(summary.phase),
        );
      return DelegatedTaskListSchema.parse(summaries);
    },

    async stop(rawArgs: unknown): Promise<DelegatedTaskActionResponse> {
      const parsed = DelegatedTaskStopArgsSchema.safeParse(rawArgs);
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
          code: "delegated-task-stopped",
          message: args.reason,
          providerId: target?.providerId,
        },
        error: args.reason ?? DELEGATED_TASK_STOPPED_REASON,
        now: now(),
      });
      if (!transition.accepted) {
        return rejected(
          toRejectionReason(transition.reason),
          summaryFromTransition(resolved.ledger, transition),
        );
      }
      if (!transition.duplicate && target) {
        // Cancelling the ledger row is the durable half; asking the delegated task
        // to stop is best effort, because a child that already ended is a
        // successful stop.
        await (resolved.child.agentRunId && dependencies.host.stopAgentRun
          ? dependencies.host.stopAgentRun({ agentRunId: resolved.child.agentRunId, workspaceId: target.workspaceId, taskId: target.taskId })
          : dependencies.host.stopTask({
            workspaceId: target.workspaceId,
            taskId: target.taskId,
          }))
          .catch((error) => {
            reportError(error, { scope: "stop-child", runId });
          });
      }
      notifyChanged(args.parentTaskId);
      return accepted({
        duplicate: transition.duplicate,
        child: summaryFromTransition(resolved.ledger, transition),
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
     * The delegation that owns a task, seen from the child's side. A delegated task
     * is an ordinary task, so the only way its own surface can show who
     * delegated it is to ask the ledger.
     */
    getParentLink,

    async get(args: { parentTaskId: string; delegationKey: string }) {
      const runId = buildDelegatedTaskRunId(args);
      const ledger = await getLedger();
      const aggregate = ledger.getRunAggregate({
        runId,
        stepId: buildDelegatedTaskStepId(runId),
      });
      const summary = aggregate
        ? summaryFromAggregate(ledger, aggregate)
        : null;
      return summary ? DelegatedTaskSummarySchema.parse(summary) : null;
    },
  };
}

export type DelegatedTaskCoordinator = ReturnType<
  typeof createDelegatedTaskCoordinator
>;
