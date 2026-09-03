import { z } from "zod";

import {
  assertNoHostControlKeys,
  serializedByteLength,
} from "@/lib/crane-connector/contract";

import {
  TRACKER_PRIORITY_LEVELS,
  TRACKER_STATUS_CATEGORIES,
  type TrackerTask,
  type TrackerTaskDetail,
} from "./types";

/**
 * Wire contract for the Crane task list Stave reads with its connector secret.
 *
 * Versioned separately from `crane-stave-dispatch-v1` because the two surfaces
 * move independently: dispatch is Crane pushing one approved job at Stave, this
 * is Stave pulling the caller's whole work list. A shared version would force a
 * lockstep release neither side needs.
 */
export const CRANE_TASKS_CONTRACT = "crane-tasks-v1" as const;

export const CRANE_TASKS_LIMITS = Object.freeze({
  /** Rows a single page may carry. */
  pageSize: 100,
  /** Serialized budget for a list response. */
  listBytes: 256_000,
  /** Serialized budget for a detail response. */
  detailBytes: 64_000,
  description: 16_000,
  title: 500,
  key: 64,
  id: 128,
  href: 2_048,
  labels: 20,
  /** The server's cap, which is wider than the shared model's own. */
  labelName: 100,
  instruction: 4_000,
});

/**
 * Crane's own status vocabulary. It already matches Stave's normalized
 * categories one-for-one, so the mapper is an identity check rather than a
 * translation table — but it is still written as a mapping so a future Crane
 * status lands in a deliberate bucket instead of failing to parse.
 */
const CRANE_TASK_STATUSES = TRACKER_STATUS_CATEGORIES;
const CRANE_TASK_PRIORITIES = TRACKER_PRIORITY_LEVELS;

/** Fixed relative-effort scale Crane exposes. */
export const CRANE_TASK_ESTIMATES = [1, 2, 3, 5, 8] as const;

/** `TrackerTaskSubtasksSchema`'s bound, which the mapper clamps into. */
const MAX_MODEL_SUBTASKS = 10_000;

const timestampSchema = z.string().max(64).datetime({ offset: true });

/**
 * `new URL` throws on a string it cannot parse, and a `refine` predicate that
 * throws escapes as a `TypeError` instead of becoming a validation failure — so
 * a relative avatar path from the server would crash the parse rather than
 * rejecting one field. Parsing inside a guard keeps every malformed value on the
 * "invalid" path where the caller can handle it.
 */
function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const httpsUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(CRANE_TASKS_LIMITS.href)
  .url()
  .refine(isHttpsUrl, { message: "Crane links must use HTTPS." });

/**
 * A URL-shaped field Stave shows but never needs.
 *
 * An avatar is decoration, so a value the server stores un-normalized (a
 * relative path, an `http` host) must cost the picture and nothing else.
 * Rejecting it would throw away the whole page — every ticket, for one image —
 * which is the wrong trade for a field no decision depends on.
 */
const optionalDecorativeUrlSchema = z
  .string()
  .trim()
  .max(CRANE_TASKS_LIMITS.href)
  .nullish()
  .transform((value) =>
    typeof value === "string" && value.length > 0 && isHttpsUrl(value)
      ? value
      : null,
  );

/**
 * Field widths here mirror the server's, not Stave's own preferences.
 *
 * Anything narrower turns a row the server considers valid into a rejected
 * page — and because the list is a page, one nameless account or one long label
 * would hide every other ticket on it. Where the two sides disagreed, this side
 * widened.
 */
const craneTaskAssigneeSchema = z
  .object({
    id: z.string().trim().min(1).max(CRANE_TASKS_LIMITS.id),
    /** Crane accounts may carry no display name; the mapper falls back. */
    name: z.string().trim().max(200).nullish(),
    email: z.string().trim().max(320).nullish(),
    avatarUrl: optionalDecorativeUrlSchema,
  })
  .strict();

const craneTaskLabelSchema = z
  .object({
    name: z.string().trim().min(1).max(CRANE_TASKS_LIMITS.labelName),
    /**
     * Either one of Crane's semantic tokens or a CSS colour; the renderer
     * decides which, so the wire type stays a bounded string.
     */
    color: z.string().trim().min(1).max(32).nullish(),
  })
  .strict();

