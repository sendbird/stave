import { z } from "zod";

import {
  CraneDispatchRuntimeChoiceSchema,
  CraneDispatchWorkspaceChoiceSchema,
} from "@/lib/crane-connector/types";

/**
 * Trackers Stave can read a work list from.
 *
 * The ids are wire values: they appear in IPC payloads, in the SQLite cache
 * primary key, and in retrieved-context source ids, so renaming one is a
 * migration rather than a refactor.
 */
export const TRACKER_SOURCE_IDS = ["jira", "crane"] as const;
export type TrackerSourceId = (typeof TRACKER_SOURCE_IDS)[number];

/** Lower rank sorts earlier. Jira is the product list; Crane follows. */
export function trackerSourceRank(source: TrackerSourceId): number {
  const index = TRACKER_SOURCE_IDS.indexOf(source);
  return index < 0 ? TRACKER_SOURCE_IDS.length : index;
}

/**
 * Normalized status buckets every source maps into.
 *
 * Grouping, sorting and colour all read this rather than the raw status, so a
 * tracker that invents a new workflow state still lands somewhere sensible.
 * `in_review` is kept distinct from `in_progress` because "waiting on someone
 * else" is the state a person scanning their list acts on differently.
 */
export const TRACKER_STATUS_CATEGORIES = [
  "todo",
  "in_progress",
  "in_review",
  "done",
  "closed",
] as const;
export type TrackerStatusCategory = (typeof TRACKER_STATUS_CATEGORIES)[number];

export const TRACKER_PRIORITY_LEVELS = [
  "none",
  "low",
  "medium",
  "high",
  "urgent",
] as const;
export type TrackerPriorityLevel = (typeof TRACKER_PRIORITY_LEVELS)[number];

/**
 * Why a source is or is not usable right now.
 *
 * Split from `lastErrorCode` on purpose: an unconfigured source is a setup step
 * with a Settings destination, while a failing configured source is an error
 * banner that must not hide the rows already cached.
 */
export const TRACKER_SOURCE_AVAILABILITIES = [
  "ready",
  "disabled",
  "unpaired",
  "not_configured",
  "secure_storage_unavailable",
] as const;
export type TrackerSourceAvailability =
  (typeof TRACKER_SOURCE_AVAILABILITIES)[number];

/** Lifecycle of a Stave run started from a tracker ticket. */
export const TRACKER_ISSUE_LINK_STATES = [
  "staged",
  "running",
  "needs_input",
  "completed",
  "failed",
  "cancelled",
] as const;
export type TrackerIssueLinkState = (typeof TRACKER_ISSUE_LINK_STATES)[number];

const httpsUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .url()
  .refine((value) => value.startsWith("https://"), {
    message: "Only https URLs are accepted.",
  });

const timestampSchema = z.string().datetime({ offset: true });

const dueDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date.");

const TrackerIssueAssigneeSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().min(1).max(320).optional(),
    avatarUrl: httpsUrlSchema.optional(),
  })
  .strict();

const TrackerIssueLabelSchema = z
  .object({
    /** Widened to Crane's cap; Jira clamps its own labels well below this. */
    name: z.string().trim().min(1).max(100),
    /**
     * Tracker-supplied colour. Rendered only as a small inline dot after
     * `isSafeCssColor`, never as a background: an external string must not be
     * able to repaint a themed surface.
     */
    color: z.string().trim().min(1).max(32).optional(),
  })
  .strict();

const TrackerIssueLinkSchema = z
  .object({
    rel: z.string().trim().min(1).max(32),
    url: httpsUrlSchema,
    key: z.string().trim().min(1).max(64).optional(),
    title: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

const TrackerIssueStatusSchema = z
  .object({
    raw: z.string().trim().min(1).max(80),
    category: z.enum(TRACKER_STATUS_CATEGORIES),
  })
  .strict();

const TrackerIssuePrioritySchema = z
  .object({
    raw: z.string().trim().min(1).max(80).nullable(),
    level: z.enum(TRACKER_PRIORITY_LEVELS),
  })
  .strict();

const TrackerIssueProjectSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    name: z.string().trim().min(1).max(200),
  })
  .strict();

const TrackerIssueTeamSchema = z
  .object({
    key: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(200),
  })
  .strict();

