import { i18n } from "@/i18n/runtime";
/**
 * Agent run domain: the records an agent run is made of.
 *
 * An agent run runs a workflow on one lead task the user already owns. It is a
 * Layer 3 supervisor entry beside wake-ups (see
 * `docs/architecture/agent-platform-taxonomy.md`): it adds turns to that task
 * and never creates one.
 *
 * Used by:
 * - `src/lib/agent-runs/policy.ts` and `src/lib/agent-runs/commands.ts` (pure
 *   transitions)
 * - `electron/persistence/agent-run-store.ts` (row parsing)
 *
 * Pure: no clock, no I/O. Callers pass `now` and ids.
 */
import { AdaptiveRoutingIntentSchema } from "./resources";
import { z } from "zod";
import { ScriptVerificationSchema, WorkspaceRevisionSchema } from "./verification-contract";
import { AUTOMATION_PERMISSION_MODES } from "@/lib/automations";
import {
  CHECK_INS,
  WorkflowSchema,
  type Workflow,
  type WorkflowStage,
} from "@/lib/workflows/schema";
import { ACCEPTANCE_CRITERION_STATUSES } from "@/lib/workflows/stage-prompt";

export const AGENT_RUN_LIMITS = Object.freeze({
  maxIdChars: 256,
  maxAssignmentChars: 8_000,
  maxReasonChars: 500,
  maxFeedbackChars: 2_000,
  defaultMaxTurns: 30,
  maxTurnsCeiling: 100,
  maxStageAttempts: 20,
  /** Report revisions accepted per provider turn; the latest counts. */
  maxReportRevisions: 5,
  maxIdempotencyKeyChars: 1_024,
  maxEventDetailChars: 8_000,
  /** Events kept per agent run. Keyed events are never pruned. */
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
  facts: { commands: 100, toolCalls: 200, checks: 50, planItems: 50, planItemText: 300 },
});

const IdSchema = z.string().trim().min(1).max(AGENT_RUN_LIMITS.maxIdChars);
const TimestampSchema = z.iso.datetime();
const ReasonSchema = z.string().max(AGENT_RUN_LIMITS.maxReasonChars);
const UrlSchema = z.url().max(AGENT_RUN_LIMITS.report.ref);

/* -------------------------------------------------------------------------- */
/* Identity and consent                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The runtime an agent run was started against. When the lead task drifts from
 * it, the agent run pauses instead of running stages on a runtime the user never
 * agreed to.
 */
export const AgentRunFingerprintSchema = z
  .object({
    providerId: z.enum(["claude-code", "codex", "cursor", "kiro"]),
    model: z.string().trim().min(1).max(200),
  })
  .strict();
export type AgentRunFingerprint = z.infer<typeof AgentRunFingerprintSchema>;

export function agentRunFingerprintsMatch(
  left: AgentRunFingerprint,
  right: AgentRunFingerprint,
) {
  return left.providerId === right.providerId && left.model === right.model;
}

export function formatAgentRunFingerprint(fingerprint: AgentRunFingerprint) {
  return `${fingerprint.providerId}:${fingerprint.model}`;
}

/**
 * What the user agreed to when starting this agent run. A saved workflow grants
 * nothing; this record is the only authority an agent run has. A stage with an
 * external effect that is not listed here always waits for sign-off.
 */
export const AgentRunConsentSchema = z
  .object({
    checkIns: z.enum(CHECK_INS),
    permissionMode: z.enum(AUTOMATION_PERMISSION_MODES),
    authorizedEffectStageIds: z.array(IdSchema).max(12),
  })
  .strict();
export type AgentRunConsent = z.infer<typeof AgentRunConsentSchema>;

/** Publish stages and Stave actions write outside the workspace. */
export function stageHasExternalEffect(stage: WorkflowStage): boolean {
  return stage.kind === "action" || stage.role === "publish";
}

export function listExternalEffectStages(workflow: Pick<Workflow, "stages">) {
  return workflow.stages.filter(stageHasExternalEffect);
}

/**
 * True for a stage that writes outside the workspace without the user's
 * go-ahead at start. It always waits for sign-off, even as the start stage.
 */
