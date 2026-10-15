import { resolveAgentRunUsageLimitResumeAt, resolveUsageLimitRetryAt } from "./usage-limit";
import { accountSwitchedEvent, decideAccountPoolRotation, type PoolAccountUsage } from "./account-pool";
import {
  appendConsumedKeys,
  currentEventWait,
  describeEventWaitEnd,
  type AgentRunEventWait,
  type AgentRunEventWaitEndReason,
} from "./event-wait";
import type { EventWaitOutcome, EventWaitWake } from "./event-wait-observe";
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
  usageLimited?: { resetsAt?: string; accountProfileId: string; fingerprint: AgentRunFingerprint };
  /** The provider failed for a reason that passes (a timeout, an overloaded or unreachable service). */
  providerFailure?: { message: string };
}

/** How long a run waits before each retry after a passing provider failure; one entry per retry. */
export const PROVIDER_RETRY_DELAYS_MS = [30_000, 120_000, 300_000] as const;

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
  /** True for a run a parent agent delegated: at its turn cap it ends rather than halts. */
  delegated?: boolean;
  /** The latest lead-task turn that ended since the current attempt began. */
  lastEndedTurn: ObservedTurn | null;
  /** The composer choice for the running user turn, if one is running. */
  userTurnIntent: "continue" | "take-over" | null;
  /** For an action stage, what the Stave action has produced so far. */
  actionOutcome: ActionOutcome | null;
  /** When the current attempt was last marked stuck, if it is stuck. */
  stageStuckAt?: string | null;
  /** The turns this stage attempt already started to retry after a provider failure. */
  providerRetries?: number;
  /**
   * With the pool off (or not applicable): what the limited account's own
   * usage read said this tick, right after its limit or at a due resume.
   */
  usageLimitResume?: { status: "headroom" | "exhausted" | "unavailable"; resetsAt?: string };
  /**
   * Set only for a run with an account pool that applies: the pool accounts
   * the host read for this limit, in read order (`account-pool.ts`).
   */
  accountPoolUsage?: PoolAccountUsage[];
  /**
   * What the run's event wait found this tick (`event-wait-observe.ts`).
   * Absent: nothing was read, as for a run that is not waiting.
   */
  eventWait?: EventWaitOutcome;
}

/* -------------------------------------------------------------------------- */
/* Decision                                                                    */
/* -------------------------------------------------------------------------- */

export type StageTurnReason =
  | "stage-start"
  | "continue-after-user"
  | "reporting-restored"
  | "resume-after-restart"
  | "resume-after-usage-limit"
  | "resume-after-account-switch"
  /** The event the run waited for came; the turn starts with what happened. */
  | "resume-after-event"
  /** The user continued a run whose wait ended without its event. */
  | "resume-after-wait-expired"
  /** The provider failed for a reason that passes; the stage continues after a pause. */
  | "retry-after-provider-error";

