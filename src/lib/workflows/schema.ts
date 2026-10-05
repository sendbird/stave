import { formatNumber } from "@/i18n/format";
import { i18n } from "@/i18n/runtime";
import { z } from "zod";
import { AUTOMATION_PERMISSION_MODES, type AutomationPermissionMode } from "@/lib/automations";

/**
 * The permissions an agent run runs with when its workflow names none. Auto: the
 * agent works without asking, because the agent run already stops where it
 * should — at the sign-offs its check-ins choose, and before any pull request
 * or script step the start did not allow. Guided would stop an unattended
 * stage at every ask instead.
 */
export const DEFAULT_WORKFLOW_PERMISSION_MODE: AutomationPermissionMode = "auto";
import { isModelEffort, type ModelEffort } from "@/lib/providers/model-effort";
import type { ProviderId } from "@/lib/providers/provider.types";

/**
 * A workflow is a saved way of working: ordered stages, each with an
 * instruction and a "Done when" condition, that an agent run runs on one lead
 * task. A saved workflow grants no permissions; every agent run start records
 * its own consent.
 */

export const WORKFLOW_VERSION = 1;
export const MAX_WORKFLOWS = 50;
export const MAX_WORKFLOW_STAGES = 12;
/** Budget for the purpose, constraints and every stage's authored text. */
export const MAX_WORKFLOW_TEXT_LENGTH = 14_000;

export const WORKFLOW_LIMITS = {
  id: 80,
  name: 80,
  shortcut: 48,
  purpose: 1_000,
  constraints: 2_000,
  model: 120,
  stageId: 48,
  stageTitle: 100,
  instruction: 1_200,
  doneWhen: 500,
} as const;

export const CHECK_INS = [
  "every-stage",
  "plan-and-publishing",
  "when-stuck",
] as const;
export type CheckIns = (typeof CHECK_INS)[number];
export const DEFAULT_CHECK_INS: CheckIns = "plan-and-publishing";

/** How the check-in levels read in the product, for agents and runs alike. */
export const CHECK_IN_LABELS: Readonly<Record<CheckIns, string>> = {
  get "when-stuck"() { return i18n.t("agentRuns:schema.whenStuck"); },
  get "plan-and-publishing"() { return i18n.t("agentRuns:schema.planAndPublishing"); },
  get "every-stage"() { return i18n.t("agentRuns:schema.everyStage"); },
};

export const SIGN_OFFS = ["auto", "ask"] as const;
export type SignOff = (typeof SIGN_OFFS)[number];

export const WORKFLOW_TEAMS = ["solo", "workers"] as const;
export type WorkflowTeam = (typeof WORKFLOW_TEAMS)[number];

export const AI_STAGE_ROLES = ["plan", "publish"] as const;
export type AiStageRole = (typeof AI_STAGE_ROLES)[number];

export const WATCH_CHECKS_TIMEOUT_MINUTES = { min: 5, max: 360 } as const;
export const DEFAULT_WATCH_CHECKS = {
  repairAttempts: 2,
  timeoutMinutes: 30,
} as const;

const WORKFLOW_PROVIDER_IDS = [
  "claude-code",
  "codex",
  "cursor",
  "kiro",
] as const satisfies readonly ProviderId[];

/**
 * Stage ids appear inside idempotency keys (`agentRunId:stageId:attempt`), so
 * they are lowercase slugs without separators that could make a key ambiguous.
 */
const STAGE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WORKFLOW_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const SHORTCUT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function text(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, i18n.t("agentRuns:schema.extraCopy418", { value1: label }))
    .max(max, i18n.t("agentRuns:schema.extraCopy419", { value1: label, value2: max }));
}

const StaveActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open-draft-pr") }).strict(),
  z
    .object({
      type: z.literal("watch-checks"),
      repairAttempts: z.union([
        z.literal(0),
        z.literal(1),
        z.literal(2),
        z.literal(3),
      ]),
      timeoutMinutes: z
        .number()
        .int()
        .min(WATCH_CHECKS_TIMEOUT_MINUTES.min)
        .max(WATCH_CHECKS_TIMEOUT_MINUTES.max),
    })
    .strict(),
  z.object({ type: z.literal("mark-pr-ready") }).strict(),
  /**
   * Runs an action from the workspace's scripts (`.stave/scripts.json`), such
   * as a preview deployment, and waits for it to finish.
   */
  z
    .object({
      type: z.literal("run-script"),
      get scriptId() { return z
        .string()
        .trim()
        .min(1, i18n.t("agentRuns:schema.extraCopy420"))
        .max(120, i18n.t("agentRuns:schema.extraCopy421")); },
    })
    .strict(),
]);

