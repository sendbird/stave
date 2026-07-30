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

export const RoutineScheduleTimeSchema = z
  .object({
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  })
  .strict();
export type RoutineScheduleTime = z.infer<typeof RoutineScheduleTimeSchema>;

export const RoutineScheduleSchema = z
  .object({
    every: z.number().int().min(1).max(999),
    unit: RoutineScheduleUnitSchema,
    /**
     * Optional local start time for day/week schedules. When set, runs snap to
     * this time of day instead of "interval after the previous run".
     */
    at: RoutineScheduleTimeSchema.optional(),
    /**
     * Optional local weekday (0 = Sunday … 6 = Saturday) for week schedules.
     * Requires `at` so an anchored week schedule always has a concrete time.
     */
    weekday: z.number().int().min(0).max(6).optional(),
    /**
     * Optional set of local weekdays for week schedules. This is the multi-day
     * form behind cadence presets such as "Every weekday" (Mon–Fri) and
     * "Weekends" (Sat–Sun), which a single `weekday` cannot express. Mutually
     * exclusive with `weekday` so a schedule always has one day source.
     */
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  })
  .strict()
  .superRefine((schedule, context) => {
    if (
      schedule.at &&
      (schedule.unit === "minutes" || schedule.unit === "hours")
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["at"],
        message: "Start time applies only to day or week schedules.",
      });
    }
    if (schedule.weekday !== undefined && schedule.unit !== "weeks") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weekday"],
        message: "Start day applies only to week schedules.",
      });
    }
    if (schedule.weekday !== undefined && !schedule.at) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weekday"],
        message: "Start day requires a start time.",
      });
    }
    if (schedule.weekdays && schedule.unit !== "weeks") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weekdays"],
        message: "Start days apply only to week schedules.",
      });
    }
    if (schedule.weekdays && !schedule.at) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weekdays"],
        message: "Start days require a start time.",
      });
    }
    if (
      schedule.weekdays &&
      new Set(schedule.weekdays).size !== schedule.weekdays.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weekdays"],
        message: "Start days must be unique.",
      });
    }
    if (schedule.weekdays && schedule.weekday !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weekdays"],
        message: "Use either a single start day or a set of start days.",
      });
    }
  });
export type RoutineSchedule = z.infer<typeof RoutineScheduleSchema>;

export const AUTOMATION_TRUST_POLICIES = [
  "review-required",
  "workspace-trusted",
  "unattended",
] as const;
export const AutomationTrustPolicySchema = z.enum(AUTOMATION_TRUST_POLICIES);
export type AutomationTrustPolicy = z.infer<typeof AutomationTrustPolicySchema>;

export const RoutineEnvironmentInputSchema = z
  .object({
    kind: z.literal("repository"),
    workspaceId: z.string().min(1),
    path: z.string().min(1),
    projectPath: z.string().min(1),
    label: z.string().min(1),
  })
  .strict();
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

export const RoutineInformationResourceCreateInputSchema = z.discriminatedUnion(
  "kind",
  [
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
        options: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
      })
      .strict(),
  ],
);
export type RoutineInformationResourceCreateInput = z.infer<
  typeof RoutineInformationResourceCreateInputSchema
>;

export const RoutineInformationReferenceSchema = z
  .object({
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
  })
  .strict();

const ClaudeRoutineRuntimeSchema = z
  .object({
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
  })
  .strict();

const CodexRoutineRuntimeSchema = z
  .object({
    provider: z.literal("codex"),
    model: z.string().min(1),
    effort: z.enum(["low", "medium", "high", "xhigh", "max", "ultra"]),
    fileAccess: z.enum(["read-only", "workspace-write", "danger-full-access"]),
    approvalPolicy: z.enum(["never", "on-request", "on-failure", "untrusted"]),
    networkAccess: z.boolean(),
    webSearch: z.enum(["disabled", "cached", "live"]),
  })
  .strict();

export const RoutineRuntimeConfigSchema = z.discriminatedUnion("provider", [
  ClaudeRoutineRuntimeSchema,
  CodexRoutineRuntimeSchema,
]);
export type RoutineRuntimeConfig = z.infer<typeof RoutineRuntimeConfigSchema>;

export const RoutineUpsertInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    prompt: z.string().trim().min(1).max(100_000),
    enabled: z.boolean(),
    schedule: RoutineScheduleSchema,
    environment: RoutineEnvironmentInputSchema,
    runtime: RoutineRuntimeConfigSchema,
    trustPolicy: AutomationTrustPolicySchema.default("review-required"),
    maxConcurrentRuns: z.number().int().min(1).max(8).default(1),
    informationReferences: z
      .array(RoutineInformationReferenceSchema)
      .max(100)
      .default([]),
  })
  .strict();
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

