import { z } from "zod";
import { ResultEvidenceSchema } from "./result-evidence";

const Identity = z.string().trim().min(1).max(1000);
export const ResultReviewScopeSchema = z
  .object({
    repositoryPath: Identity,
    workspaceId: Identity,
    taskId: Identity,
    turnId: Identity,
  })
  .strict();

export const ListResultReviewsArgsSchema = z
  .object({
    workspaceIds: z.array(Identity).max(1000).optional(),
    workspaceId: Identity.optional(),
    taskId: Identity.optional(),
    /** Narrow to one finished run, for loading its evidence on demand. */
    turnId: Identity.optional(),
    pendingOnly: z.boolean().optional(),
    includeEvidence: z.boolean().optional(),
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).max(1_000_000).optional(),
  })
  .strict();

export const SetResultReviewedArgsSchema = ResultReviewScopeSchema.extend({
  reviewed: z.boolean(),
}).strict();

/**
 * The explicit "Mark reviewed" decision from Review. `reviewed` above is the
 * read mark (set by hand or after a dwell); this one is only ever set by the
 * user deciding the result was reviewed.
 */
export const SetResultMarkedReviewedArgsSchema = ResultReviewScopeSchema.extend({
  markedReviewed: z.boolean(),
}).strict();

/**
 * Bulk form of `SetResultReviewedArgs`, used by Fleet's `Clear` action. Clearing
 * a full review queue can touch every pending row the surface paged in, so the
 * write is one transaction and one IPC round trip instead of up to 200.
 */
export const SetResultsReviewedArgsSchema = z
  .object({
    scopes: z.array(ResultReviewScopeSchema).min(1).max(200),
    reviewed: z.boolean(),
  })
  .strict();

export type ListResultReviewsArgs = z.infer<typeof ListResultReviewsArgsSchema>;
export type SetResultReviewedArgs = z.infer<typeof SetResultReviewedArgsSchema>;
export type SetResultMarkedReviewedArgs = z.infer<typeof SetResultMarkedReviewedArgsSchema>;
export type SetResultsReviewedArgs = z.infer<
  typeof SetResultsReviewedArgsSchema
>;
export type ResultReviewScope = z.infer<typeof ResultReviewScopeSchema>;

export const ResultReviewSchema = ResultReviewScopeSchema.extend({
  id: Identity,
  repositoryName: z.string(),
  workspaceName: z.string(),
  taskTitle: z.string(),
  outcome: z.enum(["completed", "failed"]),
  summary: z.string().max(2000),
  createdAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  /** Read: set by hand ("Mark read") or after the result was on screen long enough. */
  reviewedAt: z.string().nullable(),
  /** Reviewed: set only by "Mark reviewed" in Review. Absent from older bridges. */
  markedReviewedAt: z.string().nullable().optional(),
  evidence: ResultEvidenceSchema.optional(),
});
export type ResultReview = z.infer<typeof ResultReviewSchema>;

export interface ResultReviewPage {
  results: ResultReview[];
  total: number;
  hasMore: boolean;
}

export function resultReviewKey(scope: ResultReviewScope) {
  return JSON.stringify([
    scope.repositoryPath,
    scope.workspaceId,
    scope.taskId,
    scope.turnId,
  ]);
}
