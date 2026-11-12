import { tarsExecutionScope } from "../../src/lib/tars/continuation";
import path from "node:path";
import type { AgentAssignment } from "../../src/lib/agents/assign";
import { AGENT_RUN_LIMITS, currentStageRecord, type AgentRun, type AgentRunPauseReason } from "../../src/lib/agent-runs/domain";
import { isTarsRunCommandOperation, type TarsDetailCode, type TarsResponsibility, type TarsResponsibilityPatch, type TarsRunControlOperation } from "../../src/lib/tars/types";

/**
 * A host failure whose sentence surfaces translate from `detailCode`; the
 * English message stays the detail's diagnostic and the model's context.
 */
export class TarsDetailError extends Error {
  constructor(readonly detailCode: TarsDetailCode, message: string) { super(message); this.name = "TarsDetailError"; }
}

/** Confirmed ownership transfer is distinct from an unreadable execution outcome. */
export class TarsOwnershipLostError extends Error {
  constructor(message: string, readonly detailCode: TarsDetailCode = "ownershipChanged") { super(message); this.name = "TarsOwnershipLostError"; }
}

/** The detail a failure leaves on its responsibility: a coded host sentence, or the error's own text. */
export function tarsDetailFromError(error: unknown): Required<Pick<TarsResponsibilityPatch, "detail" | "detailCode" | "detailParams">> {
  if (!(error instanceof Error)) {
    // i18n-ignore: persisted diagnostic; the interface translates the code
    return { detail: "Tars could not observe this responsibility.", detailCode: "observationFailed", detailParams: null };
  }
  const code = error instanceof TarsDetailError || error instanceof TarsOwnershipLostError ? error.detailCode : null;
  return { detail: error.message.slice(0, 2_000), detailCode: code, detailParams: null };
}

/** The run is paused for a reason only its task can clear, such as its turn limit. */
export class TarsRunHeldError extends Error {
  constructor(reason: string) { super(`The run is paused (${reason}) and cannot be handed back until its task clears it.`); this.name = "TarsRunHeldError"; }
}

/** Pauses a hand-back may clear; the same set agent-run Resume accepts. */
const HAND_BACK_CLEARABLE: ReadonlySet<AgentRunPauseReason> = new Set(["paused-by-user", "taken-over", "usage-limit", "wait-expired"]);

/** The run refused a resume or run command in its current state; nothing changed. */
export class TarsRunRefusedError extends Error {
  constructor(message: string) { super(message); this.name = "TarsRunRefusedError"; }
}

/** The run's current stage is not the attempt the user saw when the stage command was proposed or clicked. */
export class TarsStageChangedError extends Error {
  constructor() { super("The run moved to another stage attempt since you saw it. Check its current stage and try again."); this.name = "TarsStageChangedError"; }
}

/** A task operation named a request that no longer waits in the task Tars observed it in. */
export class TarsRequestUnavailableError extends Error {
  constructor(message = "That request is no longer waiting in the task.") { super(message); this.name = "TarsRequestUnavailableError"; }
}

/** A message to the run while a turn runs in its task: it is said in the task, or after the turn. */
export class TarsTaskBusyError extends Error {
  constructor() { super("A turn is running in the task. Say it in the task, or ask again when the turn ends."); this.name = "TarsTaskBusyError"; }
}

/** The owned run already ended, so there is nothing for Tars to continue. */
export class TarsRunEndedError extends Error {
  constructor() { super("This run has ended. Inspect its task before delegating a new responsibility."); this.name = "TarsRunEndedError"; }
}

