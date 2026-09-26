/**
 * Mission domain: the records a mission is made of.
 *
 * A mission runs a playbook on one lead task the user already owns. It is a
 * Layer 3 supervisor entry beside wake-ups (see
 * `docs/architecture/agent-platform-taxonomy.md`): it adds turns to that task
 * and never creates one.
 *
 * Used by:
 * - `src/lib/missions/policy.ts` and `src/lib/missions/commands.ts` (pure
 *   transitions)
 * - `electron/persistence/mission-store.ts` (row parsing)
 *
 * Pure: no clock, no I/O. Callers pass `now` and ids.
 */
import { z } from "zod";
import { AUTOMATION_PERMISSION_MODES } from "@/lib/automations";
import {
  CHECK_INS,
  PlaybookSchema,
  type Playbook,
  type PlaybookStage,
} from "@/lib/playbooks/schema";
import { ACCEPTANCE_CRITERION_STATUSES } from "@/lib/playbooks/stage-prompt";

export const MISSION_LIMITS = Object.freeze({
  maxIdChars: 256,
  maxAssignmentChars: 8_000,
  maxReasonChars: 500,
  maxFeedbackChars: 2_000,
  defaultMaxTurns: 30,
  maxTurnsCeiling: 100,
  maxStageAttempts: 20,
  /** Report revisions accepted per stage attempt; the latest counts. */
  maxReportRevisions: 5,
  maxIdempotencyKeyChars: 1_024,
  maxEventDetailChars: 8_000,
  /** Events kept per mission. Keyed events are never pruned. */
  maxRetainedEvents: 2_000,
  report: {
    summary: 600,
    decisions: 5,
    decision: 200,
    decisionReason: 280,
    evidence: 10,
    evidenceLabel: 160,
    ref: 2_000,
    command: 1_000,
    artifacts: 10,
    artifactLabel: 160,
    criteria: 10,
    criterionText: 300,
    missing: 600,
    suggestedAction: 300,
  },
  facts: { commands: 100, toolCalls: 200, checks: 50 },
});

const IdSchema = z.string().trim().min(1).max(MISSION_LIMITS.maxIdChars);
const TimestampSchema = z.iso.datetime();
const ReasonSchema = z.string().max(MISSION_LIMITS.maxReasonChars);
const UrlSchema = z.url().max(MISSION_LIMITS.report.ref);

/* -------------------------------------------------------------------------- */
/* Identity and consent                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The runtime a mission was started against. When the lead task drifts from
 * it, the mission pauses instead of running stages on a runtime the user never
 * agreed to.
 */
export const MissionFingerprintSchema = z
  .object({
    providerId: z.enum(["claude-code", "codex", "cursor", "kiro"]),
    model: z.string().trim().min(1).max(200),
  })
  .strict();
export type MissionFingerprint = z.infer<typeof MissionFingerprintSchema>;

export function missionFingerprintsMatch(
  left: MissionFingerprint,
  right: MissionFingerprint,
) {
  return left.providerId === right.providerId && left.model === right.model;
}

export function formatMissionFingerprint(fingerprint: MissionFingerprint) {
  return `${fingerprint.providerId}:${fingerprint.model}`;
}

/**
 * What the user agreed to when starting this mission. A saved playbook grants
 * nothing; this record is the only authority a mission has. A stage with an
 * external effect that is not listed here always waits for sign-off.
 */
export const MissionConsentSchema = z
  .object({
    checkIns: z.enum(CHECK_INS),
    permissionMode: z.enum(AUTOMATION_PERMISSION_MODES),
    authorizedEffectStageIds: z.array(IdSchema).max(12),
  })
  .strict();
export type MissionConsent = z.infer<typeof MissionConsentSchema>;

/** Publish stages and Stave actions write outside the workspace. */
export function stageHasExternalEffect(stage: PlaybookStage): boolean {
  return stage.kind === "action" || stage.role === "publish";
}

export function listExternalEffectStages(playbook: Pick<Playbook, "stages">) {
  return playbook.stages.filter(stageHasExternalEffect);
}

/* -------------------------------------------------------------------------- */
/* Mission state                                                               */
/* -------------------------------------------------------------------------- */

export const MISSION_STATES = [
  "running",
  "paused",
  "completed",
  "cancelled",
  "stopped",
] as const;
export type MissionState = (typeof MISSION_STATES)[number];

