/**
 * Mission supervisor policy: the pure half of a mission.
 *
 * The host runtime observes the lead task and the current stage, asks
 * `decideMissionAction` what to do, applies the result with
 * `applyMissionDecision`, and performs the I/O the decision names (start a
 * turn, run a Stave action). Nothing here reads a clock or a store.
 *
 * Boundary statements asserted here (see the taxonomy):
 * - A stage completes only through a recorded stage report or a Stave action
 *   result; an ended turn alone never completes a stage.
 * - A mission advances exactly one lead task and never creates a task: no
 *   decision creates one.
 */
import { resolveStageSignOff } from "@/lib/playbooks/sign-off";
import type { SignOff } from "@/lib/playbooks/schema";
import {
  clampReason,
  currentStageRecord,
  enterStage,
  formatMissionFingerprint,
  isAutomaticMissionPause,
  missionFingerprintsMatch,
  playbookStageAt,
  stageHasExternalEffect,
  type ActionResult,
  type Mission,
  type MissionAggregate,
  type MissionChange,
  type MissionFingerprint,
  type MissionPauseReason,
  type MissionStageRecord,
  type MissionStopReason,
  type StageBlockReason,
} from "./domain";

/* -------------------------------------------------------------------------- */
/* Observation                                                                 */
/* -------------------------------------------------------------------------- */

export interface ObservedTurn {
  turnId: string;
  startedBy: "mission" | "user";
  startedAt: string;
}

