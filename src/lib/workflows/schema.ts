import { z } from "zod";
import { AUTOMATION_PERMISSION_MODES, type AutomationPermissionMode } from "@/lib/automations";

/**
 * The permissions a mission runs with when its workflow names none. Auto: the
 * agent works without asking, because the mission already stops where it
 * should — at the sign-offs its check-ins choose, and before any pull request
 * or script step the start did not allow. Guided would stop an unattended
 * stage at every ask instead.
 */
export const DEFAULT_WORKFLOW_PERMISSION_MODE: AutomationPermissionMode = "auto";
import { isModelEffort, type ModelEffort } from "@/lib/providers/model-effort";
import type { ProviderId } from "@/lib/providers/provider.types";

/**
 * A workflow is a saved way of working: ordered stages, each with an
 * instruction and a "Done when" condition, that a mission runs on one lead
 * task. A saved workflow grants no permissions; every mission start records
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

/** How the check-in levels read in the product. */
export const CHECK_IN_LABELS: Record<CheckIns, string> = {
  "every-stage": "Every stage",
  "plan-and-publishing": "Plan and publishing",
  "when-stuck": "Only when stuck",
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
 * Stage ids appear inside idempotency keys (`missionId:stageId:attempt`), so
 * they are lowercase slugs without separators that could make a key ambiguous.
 */
const STAGE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WORKFLOW_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const SHORTCUT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function text(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be ${max} characters or fewer.`);
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
      scriptId: z
        .string()
        .trim()
        .min(1, "Script is required.")
        .max(120, "Script must be 120 characters or fewer."),
    })
    .strict(),
]);

const stageIdentity = {
  id: z
    .string()
    .max(WORKFLOW_LIMITS.stageId)
    .regex(STAGE_ID_PATTERN, "Stage ids are lowercase words joined by dashes."),
  title: text("Stage name", WORKFLOW_LIMITS.stageTitle),
  signOff: z.enum(SIGN_OFFS).optional(),
};

const criterionIdentity = { text: text("Acceptance criterion", 500), required: z.boolean().optional() };

const AiStageSchema = z
  .object({
    ...stageIdentity,
    kind: z.literal("ai"),
    acceptanceCriteria: z.array(z.object({ ...criterionIdentity, verification: z.literal("agent-report").optional() }).strict()).max(20).optional(),
    instruction: text("Instruction", WORKFLOW_LIMITS.instruction),
    doneWhen: text("Done when", WORKFLOW_LIMITS.doneWhen),
    role: z.enum(AI_STAGE_ROLES).optional(),
    /**
     * Runs this stage as another agent: the lead task delegates it to a
     * delegated task running as this agent and reports its result. The lead
     * task's own provider and instructions never change mid-mission.
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
  "open-draft-pr": "Open draft PR",
  "watch-checks": "Watch checks",
  "mark-pr-ready": "Ready for review",
  "run-script": "Run script",
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
        message: `Stage id "${stage.id}" is used more than once.`,
        path: ["stages", index, "id"],
      });
    }
    seenIds.add(stage.id);
    if (stage.kind === "action" && stage.action.type !== "run-script" && stage.acceptanceCriteria?.some((criterion) => criterion.required !== false)) {
      issues.push({ message: "Required Stave checks belong to a Run script stage.", path: ["stages", index, "acceptanceCriteria"] });
    }
    if (new Set(stage.acceptanceCriteria?.map((criterion) => criterion.text)).size !== (stage.acceptanceCriteria?.length ?? 0)) {
      issues.push({ message: "Each acceptance criterion must be distinct.", path: ["stages", index, "acceptanceCriteria"] });
    }
  });

  const openIndexes = actionIndexes(workflow.stages, "open-draft-pr");
  if (openIndexes.length > 1) {
    issues.push({
      message: "Open a draft PR only once.",
      path: ["stages", openIndexes[1]!],
    });
  }
  const firstOpen = openIndexes[0];
  if (firstOpen !== undefined) {
    for (const type of ["watch-checks", "mark-pr-ready"] as const) {
      for (const index of actionIndexes(workflow.stages, type)) {
        if (index < firstOpen) {
          issues.push({
            message: `"${STAVE_ACTION_LABELS[type]}" must come after "${STAVE_ACTION_LABELS["open-draft-pr"]}".`,
            path: ["stages", index],
          });
        }
      }
    }
  }

  const length = workflowTextLength(workflow);
  if (length > MAX_WORKFLOW_TEXT_LENGTH) {
    issues.push({
      message: `Keep the combined instructions under ${MAX_WORKFLOW_TEXT_LENGTH.toLocaleString("en-US")} characters (now ${length.toLocaleString("en-US")}).`,
      path: ["stages"],
    });
  }
  return issues;
}

const WorkflowRuntimeSchema = z
  .object({
    providerId: z.enum(WORKFLOW_PROVIDER_IDS),
    model: z.string().trim().min(1).max(WORKFLOW_LIMITS.model).optional(),
    effort: z
      .custom<ModelEffort>(
        (value) => typeof value === "string" && isModelEffort(value),
        "Unknown effort.",
      )
      .optional(),
    permissionMode: z.enum(AUTOMATION_PERMISSION_MODES).optional(),
  })
  .strict();

/**
 * Deprecated: workflow start conditions (an assigned issue, pull request
 * trouble, a schedule) were retired with proposals. Nothing reads them now.
 * The shape stays because `WorkflowSchema` is strict and saved workflows and
 * old mission rows may still carry it.
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
    id: z
      .string()
      .max(WORKFLOW_LIMITS.id)
      .regex(WORKFLOW_ID_PATTERN, "Workflow ids use letters, digits, - and _."),
    name: text("Name", WORKFLOW_LIMITS.name),
    shortcut: z
      .string()
      .max(WORKFLOW_LIMITS.shortcut)
      .regex(SHORTCUT_PATTERN, "Shortcuts are lowercase words joined by dashes.")
      .optional(),
    purpose: text("Purpose", WORKFLOW_LIMITS.purpose),
    checkIns: z.enum(CHECK_INS),
    team: z.enum(WORKFLOW_TEAMS),
    runtime: WorkflowRuntimeSchema.optional(),
    advisorReview: z.boolean().optional(),
    constraints: z.string().trim().max(WORKFLOW_LIMITS.constraints).optional(),
    /** Deprecated and unread; kept so older saved workflows still parse. */
    startsWhen: WorkflowStartsWhenSchema.optional(),
    stages: z
      .array(WorkflowStageSchema)
      .min(1, "Add at least one stage.")
      .max(MAX_WORKFLOW_STAGES, `Use at most ${MAX_WORKFLOW_STAGES} stages.`),
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

