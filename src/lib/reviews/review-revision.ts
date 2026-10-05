import { z } from "zod";
import { WorkspaceRevisionSchema, revisionsMatch } from "../agent-runs/verification-contract";
import { DelegatedTaskStopArgsSchema, DelegatedTaskExpectedIdentitySchema } from "../runs/delegated-task";

export const ReviewRevisionArgsSchema = DelegatedTaskStopArgsSchema.omit({ reason: true })
  .extend({ expected: DelegatedTaskExpectedIdentitySchema });
export type ReviewRevisionArgs = z.infer<typeof ReviewRevisionArgsSchema>;

export const ReviewRevisionStateSchema = z.object({
  source: WorkspaceRevisionSchema,
  completed: WorkspaceRevisionSchema,
  current: WorkspaceRevisionSchema,
}).strict();
export type ReviewRevisionState = z.infer<typeof ReviewRevisionStateSchema>;

/** Missing or interrupted observations never establish unchanged work. */
export function describeReviewRevision(state: ReviewRevisionState | null) {
  if (!state) return null;
  if (state.source.status !== "known" || state.completed.status !== "known")
    return "The workspace state for this review is unavailable. Run the review again to check the current changes.";
  if (!revisionsMatch(state.source, state.completed))
    return "Code changed while this review was running. Run the review again before relying on its findings.";
  if (state.current.status !== "known")
    return "Current workspace changes could not be checked. This review may refer to earlier code.";
  if (!revisionsMatch(state.completed, state.current))
    return "Code changed since this review. Run again or check the fixes against the current changes.";
  return null;
}

export function reviewRevisionLabel(state: ReviewRevisionState | null) {
  if (!state) return null;
  if (state.source.status !== "known" || state.completed.status !== "known") return "Review state unavailable";
  if (!revisionsMatch(state.source, state.completed)) return "Code changed during review";
  if (state.current.status !== "known") return "Current changes not checked";
  return revisionsMatch(state.completed, state.current) ? null : "Code changed since review";
}