export const RoutineRunSchema = z
  .object({
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
    configHash: z
      .string()
      .regex(/^[a-f0-9]{16}$/)
      .nullable()
      .default(null),
    trustPolicy: AutomationTrustPolicySchema.default("review-required"),
  })
  .strict();
export type RoutineRun = z.infer<typeof RoutineRunSchema>;

export const RoutineStateSchema = z
  .object({
    version: z.literal(1),
    routines: z.array(RoutineSpecSchema),
    runs: z.array(RoutineRunSchema),
  })
  .strict();
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

/**
 * The local weekdays a week schedule targets, in ascending order. Returns an
 * empty list when the schedule is not anchored to any specific weekday.
 */
export function getRoutineScheduleWeekdays(schedule: RoutineSchedule) {
  if (schedule.unit !== "weeks") {
    return [];
  }
  if (schedule.weekdays?.length) {
    return [...new Set(schedule.weekdays)].sort((left, right) => left - right);
  }
  return schedule.weekday === undefined ? [] : [schedule.weekday];
}

export function computeNextRoutineRunAt(args: {
  schedule: RoutineSchedule;
  after: Date | string | number;
}) {
  const after = args.after instanceof Date ? args.after : new Date(args.after);
  const { schedule } = args;
  const anchored =
    schedule.at && (schedule.unit === "days" || schedule.unit === "weeks");
  if (!anchored || !schedule.at) {
    return new Date(
      after.getTime() + getRoutineScheduleIntervalMs(schedule),
    ).toISOString();
  }

  // Anchored schedules run at a local wall-clock time: start from `after`'s
  // local day, snap to the requested time (and weekday for week schedules),
  // then step whole periods until the candidate is in the future. Date methods
  // re-normalize across DST so the wall-clock time is preserved.
  const at = schedule.at;
  const stepDays =
    schedule.unit === "weeks" ? schedule.every * 7 : schedule.every;
  const computeForWeekday = (weekday: number | undefined) => {
    const candidate = new Date(after);
    candidate.setHours(at.hour, at.minute, 0, 0);
    if (weekday !== undefined) {
      candidate.setDate(
        candidate.getDate() + ((weekday - candidate.getDay() + 7) % 7),
      );
    }
    while (candidate.getTime() <= after.getTime()) {
      candidate.setDate(candidate.getDate() + stepDays);
    }
    return candidate;
  };

  const weekdays = getRoutineScheduleWeekdays(schedule);
  if (weekdays.length === 0) {
    return computeForWeekday(undefined).toISOString();
  }
  // Multi-weekday schedules fire on whichever targeted day comes first.
  const earliest = weekdays
    .map((weekday) => computeForWeekday(weekday))
    .reduce((left, right) => (right.getTime() < left.getTime() ? right : left));
  return earliest.toISOString();
}

export const ROUTINE_WEEKDAY_LABELS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

export function formatRoutineScheduleTime(at: RoutineScheduleTime) {
  const hour = String(at.hour).padStart(2, "0");
  const minute = String(at.minute).padStart(2, "0");
  return `${hour}:${minute}`;
}

export const ROUTINE_WORKWEEK_WEEKDAYS = [1, 2, 3, 4, 5] as const;
export const ROUTINE_WEEKEND_WEEKDAYS = [0, 6] as const;

function sameWeekdaySet(weekdays: number[], expected: readonly number[]) {
  return (
    weekdays.length === expected.length &&
    expected.every((weekday) => weekdays.includes(weekday))
  );
}

function formatRoutineWeekdaySet(weekdays: number[]) {
  if (weekdays.length === 7) {
    return "day";
  }
  if (sameWeekdaySet(weekdays, ROUTINE_WORKWEEK_WEEKDAYS)) {
    return "weekday";
  }
  if (sameWeekdaySet(weekdays, ROUTINE_WEEKEND_WEEKDAYS)) {
    return "weekend day";
  }
  return weekdays.map((weekday) => ROUTINE_WEEKDAY_LABELS[weekday]).join(", ");
}

