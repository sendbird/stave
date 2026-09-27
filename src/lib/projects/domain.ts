/**
 * Projects: a goal that takes several missions. A project owns a coordinator
 * task — a normal task whose turns may propose and start missions and read
 * their reports — and records the missions it started, the proposals waiting
 * for the user, what it has learned, and its events.
 *
 * A project starts work only as missions, through the same intake a user
 * takes, and its coordinator edits no files. Each mission runs exactly as a
 * standalone mission does, with its own sign-offs.
 */
import { z } from "zod";
import { PlaybookSchema } from "@/lib/playbooks/schema";
import { SCHEDULES, type Schedule } from "@/lib/schedules";

export const PROJECT_LIMITS = {
  name: 80,
  goal: 2_000,
  note: 600,
  assignment: 4_000,
  worktreeName: 60,
  maxParallel: 6,
  defaultParallel: 2,
  maxEventDetailChars: 8_000,
  maxMemories: 200,
  /** Automatic coordinator turns a project may take in a day before it pauses. */
  maxCoordinatorWakesPerDay: 24,
  /** Characters of a message the user sends the coordinator from the project. */
  coordinatorMessage: 4_000,
  /** Triggers one wake delivers; the rest wait for the next. */
  maxTriggersPerWake: 10,
} as const;

const IdSchema = z.string().trim().min(1).max(200);
const TimestampSchema = z.iso.datetime();

/** `expired`: the project reached its end date and stopped on its own. */
export const PROJECT_STATES = ["active", "paused", "completed", "cancelled", "expired"] as const;
export type ProjectState = (typeof PROJECT_STATES)[number];

export function isOpenProjectState(state: ProjectState) {
  return state === "active" || state === "paused";
}

/** When a scheduled check-in wakes the coordinator, in the host's local time. */
export const PROJECT_SCHEDULES = SCHEDULES;
export type ProjectSchedule = Schedule;

/**
 * Starts when: what wakes the coordinator besides its own missions. Each only
 * wakes it — the coordinator decides whether a mission follows, and with
 * "ask before starting" on, the user still approves it.
 */
export const ProjectTriggersSchema = z
  .object({
    /** An issue newly assigned to the user in Issues (Crane or Jira). */
    issueAssigned: z.boolean(),
    /** Only issues whose key, title, project or labels contain this; empty for all. */
    issueFilter: z.string().trim().max(80),
    /** Failing checks, requested changes or a merge on a PR a mission of this project opened. */
    pullRequestFeedback: z.boolean(),
    schedule: z.enum(PROJECT_SCHEDULES),
    /** When issue watching was turned on; issues assigned before it never wake. */
    issueSince: z.iso.datetime().nullable(),
    /** When the schedule was set; earlier slots never wake. */
    scheduleSince: z.iso.datetime().nullable(),
  })
  .strict();
export type ProjectTriggers = z.infer<typeof ProjectTriggersSchema>;

export const DEFAULT_PROJECT_TRIGGERS: ProjectTriggers = {
  issueAssigned: false,
  issueFilter: "",
  pullRequestFeedback: true,
  schedule: "off",
  issueSince: null,
  scheduleSince: null,
};

export const ProjectSettingsSchema = z
  .object({
    /** Missions of this project that may run at once. */
    parallelLimit: z.number().int().min(1).max(PROJECT_LIMITS.maxParallel),
    /** The coordinator proposes; the user starts. Staged autonomy begins here. */
    askBeforeStarting: z.boolean(),
    /** Decisions from mission reports become project memory without review. */
    autoAcceptDecisions: z.boolean(),
    triggers: ProjectTriggersSchema.default(DEFAULT_PROJECT_TRIGGERS),
    /**
     * The end of the project's time box: past it the project stops waking its
     * coordinator and starting missions. Running missions finish on their own.
     */
    endsAt: z.iso.datetime().nullable().default(null),
  })
  .strict();
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

/**
 * A change to some settings. Built without the defaults: `partial()` of a
 * schema with `.default()` fills missing keys in, and a one-field change
 * would reset the start conditions and the end date.
 */
export const ProjectSettingsPatchSchema = z
  .object({
    parallelLimit: z.number().int().min(1).max(PROJECT_LIMITS.maxParallel),
    askBeforeStarting: z.boolean(),
    autoAcceptDecisions: z.boolean(),
    triggers: ProjectTriggersSchema,
    endsAt: z.iso.datetime().nullable(),
  })
  .partial()
  .strict();

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  parallelLimit: PROJECT_LIMITS.defaultParallel,
  askBeforeStarting: true,
  autoAcceptDecisions: false,
  triggers: DEFAULT_PROJECT_TRIGGERS,
  endsAt: null,
};

