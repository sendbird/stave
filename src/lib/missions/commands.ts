/**
 * User commands on a mission, as pure transitions. Each one either returns a
 * `MissionChange` for the store to apply in one transaction or throws a
 * `MissionCommandError` whose message the surface shows as-is.
 *
 * The supervisor policy (`policy.ts`) decides what happens on its own; these
 * are the choices only the user makes: sign off, ask for changes, skip, retry,
 * pause, resume, cancel, and accept a runtime change.
 */
import {
  MISSION_LIMITS,
  MissionCommandError,
  clampReason,
  currentStageRecord,
  enterStage,
  isActiveMissionState,
  isTerminalStageStatus,
  playbookStageAt,
  replaceStageRecord,
  type CompleteStageReport,
  type Mission,
  type MissionAggregate,
  type MissionChange,
  type MissionFingerprint,
  type MissionStageRecord,
  type StageBlockInput,
  type StageCompleteReportInput,
  type StageStatus,
} from "./domain";
import { advanceMission } from "./policy";

/** The stage attempt a control was rendered against. */
export interface StageIdentity {
  stageId: string;
  attempt: number;
}

function touch(mission: Mission, patch: Partial<Mission>, now: Date): Mission {
  return { ...mission, ...patch, updatedAt: now.toISOString() };
}

function requireActive(aggregate: MissionAggregate) {
  if (!isActiveMissionState(aggregate.mission.state)) {
    throw new MissionCommandError("not-active", "This mission has already ended.");
  }
}

/**
 * Refuses a control aimed at a stage attempt the mission has moved past, so a
 * stale card can never act on whatever replaced it.
 */
function requireCurrentStage(
  aggregate: MissionAggregate,
  expected: StageIdentity,
  allowed: readonly StageStatus[],
): MissionStageRecord {
  requireActive(aggregate);
  const record = currentStageRecord(aggregate);
  if (record.stageId !== expected.stageId || record.attempt !== expected.attempt) {
    throw new MissionCommandError(
      "stale-identity",
      "The mission has moved on from this stage. Refresh to see where it is now.",
    );
  }
  if (!allowed.includes(record.status)) {
    const title = playbookStageAt(aggregate.mission, aggregate.mission.currentStageIndex).title;
    throw new MissionCommandError(
      "invalid-state",
      `"${title}" is ${record.status.replaceAll("-", " ")}, so this is not available.`,
    );
  }
  return record;
}

/** Approves the stage waiting at a sign-off card; the supervisor starts it. */
export function signOffStage(args: {
  aggregate: MissionAggregate;
  expected: StageIdentity;
  now: Date;
}): MissionChange {
  const record = requireCurrentStage(args.aggregate, args.expected, ["awaiting-sign-off"]);
  return {
    mission: touch(args.aggregate.mission, {}, args.now),
    upserts: [{ ...record, status: "running" }],
    events: [
      {
        kind: "sign-off",
        idempotencyKey: null,
        detail: { stageId: record.stageId, attempt: record.attempt },
      },
    ],
  };
}

/**
 * "Ask for changes" on a sign-off card: the most recent AI stage before the
 * card runs again as a new attempt carrying the feedback. The stages after it
 * run again too, so a change is re-verified before anything is published.
 */