export function formatRoutineSchedule(schedule: RoutineSchedule) {
  const labels: Record<RoutineScheduleUnit, [string, string]> = {
    minutes: ["minute", "minutes"],
    hours: ["hour", "hours"],
    days: ["day", "days"],
    weeks: ["week", "weeks"],
  };
  const at =
    schedule.at && (schedule.unit === "days" || schedule.unit === "weeks")
      ? ` at ${formatRoutineScheduleTime(schedule.at)}`
      : "";

  // Multi-weekday week schedules read better as "Every weekday at 09:00" than
  // as "Every 1 week on Mon, Tue, Wed, Thu, Fri at 09:00".
  if (schedule.unit === "weeks" && schedule.weekdays?.length) {
    const weekdays = getRoutineScheduleWeekdays(schedule);
    const set = formatRoutineWeekdaySet(weekdays);
    if (schedule.every === 1) {
      return weekdays.length === 7 ||
        sameWeekdaySet(weekdays, ROUTINE_WORKWEEK_WEEKDAYS) ||
        sameWeekdaySet(weekdays, ROUTINE_WEEKEND_WEEKDAYS)
        ? `Every ${set}${at}`
        : `Every week on ${set}${at}`;
    }
    return `Every ${schedule.every} weeks on ${set}${at}`;
  }

  const [singular, plural] = labels[schedule.unit];
  const base = `Every ${schedule.every} ${
    schedule.every === 1 ? singular : plural
  }`;
  const weekday =
    schedule.unit === "weeks" && schedule.weekday !== undefined
      ? ` on ${ROUTINE_WEEKDAY_LABELS[schedule.weekday]}`
      : "";
  return `${base}${weekday}${at}`;
}

export const DEFAULT_ROUTINE_SCHEDULE_TIME: RoutineScheduleTime = {
  hour: 9,
  minute: 0,
};

/**
 * Cadence presets cover the schedules automation users actually ask for.
 * `custom` keeps the raw every/unit/weekday editor available as an escape
 * hatch, and `manual` means "saved prompt, Run now only".
 */
export const ROUTINE_CADENCE_PRESETS = [
  "manual",
  "every-15-minutes",
  "hourly",
  "daily",
  "weekdays",
  "weekends",
  "weekly",
  "custom",
] as const;
export type RoutineCadencePreset = (typeof ROUTINE_CADENCE_PRESETS)[number];

export const ROUTINE_CADENCE_PRESENTATION: Record<
  RoutineCadencePreset,
  { label: string; detail: string }
> = {
  manual: { label: "Manual only", detail: "Runs when you press Run now." },
  "every-15-minutes": {
    label: "Every 15 minutes",
    detail: "High-frequency polling. Watch the concurrency limit.",
  },
  hourly: { label: "Hourly", detail: "Runs once an hour from the last run." },
  daily: { label: "Daily", detail: "Runs once a day at a local time." },
  weekdays: { label: "Weekdays", detail: "Monday through Friday." },
  weekends: { label: "Weekends", detail: "Saturday and Sunday." },
  weekly: { label: "Weekly", detail: "One chosen day each week." },
  custom: { label: "Custom", detail: "Set the interval and days yourself." },
};

export function applyRoutineCadencePreset(args: {
  preset: RoutineCadencePreset;
  schedule: RoutineSchedule;
  enabled: boolean;
}): { schedule: RoutineSchedule; enabled: boolean } {
  const at = args.schedule.at ?? DEFAULT_ROUTINE_SCHEDULE_TIME;
  const currentWeekdays = getRoutineScheduleWeekdays(args.schedule);
  switch (args.preset) {
    case "manual":
      // Keep the schedule so re-enabling restores the previous cadence.
      return { schedule: args.schedule, enabled: false };
    case "every-15-minutes":
      return { schedule: { every: 15, unit: "minutes" }, enabled: true };
    case "hourly":
      return { schedule: { every: 1, unit: "hours" }, enabled: true };
    case "daily":
      return { schedule: { every: 1, unit: "days", at }, enabled: true };
    case "weekdays":
      return {
        schedule: {
          every: 1,
          unit: "weeks",
          at,
          weekdays: [...ROUTINE_WORKWEEK_WEEKDAYS],
        },
        enabled: true,
      };
    case "weekends":
      return {
        schedule: {
          every: 1,
          unit: "weeks",
          at,
          weekdays: [...ROUTINE_WEEKEND_WEEKDAYS],
        },
        enabled: true,
      };
    case "weekly":
      return {
        schedule: {
          every: 1,
          unit: "weeks",
          at,
          weekdays: [currentWeekdays[0] ?? 1],
        },
        enabled: true,
      };
    default:
      return { schedule: args.schedule, enabled: true };
  }
}

export function detectRoutineCadencePreset(args: {
  schedule: RoutineSchedule;
  enabled: boolean;
}): RoutineCadencePreset {
  if (!args.enabled) {
    return "manual";
  }
  const { schedule } = args;
  if (schedule.unit === "minutes" && schedule.every === 15) {
    return "every-15-minutes";
  }
  if (schedule.unit === "hours" && schedule.every === 1) {
    return "hourly";
  }
  if (schedule.every !== 1 || !schedule.at) {
    return "custom";
  }
  if (schedule.unit === "days") {
    return "daily";
  }
  if (schedule.unit !== "weeks") {
    return "custom";
  }
  const weekdays = getRoutineScheduleWeekdays(schedule);
  if (sameWeekdaySet(weekdays, ROUTINE_WORKWEEK_WEEKDAYS)) {
    return "weekdays";
  }
  if (sameWeekdaySet(weekdays, ROUTINE_WEEKEND_WEEKDAYS)) {
    return "weekends";
  }
  return weekdays.length > 0 ? "weekly" : "custom";
}