export const ACTIVE_MISSION_STATES = ["running", "paused"] as const satisfies
  readonly MissionState[];

export function isActiveMissionState(state: MissionState) {
  return state === "running" || state === "paused";
}

/**
 * `paused-by-user` and `taken-over` are cleared by Resume. The other two
 * describe a condition the supervisor watches and clears on its own.
 */
export const MISSION_PAUSE_REASONS = [
  "paused-by-user",
  "taken-over",
  "task-identity-changed",
  "runtime-changed",
] as const;
export type MissionPauseReason = (typeof MISSION_PAUSE_REASONS)[number];

export function isAutomaticMissionPause(reason: MissionPauseReason) {
  return reason === "task-identity-changed" || reason === "runtime-changed";
}

export const MISSION_STOP_REASONS = [
  "task-unavailable",
  "turn-cap-reached",
  "expired",
] as const;
export type MissionStopReason = (typeof MISSION_STOP_REASONS)[number];

/* -------------------------------------------------------------------------- */
/* Stage reports                                                               */
/* -------------------------------------------------------------------------- */

const limits = MISSION_LIMITS.report;

export const STAGE_EVIDENCE_KINDS = [
  "check",
  "link",
  "artifact",
  "observation",
] as const;

export const StageEvidenceSchema = z
  .object({
    label: z.string().trim().min(1).max(limits.evidenceLabel),
    kind: z.enum(STAGE_EVIDENCE_KINDS),
    ref: z.string().trim().max(limits.ref).optional(),
    /** A tool call from this stage's turns that shows the evidence. */
    toolCallId: z.string().trim().min(1).max(MISSION_LIMITS.maxIdChars).optional(),
    /** A command this stage ran that shows the evidence. */
    command: z.string().trim().min(1).max(limits.command).optional(),
  })
  .strict();
export type StageEvidence = z.infer<typeof StageEvidenceSchema>;

export const AcceptanceCriterionSchema = z
  .object({
    text: z.string().trim().min(1).max(limits.criterionText),
    status: z.enum(ACCEPTANCE_CRITERION_STATUSES),
  })
  .strict();

/** The input of `stave_report_stage`. */
export const StageCompleteReportInputSchema = z
  .object({
    summary: z.string().trim().min(1).max(limits.summary),
    decisions: z
      .array(
        z
          .object({
            decision: z.string().trim().min(1).max(limits.decision),
            reason: z.string().trim().min(1).max(limits.decisionReason),
          })
          .strict(),
      )
      .max(limits.decisions)
      .default([]),
    evidence: z.array(StageEvidenceSchema).max(limits.evidence).default([]),
    artifacts: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(limits.artifactLabel),
            url: UrlSchema,
          })
          .strict(),
      )
      .max(limits.artifacts)
      .default([]),
    acceptanceCriteria: z
      .array(AcceptanceCriterionSchema)
      .max(limits.criteria)
      .optional(),
  })
  .strict();
export type StageCompleteReportInput = z.infer<
  typeof StageCompleteReportInputSchema
>;

export const STAGE_BLOCK_KINDS = [
  "input",
  "permission",
  "environment",
  "external",
] as const;

/** The input of `stave_block_stage`. */
export const StageBlockInputSchema = z
  .object({
    missing: z.string().trim().min(1).max(limits.missing),
    kind: z.enum(STAGE_BLOCK_KINDS),
    suggestedAction: z.string().trim().min(1).max(limits.suggestedAction).optional(),
  })
  .strict();
export type StageBlockInput = z.infer<typeof StageBlockInputSchema>;

const reportStamp = {
  reportedAt: TimestampSchema,
  /** The turn the report was recorded in, when the host knows it. */
  turnId: IdSchema.nullable(),
};

export const StageReportSchema = z.discriminatedUnion("outcome", [
  StageCompleteReportInputSchema.extend({
    outcome: z.literal("complete"),
    ...reportStamp,
  }).strict(),
  StageBlockInputSchema.extend({
    outcome: z.literal("blocked"),
    ...reportStamp,
  }).strict(),
]);
export type StageReport = z.infer<typeof StageReportSchema>;
export type CompleteStageReport = Extract<StageReport, { outcome: "complete" }>;

/* -------------------------------------------------------------------------- */
/* Stave-collected facts and action results                                    */
/* -------------------------------------------------------------------------- */