const TrackerIssueSubtasksSchema = z
  .object({
    count: z.number().int().min(0).max(10_000),
    done: z.number().int().min(0).max(10_000),
  })
  .strict();

/**
 * One ticket, normalized across trackers.
 *
 * `ref` is the source's stable handle used for follow-up fetches (`getTask`,
 * kickoff) and `key` is the human identifier. They are frequently the same
 * string, but keeping them separate lets a source key rows on an opaque id
 * without leaking that id into the UI.
 */
export const TrackerIssueSchema = z
  .object({
    source: z.enum(TRACKER_SOURCE_IDS),
    ref: z.string().trim().min(1).max(128),
    key: z.string().trim().min(1).max(64),
    title: z.string().trim().min(1).max(500),
    url: httpsUrlSchema,
    status: TrackerIssueStatusSchema,
    priority: TrackerIssuePrioritySchema,
    assignee: TrackerIssueAssigneeSchema.nullable(),
    labels: z.array(TrackerIssueLabelSchema).max(20),
    dueDate: dueDateSchema.nullable(),
    effort: z.number().int().min(0).max(1_000).nullable(),
    project: TrackerIssueProjectSchema.nullable(),
    team: TrackerIssueTeamSchema.nullable(),
    parentKey: z.string().trim().min(1).max(64).nullable(),
    subtasks: TrackerIssueSubtasksSchema.nullable(),
    issueType: z.string().trim().min(1).max(80).nullable(),
    links: z.array(TrackerIssueLinkSchema).max(8),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    closedAt: timestampSchema.nullable(),
  })
  .strict();

export type TrackerIssue = z.infer<typeof TrackerIssueSchema>;

const TrackerIssueCommentSchema = z
  .object({
    author: z.string().trim().min(1).max(200),
    createdAt: timestampSchema,
    body: z.string().max(4_000),
  })
  .strict();

/**
 * A task plus the body text, fetched only when a row is opened or kicked off.
 *
 * Descriptions are the largest field by far and are useless in a list, so the
 * list endpoint omits them and the cache stores the summary row alone.
 */
export const TrackerIssueDetailSchema = TrackerIssueSchema.extend({
  description: z.string().max(16_000),
  comments: z.array(TrackerIssueCommentSchema).max(20).optional(),
}).strict();

export type TrackerIssueDetail = z.infer<typeof TrackerIssueDetailSchema>;

export const TrackerSourceSyncStatusSchema = z
  .object({
    source: z.enum(TRACKER_SOURCE_IDS),
    availability: z.enum(TRACKER_SOURCE_AVAILABILITIES),
    syncing: z.boolean(),
    lastSyncedAt: timestampSchema.nullable(),
    lastErrorCode: z.string().trim().min(1).max(64).nullable(),
    taskCount: z.number().int().min(0),
    /** Set when the source had more rows than the page budget allowed. */
    truncated: z.boolean(),
  })
  .strict();

export type TrackerSourceSyncStatus = z.infer<
  typeof TrackerSourceSyncStatusSchema
>;

export const TrackerIssuesPublicStatusSchema = z
  .object({
    sources: z.array(TrackerSourceSyncStatusSchema),
  })
  .strict();

export type TrackerIssuesPublicStatus = z.infer<
  typeof TrackerIssuesPublicStatusSchema
>;

/**
 * A Stave run that a ticket produced.
 *
 * A ticket may have several over time (a failed attempt, then a retry), so the
 * renderer receives an array and picks the newest live one for the row badge.
 */
export const TrackerIssueStaveLinkSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    source: z.enum(TRACKER_SOURCE_IDS),
    taskRef: z.string().trim().min(1).max(128),
    taskKey: z.string().trim().min(1).max(64),
    workspaceId: z.string().trim().min(1).max(256),
    staveTaskId: z.string().trim().min(1).max(256).nullable(),
    craneJobId: z.string().trim().min(1).max(128).nullable(),
    state: z.enum(TRACKER_ISSUE_LINK_STATES),
    localTurn: z
      .object({
        id: z.string().min(1).max(256),
        sequence: z.number().int().min(0),
        ended: z.boolean(),
      })
      .strict()
      .optional(),
    errorCode: z.string().trim().min(1).max(64).nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export type TrackerIssueStaveLink = z.infer<typeof TrackerIssueStaveLinkSchema>;