export type AgentRunDecision =
  | { action: "idle" }
  | { action: "wait"; reason: "awaiting-approval" | "awaiting-user-input" }
  | { action: "stop"; reason: AgentRunStopReason; detail: string }
  | {
      action: "pause";
      reason: AgentRunPauseReason;
      detail: string;
      usageLimit?: AgentRun["usageLimit"];
      /** A `wait-expired` pause keeps its ended wait, so Resume can tell the agent. */
      eventWait?: AgentRunEventWait;
    }
  | { action: "resume" }
  /** Continue on another pool account; `usageLimit` names it as the continuation's account. */
  | { action: "switch-account"; from: string; to: string; usageLimit: NonNullable<AgentRun["usageLimit"]> }
  | { action: "block"; reason: StageBlockReason; detail: string }
  | { action: "request-sign-off" }
  | {
      action: "start-stage-turn";
      stageIndex: number;
      attempt: number;
      reason: StageTurnReason;
      feedback?: string;
      /** For `resume-after-event`: the event, delivered once with this turn. */
      wake?: EventWaitWake;
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
  "switch-account": "Continue on the next account of the run's pool that has usage left.",
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
 * A report that leaves a required criterion unmet halts a primary run for its
 * user; a delegated run ends instead, like at its turn cap, so the parent that
 * waits on it reads the result rather than a child nobody is watching.
 */
function completeStage(aggregate: AgentRunAggregate, record: AgentRunStageRecord, observation: Pick<AgentRunObservation, "delegated">): AgentRunDecision {
  const unmet = unmetStageAcceptance(aggregate, record);
  if (unmet && observation.delegated) return { action: "stop", reason: "acceptance-unmet", detail: clampReason(unmet) };
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

/**
 * At the cap a primary run halts and waits to be extended. A delegated run
 * ends instead, as before: its parent reads a finished child, not a paused
 * one, and only the user could extend it.
 */
function turnCapPause(agentRun: AgentRun, observation: Pick<AgentRunObservation, "delegated">): AgentRunDecision | null {
  if (agentRun.turnCount < agentRun.maxTurns) return null;
  const detail = i18n.t("agentRuns:policy.detail", { value1: agentRun.maxTurns });
  return observation.delegated
    ? { action: "stop", reason: "turn-cap-reached", detail }
    : { action: "pause", reason: "limit-reached", detail };
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
  const capped = turnCapPause(agentRun, observation);
  if (capped) return capped;
  return {
    action: "start-stage-turn",
    stageIndex: agentRun.currentStageIndex,
    attempt: record.attempt,
    reason: args.reason,
    ...(record.feedback ? { feedback: record.feedback } : {}),
  };
}

/**
 * A run that waits for an outside event (`stave_wait_for_event`) between its
 * turns: a turn that ended after asking to wait is not an unreported turn, so
 * it is never nudged or marked stuck. The event starts the next turn, counted
 * against the turn cap; the wait's expiry, its wake cap or an unreadable pull
 * request pause the run with `wait-expired` instead. Null when the current
 * attempt has no wait.
 */
function decideEventWait(args: {
  agentRun: AgentRun;
  record: AgentRunStageRecord;
  observation: AgentRunObservation;
  now: Date;
}): AgentRunDecision | null {
  const { agentRun, record, observation, now } = args;
  const wait = currentEventWait(agentRun, record);
  if (!wait) return null;
  // Continued after the wait ran out: one turn tells the agent, then the wait is gone.
  if (wait.status === "expired") return startTurn({ agentRun, record, observation, reason: "resume-after-wait-expired" });
  const outcome = observation.eventWait;
  if (outcome?.kind === "event" && outcome.wake.waitId === wait.id && wait.wakes < wait.maxWakes) {
    const decided = startTurn({ agentRun, record, observation, reason: "resume-after-event" });
    return decided.action === "start-stage-turn" ? { ...decided, wake: outcome.wake } : decided;
  }
  const ended: AgentRunEventWaitEndReason | null =
    outcome?.kind === "unreadable"
      ? "unreadable"
      : Date.parse(wait.expiresAt) <= now.getTime()
        ? "expired"
        : wait.wakes >= wait.maxWakes
          ? "wake-limit"
          : null;
  if (!ended) return { action: "idle" };
  return {
    action: "pause",
    reason: "wait-expired",
    detail: describeEventWaitEnd(wait, ended, outcome?.kind === "unreadable" ? outcome.detail : undefined),
    eventWait: { ...wait, status: "expired", endReason: ended, endedAt: now.toISOString() },
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
  now: Date,
): AgentRunDecision {
  const { agentRun } = aggregate;
  const last = observation.lastEndedTurn;
  const report = isCurrentReport(record, last) ? record.report : null;

  if (report?.outcome === "complete") {
    // A stage cannot complete while work it delegated is still running.
    if (observation.leadTask.activeDelegatedTaskCount > 0) return { action: "idle" };
    return completeStage(aggregate, record, observation);
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
  if (record.status !== "stuck" && last.usageLimited && agentRun.usageLimit?.turnId === last.turnId) {
    const switched = agentRun.usageLimit.accountProfileId !== last.usageLimited.accountProfileId;
    return startTurn({ agentRun, record, observation, reason: switched ? "resume-after-account-switch" : "resume-after-usage-limit" });
  }
  // The agent run's own turn ended without a report.
  if (record.status === "stuck") return { action: "idle" };
  if (last.interrupted) {
    // Stave stopped while the turn ran, so the agent did not skip its report:
    // the stage resumes without spending the one reminder.
    return startTurn({ agentRun, record, observation, reason: "resume-after-restart" });
  }
  // The turn asked to wait for an outside event: the run waits instead of nudging,
  // even when the provider failed after the wait was registered.
  const waited = decideEventWait({ agentRun, record, observation, now });
  if (waited) return waited;
  if (last.providerFailure) {
    // The provider failed, not the agent: retry after a pause without spending
    // the one reminder, and halt once the retries are used up.
    const retries = observation.providerRetries ?? 0;
    const delay = PROVIDER_RETRY_DELAYS_MS[retries];
    if (delay === undefined) {
      return { action: "mark-stuck", detail: clampReason(i18n.t("agentRuns:policy.providerRetriesSpent", {
        count: retries, message: last.providerFailure.message })) };
    }
    if (now.getTime() < Date.parse(last.endedAt ?? last.startedAt) + delay) return { action: "idle" };
    return startTurn({ agentRun, record, observation, reason: "retry-after-provider-error" });
  }
  if (!observation.reportingAvailable) {
    // The model cannot report through a connection that is down, so this
    // blocks with "reporting unavailable" rather than spending the nudge.
    return startTurn({ agentRun, record, observation, reason: "stage-start" });
  }
  if (!record.nudged) {
    return turnCapPause(agentRun, observation) ?? { action: "nudge" };
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
      return completeStage(aggregate, record, observation);
    case "failed":
      return { action: "block", reason: "action-failed", detail: clampReason(outcome.detail) };
    case "stuck":
      return { action: "mark-stuck", detail: clampReason(outcome.detail) };
    case "needs-turn":
      return (
        turnCapPause(agentRun, observation) ?? {
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
    return manuallyPaused || agentRun.pauseReason === "usage-limit"
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

  // A reply in the task after a wait ran out continues the run, as Resume does.
  if (agentRun.state === "paused" && agentRun.pauseReason === "wait-expired" && !lead.activeTurn) {
    const last = observation.lastEndedTurn;
    const endedAt = agentRun.eventWait?.endedAt;
    if (last?.startedBy === "user" && endedAt && Date.parse(last.endedAt ?? last.startedAt) > Date.parse(endedAt)) {
      return { action: "resume" };
    }
  }

  // A pause the user chose outranks every automatic one.
  if (manuallyPaused) return { action: "idle" };

  // Keep a usage reservation while identity/runtime drift prevents dispatch.
  if (agentRun.pauseReason === "usage-limit" && (!lead.identity.ok ||
      (agentRun.origin !== "agent" && lead.fingerprint && !agentRunFingerprintsMatch(agentRun.fingerprint, lead.fingerprint)))) return { action: "idle" };

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
  if (agentRun.state === "paused" && agentRun.pauseReason === "usage-limit") {
    const waiting = agentRun.usageLimit;
    if (!waiting?.resumeAt || Date.parse(waiting.resumeAt) > now.getTime() || lead.activeTurn ||
        lead.pendingApprovalCount || lead.pendingUserInputCount) return { action: "idle" };
    // A pooled run checks its whole pool in order: its own account first only
    // when it is first in the pool.
    const pooled = observation.accountPoolUsage;
    if (pooled) {
      const rotation = decideAccountPoolRotation({ usage: pooled, now });
      if (rotation.kind === "use") {
        return rotation.accountProfileId === waiting.accountProfileId ? { action: "resume" } : { action: "switch-account",
          from: waiting.accountProfileId, to: rotation.accountProfileId, usageLimit: { ...waiting, accountProfileId: rotation.accountProfileId, resumeAt: null } };
      }
      return { action: "pause", reason: "usage-limit", detail: "",
        usageLimit: { ...waiting, resetsAt: rotation.resetsAt ?? waiting.resetsAt, resumeAt: rotation.resumeAt } };
    }
    const quota = observation.usageLimitResume;
    if (!quota) return { action: "idle" };
    if (quota.status === "headroom") return { action: "resume" };
    // An unreadable usage window retries on a fixed interval instead of every
    // minute past the old reset; a read without a reset time leaves the resume
    // to the user.
    const resetsAt = quota.status === "unavailable" ? waiting.resetsAt : quota.resetsAt ?? null;
    const resumeAt = quota.status === "unavailable" ? resolveUsageLimitRetryAt(now) : resolveAgentRunUsageLimitResumeAt(resetsAt, now);
    return { action: "pause", reason: "usage-limit", detail: "", usageLimit: { ...waiting, resetsAt, resumeAt } };
  }
  if (agentRun.state === "paused") return { action: "resume" };

  // 4. Wait on the user.
  if (lead.pendingApprovalCount > 0) return { action: "wait", reason: "awaiting-approval" };
  if (lead.pendingUserInputCount > 0) return { action: "wait", reason: "awaiting-user-input" };

  // 5. A turn is running.
  if (lead.activeTurn) return { action: "idle" };

  const last = observation.lastEndedTurn;
  if (last?.usageLimited && agentRun.usageLimit?.turnId !== last.turnId) {
    const resetsAt = last.usageLimited.resetsAt ?? null;
    // With no reset time, a first usage read that failed reads again on the
    // fixed interval; a read that reports no reset leaves the resume to the user.
    const unreadable = observation.usageLimitResume?.status === "unavailable";
    const limit = {
      turnId: last.turnId, resetsAt,
      resumeAt: resolveAgentRunUsageLimitResumeAt(resetsAt, now) ?? (unreadable ? resolveUsageLimitRetryAt(now) : null),
      accountProfileId: last.usageLimited.accountProfileId, fingerprint: last.usageLimited.fingerprint,
    };
    const pooled = observation.accountPoolUsage;
    if (pooled) {
      // The next turn boundary continues on another pool account with usage left.
      const rotation = decideAccountPoolRotation({ usage: pooled, limitedAccountId: limit.accountProfileId, limitedResetsAt: resetsAt, now });
      if (rotation.kind === "use") {
        return { action: "switch-account", from: limit.accountProfileId, to: rotation.accountProfileId,
          usageLimit: { ...limit, accountProfileId: rotation.accountProfileId, resumeAt: null } };
      }
      return { action: "pause", reason: "usage-limit", detail: "",
        usageLimit: { ...limit, resetsAt: rotation.resetsAt, resumeAt: rotation.resumeAt } };
    }
    return { action: "pause", reason: "usage-limit", detail: "", usageLimit: limit };
  }

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
        ? decideAiStage(aggregate, record, observation, now)
        : decideActionStage(aggregate, record, observation);
  }
}

/* -------------------------------------------------------------------------- */
/* Transitions                                                                 */
/* -------------------------------------------------------------------------- */

function withAgentRun(agentRun: AgentRun, patch: Partial<AgentRun>, now: Date): AgentRun {
  return { ...agentRun, ...patch, updatedAt: now.toISOString() };
}

/** A wait whose run starts a turn: it is no longer sitting in it. */
function withoutWaitingSince(wait: AgentRunEventWait): AgentRunEventWait {
  if (!wait.waitingSince) return wait;
  const { waitingSince: _settled, ...rest } = wait;
  return rest;
}

/** The run without its event wait; unchanged when it has none. */
function withoutEventWait(agentRun: AgentRun, now: Date): AgentRun {
  if (!agentRun.eventWait) return agentRun;
  const { eventWait: _ended, ...rest } = agentRun;
  return withAgentRun(rest, {}, now);
}

/** The keyed event of a wait that ended without its event. */
export function eventWaitExpiredEvent(agentRunId: string, wait: AgentRunEventWait) {
  return {
    kind: "wait-expired" as const,
    idempotencyKey: `${agentRunId}:wait:${wait.id}:expired`,
    detail: { waitId: wait.id, waitKind: wait.kind, reason: wait.endReason ?? "expired", wakes: wait.wakes, stageId: wait.stageId, attempt: wait.attempt },
  };
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
    case "pause": {
      const ended = decision.eventWait;
      return {
        agentRun: withAgentRun(
          agentRun,
          {
            state: "paused",
            pauseReason: decision.reason,
            ...(decision.usageLimit ? { usageLimit: decision.usageLimit } : {}),
            ...(ended ? { eventWait: ended } : {}),
            stopReason: null,
            reasonDetail: clampReason(decision.detail),
          },
          now,
        ),
        upserts: [],
        events: [
          ...(ended ? [eventWaitExpiredEvent(agentRun.id, ended)] : []),
          { kind: "paused", idempotencyKey: null, detail: { reason: decision.reason } },
        ],
      };
    }
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
    case "switch-account":
      // Running again, quietly: a switch raises no notification.
      return {
        agentRun: withAgentRun(
          agentRun,
          { state: "running", pauseReason: null, reasonDetail: null, usageLimit: decision.usageLimit },
          now,
        ),
        upserts: [],
        events: [accountSwitchedEvent({ agentRunId: agentRun.id, providerId: decision.usageLimit.fingerprint.providerId,
          from: decision.from, to: decision.to, turnId: decision.usageLimit.turnId })],
      };
    case "block": {
      const record = currentStageRecord(aggregate);
      // The agent's own blocker, or an unmet goal, ends its wait; a reporting outage keeps it.
      const endsWait = decision.reason === "agent-blocked" || decision.reason === "acceptance-unmet";
      return {
        agentRun: endsWait ? withoutEventWait(agentRun, now) : agentRun,
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
      return { agentRun: withAgentRun(agentRun, {}, now), upserts: [{ ...record, status: "awaiting-sign-off" }], events: [] };
    }
    case "start-stage-turn": {
      const record = currentStageRecord(aggregate);
      const wait = currentEventWait(agentRun, record);
      const woke = decision.wake && wait?.id === decision.wake.waitId ? wait : null;
      // A wake spends one of the wait's wakes and delivers its keys; a final
      // one, an ended wait, or a wait of an earlier attempt is gone.
      const kept = wait?.status === "waiting" ? withoutWaitingSince(wait) : undefined;
      const eventWait = woke
        ? decision.wake!.final
          ? undefined
          : { ...withoutWaitingSince(woke), wakes: woke.wakes + 1, consumedKeys: appendConsumedKeys(woke.consumedKeys, decision.wake!.keys) }
        : kept;
      const counted = withAgentRun(eventWait === agentRun.eventWait ? agentRun : withoutEventWait(agentRun, now),
        { turnCount: agentRun.turnCount + 1, ...(eventWait && eventWait !== agentRun.eventWait ? { eventWait } : {}) }, now);
      return {
        agentRun: counted,
        upserts: [
          {
            ...record,
            status: "running",
            blockReason: null,
            detail: null,
            startedAt: record.startedAt ?? timestamp,
          },
        ],
        events: woke
          ? [{
              kind: "wait-woke",
              idempotencyKey: `${agentRun.id}:wait:${woke.id}:woke:${woke.wakes + 1}`,
              detail: {
                waitId: woke.id, waitKind: woke.kind, stageId: record.stageId, attempt: record.attempt,
                wake: woke.wakes + 1, maxWakes: woke.maxWakes, fact: decision.wake!.fact, final: decision.wake!.final,
              },
            }]
          : [],
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
        agentRun: withoutEventWait(agentRun, now),
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
          // A completed stage has nothing left to wait for.
          aggregate: { ...aggregate, agentRun: withoutEventWait(agentRun, now) },
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
