import { z } from "zod";
import { ResultEvidenceSchema } from "./result-evidence";

const Identity = z.string().trim().min(1).max(1000);
export const ResultReviewScopeSchema = z
  .object({
    projectPath: Identity,
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
    pendingOnly: z.boolean().optional(),
    includeEvidence: z.boolean().optional(),
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).max(1_000_000).optional(),
  })
  .strict();

export const SetResultReviewedArgsSchema = ResultReviewScopeSchema.extend({
  reviewed: z.boolean(),
}).strict();

export type ListResultReviewsArgs = z.infer<typeof ListResultReviewsArgsSchema>;
export type SetResultReviewedArgs = z.infer<typeof SetResultReviewedArgsSchema>;
export type ResultReviewScope = z.infer<typeof ResultReviewScopeSchema>;

export const ResultReviewSchema = ResultReviewScopeSchema.extend({
  id: Identity,
  projectName: z.string(),
  workspaceName: z.string(),
  taskTitle: z.string(),
  outcome: z.enum(["completed", "failed"]),
  summary: z.string().max(2000),
  createdAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  reviewedAt: z.string().nullable(),
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
    scope.projectPath,
    scope.workspaceId,
    scope.taskId,
    scope.turnId,
  ]);
}
