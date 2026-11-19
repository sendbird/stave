import type { AgentWorkflow } from "./schema";

/** Shipper's publication workflow uses Stave actions to manage the pull request. */
export const BUILTIN_AGENT_WORKFLOWS: Readonly<Record<string, AgentWorkflow>> = {
  shipper: [
    {
      id: "validate",
      title: "Validate" /* i18n-ignore: model-facing built-in workflow stage name; localized by UI helper */,
      kind: "ai",
      instruction: "Read the diff, leave unrelated changes unstaged, run the required checks and commit the scoped change.",
      doneWhen: "The scoped change is committed and the required checks pass locally.",
    },
    { id: "open-draft-pr", title: "Open draft PR" /* i18n-ignore: model-facing built-in workflow stage name; localized by UI helper */, kind: "action", action: { type: "open-draft-pr" } },
    {
      id: "watch-checks",
      title: "Watch checks" /* i18n-ignore: model-facing built-in workflow stage name; localized by UI helper */,
      kind: "action",
      action: { type: "watch-checks", repairAttempts: 2, timeoutMinutes: 30 },
    },
    { id: "ready-for-review", title: "Ready for review" /* i18n-ignore: model-facing built-in workflow stage name; localized by UI helper */, kind: "action", action: { type: "mark-pr-ready" } },
  ],
};