export const TrackerIssueListItemSchema = z
  .object({
    task: TrackerIssueSchema,
    staveLinks: z.array(TrackerIssueStaveLinkSchema).max(20),
  })
  .strict();

export type TrackerIssueListItem = z.infer<typeof TrackerIssueListItemSchema>;

export const TrackerIssuesListArgsSchema = z
  .object({
    source: z.enum(TRACKER_SOURCE_IDS).optional(),
  })
  .strict();

export const TrackerIssuesRefreshArgsSchema = z
  .object({
    source: z.enum(TRACKER_SOURCE_IDS).optional(),
  })
  .strict();

export const TrackerIssueRefArgsSchema = z
  .object({
    source: z.enum(TRACKER_SOURCE_IDS),
    taskRef: z.string().trim().min(1).max(128),
  })
  .strict();

export const TrackerIssuesSurfaceVisibleArgsSchema = z
  .object({
    visible: z.boolean(),
  })
  .strict();

export const TRACKER_ISSUE_START_MODES = ["run", "stage"] as const;
export type TrackerIssueStartMode = (typeof TRACKER_ISSUE_START_MODES)[number];

export const TrackerIssueKickoffArgsSchema = z
  .object({
    source: z.enum(TRACKER_SOURCE_IDS),
    taskRef: z.string().trim().min(1).max(128),
    projectPath: z.string().trim().min(1).max(4_096),
    workspace: CraneDispatchWorkspaceChoiceSchema,
    runtime: CraneDispatchRuntimeChoiceSchema,
    instruction: z.string().trim().min(1).max(4_000),
    startMode: z.enum(TRACKER_ISSUE_START_MODES),
    /**
     * Whether the kickoff should also register a Crane job so the ticket shows
     * "running in Stave". Only meaningful for a Crane ticket that actually
     * starts now: a staged prompt has not run yet, so reporting it as running
     * would be a lie the user cannot undo from Stave.
     */
    craneWriteBack: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.craneWriteBack) {
      return;
    }
    if (value.source !== "crane") {
      context.addIssue({
        code: "custom",
        path: ["craneWriteBack"],
        message: "Write-back is only available for Crane tickets.",
      });
      return;
    }
    if (value.startMode !== "run") {
      context.addIssue({
        code: "custom",
        path: ["craneWriteBack"],
        message: "Write-back requires the run to start now.",
      });
    }
  });

export type TrackerIssueKickoffArgs = z.infer<
  typeof TrackerIssueKickoffArgsSchema
>;

export const TrackerIssueAttachStaveTaskArgsSchema = z
  .object({
    kickoffId: z.string().trim().min(1).max(128),
    taskId: z.string().trim().min(1).max(256),
  })
  .strict();

export const TrackerIssueKickoffResultSchema = z
  .object({
    kickoffId: z.string().trim().min(1).max(128),
    workspaceId: z.string().trim().min(1).max(256),
    taskId: z.string().trim().min(1).max(256).nullable(),
    craneJobId: z.string().trim().min(1).max(128).nullable(),
    /**
     * Present only for `startMode: "stage"`. The renderer owns task creation in
     * that path because staging is a draft in the composer, which lives in the
     * renderer store and has no main-process equivalent.
     */
    staged: z
      .object({
        title: z.string().trim().min(1).max(300),
        prompt: z.string().min(1).max(8_000),
      })
      .strict()
      .nullable(),
  })
  .strict();

export type TrackerIssueKickoffResult = z.infer<
  typeof TrackerIssueKickoffResultSchema
>;

export type TrackerIssuesListArgs = z.infer<typeof TrackerIssuesListArgsSchema>;
export type TrackerIssuesRefreshArgs = z.infer<
  typeof TrackerIssuesRefreshArgsSchema
>;
export type TrackerIssueRefArgs = z.infer<typeof TrackerIssueRefArgsSchema>;
export type TrackerIssuesSurfaceVisibleArgs = z.infer<
  typeof TrackerIssuesSurfaceVisibleArgsSchema
>;
export type TrackerIssueAttachStaveTaskArgs = z.infer<
  typeof TrackerIssueAttachStaveTaskArgsSchema
>;