const craneJiraIssueSchema = z
  .object({
    issueKey: z.string().trim().min(1).max(CRANE_TASKS_LIMITS.key),
    issueUrl: httpsUrlSchema,
  })
  .strict();

const craneTaskBodySchema = z.object({
  id: z.string().trim().min(1).max(CRANE_TASKS_LIMITS.id),
  number: z.number().int().min(1),
  key: z.string().trim().min(1).max(CRANE_TASKS_LIMITS.key),
  title: z.string().trim().min(1).max(CRANE_TASKS_LIMITS.title),
  status: z.enum(CRANE_TASK_STATUSES),
  priority: z.enum(CRANE_TASK_PRIORITIES),
  teamKey: z.string().trim().min(1).max(64),
  teamName: z.string().trim().min(1).max(200),
  projectId: z.string().trim().min(1).max(CRANE_TASKS_LIMITS.id).nullable(),
  /** The server permits an empty name; the mapper treats it as no project. */
  projectName: z.string().trim().max(200).nullable(),
  assignee: craneTaskAssigneeSchema.nullable(),
  labels: z.array(craneTaskLabelSchema).max(CRANE_TASKS_LIMITS.labels),
  dueDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  estimate: z
    .union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(5),
      z.literal(8),
    ])
    .nullable(),
  parentKey: z.string().trim().min(1).max(CRANE_TASKS_LIMITS.key).nullable(),
  /**
   * Uncapped on the wire because the server does not cap it. The shared model
   * keeps its own bound, which the mapper clamps to: a bound exists to protect
   * the renderer, and enforcing it here would instead discard the page.
   */
  subtaskCount: z.number().int().min(0),
  subtaskDoneCount: z.number().int().min(0),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  closedAt: timestampSchema.nullable(),
  jiraIssue: craneJiraIssueSchema.nullable(),
  href: httpsUrlSchema,
});

function assertSubtaskCountsAgree(
  value: { subtaskCount: number; subtaskDoneCount: number },
  context: z.RefinementCtx,
) {
  if (value.subtaskDoneCount > value.subtaskCount) {
    context.addIssue({
      code: "custom",
      path: ["subtaskDoneCount"],
      message: "Completed subtasks cannot exceed the subtask count.",
    });
  }
}

/**
 * A list row.
 *
 * Unknown properties are stripped rather than rejected, matching
 * `CraneStaveJobV1Schema`: a field Crane adds must not break an older Stave,
 * and a field Stave expects but Crane has not shipped yet is a parse failure
 * either way. The real boundary is the host-control denylist, which runs
 * against the payload as received, before stripping.
 */
export const CraneTaskV1Schema = z
  .unknown()
  .superRefine((value, context) => {
    assertNoHostControlKeys(value, context);
  })
  .pipe(craneTaskBodySchema)
  .superRefine(assertSubtaskCountsAgree);

export type CraneTaskV1 = z.infer<typeof CraneTaskV1Schema>;

export const CraneTaskDetailV1Schema = z
  .unknown()
  .superRefine((value, context) => {
    assertNoHostControlKeys(value, context);
  })
  .pipe(
    craneTaskBodySchema.extend({
      description: z.string().max(CRANE_TASKS_LIMITS.description),
    }),
  )
  .superRefine(assertSubtaskCountsAgree);

export type CraneTaskDetailV1 = z.infer<typeof CraneTaskDetailV1Schema>;

export const CraneTaskListResponseV1Schema = z
  .object({
    contract: z.literal(CRANE_TASKS_CONTRACT),
    tasks: z.array(CraneTaskV1Schema).max(CRANE_TASKS_LIMITS.pageSize),
    nextCursor: z.string().trim().min(1).max(512).nullable(),
    generatedAt: timestampSchema,
  })
  .superRefine((value, context) => {
    if (serializedByteLength(value) > CRANE_TASKS_LIMITS.listBytes) {
      context.addIssue({
        code: "custom",
        message: "Crane task list exceeds the size budget.",
      });
    }
  });

export type CraneTaskListResponseV1 = z.infer<
  typeof CraneTaskListResponseV1Schema
>;