export const ProjectSchema = z
  .object({
    id: IdSchema,
    name: z.string().trim().min(1).max(PROJECT_LIMITS.name),
    goal: z.string().trim().min(1).max(PROJECT_LIMITS.goal),
    repositoryPath: z.string().min(1),
    coordinator: z.object({ workspaceId: IdSchema, taskId: IdSchema }).strict(),
    settings: ProjectSettingsSchema,
    state: z.enum(PROJECT_STATES),
    /** The coordinator's latest summary of where the project stands. */
    summary: z.string().max(PROJECT_LIMITS.note).nullable(),
    reasonDetail: z.string().max(500).nullable(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict();
export type Project = z.infer<typeof ProjectSchema>;

export const MISSION_PROVIDERS = ["claude-code", "codex"] as const;
export type MissionProviderId = (typeof MISSION_PROVIDERS)[number];

export const PROPOSAL_STATES = ["pending", "approved", "rejected", "started", "failed"] as const;
export type ProposalState = (typeof PROPOSAL_STATES)[number];

/**
 * A mission the coordinator wants to start. With "ask before starting" on it
 * waits for the user; once approved (or when asking is off) Stave starts it
 * through intake: a new worktree, a task, then the mission.
 */
export const MissionProposalSchema = z
  .object({
    id: IdSchema,
    projectId: IdSchema,
    /** The coordinator's idempotency key; the same key never starts twice. */
    startKey: z.string().trim().min(1).max(120),
    playbook: PlaybookSchema,
    assignment: z.string().trim().min(1).max(PROJECT_LIMITS.assignment),
    providerId: z.enum(MISSION_PROVIDERS),
    model: z.string().trim().min(1).max(120).nullable(),
    worktreeName: z.string().trim().min(1).max(PROJECT_LIMITS.worktreeName).nullable(),
    state: z.enum(PROPOSAL_STATES),
    workspaceId: IdSchema.nullable(),
    taskId: IdSchema.nullable(),
    missionId: IdSchema.nullable(),
    detail: z.string().max(500).nullable(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict();
export type MissionProposal = z.infer<typeof MissionProposalSchema>;

export const PROJECT_EVENT_KINDS = [
  "project-created",
  "proposal-created",
  "proposal-approved",
  "proposal-rejected",
  "mission-started",
  "mission-start-failed",
  /** A coordinator turn Stave started, with the mission states and triggers it delivered. */
  "coordinator-woken",
  /** Something a project watches happened; delivered to the coordinator at its next wake. */
  "trigger-observed",
  /** The user wrote to the coordinator from the project. */
  "coordinator-messaged",
  "coordinator-wake-failed",
  "summary",
  "memory-added",
  "memory-accepted",
  "settings-changed",
  "paused",
  "resumed",
  "ended",
] as const;
export type ProjectEventKind = (typeof PROJECT_EVENT_KINDS)[number];

export const ProjectEventSchema = z
  .object({
    id: IdSchema,
    projectId: IdSchema,
    sequence: z.number().int().min(1),
    kind: z.enum(PROJECT_EVENT_KINDS),
    idempotencyKey: z.string().max(300).nullable(),
    detail: z
      .record(z.string(), z.unknown())
      .refine((value) => JSON.stringify(value).length <= PROJECT_LIMITS.maxEventDetailChars, "Event detail is too long."),
    createdAt: TimestampSchema,
  })
  .strict();
export type ProjectEvent = z.infer<typeof ProjectEventSchema>;
export type ProjectEventDraft = Pick<ProjectEvent, "kind" | "detail"> & { idempotencyKey?: string | null };

export const MEMORY_KINDS = ["decision", "note"] as const;
export const MEMORY_STATUSES = ["candidate", "accepted"] as const;

/**
 * What a project has learned: decisions from its missions' reports and notes
 * from its coordinator. Recalled only by missions of the same project, and
 * only once accepted.
 */
export const ProjectMemorySchema = z
  .object({
    id: IdSchema,
    projectId: IdSchema,
    kind: z.enum(MEMORY_KINDS),
    content: z.string().trim().min(1).max(PROJECT_LIMITS.note),
    status: z.enum(MEMORY_STATUSES),
    sourceMissionId: IdSchema.nullable(),
    createdAt: TimestampSchema,
  })
  .strict();
export type ProjectMemory = z.infer<typeof ProjectMemorySchema>;

export const ProjectCreateInputSchema = z
  .object({
    name: z.string().trim().min(1).max(PROJECT_LIMITS.name),
    goal: z.string().trim().min(1).max(PROJECT_LIMITS.goal),
    coordinator: z.object({ workspaceId: IdSchema, taskId: IdSchema }).strict(),
    settings: ProjectSettingsSchema.partial().optional(),
  })
  .strict();
export type ProjectCreateInput = z.input<typeof ProjectCreateInputSchema>;

/** What `stave_start_mission` accepts from a coordinator turn. */
export const StartMissionToolInputSchema = z
  .object({
    playbookId: z.string().trim().min(1).max(120).describe("A saved playbook id or a template id from stave_get_project."),
    assignment: z.string().trim().min(1).max(PROJECT_LIMITS.assignment).describe("What this mission should achieve."),
    providerId: z.enum(MISSION_PROVIDERS).optional().describe("Claude or Codex; defaults to the coordinator's provider."),
    model: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .optional()
      .describe("A model id from stave_get_project's models for that provider; defaults to the provider's default model."),
    worktreeName: z
      .string()
      .trim()
      .min(1)
      .max(PROJECT_LIMITS.worktreeName)
      .optional()
      .describe("A short branch-friendly name for the mission's new worktree."),
    startKey: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .describe("Your idempotency key for this mission; reusing it never starts a second one."),
  })
  .strict();
export type StartMissionToolInput = z.infer<typeof StartMissionToolInputSchema>;

export class ProjectCommandError extends Error {
  constructor(
    readonly code: "not-found" | "refused" | "stale" ,
    message: string,
  ) {
    super(message);
    this.name = "ProjectCommandError";
  }
}
