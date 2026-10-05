import { i18n } from "@/i18n/runtime";
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
    return i18n.t("sourceControl:reviewRevision.theWorkspaceStateForThisReviewIs");
  if (!revisionsMatch(state.source, state.completed))
    return i18n.t("sourceControl:reviewRevision.codeChangedWhileThisReviewWasRunning");
  if (state.current.status !== "known")
    return i18n.t("sourceControl:reviewRevision.currentWorkspaceChangesCouldNotBeChecked");
  if (!revisionsMatch(state.completed, state.current))
    return i18n.t("sourceControl:reviewRevision.codeChangedSinceThisReviewRunAgain");
  return null;
}

export function reviewRevisionLabel(state: ReviewRevisionState | null) {
  if (!state) return null;
  if (state.source.status !== "known" || state.completed.status !== "known") return i18n.t("sourceControl:reviewRevision.reviewStateUnavailable");
  if (!revisionsMatch(state.source, state.completed)) return i18n.t("sourceControl:reviewRevision.codeChangedDuringReview");
  if (state.current.status !== "known") return i18n.t("sourceControl:reviewRevision.currentChangesNotChecked");
  return revisionsMatch(state.completed, state.current) ? null : i18n.t("sourceControl:reviewRevision.codeChangedSinceReview");
}
