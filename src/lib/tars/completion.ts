import { z } from "zod";
import { isTarsPublicationUnfinished } from "./publication";
import type { TarsResponsibility } from "./types";

/** Where the work ends: what the user asked for, or a pull request for work that changes files. Never a grant to publish or merge; missing means ask. */
export const TarsCompletionGoalSchema = z.enum(["design", "implementation", "pullRequest", "merge", "confirmation"]);
export type TarsCompletionGoal = z.infer<typeof TarsCompletionGoalSchema>;

/**
 * A pull request goal has nothing left to do when the work's only run changed
 * no file: there is no change to publish. An earlier run of the same work may
 * have left commits that were never published, and a saved publication is its
 * own state, so either one keeps the goal open.
 */
function nothingToPublish(row: Pick<TarsResponsibility, "completionGoal" | "publication" | "agentRunId"> & Partial<Pick<TarsResponsibility, "unchangedRunId" | "previousRunIds">>) {
  return row.completionGoal === "pullRequest" && Boolean(row.agentRunId) && row.unchangedRunId === row.agentRunId &&
    !row.previousRunIds?.length && !row.publication;
}

/** A verified execution result can finish only the endpoint it actually establishes. */
export function tarsGoalReached(row: Pick<TarsResponsibility, "completionGoal" | "publication" | "agentRunId"> & Partial<Pick<TarsResponsibility, "unchangedRunId" | "previousRunIds">>): boolean {
  return row.completionGoal === "design" || row.completionGoal === "implementation" || nothingToPublish(row) ||
    (row.completionGoal === "pullRequest" || row.completionGoal === "merge" && row.publication?.watch?.stopped === "merged") && row.publication?.state === "opened" &&
      Boolean(row.agentRunId && row.publication.agentRunId === row.agentRunId);
}

/** The next unobserved boundary, not an inferred external-service status. */
export function tarsGoalNext(row: Pick<TarsResponsibility, "state" | "completionGoal" | "publication">) {
  if (row.state === "completed") return "complete";
  if (row.state !== "resultReady") return "execution";
  if (isTarsPublicationUnfinished(row.publication)) return "publishing";
  if (row.publication?.state === "failed") return "publishFailed";
  if (row.completionGoal === "pullRequest") return "publish";
  if (row.completionGoal === "merge") return row.publication?.state === "opened" ? "mergeUnknown" : "publish";
  return "confirm";
}

/** The host and the UI use the same eligibility for accepting a reported completion. */
export function canAcceptTarsCompletion(row: Pick<TarsResponsibility, "state" | "detailCode" | "completionGoal" | "executionPending">) {
  return !row.executionPending && row.completionGoal !== "pullRequest" && row.completionGoal !== "merge" &&
    (row.state === "resultReady" || (row.state === "blocked" && row.detailCode === "unverifiedCompletion"));
}