const stageIdentity = {
  get id() { return z
    .string()
    .max(WORKFLOW_LIMITS.stageId)
    .regex(STAGE_ID_PATTERN, i18n.t("agentRuns:schema.extraCopy422")); },
  get title() { return text(i18n.t("agentRuns:schema.extraCopy423"), WORKFLOW_LIMITS.stageTitle); },
  signOff: z.enum(SIGN_OFFS).optional(),
};

const criterionIdentity = { get text() { return text(i18n.t("agentRuns:schema.extraCopy424"), 500); }, required: z.boolean().optional() };

const AiStageSchema = z
  .object({
    ...stageIdentity,
    kind: z.literal("ai"),
    acceptanceCriteria: z.array(z.object({ ...criterionIdentity, verification: z.literal("agent-report").optional() }).strict()).max(20).optional(),
    get instruction() { return text(i18n.t("agentRuns:schema.extraCopy425"), WORKFLOW_LIMITS.instruction); },
    get doneWhen() { return text(i18n.t("agentRuns:schema.extraCopy426"), WORKFLOW_LIMITS.doneWhen); },
    role: z.enum(AI_STAGE_ROLES).optional(),
    /**
     * Runs this stage as another agent: the lead task delegates it to a
     * delegated task running as this agent and reports its result. The lead
     * task's own provider and instructions never change mid-agent-run.
     */
    agentConfigId: z.string().trim().min(1).max(80).optional(),
    /**
     * With `agentConfigId`: pin the delegated work to the commit checked out
     * when it starts, so a review never reports on a later commit.
     */
    pinCommit: z.boolean().optional(),
  })
  .strict();

const ActionStageSchema = z
  .object({
    ...stageIdentity,
    kind: z.literal("action"),
    acceptanceCriteria: z.array(z.object({ ...criterionIdentity, verification: z.literal("stave-check").optional() }).strict()).max(20).optional(),
    action: StaveActionSchema,
  })
  .strict();

export const WorkflowStageSchema = z.discriminatedUnion("kind", [
  AiStageSchema,
  ActionStageSchema,
]);

export type WorkflowStage = z.infer<typeof WorkflowStageSchema>;
export type AiStage = Extract<WorkflowStage, { kind: "ai" }>;
export type ActionStage = Extract<WorkflowStage, { kind: "action" }>;
export type StaveAction = ActionStage["action"];
export type StaveActionType = StaveAction["type"];

export const STAVE_ACTION_LABELS: Record<StaveActionType, string> = {
  get "open-draft-pr"() { return i18n.t("agentRuns:schema.openDraftPr"); },
  get "watch-checks"() { return i18n.t("agentRuns:schema.watchChecks"); },
  get "mark-pr-ready"() { return i18n.t("agentRuns:schema.markPrReady"); },
  get "run-script"() { return i18n.t("agentRuns:schema.runScript"); },
};

interface StructureInput {
  purpose: string;
  constraints?: string;
  stages: WorkflowStage[];
}

function stageTextLength(stage: WorkflowStage): number {
  return (stage.acceptanceCriteria ?? []).reduce((total, criterion) => total + criterion.text.length, 0) + (stage.kind === "ai"
    ? stage.title.length + stage.instruction.length + stage.doneWhen.length
    : stage.title.length);
}

export function workflowTextLength(workflow: StructureInput): number {
  return (
    workflow.purpose.length +
    (workflow.constraints?.length ?? 0) +
    workflow.stages.reduce((total, stage) => total + stageTextLength(stage), 0)
  );
}

function actionIndexes(stages: WorkflowStage[], type: StaveActionType) {
  return stages.flatMap((stage, index) =>
    stage.kind === "action" && stage.action.type === type ? [index] : [],
  );
}

/**
 * Rules that span stages, shared by workflows and agent workflows. When the
 * stages open a draft PR, the checks and ready-for-review actions must come
 * after it; without an `open-draft-pr` stage they act on the workspace's
 * existing pull request.
 */
