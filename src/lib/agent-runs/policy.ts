import { i18n } from "@/i18n/runtime";
/**
 * Agent run supervisor policy: the pure half of an agent run.
 *
 * The host runtime observes the lead task and the current stage, asks
 * `decideAgentRunAction` what to do, applies the result with
 * `applyAgentRunDecision`, and performs the I/O the decision names (start a
 * turn, run a Stave action). Nothing here reads a clock or a store.
 *
 * Boundary statements asserted here (see the taxonomy):
 * - A stage completes only through a recorded stage report or a Stave action
 *   result; an ended turn alone never completes a stage.
 * - An agent run advances exactly one lead task and never creates a task: no
 *   decision creates one.
 */
import { resolveStageSignOff } from "@/lib/workflows/sign-off";
import { unmetStageAcceptance } from "./acceptance";
import type { SignOff } from "@/lib/workflows/schema";
import {
  clampReason,
  currentStageRecord,
  enterStage,
  formatAgentRunFingerprint,
  isAutomaticAgentRunPause,
  AgentRunCommandError,
  agentRunFingerprintsMatch,
  workflowStageAt,
  stageNeedsEffectConsent,
  type ActionResult,
  type AgentRun,
  type AgentRunAggregate,
  type AgentRunChange,
  type AgentRunFingerprint,
  type AgentRunPauseReason,
  type AgentRunStageRecord,
  type AgentRunStopReason,
  type StageBlockReason,
} from "./domain";

/* -------------------------------------------------------------------------- */
/* Observation                                                                 */
/* -------------------------------------------------------------------------- */

export interface ObservedTurn {
  turnId: string;
  startedBy: "agentRun" | "user";
  startedAt: string;
  /** When the turn ended; absent for a running turn. */
  endedAt?: string | null;
  /** True when Stave stopped in the middle of this turn and closed it at boot. */
  interrupted?: boolean;
}

/** What the runtime read about the lead task this tick. */
export interface LeadTaskObservation {
  /**
   * False when the workspace could not be read. A momentarily unreadable
   * workspace pauses; only a task that is really gone stops the agent run.
   */
  workspaceAvailable: boolean;
  taskExists: boolean;
  taskArchived: boolean;
  /** The fleet control plane's staleness check against the agent run identity. */
  identity: { ok: true } | { ok: false; reason: string };
  fingerprint: AgentRunFingerprint | null;
  activeTurn: ObservedTurn | null;
  pendingApprovalCount: number;
  pendingUserInputCount: number;
  /** Delegated tasks of the lead task that have not finished. */
  activeDelegatedTaskCount: number;
}

export type ActionOutcome =
  | { status: "in-progress" }
  | { status: "succeeded"; result: ActionResult }
  | { status: "failed"; detail: string }
  | { status: "stuck"; detail: string }
  /**
   * The action needs an AI turn before it can go on, such as a repair turn
   * for failing checks. The turn counts against the agent run's turn cap and
   * reports nothing; the action observes its effect afterwards.
   */
  | { status: "needs-turn"; reason: "repair-checks"; prompt: string; detail: string };

