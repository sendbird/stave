import { z } from "zod";
import { getDefaultModelForProvider } from "@/lib/providers/model-catalog";
import type {
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
import type { WorkspaceInformationReference } from "@/lib/workspace-information-references";

export const ROUTINE_SCHEDULE_UNITS = [
  "minutes",
  "hours",
  "days",
  "weeks",
] as const;

export const RoutineScheduleUnitSchema = z.enum(ROUTINE_SCHEDULE_UNITS);
export type RoutineScheduleUnit = z.infer<typeof RoutineScheduleUnitSchema>;

export const RoutineScheduleSchema = z.object({
  every: z.number().int().min(1).max(999),
  unit: RoutineScheduleUnitSchema,
}).strict();
export type RoutineSchedule = z.infer<typeof RoutineScheduleSchema>;

export const RoutineEnvironmentInputSchema = z.object({
  kind: z.literal("repository"),
  workspaceId: z.string().min(1),
  path: z.string().min(1),
  projectPath: z.string().min(1),
  label: z.string().min(1),
}).strict();
export type RoutineEnvironmentInput = z.infer<
  typeof RoutineEnvironmentInputSchema
>;

export const RoutineEnvironmentSchema = RoutineEnvironmentInputSchema;
export type RoutineEnvironment = z.infer<typeof RoutineEnvironmentSchema>;

export const ROUTINE_INFORMATION_RESOURCE_KINDS = [
  "notes",
  "todo",
  "pull_request",
  "jira",
  "confluence",
  "storybook",
  "amplify",
  "slack",
  "figma",
  "custom",
] as const;
export type RoutineInformationResourceKind =
  (typeof ROUTINE_INFORMATION_RESOURCE_KINDS)[number];

const RoutineInformationWorkspaceIdSchema = z.string().min(1).max(4096);
const RoutineInformationUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(8192)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "A valid http(s) URL is required.");
const RoutineInformationTitleSchema = z.string().trim().max(500).optional();
const RoutineInformationNoteSchema = z.string().trim().max(10_000).optional();
const RoutineInformationExternalResourceBaseSchema = z.object({
  workspaceId: RoutineInformationWorkspaceIdSchema,
  url: RoutineInformationUrlSchema,
  title: RoutineInformationTitleSchema,
  note: RoutineInformationNoteSchema,
});

export const RoutineInformationResourceCreateInputSchema =
  z.discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("notes"),
        workspaceId: RoutineInformationWorkspaceIdSchema,
        text: z.string().trim().min(1).max(100_000),
      })
      .strict(),
    z
      .object({
        kind: z.literal("todo"),
        workspaceId: RoutineInformationWorkspaceIdSchema,
        text: z.string().trim().min(1).max(10_000),
      })
      .strict(),
    RoutineInformationExternalResourceBaseSchema.extend({
      kind: z.literal("pull_request"),
      status: z
        .enum(["planned", "open", "review", "merged", "closed"])
        .optional(),
    }).strict(),
    RoutineInformationExternalResourceBaseSchema.extend({
      kind: z.literal("jira"),
      issueKey: z.string().trim().max(100).optional(),
      status: z.string().trim().max(200).optional(),
    }).strict(),
    RoutineInformationExternalResourceBaseSchema.extend({
      kind: z.literal("confluence"),
      spaceKey: z.string().trim().max(100).optional(),
    }).strict(),
    RoutineInformationExternalResourceBaseSchema.extend({
      kind: z.literal("storybook"),
    }).strict(),
    RoutineInformationExternalResourceBaseSchema.extend({
      kind: z.literal("amplify"),
    }).strict(),
    RoutineInformationExternalResourceBaseSchema.extend({
      kind: z.literal("slack"),
      channelName: z.string().trim().max(200).optional(),
    }).strict(),
    RoutineInformationExternalResourceBaseSchema.extend({
      kind: z.literal("figma"),
      nodeId: z.string().trim().max(500).optional(),
    }).strict(),
    z
      .object({
        kind: z.literal("custom"),
        workspaceId: RoutineInformationWorkspaceIdSchema,
        label: z.string().trim().min(1).max(500),
        fieldType: z.enum([
          "text",
          "textarea",
          "number",
          "boolean",
          "date",
          "url",
          "single_select",
        ]),
        value: z
          .union([z.string().max(10_000), z.number(), z.boolean(), z.null()])
          .optional(),
        options: z
          .array(z.string().trim().min(1).max(200))
          .max(100)
          .optional(),
      })
      .strict(),
  ]);