export function listWorkflowStructureIssues(
  workflow: StructureInput,
): Array<{ message: string; path: PropertyKey[] }> {
  const issues: Array<{ message: string; path: PropertyKey[] }> = [];
  const seenIds = new Set<string>();
  workflow.stages.forEach((stage, index) => {
    if (seenIds.has(stage.id)) {
      issues.push({
        message: i18n.t("agentRuns:schema.message", { value1: stage.id }),
        path: ["stages", index, "id"],
      });
    }
    seenIds.add(stage.id);
    if (stage.kind === "action" && stage.action.type !== "run-script" && stage.acceptanceCriteria?.some((criterion) => criterion.required !== false)) {
      issues.push({ message: i18n.t("agentRuns:schema.message2"), path: ["stages", index, "acceptanceCriteria"] });
    }
    if (new Set(stage.acceptanceCriteria?.map((criterion) => criterion.text)).size !== (stage.acceptanceCriteria?.length ?? 0)) {
      issues.push({ message: i18n.t("agentRuns:schema.message3"), path: ["stages", index, "acceptanceCriteria"] });
    }
  });

  const openIndexes = actionIndexes(workflow.stages, "open-draft-pr");
  if (openIndexes.length > 1) {
    issues.push({
      message: i18n.t("agentRuns:schema.message4"),
      path: ["stages", openIndexes[1]!],
    });
  }
  const firstOpen = openIndexes[0];
  if (firstOpen !== undefined) {
    for (const type of ["watch-checks", "mark-pr-ready"] as const) {
      for (const index of actionIndexes(workflow.stages, type)) {
        if (index < firstOpen) {
          issues.push({
            message: i18n.t("agentRuns:schema.message5", { value1: STAVE_ACTION_LABELS[type], value2: STAVE_ACTION_LABELS["open-draft-pr"] }),
            path: ["stages", index],
          });
        }
      }
    }
  }

  const length = workflowTextLength(workflow);
  if (length > MAX_WORKFLOW_TEXT_LENGTH) {
    issues.push({
      message: i18n.t("agentRuns:schema.message6", { value1: formatNumber(MAX_WORKFLOW_TEXT_LENGTH), value2: formatNumber(length) }),
      path: ["stages"],
    });
  }
  return issues;
}

const WorkflowRuntimeSchema = z
  .object({
    providerId: z.enum(WORKFLOW_PROVIDER_IDS),
    model: z.string().trim().min(1).max(WORKFLOW_LIMITS.model).optional(),
    get effort() { return z
      .custom<ModelEffort>(
        (value) => typeof value === "string" && isModelEffort(value),
        i18n.t("agentRuns:schema.extraCopy427"),
      )
      .optional(); },
    permissionMode: z.enum(AUTOMATION_PERMISSION_MODES).optional(),
  })
  .strict();

/**
 * Deprecated: workflow start conditions (an assigned issue, pull request
 * trouble, a schedule) were retired with proposals. Nothing reads them now.
 * The shape stays because `WorkflowSchema` is strict and saved workflows and
 * old agent run rows may still carry it.
 */
const RETIRED_START_SCHEDULES = ["off", "daily", "weekdays", "weekly", "every-4h"] as const;

const WorkflowStartsWhenSchema = z
  .object({
    issueAssigned: z
      .object({
        /** Only issues whose key, title, project or labels contain this; empty for all. */
        filter: z.string().trim().max(80),
        /** Issues assigned before this never propose. */
        since: z.iso.datetime(),
      })
      .strict()
      .optional(),
    pullRequest: z.object({ checksFailed: z.boolean(), changesRequested: z.boolean() }).strict().optional(),
    schedule: z
      .object({
        schedule: z.enum(RETIRED_START_SCHEDULES),
        workspaceId: z.string().trim().min(1).max(200),
        workspaceName: z.string().trim().max(200),
        /** Slots before this never run. */
        since: z.iso.datetime(),
      })
      .strict()
      .optional(),
    autoStart: z.boolean().optional(),
  })
  .strict();

export const WorkflowSchema = z
  .object({
    version: z.literal(WORKFLOW_VERSION),
    get id() { return z
      .string()
      .max(WORKFLOW_LIMITS.id)
      .regex(WORKFLOW_ID_PATTERN, i18n.t("agentRuns:schema.extraCopy428")); },
    get name() { return text(i18n.t("agentRuns:schema.extraCopy429"), WORKFLOW_LIMITS.name); },
    get shortcut() { return z
      .string()
      .max(WORKFLOW_LIMITS.shortcut)
      .regex(SHORTCUT_PATTERN, i18n.t("agentRuns:schema.extraCopy430"))
      .optional(); },
    get purpose() { return text(i18n.t("agentRuns:schema.extraCopy431"), WORKFLOW_LIMITS.purpose); },
    checkIns: z.enum(CHECK_INS),
    team: z.enum(WORKFLOW_TEAMS),
    runtime: WorkflowRuntimeSchema.optional(),
    advisorReview: z.boolean().optional(),
    constraints: z.string().trim().max(WORKFLOW_LIMITS.constraints).optional(),
    /** Deprecated and unread; kept so older saved workflows still parse. */
    startsWhen: WorkflowStartsWhenSchema.optional(),
    get stages() { return z
      .array(WorkflowStageSchema)
      .min(1, i18n.t("agentRuns:schema.extraCopy432"))
      .max(MAX_WORKFLOW_STAGES, i18n.t("agentRuns:schema.extraCopy433", { value1: MAX_WORKFLOW_STAGES })); },
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((workflow, context) => {
    for (const issue of listWorkflowStructureIssues(workflow)) {
      context.addIssue({ code: "custom", ...issue });
    }
  });

export type Workflow = z.infer<typeof WorkflowSchema>;
export type WorkflowRuntime = NonNullable<Workflow["runtime"]>;