export interface AgentRunObservation {
  leadTask: LeadTaskObservation;
  /** False when the Local MCP server the model reports through is down. */
  reportingAvailable: boolean;
  /** The latest lead-task turn that ended since the current attempt began. */
  lastEndedTurn: ObservedTurn | null;
  /** The composer choice for the running user turn, if one is running. */
  userTurnIntent: "continue" | "take-over" | null;
  /** For an action stage, what the Stave action has produced so far. */
  actionOutcome: ActionOutcome | null;
  /** When the current attempt was last marked stuck, if it is stuck. */
  stageStuckAt?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Decision                                                                    */
/* -------------------------------------------------------------------------- */

export type StageTurnReason =
  | "stage-start"
  | "continue-after-user"
  | "reporting-restored"
  | "resume-after-restart";

export type AgentRunDecision =
  | { action: "idle" }
  | { action: "wait"; reason: "awaiting-approval" | "awaiting-user-input" }
  | { action: "stop"; reason: AgentRunStopReason; detail: string }
  | { action: "pause"; reason: AgentRunPauseReason; detail: string }
  | { action: "resume" }
  | { action: "block"; reason: StageBlockReason; detail: string }
  | { action: "request-sign-off" }
  | {
      action: "start-stage-turn";
      stageIndex: number;
      attempt: number;
      reason: StageTurnReason;
      feedback?: string;
    }
  | { action: "nudge" }
  | { action: "mark-stuck"; detail: string }
  | { action: "execute-action"; stageIndex: number }
  | { action: "start-action-turn"; stageIndex: number; attempt: number }
  | { action: "complete-stage"; next: "sign-off" | "start" | "finish" };

export type AgentRunDecisionAction = AgentRunDecision["action"];

/**
 * Every decision the supervisor can make, with what the runtime does for it.
 * None creates a task: an agent run advances exactly one lead task.
 */
export const AGENT_RUN_DECISION_EFFECTS: Record<AgentRunDecisionAction, string> = {
  idle: "Nothing to do this tick.",
  wait: "The lead task waits on the user; its own attention item shows it.",
  stop: "End the run with a reason and a partial report.",
  pause: "Pause the run with a reason.",
  resume: "Clear a supervisor pause whose condition lifted.",
  block: "Block the current stage with a reason.",
  "request-sign-off": "Show a sign-off card before the current stage.",
  "start-stage-turn": "Start a turn on the lead task for the current stage.",
  nudge: "Start one reminder turn asking the agent to report.",
  "mark-stuck": "Mark the current stage stuck.",
  "execute-action": "Run the current Stave action.",
  "start-action-turn": "Start a turn the current Stave action asked for, such as a checks repair.",
  "complete-stage": "Complete the current stage and move on.",
};

/**
 * The sign-off an agent run applies before the stage at `index`. The check-in
 * level comes from the agent run's consent, not the saved workflow, and a stage
 * with an external effect the user did not authorize at start always asks.
 */
export function resolveAgentRunStageSignOff(agentRun: AgentRun, index: number): SignOff {
  workflowStageAt(agentRun, index);
  return resolveConsentStageSignOff(agentRun, index);
}

/**
 * The sign-off a stage gets under a start's consent: a stage that writes
 * outside the workspace without the user's go-ahead always asks; the rest
 * follow the chosen check-ins.
 */
export function resolveConsentStageSignOff(
  agentRun: Pick<AgentRun, "workflow"> & { consent: Pick<AgentRun["consent"], "checkIns" | "authorizedEffectStageIds"> },
  index: number,
): SignOff {
  const stage = agentRun.workflow.stages[index];
  if (!stage) throw new RangeError(i18n.t("agentRuns:remaining.presentationCopy446", { v1: index }));
  if (stageNeedsEffectConsent(stage, agentRun.consent)) return "ask";
  return resolveStageSignOff(
    { checkIns: agentRun.consent.checkIns, stages: agentRun.workflow.stages },
    index,
  );
}

function nextAfterCompletion(agentRun: AgentRun): "sign-off" | "start" | "finish" {
  const nextIndex = agentRun.currentStageIndex + 1;
  if (nextIndex >= agentRun.workflow.stages.length) return "finish";
  return resolveAgentRunStageSignOff(agentRun, nextIndex) === "ask" ? "sign-off" : "start";
}

/** The sentence for a stage that is done but cannot hand over to the next one. */
function attemptLimitDetail(error: AgentRunCommandError) {
  return clampReason(
    i18n.t("agentRuns:policy.extraCopy307", { value1: error.message }),
  );
}

/**
 * Completes the current stage, or marks it stuck once when the next stage has
 * no attempts left: entering that stage would otherwise throw on every tick.
 */
function completeStage(aggregate: AgentRunAggregate, record: AgentRunStageRecord): AgentRunDecision {
  const unmet = unmetStageAcceptance(aggregate, record);
  if (unmet) return record.status === "blocked" && record.blockReason === "acceptance-unmet" && record.detail === clampReason(unmet)
    ? { action: "idle" } : { action: "block", reason: "acceptance-unmet", detail: clampReason(unmet) };
  const { agentRun } = aggregate;
  const nextIndex = agentRun.currentStageIndex + 1;
  if (nextIndex < agentRun.workflow.stages.length) {
    try {
      enterStage({ aggregate, index: nextIndex });
    } catch (error) {
      if (!(error instanceof AgentRunCommandError) || error.code !== "attempt-limit") throw error;
      return record.status === "stuck"
        ? { action: "idle" }
        : { action: "mark-stuck", detail: attemptLimitDetail(error) };
    }
  }
  return { action: "complete-stage", next: nextAfterCompletion(agentRun) };
}

/**
 * A stuck stage continues only for a reply that ended after it got stuck. The
 * reply before a turn that failed to start is not a new one; continuing for it
 * again would spend a turn on every tick.
 */
function isReplyAfterStuck(last: ObservedTurn, stuckAt: string | null | undefined) {
  if (!stuckAt) return true;
  return Date.parse(last.endedAt ?? last.startedAt) > Date.parse(stuckAt);
}

function turnCapStop(agentRun: AgentRun): AgentRunDecision | null {
  if (agentRun.turnCount < agentRun.maxTurns) return null;
  return {
    action: "stop",
    reason: "turn-cap-reached",
    detail: i18n.t("agentRuns:policy.detail", { value1: agentRun.maxTurns }),
  };
}

function startTurn(args: {
  agentRun: AgentRun;
  record: AgentRunStageRecord;
  observation: AgentRunObservation;
  reason: StageTurnReason;
}): AgentRunDecision {
  const { agentRun, record, observation } = args;
  if (!observation.reportingAvailable) {
    return record.status === "blocked" && record.blockReason === "reporting-unavailable"
      ? { action: "idle" }
      : {
          action: "block",
          reason: "reporting-unavailable",
          detail:
            i18n.t("agentRuns:policy.detail2"),
        };
  }
  const capped = turnCapStop(agentRun);
  if (capped) return capped;
  return {
    action: "start-stage-turn",
    stageIndex: agentRun.currentStageIndex,
    attempt: record.attempt,
    reason: args.reason,
    ...(record.feedback ? { feedback: record.feedback } : {}),
  };
}

/** True when the report was made during or after the last ended turn. */
function isCurrentReport(record: AgentRunStageRecord, lastEndedTurn: ObservedTurn | null) {
  if (!record.report) return false;
  if (record.report.turnId) return record.report.turnId === lastEndedTurn?.turnId;
  if (!lastEndedTurn) return true;
  return Date.parse(record.report.reportedAt) >= Date.parse(lastEndedTurn.startedAt);
}

function decideAiStage(
  aggregate: AgentRunAggregate,
  record: AgentRunStageRecord,
  observation: AgentRunObservation,
): AgentRunDecision {
  const { agentRun } = aggregate;
  const last = observation.lastEndedTurn;
  const report = isCurrentReport(record, last) ? record.report : null;

  if (report?.outcome === "complete") {
    // A stage cannot complete while work it delegated is still running.
    if (observation.leadTask.activeDelegatedTaskCount > 0) return { action: "idle" };
    return completeStage(aggregate, record);
  }
  if (report?.outcome === "blocked") {
    return record.status === "blocked"
      ? { action: "idle" }
      : { action: "block", reason: "agent-blocked", detail: clampReason(report.missing) };
  }

  // No current report from here on.
  if (record.status === "blocked" && record.blockReason === "reporting-unavailable") {
    return startTurn({ agentRun, record, observation, reason: "reporting-restored" });
  }
  if (!last) {
    // A stage marked stuck before any turn ended (its turn never started)
    // waits for Retry or a reply instead of replaying the start.
    if (record.status === "stuck") return { action: "idle" };
    return startTurn({ agentRun, record, observation, reason: "stage-start" });
  }
  if (last.startedBy === "user") {
    if (record.status === "stuck" && !isReplyAfterStuck(last, observation.stageStuckAt)) {
      return { action: "idle" };
    }
    // The user's reply is guidance for this stage; the agent run picks it up.
    return startTurn({ agentRun, record, observation, reason: "continue-after-user" });
  }
  // The agent run's own turn ended without a report.
  if (record.status === "stuck") return { action: "idle" };
  if (last.interrupted) {
    // Stave stopped while the turn ran, so the agent did not skip its report:
    // the stage resumes without spending the one reminder.
    return startTurn({ agentRun, record, observation, reason: "resume-after-restart" });
  }
  if (!observation.reportingAvailable) {
    // The model cannot report through a connection that is down, so this
    // blocks with "reporting unavailable" rather than spending the nudge.
    return startTurn({ agentRun, record, observation, reason: "stage-start" });
  }
  if (!record.nudged) {
    return turnCapStop(agentRun) ?? { action: "nudge" };
  }
  return {
    action: "mark-stuck",
    detail: i18n.t("agentRuns:policy.detail3"),
  };
}

function decideActionStage(
  aggregate: AgentRunAggregate,
  record: AgentRunStageRecord,
  observation: AgentRunObservation,
): AgentRunDecision {
  const { agentRun } = aggregate;
  if (record.status === "blocked" || record.status === "stuck") return { action: "idle" };
  const outcome = observation.actionOutcome;
  if (!outcome || outcome.status === "in-progress") {
    return { action: "execute-action", stageIndex: agentRun.currentStageIndex };
  }
  switch (outcome.status) {
    case "succeeded":
      return completeStage(aggregate, record);
    case "failed":
      return { action: "block", reason: "action-failed", detail: clampReason(outcome.detail) };
    case "stuck":
      return { action: "mark-stuck", detail: clampReason(outcome.detail) };
    case "needs-turn":
      return (
        turnCapStop(agentRun) ?? {
          action: "start-action-turn",
          stageIndex: agentRun.currentStageIndex,
          attempt: record.attempt,
        }
      );
  }
}

/** A pause the agent run is already in is not decided again every tick. */
function pauseFor(
  agentRun: AgentRun,
  reason: AgentRunPauseReason,
  detail: string,
): AgentRunDecision {
  return agentRun.state === "paused" && agentRun.pauseReason === reason
    ? { action: "idle" }
    : { action: "pause", reason, detail };
}

/**
 * The whole policy, in the design's priority order: stop, pause, reporting,
 * wait, a running turn, then the current stage.
 */
export function decideAgentRunAction(args: {
  aggregate: AgentRunAggregate;
  observation: AgentRunObservation;
  now: Date;
}): AgentRunDecision {
  const { aggregate, observation, now } = args;
  const { agentRun } = aggregate;
  const lead = observation.leadTask;

  if (agentRun.state !== "running" && agentRun.state !== "paused") {
    return { action: "idle" };
  }
  const manuallyPaused =
    agentRun.state === "paused" &&
    agentRun.pauseReason !== null &&
    !isAutomaticAgentRunPause(agentRun.pauseReason);

  // 1. Stop. Trusted only when the workspace actually loaded.
  if (!lead.workspaceAvailable) {
    return manuallyPaused
      ? { action: "idle" }
      : pauseFor(agentRun, "task-identity-changed", i18n.t("agentRuns:policy.extraCopy308"));
  }
  if (!lead.taskExists) {
    return { action: "stop", reason: "task-unavailable", detail: i18n.t("agentRuns:policy.detail4") };
  }
  if (lead.taskArchived) {
    return { action: "stop", reason: "task-unavailable", detail: i18n.t("agentRuns:policy.detail5") };
  }
  if (agentRun.expiresAt && Date.parse(agentRun.expiresAt) <= now.getTime()) {
    return {
      action: "stop",
      reason: "expired",
      detail: i18n.t("agentRuns:policy.detail6", { value1: agentRun.expiresAt }),
    };
  }

  // A pause the user chose outranks every automatic one.
  if (manuallyPaused) return { action: "idle" };

  // 2. Pause.
  if (!lead.identity.ok) {
    return pauseFor(agentRun, "task-identity-changed", lead.identity.reason);
  }
  // An agent run's model is routed per turn, so a different model on the
  // lead task is the route at work, not drift.
  if (agentRun.origin !== "agent" && lead.fingerprint && !agentRunFingerprintsMatch(agentRun.fingerprint, lead.fingerprint)) {
    return pauseFor(
      agentRun,
      "runtime-changed",
      i18n.t("agentRuns:policy.extraCopy309", { value1: formatAgentRunFingerprint(lead.fingerprint), value2: formatAgentRunFingerprint(agentRun.fingerprint) }),
    );
  }
  if (lead.activeTurn?.startedBy === "user" && observation.userTurnIntent === "take-over") {
    return {
      action: "pause",
      reason: "taken-over",
      detail: i18n.t("agentRuns:policy.detail7"),
    };
  }
  if (agentRun.state === "paused") return { action: "resume" };

  // 4. Wait on the user.
  if (lead.pendingApprovalCount > 0) return { action: "wait", reason: "awaiting-approval" };
  if (lead.pendingUserInputCount > 0) return { action: "wait", reason: "awaiting-user-input" };

  // 5. A turn is running.
  if (lead.activeTurn) return { action: "idle" };

  // 6-9. The current stage.
  const record = currentStageRecord(aggregate);
  const stage = workflowStageAt(agentRun, agentRun.currentStageIndex);
  switch (record.status) {
    case "completed":
    case "skipped":
    case "cancelled":
    case "awaiting-sign-off":
      return { action: "idle" };
    case "pending":
      if (resolveAgentRunStageSignOff(agentRun, agentRun.currentStageIndex) === "ask") {
        return { action: "request-sign-off" };
      }
      return stage.kind === "ai"
        ? startTurn({ agentRun, record, observation, reason: "stage-start" })
        : { action: "execute-action", stageIndex: agentRun.currentStageIndex };
    case "running":
    case "blocked":
    case "stuck":
      return stage.kind === "ai"
        ? decideAiStage(aggregate, record, observation)
        : decideActionStage(aggregate, record, observation);
  }
}

/* -------------------------------------------------------------------------- */
/* Transitions                                                                 */
/* -------------------------------------------------------------------------- */

function withAgentRun(agentRun: AgentRun, patch: Partial<AgentRun>, now: Date): AgentRun {
  return { ...agentRun, ...patch, updatedAt: now.toISOString() };
}

/**
 * Moves the agent run past its current stage: into the next stage's record, or
 * to completed after the last stage.
 */
export function advanceAgentRun(args: {
  aggregate: AgentRunAggregate;
  completed: AgentRunStageRecord;
  now: Date;
  signOff?: boolean;
}): AgentRunChange {
  const { aggregate, completed, now } = args;
  const { agentRun } = aggregate;
  const nextIndex = agentRun.currentStageIndex + 1;
  if (nextIndex >= agentRun.workflow.stages.length) {
    return {
      agentRun: withAgentRun(
        agentRun,
        { state: "completed", pauseReason: null, stopReason: null, reasonDetail: null },
        now,
      ),
      upserts: [completed],
      events: [{ kind: "agent-run-ended", idempotencyKey: null, detail: { outcome: "completed" } }],
    };
  }
  const advanced = withAgentRun(agentRun, { currentStageIndex: nextIndex }, now);
  const entered = enterStage({ aggregate: { agentRun: advanced, stages: aggregate.stages }, index: nextIndex });
  return {
    agentRun: advanced,
    upserts: [completed, args.signOff ? { ...entered, status: "awaiting-sign-off" } : entered],
    events: [],
  };
}

export function applyAgentRunDecision(args: {
  aggregate: AgentRunAggregate;
  decision: AgentRunDecision;
  now: Date;
}): AgentRunChange {
  const { aggregate, decision, now } = args;
  const { agentRun } = aggregate;
  const timestamp = now.toISOString();
  const unchanged: AgentRunChange = { agentRun, upserts: [], events: [] };

  switch (decision.action) {
    case "idle":
    case "wait":
      return unchanged;
    case "stop":
      return {
        agentRun: withAgentRun(
          agentRun,
          {
            state: "stopped",
            pauseReason: null,
            stopReason: decision.reason,
            reasonDetail: clampReason(decision.detail),
          },
          now,
        ),
        upserts: [],
        events: [
          {
            kind: "agent-run-ended",
            idempotencyKey: null,
            detail: { outcome: "stopped", reason: decision.reason },
          },
        ],
      };
    case "pause":
      return {
        agentRun: withAgentRun(
          agentRun,
          {
            state: "paused",
            pauseReason: decision.reason,
            stopReason: null,
            reasonDetail: clampReason(decision.detail),
          },
          now,
        ),
        upserts: [],
        events: [{ kind: "paused", idempotencyKey: null, detail: { reason: decision.reason } }],
      };
    case "resume":
      return {
        agentRun: withAgentRun(
          agentRun,
          { state: "running", pauseReason: null, reasonDetail: null },
          now,
        ),
        upserts: [],
        events: [{ kind: "resumed", idempotencyKey: null, detail: {} }],
      };
    case "block": {
      const record = currentStageRecord(aggregate);
      return {
        agentRun,
        upserts: [
          { ...record, status: "blocked", blockReason: decision.reason, detail: clampReason(decision.detail) },
        ],
        events: [
          {
            kind: "stage-blocked",
            idempotencyKey: null,
            detail: { stageId: record.stageId, attempt: record.attempt, reason: decision.reason },
          },
        ],
      };
    }
    case "request-sign-off": {
      const record = currentStageRecord(aggregate);
      return { agentRun, upserts: [{ ...record, status: "awaiting-sign-off" }], events: [] };
    }
    case "start-stage-turn": {
      const record = currentStageRecord(aggregate);
      return {
        agentRun: withAgentRun(agentRun, { turnCount: agentRun.turnCount + 1 }, now),
        upserts: [
          {
            ...record,
            status: "running",
            blockReason: null,
            detail: null,
            startedAt: record.startedAt ?? timestamp,
          },
        ],
        events: [],
      };
    }
    case "nudge": {
      const record = currentStageRecord(aggregate);
      return {
        agentRun: withAgentRun(agentRun, { turnCount: agentRun.turnCount + 1 }, now),
        upserts: [{ ...record, nudged: true }],
        events: [
          {
            kind: "nudge",
            idempotencyKey: null,
            detail: { stageId: record.stageId, attempt: record.attempt },
          },
        ],
      };
    }
    case "mark-stuck": {
      const record = currentStageRecord(aggregate);
      return {
        agentRun,
        upserts: [{ ...record, status: "stuck", blockReason: null, detail: clampReason(decision.detail) }],
        events: [
          {
            kind: "stage-stuck",
            idempotencyKey: null,
            detail: { stageId: record.stageId, attempt: record.attempt },
          },
        ],
      };
    }
    case "start-action-turn":
      return {
        agentRun: withAgentRun(agentRun, { turnCount: agentRun.turnCount + 1 }, now),
        upserts: [],
        events: [],
      };
    case "execute-action": {
      const record = currentStageRecord(aggregate);
      // A stage signed off before it ran is running without a start time yet.
      if (record.status === "running" && record.startedAt) return unchanged;
      return {
        agentRun,
        upserts: [{ ...record, status: "running", startedAt: record.startedAt ?? timestamp }],
        events: [],
      };
    }
    case "complete-stage": {
      const record = currentStageRecord(aggregate);
      const unmet = unmetStageAcceptance(aggregate, record);
      if (unmet) return applyAgentRunDecision({ aggregate, decision: { action: "block", reason: "acceptance-unmet", detail: unmet }, now });
      const completed: AgentRunStageRecord = {
        ...record,
        status: "completed",
        blockReason: null,
        detail: null,
        endedAt: timestamp,
      };
      let change: AgentRunChange;
      try {
        change = advanceAgentRun({
          aggregate,
          completed,
          now,
          signOff: decision.next === "sign-off",
        });
      } catch (error) {
        // `decideAgentRunAction` already avoids this; a caller that decided
        // elsewhere still gets a stuck stage instead of an error every tick.
        if (!(error instanceof AgentRunCommandError) || error.code !== "attempt-limit") throw error;
        return applyAgentRunDecision({
          aggregate,
          decision: { action: "mark-stuck", detail: attemptLimitDetail(error) },
          now,
        });
      }
      return {
        ...change,
        events: [
          {
            kind: "stage-completed",
            idempotencyKey: null,
            detail: { stageId: record.stageId, attempt: record.attempt },
          },
          ...change.events,
        ],
      };
    }
    default:
      decision satisfies never;
      return unchanged;
  }
}