export const ActionResultSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("open-draft-pr"),
      prUrl: UrlSchema,
      prNumber: z.number().int().positive(),
      /** False when the pull request already existed and was reused. */
      created: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("watch-checks"),
      outcome: z.enum(["passed", "no-checks"]),
      checks: z
        .array(
          z
            .object({
              name: z.string().trim().min(1).max(200),
              state: z.string().trim().min(1).max(40),
              url: UrlSchema.optional(),
            })
            .strict(),
        )
        .max(MISSION_LIMITS.facts.checks),
    })
    .strict(),
  z
    .object({
      type: z.literal("mark-pr-ready"),
      prUrl: UrlSchema,
    })
    .strict(),
]);
export type ActionResult = z.infer<typeof ActionResultSchema>;

/** What Stave itself observed during a stage, as opposed to what was reported. */
export const StageFactsSchema = z
  .object({
    diff: z
      .object({
        filesChanged: z.number().int().min(0),
        insertions: z.number().int().min(0),
        deletions: z.number().int().min(0),
      })
      .strict()
      .nullable(),
    commands: z
      .array(
        z
          .object({
            command: z.string().min(1).max(limits.command),
            exitCode: z.number().int().nullable(),
            toolCallId: IdSchema.nullable(),
          })
          .strict(),
      )
      .max(MISSION_LIMITS.facts.commands),
    toolCalls: z
      .array(
        z
          .object({
            toolCallId: IdSchema,
            name: z.string().min(1).max(200),
            ok: z.boolean(),
          })
          .strict(),
      )
      .max(MISSION_LIMITS.facts.toolCalls),
    action: ActionResultSchema.nullable(),
  })
  .strict();
export type StageFacts = z.infer<typeof StageFactsSchema>;

export const EMPTY_STAGE_FACTS: StageFacts = Object.freeze({
  diff: null,
  commands: [],
  toolCalls: [],
  action: null,
}) as StageFacts;

/* -------------------------------------------------------------------------- */
/* Stage records                                                               */
/* -------------------------------------------------------------------------- */

export const STAGE_STATUSES = [
  "pending",
  "awaiting-sign-off",
  "running",
  "blocked",
  "stuck",
  "completed",
  "skipped",
  "cancelled",
] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

/** A stage in one of these has not started a turn or an action yet. */
export function isUnstartedStageStatus(status: StageStatus) {
  return status === "pending" || status === "awaiting-sign-off";
}

export function isTerminalStageStatus(status: StageStatus) {
  return status === "completed" || status === "skipped" || status === "cancelled";
}

export const STAGE_BLOCK_REASONS = [
  "agent-blocked",
  "reporting-unavailable",
  "action-failed",
] as const;
export type StageBlockReason = (typeof STAGE_BLOCK_REASONS)[number];

/** One attempt at one stage. `(missionId, stageId, attempt)` is its identity. */
export const MissionStageRecordSchema = z
  .object({
    missionId: IdSchema,
    stageId: IdSchema,
    attempt: z.number().int().min(1).max(MISSION_LIMITS.maxStageAttempts),
    status: z.enum(STAGE_STATUSES),
    /** True once the one bounded reminder to report has been sent. */
    nudged: z.boolean(),
    blockReason: z.enum(STAGE_BLOCK_REASONS).nullable(),
    /** The sentence behind a blocked, stuck, skipped or cancelled status. */
    detail: ReasonSchema.nullable(),
    /** The user's "Ask for changes" feedback that started this attempt. */
    feedback: z.string().max(MISSION_LIMITS.maxFeedbackChars).nullable(),
    startedAt: TimestampSchema.nullable(),
    endedAt: TimestampSchema.nullable(),
    startHeadSha: z.string().trim().min(1).max(64).nullable(),
    report: StageReportSchema.nullable(),
    reportRevision: z.number().int().min(0).max(MISSION_LIMITS.maxReportRevisions),
    facts: StageFactsSchema.nullable(),
  })
  .strict()
  .superRefine((record, context) => {
    if (record.status === "blocked" && !record.blockReason) {
      context.addIssue({
        code: "custom",
        path: ["blockReason"],
        message: "A blocked stage must carry a block reason.",
      });
    }
    if (record.status !== "blocked" && record.blockReason) {
      context.addIssue({
        code: "custom",
        path: ["blockReason"],
        message: "Only a blocked stage carries a block reason.",
      });
    }
  });