/** What the runtime read about the lead task this tick. */
export interface LeadTaskObservation {
  /**
   * False when the workspace could not be read. A momentarily unreadable
   * workspace pauses; only a task that is really gone stops the mission.
   */
  workspaceAvailable: boolean;
  taskExists: boolean;
  taskArchived: boolean;
  /** The fleet control plane's staleness check against the mission identity. */
  identity: { ok: true } | { ok: false; reason: string };
  fingerprint: MissionFingerprint | null;
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
   * for failing checks. The turn counts against the mission's turn cap and
   * reports nothing; the action observes its effect afterwards.
   */
  | { status: "needs-turn"; reason: "repair-checks"; prompt: string; detail: string };

export interface MissionObservation {
  leadTask: LeadTaskObservation;
  /** False when the Local MCP server the model reports through is down. */
  reportingAvailable: boolean;
  /** The latest lead-task turn that ended since the current attempt began. */
  lastEndedTurn: ObservedTurn | null;
  /** The composer choice for the running user turn, if one is running. */
  userTurnIntent: "continue" | "take-over" | null;
  /** For an action stage, what the Stave action has produced so far. */
  actionOutcome: ActionOutcome | null;
}

/* -------------------------------------------------------------------------- */
/* Decision                                                                    */
/* -------------------------------------------------------------------------- */

export type StageTurnReason =
  | "stage-start"
  | "continue-after-user"
  | "reporting-restored";

export type MissionDecision =
  | { action: "idle" }
  | { action: "wait"; reason: "awaiting-approval" | "awaiting-user-input" }
  | { action: "stop"; reason: MissionStopReason; detail: string }
  | { action: "pause"; reason: MissionPauseReason; detail: string }
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

export type MissionDecisionAction = MissionDecision["action"];

/**
 * Every decision the supervisor can make, with what the runtime does for it.
 * None creates a task: a mission advances exactly one lead task.
 */
export const MISSION_DECISION_EFFECTS: Record<MissionDecisionAction, string> = {
  idle: "Nothing to do this tick.",
  wait: "The lead task waits on the user; its own attention item shows it.",
  stop: "End the mission with a reason and a partial report.",
  pause: "Pause the mission with a reason.",
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
 * The sign-off a mission applies before the stage at `index`. The check-in
 * level comes from the mission's consent, not the saved playbook, and a stage
 * with an external effect the user did not authorize at start always asks.
 */
export function resolveMissionStageSignOff(mission: Mission, index: number): SignOff {
  playbookStageAt(mission, index);
  return resolveConsentStageSignOff(mission, index);
}

/**
 * The sign-off a stage gets under a start's consent: a stage that writes
 * outside the workspace without the user's go-ahead always asks; the rest
 * follow the chosen check-ins. The Start sheet previews missions with this
 * same rule, so what it shows is what the mission does.
 */
export function resolveConsentStageSignOff(
  mission: Pick<Mission, "playbook"> & { consent: Pick<Mission["consent"], "checkIns" | "authorizedEffectStageIds"> },
  index: number,
): SignOff {
  const stage = mission.playbook.stages[index];
  if (!stage) throw new RangeError(`Stage index ${index} is outside the playbook.`);
  if (
    stageHasExternalEffect(stage) &&
    !mission.consent.authorizedEffectStageIds.includes(stage.id)
  ) {
    return "ask";
  }
  return resolveStageSignOff(
    { checkIns: mission.consent.checkIns, stages: mission.playbook.stages },
    index,
  );
}

function nextAfterCompletion(mission: Mission): "sign-off" | "start" | "finish" {
  const nextIndex = mission.currentStageIndex + 1;
  if (nextIndex >= mission.playbook.stages.length) return "finish";
  return resolveMissionStageSignOff(mission, nextIndex) === "ask" ? "sign-off" : "start";
}

function turnCapStop(mission: Mission): MissionDecision | null {
  if (mission.turnCount < mission.maxTurns) return null;
  return {
    action: "stop",
    reason: "turn-cap-reached",
    detail: `This mission reached its limit of ${mission.maxTurns} turns.`,
  };
}

function startTurn(args: {
  mission: Mission;
  record: MissionStageRecord;
  observation: MissionObservation;
  reason: StageTurnReason;
}): MissionDecision {
  const { mission, record, observation } = args;
  if (!observation.reportingAvailable) {
    return record.status === "blocked" && record.blockReason === "reporting-unavailable"
      ? { action: "idle" }
      : {
          action: "block",
          reason: "reporting-unavailable",
          detail:
            "Stave's local tools are unreachable, so the agent could not report this stage. The mission continues when they are back.",
        };
  }
  const capped = turnCapStop(mission);
  if (capped) return capped;
  return {
    action: "start-stage-turn",
    stageIndex: mission.currentStageIndex,
    attempt: record.attempt,
    reason: args.reason,
    ...(record.feedback ? { feedback: record.feedback } : {}),
  };
}

/** True when the report was made during or after the last ended turn. */
function isCurrentReport(record: MissionStageRecord, lastEndedTurn: ObservedTurn | null) {
  if (!record.report) return false;
  if (!lastEndedTurn) return true;
  if (record.report.turnId && record.report.turnId === lastEndedTurn.turnId) return true;
  return Date.parse(record.report.reportedAt) >= Date.parse(lastEndedTurn.startedAt);
}

function decideAiStage(
  mission: Mission,
  record: MissionStageRecord,
  observation: MissionObservation,
): MissionDecision {
  const last = observation.lastEndedTurn;
  const report = isCurrentReport(record, last) ? record.report : null;

  if (report?.outcome === "complete") {
    // A stage cannot complete while work it delegated is still running.
    if (observation.leadTask.activeDelegatedTaskCount > 0) return { action: "idle" };
    return { action: "complete-stage", next: nextAfterCompletion(mission) };
  }
  if (report?.outcome === "blocked") {
    return record.status === "blocked"
      ? { action: "idle" }
      : { action: "block", reason: "agent-blocked", detail: clampReason(report.missing) };
  }

  // No current report from here on.
  if (record.status === "blocked" && record.blockReason === "reporting-unavailable") {
    return startTurn({ mission, record, observation, reason: "reporting-restored" });
  }
  if (!last) {
    // A stage marked stuck before any turn ended (its turn never started)
    // waits for Retry or a reply instead of replaying the start.
    if (record.status === "stuck") return { action: "idle" };
    return startTurn({ mission, record, observation, reason: "stage-start" });
  }
  if (last.startedBy === "user") {
    // The user's reply is guidance for this stage; the mission picks it up.
    return startTurn({ mission, record, observation, reason: "continue-after-user" });
  }
  // The mission's own turn ended without a report.
  if (record.status === "stuck") return { action: "idle" };
  if (!observation.reportingAvailable) {
    // The model cannot report through a connection that is down, so this
    // blocks with "reporting unavailable" rather than spending the nudge.
    return startTurn({ mission, record, observation, reason: "stage-start" });
  }
  if (!record.nudged) {
    return turnCapStop(mission) ?? { action: "nudge" };
  }
  return {
    action: "mark-stuck",
    detail: "The agent ended two turns without reporting this stage.",
  };
}

function decideActionStage(
  mission: Mission,
  record: MissionStageRecord,
  observation: MissionObservation,
): MissionDecision {
  if (record.status === "blocked" || record.status === "stuck") return { action: "idle" };
  const outcome = observation.actionOutcome;
  if (!outcome || outcome.status === "in-progress") {
    return { action: "execute-action", stageIndex: mission.currentStageIndex };
  }
  switch (outcome.status) {
    case "succeeded":
      return { action: "complete-stage", next: nextAfterCompletion(mission) };
    case "failed":
      return { action: "block", reason: "action-failed", detail: clampReason(outcome.detail) };
    case "stuck":
      return { action: "mark-stuck", detail: clampReason(outcome.detail) };
    case "needs-turn":
      return (
        turnCapStop(mission) ?? {
          action: "start-action-turn",
          stageIndex: mission.currentStageIndex,
          attempt: record.attempt,
        }
      );
  }
}

/** A pause the mission is already in is not decided again every tick. */
function pauseFor(
  mission: Mission,
  reason: MissionPauseReason,
  detail: string,
): MissionDecision {
  return mission.state === "paused" && mission.pauseReason === reason
    ? { action: "idle" }
    : { action: "pause", reason, detail };
}

/**
 * The whole policy, in the design's priority order: stop, pause, reporting,
 * wait, a running turn, then the current stage.
 */
export function decideMissionAction(args: {
  aggregate: MissionAggregate;
  observation: MissionObservation;
  now: Date;
}): MissionDecision {
  const { aggregate, observation, now } = args;
  const { mission } = aggregate;
  const lead = observation.leadTask;

  if (mission.state !== "running" && mission.state !== "paused") {
    return { action: "idle" };
  }
  const manuallyPaused =
    mission.state === "paused" &&
    mission.pauseReason !== null &&
    !isAutomaticMissionPause(mission.pauseReason);

  // 1. Stop. Trusted only when the workspace actually loaded.
  if (!lead.workspaceAvailable) {
    return manuallyPaused
      ? { action: "idle" }
      : pauseFor(mission, "task-identity-changed", "The lead task's workspace is not loaded right now.");
  }
  if (!lead.taskExists) {
    return { action: "stop", reason: "task-unavailable", detail: "The lead task no longer exists." };
  }
  if (lead.taskArchived) {
    return { action: "stop", reason: "task-unavailable", detail: "The lead task was archived." };
  }
  if (mission.expiresAt && Date.parse(mission.expiresAt) <= now.getTime()) {
    return {
      action: "stop",
      reason: "expired",
      detail: `This mission expired at ${mission.expiresAt}.`,
    };
  }

  // A pause the user chose outranks every automatic one.
  if (manuallyPaused) return { action: "idle" };

  // 2. Pause.
  if (!lead.identity.ok) {
    return pauseFor(mission, "task-identity-changed", lead.identity.reason);
  }
  if (lead.fingerprint && !missionFingerprintsMatch(mission.fingerprint, lead.fingerprint)) {
    return pauseFor(
      mission,
      "runtime-changed",
      `The lead task now runs on ${formatMissionFingerprint(lead.fingerprint)}, not ${formatMissionFingerprint(mission.fingerprint)}.`,
    );
  }
  if (lead.activeTurn?.startedBy === "user" && observation.userTurnIntent === "take-over") {
    return {
      action: "pause",
      reason: "taken-over",
      detail: "You took over the lead task. Resume the mission when you are done.",
    };
  }
  if (mission.state === "paused") return { action: "resume" };

  // 4. Wait on the user.
  if (lead.pendingApprovalCount > 0) return { action: "wait", reason: "awaiting-approval" };
  if (lead.pendingUserInputCount > 0) return { action: "wait", reason: "awaiting-user-input" };

  // 5. A turn is running.
  if (lead.activeTurn) return { action: "idle" };

  // 6-9. The current stage.
  const record = currentStageRecord(aggregate);
  const stage = playbookStageAt(mission, mission.currentStageIndex);
  switch (record.status) {
    case "completed":
    case "skipped":
    case "cancelled":
    case "awaiting-sign-off":
      return { action: "idle" };
    case "pending":
      if (resolveMissionStageSignOff(mission, mission.currentStageIndex) === "ask") {
        return { action: "request-sign-off" };
      }
      return stage.kind === "ai"
        ? startTurn({ mission, record, observation, reason: "stage-start" })
        : { action: "execute-action", stageIndex: mission.currentStageIndex };
    case "running":
    case "blocked":
    case "stuck":
      return stage.kind === "ai"
        ? decideAiStage(mission, record, observation)
        : decideActionStage(mission, record, observation);
  }
}

/* -------------------------------------------------------------------------- */
/* Transitions                                                                 */
/* -------------------------------------------------------------------------- */

function withMission(mission: Mission, patch: Partial<Mission>, now: Date): Mission {
  return { ...mission, ...patch, updatedAt: now.toISOString() };
}

/**
 * Moves the mission past its current stage: into the next stage's record, or
 * to completed after the last stage.
 */
export function advanceMission(args: {
  aggregate: MissionAggregate;
  completed: MissionStageRecord;
  now: Date;
  signOff?: boolean;
}): MissionChange {
  const { aggregate, completed, now } = args;
  const { mission } = aggregate;
  const nextIndex = mission.currentStageIndex + 1;
  if (nextIndex >= mission.playbook.stages.length) {
    return {
      mission: withMission(
        mission,
        { state: "completed", pauseReason: null, stopReason: null, reasonDetail: null },
        now,
      ),
      upserts: [completed],
      events: [{ kind: "mission-ended", idempotencyKey: null, detail: { outcome: "completed" } }],
    };
  }
  const advanced = withMission(mission, { currentStageIndex: nextIndex }, now);
  const entered = enterStage({ aggregate: { mission: advanced, stages: aggregate.stages }, index: nextIndex });
  return {
    mission: advanced,
    upserts: [completed, args.signOff ? { ...entered, status: "awaiting-sign-off" } : entered],
    events: [],
  };
}

export function applyMissionDecision(args: {
  aggregate: MissionAggregate;
  decision: MissionDecision;
  now: Date;
}): MissionChange {
  const { aggregate, decision, now } = args;
  const { mission } = aggregate;
  const timestamp = now.toISOString();
  const unchanged: MissionChange = { mission, upserts: [], events: [] };

  switch (decision.action) {
    case "idle":
    case "wait":
      return unchanged;
    case "stop":
      return {
        mission: withMission(
          mission,
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
            kind: "mission-ended",
            idempotencyKey: null,
            detail: { outcome: "stopped", reason: decision.reason },
          },
        ],
      };
    case "pause":
      return {
        mission: withMission(
          mission,
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
        mission: withMission(
          mission,
          { state: "running", pauseReason: null, reasonDetail: null },
          now,
        ),
        upserts: [],
        events: [{ kind: "resumed", idempotencyKey: null, detail: {} }],
      };
    case "block": {
      const record = currentStageRecord(aggregate);
      return {
        mission,
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
      return { mission, upserts: [{ ...record, status: "awaiting-sign-off" }], events: [] };
    }
    case "start-stage-turn": {
      const record = currentStageRecord(aggregate);
      return {
        mission: withMission(mission, { turnCount: mission.turnCount + 1 }, now),
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
        mission: withMission(mission, { turnCount: mission.turnCount + 1 }, now),
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
        mission,
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
        mission: withMission(mission, { turnCount: mission.turnCount + 1 }, now),
        upserts: [],
        events: [],
      };
    case "execute-action": {
      const record = currentStageRecord(aggregate);
      if (record.status === "running") return unchanged;
      return {
        mission,
        upserts: [{ ...record, status: "running", startedAt: record.startedAt ?? timestamp }],
        events: [],
      };
    }
    case "complete-stage": {
      const record = currentStageRecord(aggregate);
      const completed: MissionStageRecord = {
        ...record,
        status: "completed",
        blockReason: null,
        detail: null,
        endedAt: timestamp,
      };
      const change = advanceMission({
        aggregate,
        completed,
        now,
        signOff: decision.next === "sign-off",
      });
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