export type RoutineInformationResourceCreateInput = z.infer<
  typeof RoutineInformationResourceCreateInputSchema
>;

export const RoutineInformationReferenceSchema = z.object({
  section: z.enum([
    "turn-summary",
    "notes",
    "todo",
    "pr",
    "jira",
    "confluence",
    "storybook",
    "amplify",
    "slack",
    "figma",
    "custom",
  ]),
  scope: z.enum(["section", "item"]),
  itemId: z.string().optional(),
  label: z.string(),
  token: z.string().min(1),
}).strict();

const ClaudeRoutineRuntimeSchema = z.object({
  provider: z.literal("claude-code"),
  model: z.string().min(1),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
  permissionMode: z.enum([
    "default",
    "acceptEdits",
    "bypassPermissions",
    "plan",
    "dontAsk",
    "auto",
  ]),
  sandboxEnabled: z.boolean(),
  allowUnsandboxedCommands: z.boolean(),
  allowDangerouslySkipPermissions: z.boolean(),
}).strict();

const CodexRoutineRuntimeSchema = z.object({
  provider: z.literal("codex"),
  model: z.string().min(1),
  effort: z.enum(["low", "medium", "high", "xhigh", "max", "ultra"]),
  fileAccess: z.enum([
    "read-only",
    "workspace-write",
    "danger-full-access",
  ]),
  approvalPolicy: z.enum([
    "never",
    "on-request",
    "on-failure",
    "untrusted",
  ]),
  networkAccess: z.boolean(),
  webSearch: z.enum(["disabled", "cached", "live"]),
}).strict();

export const RoutineRuntimeConfigSchema = z.discriminatedUnion("provider", [
  ClaudeRoutineRuntimeSchema,
  CodexRoutineRuntimeSchema,
]);
export type RoutineRuntimeConfig = z.infer<
  typeof RoutineRuntimeConfigSchema
>;

export const RoutineUpsertInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(100_000),
  enabled: z.boolean(),
  schedule: RoutineScheduleSchema,
  environment: RoutineEnvironmentInputSchema,
  runtime: RoutineRuntimeConfigSchema,
  informationReferences: z
    .array(RoutineInformationReferenceSchema)
    .max(100)
    .default([]),
}).strict();
export type RoutineUpsertInput = z.infer<typeof RoutineUpsertInputSchema>;

export const RoutineSpecSchema = RoutineUpsertInputSchema.omit({
  environment: true,
}).extend({
  id: z.string().min(1),
  environment: RoutineEnvironmentSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastRunAt: z.string().datetime().nullable(),
  nextRunAt: z.string().datetime().nullable(),
});
export type RoutineSpec = z.infer<typeof RoutineSpecSchema>;

export const ROUTINE_RUN_STATUSES = [
  "running",
  "waiting",
  "completed",
  "failed",
  "skipped",
] as const;

export const RoutineRunStatusSchema = z.enum(ROUTINE_RUN_STATUSES);
export type RoutineRunStatus = z.infer<typeof RoutineRunStatusSchema>;

