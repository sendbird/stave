import { z } from "zod";
import { isTarsPublicationUnfinished } from "./publication";
import type { TarsResponsibility } from "./types";

/** The user's requested endpoint, never a grant to publish or merge. Missing means ask. */
export const TarsCompletionGoalSchema = z.enum(["design", "implementation", "pullRequest", "merge", "confirmation"]);
export type TarsCompletionGoal = z.infer<typeof TarsCompletionGoalSchema>;

/** A verified execution result can finish only the endpoint it actually establishes. */
export function tarsGoalReached(row: Pick<TarsResponsibility, "completionGoal" | "publication" | "agentRunId">): boolean {
  return row.completionGoal === "design" || row.completionGoal === "implementation" ||
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