export function requestStageChanges(args: {
  aggregate: MissionAggregate;
  expected: StageIdentity;
  feedback: string;
  now: Date;
}): MissionChange {
  const { aggregate, now } = args;
  const waiting = requireCurrentStage(aggregate, args.expected, ["awaiting-sign-off"]);
  const feedback = args.feedback.trim().slice(0, MISSION_LIMITS.maxFeedbackChars);
  if (!feedback) {
    throw new MissionCommandError("invalid-state", "Describe the changes you want.");
  }
  const stages = aggregate.mission.playbook.stages;
  let targetIndex = -1;
  for (let index = aggregate.mission.currentStageIndex - 1; index >= 0; index -= 1) {
    if (stages[index]?.kind === "ai") {
      targetIndex = index;
      break;
    }
  }
  if (targetIndex === -1) {
    throw new MissionCommandError(
      "no-previous-ai-stage",
      "No earlier AI stage can take changes. Skip this stage or cancel the mission.",
    );
  }
  const mission = touch(aggregate.mission, { currentStageIndex: targetIndex }, now);
  const rerun = enterStage({
    aggregate: { mission, stages: aggregate.stages },
    index: targetIndex,
    feedback,
  });
  return {
    mission,
    // The card's own record never started; it waits as pending until the
    // mission reaches it again.
    upserts: [{ ...waiting, status: "pending" }, rerun],
    events: [
      {
        kind: "changes-requested",
        idempotencyKey: null,
        detail: {
          atStageId: waiting.stageId,
          rerunStageId: rerun.stageId,
          attempt: rerun.attempt,
        },
      },
    ],
  };
}

/** Skips the current stage and moves on. */
export function skipStage(args: {
  aggregate: MissionAggregate;
  expected: StageIdentity;
  now: Date;
}): MissionChange {
  const record = requireCurrentStage(args.aggregate, args.expected, [
    "pending",
    "awaiting-sign-off",
    "blocked",
    "stuck",
  ]);
  const skipped: MissionStageRecord = {
    ...record,
    status: "skipped",
    blockReason: null,
    detail: "Skipped by the user.",
    endedAt: args.now.toISOString(),
  };
  const change = advanceMission({ aggregate: args.aggregate, completed: skipped, now: args.now });
  return {
    ...change,
    events: [
      {
        kind: "stage-skipped",
        idempotencyKey: null,
        detail: { stageId: record.stageId, attempt: record.attempt },
      },
      ...change.events,
    ],
  };
}

/** Starts a fresh attempt at a blocked or stuck stage. */
export function retryStage(args: {
  aggregate: MissionAggregate;
  expected: StageIdentity;
  now: Date;
}): MissionChange {
  const { aggregate, now } = args;
  const record = requireCurrentStage(aggregate, args.expected, ["blocked", "stuck"]);
  const ended: MissionStageRecord = {
    ...record,
    status: "cancelled",
    blockReason: null,
    detail: "Replaced by a new attempt.",
    endedAt: now.toISOString(),
  };
  const retried = enterStage({
    aggregate: { mission: aggregate.mission, stages: replaceStageRecord(aggregate.stages, ended) },
    index: aggregate.mission.currentStageIndex,
  });
  return {
    mission: touch(aggregate.mission, {}, now),
    upserts: [ended, retried],
    events: [
      {
        kind: "stage-retried",
        idempotencyKey: null,
        detail: { stageId: record.stageId, attempt: retried.attempt },
      },
    ],
  };
}

/** Pauses a running mission until Resume. */
export function pauseMission(args: {
  aggregate: MissionAggregate;
  reason: "paused-by-user" | "taken-over";
  now: Date;
}): MissionChange {
  requireActive(args.aggregate);
  const { mission } = args.aggregate;
  if (mission.state === "paused" && mission.pauseReason === args.reason) {
    return { mission, upserts: [], events: [] };
  }
  const detail =
    args.reason === "taken-over"
      ? "You took over the lead task. Resume the mission when you are done."
      : "Paused by the user.";
  return {
    mission: touch(
      mission,
      { state: "paused", pauseReason: args.reason, reasonDetail: detail },
      args.now,
    ),
    upserts: [],
    events: [{ kind: "paused", idempotencyKey: null, detail: { reason: args.reason } }],
  };
}

/**
 * Clears a pause the user chose. A pause the supervisor set clears on its own
 * once its condition lifts, so resuming one by hand is refused.
 */