export const RoutineRunSchema = z.object({
  id: z.string().min(1),
  routineId: z.string().min(1),
  workspaceId: z.string().min(1),
  projectPath: z.string().min(1),
  taskId: z.string().nullable(),
  turnId: z.string().nullable(),
  status: RoutineRunStatusSchema,
  trigger: z.enum(["scheduled", "manual"]),
  scheduledFor: z.string().datetime().nullable(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  resultPreview: z.string().nullable(),
  error: z.string().nullable(),
}).strict();
export type RoutineRun = z.infer<typeof RoutineRunSchema>;

export const RoutineStateSchema = z.object({
  version: z.literal(1),
  routines: z.array(RoutineSpecSchema),
  runs: z.array(RoutineRunSchema),
}).strict();
export type RoutineState = z.infer<typeof RoutineStateSchema>;

export interface RoutineSnapshot {
  routines: RoutineSpec[];
  runs: RoutineRun[];
}

const ROUTINE_SCHEDULE_UNIT_MS: Record<RoutineScheduleUnit, number> = {
  minutes: 60_000,
  hours: 60 * 60_000,
  days: 24 * 60 * 60_000,
  weeks: 7 * 24 * 60 * 60_000,
};

export const MAX_ROUTINE_RUNS_PER_ROUTINE = 50;

export function createEmptyRoutineState(): RoutineState {
  return {
    version: 1,
    routines: [],
    runs: [],
  };
}

export function normalizeRoutineState(value: unknown): RoutineState {
  const parsed = RoutineStateSchema.safeParse(value);
  return parsed.success ? parsed.data : createEmptyRoutineState();
}

export function getRoutineScheduleIntervalMs(schedule: RoutineSchedule) {
  return schedule.every * ROUTINE_SCHEDULE_UNIT_MS[schedule.unit];
}

export function computeNextRoutineRunAt(args: {
  schedule: RoutineSchedule;
  after: Date | string | number;
}) {
  const after =
    args.after instanceof Date ? args.after : new Date(args.after);
  return new Date(
    after.getTime() + getRoutineScheduleIntervalMs(args.schedule),
  ).toISOString();
}

export function formatRoutineSchedule(schedule: RoutineSchedule) {
  const labels: Record<RoutineScheduleUnit, [string, string]> = {
    minutes: ["minute", "minutes"],
    hours: ["hour", "hours"],
    days: ["day", "days"],
    weeks: ["week", "weeks"],
  };
  const [singular, plural] = labels[schedule.unit];
  return `Every ${schedule.every} ${
    schedule.every === 1 ? singular : plural
  }`;
}

export function createDefaultRoutineRuntime(
  provider: ProviderId,
): RoutineRuntimeConfig {
  if (provider === "codex") {
    return {
      provider: "codex",
      model: getDefaultModelForProvider({ providerId: "codex" }),
      effort: "medium",
      fileAccess: "workspace-write",
      approvalPolicy: "untrusted",
      networkAccess: false,
      webSearch: "cached",
    };
  }
  return {
    provider: "claude-code",
    model: getDefaultModelForProvider({ providerId: "claude-code" }),
    effort: "medium",
    permissionMode: "acceptEdits",
    sandboxEnabled: false,
    allowUnsandboxedCommands: true,
    allowDangerouslySkipPermissions: false,
  };
}

export function routineRuntimeToProviderOptions(
  runtime: RoutineRuntimeConfig,
): ProviderRuntimeOptions {
  if (runtime.provider === "codex") {
    return {
      model: runtime.model,
      codexReasoningEffort: runtime.effort,
      codexFileAccess: runtime.fileAccess,
      codexApprovalPolicy: runtime.approvalPolicy,
      codexNetworkAccess: runtime.networkAccess,
      codexWebSearch: runtime.webSearch,
    };
  }
  return {
    model: runtime.model,
    claudeEffort: runtime.effort,
    claudePermissionMode: runtime.permissionMode,
    claudeSandboxEnabled: runtime.sandboxEnabled,
    claudeAllowUnsandboxedCommands: runtime.allowUnsandboxedCommands,
    claudeAllowDangerouslySkipPermissions:
      runtime.allowDangerouslySkipPermissions,
  };
}

export function pruneRoutineRuns(runs: RoutineRun[]) {
  const countByRoutine = new Map<string, number>();
  return [...runs]
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .filter((run) => {
      const count = countByRoutine.get(run.routineId) ?? 0;
      if (count >= MAX_ROUTINE_RUNS_PER_ROUTINE) {
        return false;
      }
      countByRoutine.set(run.routineId, count + 1);
      return true;
    });
}

export function getRoutineInformationReferenceKey(
  reference: WorkspaceInformationReference,
) {
  return reference.scope === "section"
    ? `${reference.section}:section`
    : `${reference.section}:item:${reference.itemId ?? ""}`;
}