export const CraneTaskDetailResponseV1Schema = z
  .object({
    contract: z.literal(CRANE_TASKS_CONTRACT),
    task: CraneTaskDetailV1Schema,
  })
  .superRefine((value, context) => {
    if (serializedByteLength(value) > CRANE_TASKS_LIMITS.detailBytes) {
      context.addIssue({
        code: "custom",
        message: "Crane task detail exceeds the size budget.",
      });
    }
  });

export type CraneTaskDetailResponseV1 = z.infer<
  typeof CraneTaskDetailResponseV1Schema
>;

/**
 * Body Stave sends when it starts a run from a Crane ticket.
 *
 * The instruction is the locally edited text the user approved, not the ticket
 * body: Crane records what was actually asked so the receipt trail matches the
 * run.
 */
export const CraneTaskJobClaimRequestV1Schema = z
  .object({
    protocolVersion: z.literal(1),
    instruction: z.string().trim().min(1).max(CRANE_TASKS_LIMITS.instruction),
  })
  .strict();

export type CraneTaskJobClaimRequestV1 = z.infer<
  typeof CraneTaskJobClaimRequestV1Schema
>;

export function parseCraneTaskListResponseV1(value: unknown) {
  return CraneTaskListResponseV1Schema.safeParse(value);
}

export function parseCraneTaskDetailResponseV1(value: unknown) {
  return CraneTaskDetailResponseV1Schema.safeParse(value);
}

function toTrackerLinks(row: Pick<CraneTaskV1, "jiraIssue">) {
  return row.jiraIssue
    ? [
        {
          rel: "jira",
          url: row.jiraIssue.issueUrl,
          key: row.jiraIssue.issueKey,
        },
      ]
    : [];
}

/**
 * The name to show for an account the server did not name.
 *
 * Degrades along what a person can still recognise — display name, then email,
 * then the opaque id — rather than inventing a label or dropping the assignee.
 * The shared model requires a non-empty name, and an unassigned ticket already
 * means something different, so neither an empty string nor `null` is available
 * here.
 */
function resolveAssigneeName(assignee: {
  id: string;
  name?: string | null;
  email?: string | null;
}): string {
  return (
    assignee.name?.trim() || assignee.email?.trim() || assignee.id.trim()
  ).slice(0, 200);
}

function toTrackerAssignee(row: Pick<CraneTaskV1, "assignee">) {
  if (!row.assignee) {
    return null;
  }
  return {
    id: row.assignee.id,
    name: resolveAssigneeName(row.assignee),
    ...(row.assignee.email ? { email: row.assignee.email } : {}),
    ...(row.assignee.avatarUrl ? { avatarUrl: row.assignee.avatarUrl } : {}),
  };
}

function toTrackerLabels(row: Pick<CraneTaskV1, "labels">) {
  return row.labels.map((label) => ({
    name: label.name,
    ...(label.color ? { color: label.color } : {}),
  }));
}

/**
 * Wire row to the shared model.
 *
 * `ref` is the issue key rather than the opaque id: Crane's routes accept both,
 * and a key survives being written into a cache row a human may have to read.
 */
export function toTrackerTaskFromCrane(row: CraneTaskV1): TrackerTask {
  return {
    source: "crane",
    ref: row.key,
    key: row.key,
    title: row.title,
    url: row.href,
    status: { raw: row.status, category: row.status },
    priority: { raw: row.priority, level: row.priority },
    assignee: toTrackerAssignee(row),
    labels: toTrackerLabels(row),
    dueDate: row.dueDate,
    effort: row.estimate,
    project:
      row.projectId && row.projectName
        ? { id: row.projectId, name: row.projectName }
        : null,
    team: { key: row.teamKey, name: row.teamName },
    parentKey: row.parentKey,
    subtasks:
      row.subtaskCount > 0
        ? {
            // Clamped, not rejected: the bound belongs to the renderer, and a
            // ticket with an absurd subtask count is still a ticket the user
            // needs to see.
            count: Math.min(row.subtaskCount, MAX_MODEL_SUBTASKS),
            done: Math.min(row.subtaskDoneCount, MAX_MODEL_SUBTASKS),
          }
        : null,
    issueType: null,
    links: toTrackerLinks(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    closedAt: row.closedAt,
  };
}

export function toTrackerTaskDetailFromCrane(
  row: CraneTaskDetailV1,
): TrackerTaskDetail {
  return {
    ...toTrackerTaskFromCrane(row),
    description: row.description,
  };
}