export function stageNeedsEffectConsent(
  stage: WorkflowStage,
  consent: Pick<AgentRunConsent, "authorizedEffectStageIds">,
): boolean {
  return stageHasExternalEffect(stage) && !consent.authorizedEffectStageIds.includes(stage.id);
}

/* -------------------------------------------------------------------------- */
/* Agent run state                                                               */
/* -------------------------------------------------------------------------- */

export const AGENT_RUN_STATES = [
  "running",
  "paused",
  "completed",
  "cancelled",
  "stopped",
] as const;
export type AgentRunState = (typeof AGENT_RUN_STATES)[number];

export const ACTIVE_AGENT_RUN_STATES = ["running", "paused"] as const satisfies
  readonly AgentRunState[];

export function isActiveAgentRunState(state: AgentRunState) {
  return state === "running" || state === "paused";
}

/**
 * `paused-by-user` and `taken-over` are cleared by Resume. The other two
 * describe a condition the supervisor watches and clears on its own.
 */
export const AGENT_RUN_PAUSE_REASONS = [
  "paused-by-user",
  "taken-over",
  "task-identity-changed",
  "runtime-changed",
] as const;
export type AgentRunPauseReason = (typeof AGENT_RUN_PAUSE_REASONS)[number];

export function isAutomaticAgentRunPause(reason: AgentRunPauseReason) {
  return reason === "task-identity-changed" || reason === "runtime-changed";
}

export const AGENT_RUN_STOP_REASONS = [
  "task-unavailable",
  "turn-cap-reached",
  "expired",
] as const;
export type AgentRunStopReason = (typeof AGENT_RUN_STOP_REASONS)[number];

/* -------------------------------------------------------------------------- */
/* Stage reports                                                               */
/* -------------------------------------------------------------------------- */

const limits = AGENT_RUN_LIMITS.report;

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
    toolCallId: z.string().trim().min(1).max(AGENT_RUN_LIMITS.maxIdChars).optional(),
    /** A command this stage ran that shows the evidence. */
    command: z.string().trim().min(1).max(limits.command).optional(),
  })
  .strict();
export type StageEvidence = z.infer<typeof StageEvidenceSchema>;

export const AcceptanceCriterionSchema = z
  .object({
    text: z.string().trim().min(1).max(limits.criterionText),
    status: z.enum(ACCEPTANCE_CRITERION_STATUSES),
    required: z.boolean().optional(),
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
  turnRevision: z.number().int().min(1).max(AGENT_RUN_LIMITS.maxReportRevisions).optional(),
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
        .max(AGENT_RUN_LIMITS.facts.checks),
    })
    .strict(),
  z
    .object({
      type: z.literal("mark-pr-ready"),
      prUrl: UrlSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("run-script"),
      scriptId: z.string().trim().min(1).max(120),
      exitCode: z.number().int(),
      verification: ScriptVerificationSchema.optional(),
      /** The last web address the script printed, such as a preview URL. */
      url: UrlSchema.optional(),
      /** The end of its output. */
      outputTail: z.string().max(2_000),
    })
    .strict(),
]);
export type ActionResult = z.infer<typeof ActionResultSchema>;

export const STAGE_PLAN_STATUSES = ["pending", "in_progress", "completed"] as const;
export type StagePlanStatus = (typeof STAGE_PLAN_STATUSES)[number];

export const StagePlanSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            content: z.string().min(1).max(AGENT_RUN_LIMITS.facts.planItemText),
            status: z.enum(STAGE_PLAN_STATUSES),
          })
          .strict(),
      )
      .max(AGENT_RUN_LIMITS.facts.planItems),
    turnId: IdSchema,
  })
  .strict();