/** Historical rows matter: the active-assignment API intentionally hides releases. */
export function assertTarsAssignment(
  row: TarsResponsibility,
  latest: AgentAssignment | null,
  receipt: AgentAssignment | null,
): boolean {
  if (!latest && !receipt) return false;
  // A missing/unreadable historical receipt does not prove a user transfer.
  if (!latest || !receipt) throw new TarsDetailError("ownershipUnverified", "The task's agent ownership could not be verified.");
  if (latest.id !== receipt.id || receipt.endedAt ||
      receipt.requestId !== `tars-${row.id}` || receipt.taskId !== row.taskId ||
      receipt.workspaceId !== row.executionWorkspaceId || receipt.providerId !== row.providerId ||
      path.resolve(receipt.repositoryPath) !== path.resolve(row.repositoryPath))
    throw new TarsOwnershipLostError("This task's agent ownership changed. Tars cannot reclaim it.");
  return true;
}

/** A same-task run is not necessarily the execution admitted for this responsibility. */
export function assertTarsRun(row: TarsResponsibility, run: AgentRun): void {
  if (run.leadTaskId !== row.taskId || run.workspaceId !== row.executionWorkspaceId ||
      path.resolve(run.repositoryPath) !== path.resolve(row.repositoryPath) ||
      run.origin !== "agent" || run.workflow.id !== `tars-${row.id}` ||
      run.assignment !== (row.continuation && run.id === row.continuation.previousRunId ? row.continuation.previousInstruction : tarsExecutionScope(row).instruction) || (row.agentRunId && row.agentRunId !== run.id))
    throw new TarsOwnershipLostError("The owned run identity changed.");
}

export function assertTarsControl(row: TarsResponsibility, run: AgentRun): void {
  assertTarsRun(row, run);
  if (run.pauseReason === "taken-over")
    throw new TarsOwnershipLostError("This task was taken over. Continue it in its task.", "takenOverInTask");
}


interface TarsControlPorts {
  agentRuns: Pick<import("./supervision/agent-run-runtime").AgentRunRuntime,
    "get" | "pause" | "resume" | "cancel" | "takeOver" | "restartStageAndResume" | "extend" | "retryStage" | "skipStage" | "signOff">;
  hasAssignment: (row: TarsResponsibility) => boolean;
  readTask: (args: { workspaceId: string; taskId: string }) => Promise<{ activeTurnId: string | null }>;
  readRun: (id: string) => AgentRun | null;
  linkedTurns: (id: string) => string[];
  userTurnIds: (id: string) => string[];
  abortTurn: (turnId: string) => void;
}

/**
 * Control admission is rechecked in the run queue; only a proven automatic turn
 * is interrupted. Takeover uses the run's own taken-over pause. Only an explicit
 * hand-back clears it, and only while the run and assignment are still Tars's;
 * a hand-back during a stage that may end the run always restarts that attempt.
 */
