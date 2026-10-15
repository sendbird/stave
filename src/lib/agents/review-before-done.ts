/**
 * "Review before done": a run of an agent that edits files and has no
 * workflow of its own ends with a Reviewer stage and a fix stage, so a change
 * is checked by an agent that did not write it before the run reports done.
 * It is one Agent setting, not a workflow the user has to assemble:
 * `buildAgentRunWorkflow` (`src/lib/agent-runs/agent-run.ts`) composes the
 * three stages when the run starts.
 */
import type { AgentConfig, ReviewBeforeDone } from "./schema";
import type { WorkflowStage } from "@/lib/workflows/schema";

/** The built-in agent the review stage runs as (`starters.ts`). */
export const REVIEW_AGENT_ID = "reviewer";
export const REVIEW_STAGE_ID = "review";
export const FIX_REVIEW_STAGE_ID = "fix-review";

/**
 * What a run of this agent does before it is done. A workflow of the agent's
 * own decides its stages, and a read-only agent has nothing to review; the
 * rest default to reviewing changes that alter behavior.
 */
export function resolveReviewBeforeDone(
  agent: Partial<Pick<AgentConfig, "permission" | "workflow" | "reviewBeforeDone">>,
): ReviewBeforeDone {
  if (!offersReviewBeforeDone(agent)) return "off";
  return agent.reviewBeforeDone ?? "behavior-changes";
}

/**
 * Whether the setting applies: an agent that edits files and has no workflow.
 * A run that names no permission (a bare agent name) is not a saved agent's run.
 */
export function offersReviewBeforeDone(agent: Partial<Pick<AgentConfig, "permission" | "workflow">>): boolean {
  return !agent.workflow?.length && agent.permission !== undefined && agent.permission !== "read-only";
}

// Model-facing stage text; the stage titles are localized for display by `stage-display.ts`.
const COMMIT_FOR_REVIEW = "When the change is verified, commit it before you report the stage, and name in your report the commit the work started from: a Reviewer reviews every commit since then next.";

/** The two stages that follow the work stage. */
export function reviewStages(mode: Exclude<ReviewBeforeDone, "off">): WorkflowStage[] {
  return [
    {
      id: REVIEW_STAGE_ID,
      title: "Review", // i18n-ignore: canonical stage title, localized by stage-display.ts
      kind: "ai",
      agentConfigId: REVIEW_AGENT_ID,
      pinCommit: true,
      instruction: [
        "Review every commit the previous stage made, from the commit it started from (its report names it) to the pinned commit, against the assignment, without changing any file.",
        mode === "behavior-changes"
          ? "If those commits change only wording, formatting or comments, say so and report the review complete with no findings."
          : "",
        "For each defect give the file, the line, the reason and a failure scenario.",
      ].filter(Boolean).join(" "),
      doneWhen: "The review lists each defect with file, line and reason, or says it found none.",
    },
    {
      id: FIX_REVIEW_STAGE_ID,
      title: "Fix review findings", // i18n-ignore: canonical stage title, localized by stage-display.ts
      kind: "ai",
      instruction: "Fix each defect the review found at its cause, verify the fix the way you verified the work, and commit it. If the review found none, report the stage complete without changing anything.",
      doneWhen: "Every defect the review found is fixed and verified, or the review found none.",
    },
  ];
}

/** The work stage's instruction when a review follows it. */
export function withCommitForReview(instruction: string): string {
  return `${instruction} ${COMMIT_FOR_REVIEW}`;
}