export type StagePlan = z.infer<typeof StagePlanSchema>;

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
            turnId: IdSchema.optional(),
            outcome: z.enum(["succeeded", "failed", "unknown"]).optional(),
            provenance: z.enum(["provider-structured", "stave-runner"]).optional(),
            sourceRevision: WorkspaceRevisionSchema.optional(),
          })
          .strict(),
      )
      .max(AGENT_RUN_LIMITS.facts.commands),
    toolCalls: z
      .array(
        z
          .object({
            toolCallId: IdSchema,
            name: z.string().min(1).max(200),
            ok: z.boolean(),
            turnId: IdSchema.optional(),
          })
          .strict(),
      )
      .max(AGENT_RUN_LIMITS.facts.toolCalls),
    action: ActionResultSchema.nullable(),
    currentTurnId: IdSchema.optional(),
    workspaceRevision: WorkspaceRevisionSchema.optional(),
    /**
     * The agent's own plan as its latest to-do list in the stage's turns
     * (Claude TodoWrite, Codex update_plan). It shows a one-stage run's steps
     * between turns and in its report.
     */
    plan: StagePlanSchema.optional(),
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
  "acceptance-unmet",
] as const;
export type StageBlockReason = (typeof STAGE_BLOCK_REASONS)[number];

/** One attempt at one stage. `(agentRunId, stageId, attempt)` is its identity. */
export const AgentRunStageRecordSchema = z
  .object({
    agentRunId: IdSchema,
    stageId: IdSchema,
    attempt: z.number().int().min(1).max(AGENT_RUN_LIMITS.maxStageAttempts),
    status: z.enum(STAGE_STATUSES),
    /** True once the one bounded reminder to report has been sent. */
    nudged: z.boolean(),
    blockReason: z.enum(STAGE_BLOCK_REASONS).nullable(),
    /** The sentence behind a blocked, stuck, skipped or cancelled status. */
    detail: ReasonSchema.nullable(),
    /** The user's "Ask for changes" feedback that started this attempt. */
    feedback: z.string().max(AGENT_RUN_LIMITS.maxFeedbackChars).nullable(),
    startedAt: TimestampSchema.nullable(),
    endedAt: TimestampSchema.nullable(),
    startHeadSha: z.string().trim().min(1).max(64).nullable(),
    report: StageReportSchema.nullable(),
    reportRevision: z.number().int().min(0),
    facts: StageFactsSchema.nullable(),
  })
  .strict()
  .superRefine((record, context) => {
    if (record.status === "blocked" && !record.blockReason) {
      context.addIssue({
        code: "custom",
        path: ["blockReason"],
        message: i18n.t("agentRuns:domain.message"),
      });
    }
    if (record.status !== "blocked" && record.blockReason) {
      context.addIssue({
        code: "custom",
        path: ["blockReason"],
        message: i18n.t("agentRuns:domain.message2"),
      });
    }
  });
export type AgentRunStageRecord = z.infer<typeof AgentRunStageRecordSchema>;

