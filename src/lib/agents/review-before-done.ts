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
const COMMIT_FOR_REVIEW = "If this assignment changes repository files, verify and commit only its changes, then name the actual starting commit and the resulting commits in your report. For research or an answer, identify the conclusions, sources and artifacts to review; do not create an empty commit. A Reviewer checks the assignment's result next.";

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
        "Independently review the previous stage's result against the assignment without changing files. For code, review every commit the stage made from its actual starting commit to the pinned commit; exclude unrelated work. For research or answers, verify conclusions, sources and artifacts. An empty commit range is not evidence that a non-code result is correct.",
        mode === "behavior-changes"
          ? "If code commits change only wording, formatting or comments, a brief correctness check is enough; still verify requested research or conclusions."
          : "",
        "For each defect give its location, reason and failure scenario. Report reviewVerdict as passed only after the independent review completed with no unresolved findings, otherwise changes-requested. If the review could not run, block instead.",
      ].filter(Boolean).join(" "),
      doneWhen: "The review lists each defect with file, line and reason, or says it found none.",
    },
    {
      id: FIX_REVIEW_STAGE_ID,
      title: "Fix review findings", // i18n-ignore: canonical stage title, localized by stage-display.ts
      kind: "ai",
      skipIfReviewPassed: true,
      instruction: "Fix each defect the review found at its cause, verify the fix the way you verified the work, and commit it. If the review found none, report the stage complete without changing anything.",
      doneWhen: "Every defect the review found is fixed and verified, or the review found none.",
    },
  ];
}

/** The work stage's instruction when a review follows it. */
export function withCommitForReview(instruction: string): string {
  return `${instruction} ${COMMIT_FOR_REVIEW}`;
}