export async function controlTarsRun(
  row: TarsResponsibility,
  operation: TarsRunControlOperation,
  ports: TarsControlPorts,
) {
  const detail = await ports.agentRuns.get({ agentRunId: row.agentRunId! });
  assertTarsRun(row, detail.agentRun);
  // Pausing, cancelling or taking over leaves an already human-owned task untouched.
  if (detail.agentRun.pauseReason === "taken-over" && operation !== "handBack") {
    // Continuing or commanding a run the user holds in its task is refused, never a silent no-op.
    if (operation === "resume" || isTarsRunCommandOperation(operation)) assertTarsControl(row, detail.agentRun);
    return;
  }
  const guard = (run: AgentRun) => {
    assertTarsControl(row, run);
    if (!ports.hasAssignment(row)) throw new Error("The task's agent assignment is unavailable.");
  };
  // Interrupt only a proven automatic turn that is active after a control applied.
  const stopAutomaticTurn = async (check: (run: AgentRun) => void) => {
    const task = await ports.readTask({ workspaceId: row.executionWorkspaceId!, taskId: row.taskId! });
    const current = ports.readRun(row.agentRunId!);
    if (current) check(current);
    const turnId = task.activeTurnId;
    if (current && turnId && ports.linkedTurns(row.agentRunId!).includes(turnId) &&
        !ports.userTurnIds(row.agentRunId!).includes(turnId)) ports.abortTurn(turnId);
  };
  const run = detail.agentRun;
  if (operation === "resume") {
    guard(run);
    if (run.state === "paused") await ports.agentRuns.resume({ agentRunId: row.agentRunId! }, guard);
    else if (run.state !== "running") throw new TarsRunEndedError();
    // Waiting work over a running run waits on its stage or task, not a pause: resuming would change nothing.
    else if (row.state === "waiting") throw new TarsRunRefusedError("The run is not paused. Its stage or task is waiting for an answer.");
  } else if (isTarsRunCommandOperation(operation)) {
    guard(run);
    if (run.state !== "running" && run.state !== "paused") throw new TarsRunEndedError();
    const agentRunId = row.agentRunId!;
    // The run's own command checks the stage state, exactly as when the user gives it in the task,
    // and the guard rechecks ownership inside the run's command queue.
    if (operation === "extend") await ports.agentRuns.extend({ agentRunId }, guard);
    else {
      // Only the attempt Tars observed at the revision the user confirmed: a later stage is never retried, skipped or signed off by it.
      const record = currentStageRecord(detail);
      if (!row.activeStage || row.activeStage !== `${record.stageId}#${record.attempt}`) throw new TarsStageChangedError();
      await ports.agentRuns[operation]({ agentRunId, stageId: record.stageId, attempt: record.attempt }, guard);
    }
  } else if (operation === "handBack") {
    const reclaim = (current: AgentRun) => {
      assertTarsRun(row, current);
      if (!ports.hasAssignment(row)) throw new Error("The task's agent assignment is unavailable.");
    };
    // Every precondition is checked before anything changes the run.
    reclaim(run);
    if (run.state !== "running" && run.state !== "paused") throw new TarsRunEndedError();
    if (run.state === "paused" && (!run.pauseReason || !HAND_BACK_CLEARABLE.has(run.pauseReason))) throw new TarsRunHeldError(run.pauseReason ?? "unknown");
    const record = [...detail.stages].reverse().find((stage) => stage.stageId === run.workflow.stages[run.currentStageIndex]?.id);
    // A stage that may end the run (the last one, or a review whose pass skips the
    // fix stage) and started before the hand-back may rest on evidence from before
    // the user's changes. Only a fresh attempt may complete the work.
    const next = run.workflow.stages[run.currentStageIndex + 1];
    const mayEndRun = !next || (next.kind === "ai" && next.skipIfReviewPassed === true);
    const stale = mayEndRun && Boolean(record?.startedAt);
    if (!stale) {
      if (run.state === "paused") await ports.agentRuns.resume({ agentRunId: row.agentRunId! }, reclaim);
      return;
    }
    if (record!.attempt >= AGENT_RUN_LIMITS.maxStageAttempts) throw new Error("The final verification has no attempts left. Open its task to continue.");
    if (run.state === "running" || run.pauseReason !== "taken-over") {
      // The user resumed or paused it meanwhile: hold it first so the old attempt stops.
      await ports.agentRuns.takeOver({ agentRunId: row.agentRunId! }, reclaim);
      await stopAutomaticTurn(reclaim);
    }
    await ports.agentRuns.restartStageAndResume({ agentRunId: row.agentRunId! }, reclaim);
  } else if (run.state === "running" || run.state === "paused") {
    // Admission may have been queued behind a turn start. Read the active turn
    // after the control applies, then check its durable automatic/user provenance.
    await ports.agentRuns[operation === "takeover" ? "takeOver" : operation]({ agentRunId: row.agentRunId! }, guard);
    // After a takeover the run is the user's; only its identity is rechecked.
    await stopAutomaticTurn(operation === "takeover" ? (current: AgentRun) => assertTarsRun(row, current) : guard);
  }
  // An ended run has nothing left to stop: pause, cancel or takeover only change the responsibility.
}