export type MissionStageRecord = z.infer<typeof MissionStageRecordSchema>;

export function createStageRecord(args: {
  missionId: string;
  stageId: string;
  attempt: number;
  feedback?: string | null;
}): MissionStageRecord {
  return {
    missionId: args.missionId,
    stageId: args.stageId,
    attempt: args.attempt,
    status: "pending",
    nudged: false,
    blockReason: null,
    detail: null,
    feedback: args.feedback ?? null,
    startedAt: null,
    endedAt: null,
    startHeadSha: null,
    report: null,
    reportRevision: 0,
    facts: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Mission record                                                              */
/* -------------------------------------------------------------------------- */

const missionIdentity = {
  workspaceId: IdSchema,
  leadTaskId: IdSchema,
};

/**
 * What starting a mission takes. It names an existing lead task and carries no
 * field that could create one.
 */
export const MissionStartInputSchema = z
  .object({
    ...missionIdentity,
    playbook: PlaybookSchema,
    assignment: z.string().trim().min(1).max(MISSION_LIMITS.maxAssignmentChars),
    consent: MissionConsentSchema,
    maxTurns: z
      .number()
      .int()
      .min(1)
      .max(MISSION_LIMITS.maxTurnsCeiling)
      .default(MISSION_LIMITS.defaultMaxTurns),
    expiresAt: TimestampSchema.nullable().default(null),
    /**
     * The stage the mission starts at. Earlier stages are recorded as skipped
     * and never run — for work already done by hand.
     */
    startStageIndex: z.number().int().min(0).default(0),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.startStageIndex >= input.playbook.stages.length) {
      context.addIssue({
        code: "custom",
        path: ["startStageIndex"],
        message: "The mission must start at a stage of its playbook.",
      });
    }
    const effectIds = new Set(
      listExternalEffectStages(input.playbook).map((stage) => stage.id),
    );
    input.consent.authorizedEffectStageIds.forEach((stageId, index) => {
      if (!effectIds.has(stageId)) {
        context.addIssue({
          code: "custom",
          path: ["consent", "authorizedEffectStageIds", index],
          message: `"${stageId}" is not a stage with an external effect in this playbook.`,
        });
      }
    });
  });
export type MissionStartInput = z.input<typeof MissionStartInputSchema>;

export const MissionSchema = z
  .object({
    id: IdSchema,
    repositoryPath: z.string().min(1),
    ...missionIdentity,
    /** The project that started this mission (Phase 3); null otherwise. */
    projectId: IdSchema.nullable(),
    /** The playbook as it was when the mission started. Later edits never apply. */
    playbook: PlaybookSchema,
    assignment: z.string().min(1).max(MISSION_LIMITS.maxAssignmentChars),
    consent: MissionConsentSchema,
    fingerprint: MissionFingerprintSchema,
    state: z.enum(MISSION_STATES),
    pauseReason: z.enum(MISSION_PAUSE_REASONS).nullable(),
    stopReason: z.enum(MISSION_STOP_REASONS).nullable(),
    reasonDetail: ReasonSchema.nullable(),
    currentStageIndex: z.number().int().min(0),
    turnCount: z.number().int().min(0),
    maxTurns: z.number().int().min(1).max(MISSION_LIMITS.maxTurnsCeiling),
    expiresAt: TimestampSchema.nullable(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict()
  .superRefine((mission, context) => {
    if (mission.currentStageIndex >= mission.playbook.stages.length) {
      context.addIssue({
        code: "custom",
        path: ["currentStageIndex"],
        message: "The current stage must exist in the playbook.",
      });
    }
    if ((mission.state === "paused") !== Boolean(mission.pauseReason)) {
      context.addIssue({
        code: "custom",
        path: ["pauseReason"],
        message: "A paused mission, and only a paused one, carries a pause reason.",
      });
    }
    if ((mission.state === "stopped") !== Boolean(mission.stopReason)) {
      context.addIssue({
        code: "custom",
        path: ["stopReason"],
        message: "A stopped mission, and only a stopped one, carries a stop reason.",
      });
    }
  });
export type Mission = z.infer<typeof MissionSchema>;

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

export const MISSION_EVENT_KINDS = [
  "mission-started",
  "turn-started",
  /** The turn a `turn-started` event led to, written once it exists. */
  "turn-linked",
  /** A `turn-started` event whose turn never started. */
  "turn-failed",
  "report",
  "sign-off",
  "changes-requested",
  "stage-completed",
  "stage-skipped",
  "stage-retried",
  "stage-blocked",
  "stage-stuck",
  "action-started",
  "action-finished",
  "checks-observed",
  "user-turn",
  "nudge",
  "paused",
  "resumed",
  "runtime-accepted",
  "mission-ended",
] as const;
export type MissionEventKind = (typeof MISSION_EVENT_KINDS)[number];

const EventDetailSchema = z
  .record(z.string(), z.unknown())
  .refine(
    (detail) => JSON.stringify(detail).length <= MISSION_LIMITS.maxEventDetailChars,
    `Event detail must stay under ${MISSION_LIMITS.maxEventDetailChars} characters.`,
  );

export const MissionEventSchema = z
  .object({
    id: IdSchema,
    missionId: IdSchema,
    sequence: z.number().int().min(1),
    kind: z.enum(MISSION_EVENT_KINDS),
    idempotencyKey: z
      .string()
      .min(1)
      .max(MISSION_LIMITS.maxIdempotencyKeyChars)
      .nullable(),
    detail: EventDetailSchema,
    createdAt: TimestampSchema,
  })
  .strict();
export type MissionEvent = z.infer<typeof MissionEventSchema>;

/** An event before the store assigns its id and sequence. */
export interface MissionEventDraft {
  kind: MissionEventKind;
  idempotencyKey: string | null;
  detail: Record<string, unknown>;
}

/**
 * The stage attempt a mission turn works on. The host keeps it with the turn's
 * mission grant and resolves reports against it; the model never passes it.
 */
export interface MissionStageIdentity {
  missionId: string;
  stageId: string;
  attempt: number;
}

/** Guards the turn the supervisor starts for one stage attempt. */
export function buildMissionTurnKey(args: {
  missionId: string;
  stageId: string;
  attempt: number;
  turn: number;
}) {
  return `${args.missionId}:${args.stageId}:${args.attempt}:turn:${args.turn}`;
}

/**
 * Keys of the event that settles a `turn-started` event: `linked` names the
 * turn that started, `failed` records that none did. A `turn-started` event
 * with neither is a start Stave was interrupted in the middle of.
 */
export function buildMissionTurnOutcomeKey(
  turnKey: string,
  outcome: "linked" | "failed",
) {
  return `${turnKey}:${outcome}`;
}

/**
 * Written before a Stave action executes, so a restart never repeats an action
 * whose outcome is unknown; the runtime checks remote state first instead.
 */
export function buildMissionActionKey(args: {
  missionId: string;
  stageId: string;
  attempt: number;
}) {
  return `${args.missionId}:${args.stageId}:${args.attempt}:action`;
}

/* -------------------------------------------------------------------------- */
/* Aggregate helpers                                                           */
/* -------------------------------------------------------------------------- */

/** A mission with every stage attempt it has recorded. */
export interface MissionAggregate {
  mission: Mission;
  stages: MissionStageRecord[];
}

/** The result of a pure transition, applied by the store in one transaction. */
export interface MissionChange {
  mission: Mission;
  upserts: MissionStageRecord[];
  events: MissionEventDraft[];
}

export function latestStageRecord(
  stages: readonly MissionStageRecord[],
  stageId: string,
): MissionStageRecord | undefined {
  let latest: MissionStageRecord | undefined;
  for (const record of stages) {
    if (record.stageId === stageId && (!latest || record.attempt > latest.attempt)) {
      latest = record;
    }
  }
  return latest;
}

export function playbookStageAt(mission: Mission, index: number): PlaybookStage {
  const stage = mission.playbook.stages[index];
  if (!stage) {
    throw new RangeError(`Mission ${mission.id} has no stage at index ${index}.`);
  }
  return stage;
}

/** The record for the attempt the mission is on now. */
export function currentStageRecord(aggregate: MissionAggregate): MissionStageRecord {
  const stage = playbookStageAt(aggregate.mission, aggregate.mission.currentStageIndex);
  const record = latestStageRecord(aggregate.stages, stage.id);
  if (!record) {
    throw new Error(`Mission ${aggregate.mission.id} has no record for stage "${stage.id}".`);
  }
  return record;
}

/**
 * The record a stage gets when the mission enters it. A record that never
 * started (pending or awaiting sign-off) is reused; otherwise a new attempt
 * begins, so returning to a finished stage never rewrites its history.
 */
export function enterStage(args: {
  aggregate: MissionAggregate;
  index: number;
  feedback?: string | null;
}): MissionStageRecord {
  const stage = playbookStageAt(args.aggregate.mission, args.index);
  const latest = latestStageRecord(args.aggregate.stages, stage.id);
  if (latest && isUnstartedStageStatus(latest.status)) {
    return {
      ...latest,
      status: "pending",
      feedback: args.feedback ?? latest.feedback,
    };
  }
  const attempt = (latest?.attempt ?? 0) + 1;
  if (attempt > MISSION_LIMITS.maxStageAttempts) {
    throw new MissionCommandError(
      "attempt-limit",
      `"${stage.title}" reached its limit of ${MISSION_LIMITS.maxStageAttempts} attempts.`,
    );
  }
  return createStageRecord({
    missionId: args.aggregate.mission.id,
    stageId: stage.id,
    attempt,
    feedback: args.feedback ?? null,
  });
}

export function replaceStageRecord(
  stages: readonly MissionStageRecord[],
  record: MissionStageRecord,
): MissionStageRecord[] {
  const index = stages.findIndex(
    (candidate) =>
      candidate.stageId === record.stageId && candidate.attempt === record.attempt,
  );
  if (index === -1) return [...stages, record];
  const next = [...stages];
  next[index] = record;
  return next;
}

export type MissionCommandErrorCode =
  /** A mission cannot start or change runtime on this task right now. */
  | "refused"
  | "not-active"
  | "stale-identity"
  | "invalid-state"
  | "no-previous-ai-stage"
  | "report-limit"
  | "attempt-limit";

/** A refused command, with a sentence the surface can show as-is. */
export class MissionCommandError extends Error {
  constructor(
    readonly code: MissionCommandErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MissionCommandError";
  }
}

export function clampReason(detail: string) {
  return detail.slice(0, MISSION_LIMITS.maxReasonChars);
}

/**
 * A new mission and the record for its first stage. The caller resolves the
 * repository path and runtime from the lead task, as wake-ups do.
 */
export function createMission(args: {
  id: string;
  input: MissionStartInput;
  repositoryPath: string;
  fingerprint: MissionFingerprint;
  projectId?: string | null;
  now: Date;
}): MissionChange {
  const input = MissionStartInputSchema.parse(args.input);
  const timestamp = args.now.toISOString();
  const mission = MissionSchema.parse({
    id: args.id,
    repositoryPath: args.repositoryPath,
    workspaceId: input.workspaceId,
    leadTaskId: input.leadTaskId,
    projectId: args.projectId ?? null,
    playbook: input.playbook,
    assignment: input.assignment,
    consent: input.consent,
    fingerprint: args.fingerprint,
    state: "running",
    pauseReason: null,
    stopReason: null,
    reasonDetail: null,
    currentStageIndex: input.startStageIndex,
    turnCount: 0,
    maxTurns: input.maxTurns,
    expiresAt: input.expiresAt,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  const startStage = playbookStageAt(mission, input.startStageIndex);
  // Starting later records the earlier stages as skipped, so the rail and the
  // report say why they never ran.
  const skipped = mission.playbook.stages.slice(0, input.startStageIndex).map(
    (stage): MissionStageRecord => ({
      ...createStageRecord({ missionId: mission.id, stageId: stage.id, attempt: 1 }),
      status: "skipped",
      detail: `Not run: the mission started at ${startStage.title}.`,
      endedAt: timestamp,
    }),
  );
  const firstStage = createStageRecord({
    missionId: mission.id,
    stageId: startStage.id,
    attempt: 1,
  });
  return {
    mission,
    upserts: [...skipped, firstStage],
    events: [
      {
        kind: "mission-started",
        idempotencyKey: null,
        detail: {
          playbookId: mission.playbook.id,
          playbookName: mission.playbook.name,
          checkIns: mission.consent.checkIns,
          permissionMode: mission.consent.permissionMode,
          authorizedEffectStageIds: mission.consent.authorizedEffectStageIds,
          ...(input.startStageIndex > 0 ? { startStageId: startStage.id } : {}),
        },
      },
    ],
  };
}