export function createStageRecord(args: {
  agentRunId: string;
  stageId: string;
  attempt: number;
  feedback?: string | null;
}): AgentRunStageRecord {
  return {
    agentRunId: args.agentRunId,
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
/* Agent run record                                                              */
/* -------------------------------------------------------------------------- */

const agentRunIdentity = {
  workspaceId: IdSchema,
  leadTaskId: IdSchema,
};

/**
 * `agent`: an agent run. An Agent-mode prompt started it with an implicit
 * one-stage workflow built from the task's agent (`agent-run.ts`); the host
 * routes each of its turns and it ends when the agent stops running the task.
 * Absent for an agent run started from a saved workflow.
 */
export const AGENT_RUN_ORIGINS = ["agent"] as const;
export type AgentRunOrigin = (typeof AGENT_RUN_ORIGINS)[number];
const AgentRunOriginSchema = z.enum(AGENT_RUN_ORIGINS).optional();

/**
 * What starting an agent run takes. It names an existing lead task and carries no
 * field that could create one.
 */
export const AgentRunStartInputSchema = z
  .object({
    ...agentRunIdentity,
    workflow: WorkflowSchema,
    assignment: z.string().trim().min(1).max(AGENT_RUN_LIMITS.maxAssignmentChars),
    consent: AgentRunConsentSchema,
    maxTurns: z
      .number()
      .int()
      .min(1)
      .max(AGENT_RUN_LIMITS.maxTurnsCeiling)
      .default(AGENT_RUN_LIMITS.defaultMaxTurns),
    expiresAt: TimestampSchema.nullable().default(null),
    /**
     * The stage the agent run starts at. Earlier stages are recorded as skipped
     * and never run — for work already done by hand.
     */
    startStageIndex: z.number().int().min(0).default(0),
    origin: AgentRunOriginSchema,
    adaptive: z.boolean().optional(),
    routingIntent: AdaptiveRoutingIntentSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.startStageIndex >= input.workflow.stages.length) {
      context.addIssue({
        code: "custom",
        path: ["startStageIndex"],
        message: i18n.t("agentRuns:domain.message3"),
      });
    }
    const effectIds = new Set(
      listExternalEffectStages(input.workflow).map((stage) => stage.id),
    );
    input.consent.authorizedEffectStageIds.forEach((stageId, index) => {
      if (!effectIds.has(stageId)) {
        context.addIssue({
          code: "custom",
          path: ["consent", "authorizedEffectStageIds", index],
          message: i18n.t("agentRuns:domain.message4", { value1: stageId }),
        });
      }
    });
  });
export type AgentRunStartInput = z.input<typeof AgentRunStartInputSchema>;

export const AgentRunSchema = z
  .object({
    id: IdSchema,
    repositoryPath: z.string().min(1),
    ...agentRunIdentity,
    /**
     * The retired project that started this agent run; null for every agent run
     * started since projects were removed. Kept so older rows still parse.
     */
    projectId: IdSchema.nullable(),
    /** The workflow as it was when the agent run started. Later edits never apply. */
    workflow: WorkflowSchema,
    assignment: z.string().min(1).max(AGENT_RUN_LIMITS.maxAssignmentChars),
    consent: AgentRunConsentSchema,
    fingerprint: AgentRunFingerprintSchema,
    state: z.enum(AGENT_RUN_STATES),
    pauseReason: z.enum(AGENT_RUN_PAUSE_REASONS).nullable(),
    stopReason: z.enum(AGENT_RUN_STOP_REASONS).nullable(),
    reasonDetail: ReasonSchema.nullable(),
    currentStageIndex: z.number().int().min(0),
    turnCount: z.number().int().min(0),
    maxTurns: z.number().int().min(1).max(AGENT_RUN_LIMITS.maxTurnsCeiling),
    expiresAt: TimestampSchema.nullable(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    origin: AgentRunOriginSchema,
  })
  .strict()
  .superRefine((agentRun, context) => {
    if (agentRun.currentStageIndex >= agentRun.workflow.stages.length) {
      context.addIssue({
        code: "custom",
        path: ["currentStageIndex"],
        message: i18n.t("agentRuns:domain.message5"),
      });
    }
    if ((agentRun.state === "paused") !== Boolean(agentRun.pauseReason)) {
      context.addIssue({
        code: "custom",
        path: ["pauseReason"],
        message: i18n.t("agentRuns:domain.message6"),
      });
    }
    if ((agentRun.state === "stopped") !== Boolean(agentRun.stopReason)) {
      context.addIssue({
        code: "custom",
        path: ["stopReason"],
        message: i18n.t("agentRuns:domain.message7"),
      });
    }
  });
export type AgentRun = z.infer<typeof AgentRunSchema>;

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

export const AGENT_RUN_EVENT_KINDS = [
  "agent-run-started",
  "resource-budget",
  "resource-request",
  "resource-decision",
  "turn-started",
  /** The turn a `turn-started` event led to, written once it exists. */
  "turn-linked",
  /** A `turn-started` event whose turn never started. */
  "turn-failed",
  /** A linked turn Stave stopped in the middle of, closed at the next boot. */
  "turn-interrupted",
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
  "agent-run-ended",
  /** The user shared the ended agent run's report to a Slack thread. */
  "report-shared",
] as const;
export type AgentRunEventKind = (typeof AGENT_RUN_EVENT_KINDS)[number];

const EventDetailSchema = z
  .record(z.string(), z.unknown())
  .refine(
    (detail) => JSON.stringify(detail).length <= AGENT_RUN_LIMITS.maxEventDetailChars,
    { error: () => i18n.t("agentRuns:domain.extraCopy247", { value1: AGENT_RUN_LIMITS.maxEventDetailChars }) },
  );

export const AgentRunEventSchema = z
  .object({
    id: IdSchema,
    agentRunId: IdSchema,
    sequence: z.number().int().min(1),
    kind: z.enum(AGENT_RUN_EVENT_KINDS),
    idempotencyKey: z
      .string()
      .min(1)
      .max(AGENT_RUN_LIMITS.maxIdempotencyKeyChars)
      .nullable(),
    detail: EventDetailSchema,
    createdAt: TimestampSchema,
  })
  .strict();
export type AgentRunEvent = z.infer<typeof AgentRunEventSchema>;

/** An event before the store assigns its id and sequence. */
export interface AgentRunEventDraft {
  kind: AgentRunEventKind;
  idempotencyKey: string | null;
  detail: Record<string, unknown>;
}

/**
 * The stage attempt an agent run turn works on. The host keeps it with the turn's
 * agent run grant and resolves reports against it; the model never passes it.
 */
export interface AgentRunStageIdentity {
  agentRunId: string;
  stageId: string;
  attempt: number;
}

/** Guards the turn the supervisor starts for one stage attempt. */
export function buildAgentRunTurnKey(args: {
  agentRunId: string;
  stageId: string;
  attempt: number;
  turn: number;
}) {
  return `${args.agentRunId}:${args.stageId}:${args.attempt}:turn:${args.turn}`;
}

/**
 * Keys of the event that settles a `turn-started` event: `linked` names the
 * turn that started, `failed` records that none did. A `turn-started` event
 * with neither is a start Stave was interrupted in the middle of.
 */
export function buildAgentRunTurnOutcomeKey(
  turnKey: string,
  outcome: "linked" | "failed" | "interrupted",
) {
  return `${turnKey}:${outcome}`;
}

/**
 * Written before a Stave action executes, so a restart never repeats an action
 * whose outcome is unknown; the runtime checks remote state first instead.
 */
export function buildAgentRunActionKey(args: {
  agentRunId: string;
  stageId: string;
  attempt: number;
}) {
  return `${args.agentRunId}:${args.stageId}:${args.attempt}:action`;
}

/* -------------------------------------------------------------------------- */
/* Aggregate helpers                                                           */
/* -------------------------------------------------------------------------- */

/** An agent run with every stage attempt it has recorded. */
export interface AgentRunAggregate {
  agentRun: AgentRun;
  stages: AgentRunStageRecord[];
}

/** The result of a pure transition, applied by the store in one transaction. */
export interface AgentRunChange {
  agentRun: AgentRun;
  upserts: AgentRunStageRecord[];
  events: AgentRunEventDraft[];
}

export function latestStageRecord(
  stages: readonly AgentRunStageRecord[],
  stageId: string,
): AgentRunStageRecord | undefined {
  let latest: AgentRunStageRecord | undefined;
  for (const record of stages) {
    if (record.stageId === stageId && (!latest || record.attempt > latest.attempt)) {
      latest = record;
    }
  }
  return latest;
}

export function workflowStageAt(agentRun: AgentRun, index: number): WorkflowStage {
  const stage = agentRun.workflow.stages[index];
  if (!stage) {
    throw new RangeError(i18n.t("agentRuns:remaining.presentationCopy433", { v1: agentRun.id, v2: index }));
  }
  return stage;
}

/** The record for the attempt the agent run is on now. */
export function currentStageRecord(aggregate: AgentRunAggregate): AgentRunStageRecord {
  const stage = workflowStageAt(aggregate.agentRun, aggregate.agentRun.currentStageIndex);
  const record = latestStageRecord(aggregate.stages, stage.id);
  if (!record) {
    throw new Error(i18n.t("agentRuns:remaining.presentationCopy434", { v1: aggregate.agentRun.id, v2: stage.id }));
  }
  return record;
}

/**
 * The record a stage gets when the agent run enters it. A record that never
 * started (pending or awaiting sign-off) is reused; otherwise a new attempt
 * begins, so returning to a finished stage never rewrites its history.
 */
export function enterStage(args: {
  aggregate: AgentRunAggregate;
  index: number;
  feedback?: string | null;
}): AgentRunStageRecord {
  const stage = workflowStageAt(args.aggregate.agentRun, args.index);
  const latest = latestStageRecord(args.aggregate.stages, stage.id);
  if (latest && isUnstartedStageStatus(latest.status)) {
    return {
      ...latest,
      status: "pending",
      feedback: args.feedback ?? latest.feedback,
    };
  }
  const attempt = (latest?.attempt ?? 0) + 1;
  if (attempt > AGENT_RUN_LIMITS.maxStageAttempts) {
    throw new AgentRunCommandError(
      "attempt-limit",
      i18n.t("agentRuns:domain.extraCopy250", { value1: stage.title, value2: AGENT_RUN_LIMITS.maxStageAttempts }),
    );
  }
  return createStageRecord({
    agentRunId: args.aggregate.agentRun.id,
    stageId: stage.id,
    attempt,
    feedback: args.feedback ?? null,
  });
}

export function replaceStageRecord(
  stages: readonly AgentRunStageRecord[],
  record: AgentRunStageRecord,
): AgentRunStageRecord[] {
  const index = stages.findIndex(
    (candidate) =>
      candidate.stageId === record.stageId && candidate.attempt === record.attempt,
  );
  if (index === -1) return [...stages, record];
  const next = [...stages];
  next[index] = record;
  return next;
}

export type AgentRunCommandErrorCode =
  /** An agent run cannot start or change runtime on this task right now. */
  | "refused"
  | "not-active"
  | "stale-identity"
  | "invalid-state"
  | "no-previous-ai-stage"
  | "report-limit"
  | "attempt-limit";

/** A refused command, with a sentence the surface can show as-is. */
export class AgentRunCommandError extends Error {
  constructor(
    readonly code: AgentRunCommandErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AgentRunCommandError";
  }
}

export function clampReason(detail: string) {
  return detail.slice(0, AGENT_RUN_LIMITS.maxReasonChars);
}

/**
 * A new agent run and the record for its first stage. The caller resolves the
 * repository path and runtime from the lead task, as wake-ups do.
 */
export function createAgentRun(args: {
  id: string;
  input: AgentRunStartInput;
  repositoryPath: string;
  fingerprint: AgentRunFingerprint;
  now: Date;
}): AgentRunChange {
  const input = AgentRunStartInputSchema.parse(args.input);
  const timestamp = args.now.toISOString();
  const agentRun = AgentRunSchema.parse({
    id: args.id,
    repositoryPath: args.repositoryPath,
    workspaceId: input.workspaceId,
    leadTaskId: input.leadTaskId,
    projectId: null,
    workflow: input.workflow,
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
    ...(input.origin ? { origin: input.origin } : {}),
  });
  const startStage = workflowStageAt(agentRun, input.startStageIndex);
  // Starting later records the earlier stages as skipped, so the rail and the
  // report say why they never ran.
  const skipped = agentRun.workflow.stages.slice(0, input.startStageIndex).map(
    (stage): AgentRunStageRecord => ({
      ...createStageRecord({ agentRunId: agentRun.id, stageId: stage.id, attempt: 1 }),
      status: "skipped",
      detail: i18n.t("agentRuns:domain.detail", { value1: startStage.title }),
      endedAt: timestamp,
    }),
  );
  const firstStage = createStageRecord({
    agentRunId: agentRun.id,
    stageId: startStage.id,
    attempt: 1,
  });
  // Starting at a later stage signs that stage off, as a sign-off card would,
  // unless it writes outside the workspace without the user's go-ahead. The
  // first stage needs no sign-off in the first place.
  if (input.startStageIndex > 0 && !stageNeedsEffectConsent(startStage, agentRun.consent)) {
    firstStage.status = "running";
  }
  return {
    agentRun,
    upserts: [...skipped, firstStage],
    events: [
      {
        kind: "agent-run-started",
        idempotencyKey: null,
        detail: {
          workflowId: agentRun.workflow.id,
          workflowName: agentRun.workflow.name,
          checkIns: agentRun.consent.checkIns,
          permissionMode: agentRun.consent.permissionMode,
          authorizedEffectStageIds: agentRun.consent.authorizedEffectStageIds,
          ...(input.startStageIndex > 0 ? { startStageId: startStage.id } : {}),
          ...(agentRun.origin ? { origin: agentRun.origin } : {}),
        },
      },
    ],
  };
}