export function resumeMission(args: {
  aggregate: MissionAggregate;
  now: Date;
}): MissionChange {
  requireActive(args.aggregate);
  const { mission } = args.aggregate;
  if (mission.state === "running") return { mission, upserts: [], events: [] };
  if (mission.pauseReason !== "paused-by-user" && mission.pauseReason !== "taken-over") {
    throw new MissionCommandError(
      "invalid-state",
      mission.reasonDetail ?? "This pause clears on its own once its condition lifts.",
    );
  }
  return {
    mission: touch(
      mission,
      { state: "running", pauseReason: null, reasonDetail: null },
      args.now,
    ),
    upserts: [],
    events: [{ kind: "resumed", idempotencyKey: null, detail: {} }],
  };
}

/**
 * "Apply to remaining stages" on a runtime-changed pause: the mission adopts
 * the lead task's new runtime and continues.
 */
export function acceptMissionRuntime(args: {
  aggregate: MissionAggregate;
  fingerprint: MissionFingerprint;
  now: Date;
}): MissionChange {
  requireActive(args.aggregate);
  const { mission } = args.aggregate;
  const resumes = mission.state === "paused" && mission.pauseReason === "runtime-changed";
  return {
    mission: touch(
      mission,
      {
        fingerprint: args.fingerprint,
        ...(resumes ? { state: "running", pauseReason: null, reasonDetail: null } : {}),
      },
      args.now,
    ),
    upserts: [],
    events: [
      {
        kind: "runtime-accepted",
        idempotencyKey: null,
        detail: { providerId: args.fingerprint.providerId, model: args.fingerprint.model },
      },
    ],
  };
}

/** Ends the mission. Completed work, pushed branches and PRs stay as they are. */
export function cancelMission(args: {
  aggregate: MissionAggregate;
  now: Date;
}): MissionChange {
  requireActive(args.aggregate);
  const record = currentStageRecord(args.aggregate);
  const upserts = isTerminalStageStatus(record.status)
    ? []
    : [
        {
          ...record,
          status: "cancelled" as const,
          blockReason: null,
          detail: "The mission was cancelled.",
          endedAt: args.now.toISOString(),
        },
      ];
  return {
    mission: touch(
      args.aggregate.mission,
      { state: "cancelled", pauseReason: null, stopReason: null, reasonDetail: null },
      args.now,
    ),
    upserts,
    events: [{ kind: "mission-ended", idempotencyKey: null, detail: { outcome: "cancelled" } }],
  };
}

/**
 * Records what the agent reported for the stage its turn's grant names. The
 * host resolves `expected` from the grant, never from the model. The policy
 * acts on the report at the next tick.
 */
export function recordStageReport(args: {
  aggregate: MissionAggregate;
  expected: StageIdentity;
  report:
    | ({ outcome: "complete" } & StageCompleteReportInput)
    | ({ outcome: "blocked" } & StageBlockInput);
  turnId: string | null;
  now: Date;
}): MissionChange {
  const record = requireCurrentStage(args.aggregate, args.expected, ["running", "blocked", "stuck"]);
  if (record.reportRevision >= MISSION_LIMITS.maxReportRevisions) {
    throw new MissionCommandError(
      "report-limit",
      `This stage already has ${MISSION_LIMITS.maxReportRevisions} reports; the latest one counts.`,
    );
  }
  const report =
    args.report.outcome === "complete"
      ? ({
          ...args.report,
          decisions: args.report.decisions ?? [],
          evidence: args.report.evidence ?? [],
          artifacts: args.report.artifacts ?? [],
          reportedAt: args.now.toISOString(),
          turnId: args.turnId,
        } satisfies CompleteStageReport)
      : { ...args.report, reportedAt: args.now.toISOString(), turnId: args.turnId };
  return {
    mission: touch(args.aggregate.mission, {}, args.now),
    upserts: [{ ...record, report, reportRevision: record.reportRevision + 1 }],
    events: [
      {
        kind: "report",
        idempotencyKey: null,
        detail: {
          stageId: record.stageId,
          attempt: record.attempt,
          outcome: report.outcome,
          summary: clampReason(
            report.outcome === "complete" ? report.summary : report.missing,
          ),
        },
      },
    ],
  };
}