/**
 * Automations expose one guided permission control instead of the raw
 * per-provider permission matrix. The three modes mirror the prompt composer's
 * `manual | guided | auto` vocabulary and map one-to-one onto the persisted
 * trust policy that the host runtime enforces.
 */
export const AUTOMATION_PERMISSION_MODES = [
  "auto",
  "guided",
  "manual",
] as const;
export type AutomationPermissionMode =
  (typeof AUTOMATION_PERMISSION_MODES)[number];

const AUTOMATION_PERMISSION_MODE_TRUST_POLICY: Record<
  AutomationPermissionMode,
  AutomationTrustPolicy
> = {
  auto: "unattended",
  guided: "review-required",
  manual: "workspace-trusted",
};

const AUTOMATION_TRUST_POLICY_PERMISSION_MODE: Record<
  AutomationTrustPolicy,
  AutomationPermissionMode
> = {
  unattended: "auto",
  "review-required": "guided",
  "workspace-trusted": "manual",
};

export const AUTOMATION_PERMISSION_MODE_PRESENTATION: Record<
  AutomationPermissionMode,
  { label: string; summary: string; description: string }
> = {
  auto: {
    label: "Auto",
    summary: "Runs fully unattended",
    description:
      "Runs every provider action, MCP tool, and Lens action without approval prompts, because nobody is watching a scheduled run. Lens Developer Mode must still be enabled in Settings > Lens.",
  },
  guided: {
    label: "Guided",
    summary: "Asks before sensitive actions",
    description:
      "Sensitive provider actions take the strict approval path, so a run can pause and wait for you in its task.",
  },
  manual: {
    label: "Manual",
    summary: "Exactly what you configure",
    description:
      "Skip the guardrails and run with the provider permissions you set by hand below.",
  },
};

export function automationTrustPolicyToPermissionMode(
  policy: AutomationTrustPolicy,
): AutomationPermissionMode {
  return AUTOMATION_TRUST_POLICY_PERMISSION_MODE[policy];
}

export function automationPermissionModeToTrustPolicy(
  mode: AutomationPermissionMode,
): AutomationTrustPolicy {
  return AUTOMATION_PERMISSION_MODE_TRUST_POLICY[mode];
}

export function formatAutomationTrustPolicy(policy: AutomationTrustPolicy) {
  return AUTOMATION_PERMISSION_MODE_PRESENTATION[
    automationTrustPolicyToPermissionMode(policy)
  ].label;
}

/**
 * Mirrors the host runtime's trust-policy override so the saved runtime config
 * matches what a run actually executes with. Without this the editor would show
 * permission values the scheduler silently discards.
 */
export function applyAutomationTrustPolicyToRuntime(
  runtime: RoutineRuntimeConfig,
  policy: AutomationTrustPolicy,
): RoutineRuntimeConfig {
  if (policy === "workspace-trusted") {
    return runtime;
  }
  if (runtime.provider === "codex") {
    return {
      ...runtime,
      approvalPolicy: policy === "unattended" ? "never" : "untrusted",
    };
  }
  // Unattended runs have no human to answer a prompt, so anything short of a
  // full bypass turns an approval into a stalled run (`dontAsk` was worse still:
  // it silently *denied* every tool outside the Stave Local MCP allowlist).
  if (policy === "unattended") {
    return {
      ...runtime,
      permissionMode: "bypassPermissions",
      allowUnsandboxedCommands: runtime.allowUnsandboxedCommands,
      allowDangerouslySkipPermissions: true,
    };
  }
  return {
    ...runtime,
    permissionMode: "default",
    allowUnsandboxedCommands: false,
    allowDangerouslySkipPermissions: false,
  };
}

export function formatAutomationRuntimePermissions(
  runtime: RoutineRuntimeConfig,
) {
  if (runtime.provider === "codex") {
    return [
      `Approvals ${runtime.approvalPolicy}`,
      `Files ${runtime.fileAccess}`,
      `Network ${runtime.networkAccess ? "on" : "off"}`,
      `Web ${runtime.webSearch}`,
    ].join(" · ");
  }
  return [
    `Permission ${runtime.permissionMode}`,
    `Sandbox ${runtime.sandboxEnabled ? "on" : "off"}`,
    `Unsandboxed ${runtime.allowUnsandboxedCommands ? "on" : "off"}`,
    `Skip prompts ${runtime.allowDangerouslySkipPermissions ? "on" : "off"}`,
  ].join(" · ");
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
