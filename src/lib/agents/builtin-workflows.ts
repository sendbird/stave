import type { AgentWorkflow } from "./schema";

/**
 * The workflows of the built-in agents that work in stages. A run of one of
 * these agents follows its stages, reporting each; every other built-in runs
 * as one "Work" stage. Implementer, Researcher, Reviewer and Lead stay single
 * stage on purpose: they plan their own steps inside the work.
 */
export const BUILTIN_AGENT_WORKFLOWS: Readonly<Record<string, AgentWorkflow>> = {
  debugger: [
    {
      id: "reproduce",
      title: "Reproduce",
      kind: "ai",
      instruction: "Reproduce the problem. Record the exact steps, the inputs and what you observed. Change nothing yet.",
      doneWhen: "The steps and the observed behaviour are recorded.",
    },
    {
      id: "cause",
      title: "Cause",
      kind: "ai",
      instruction: "Find the root cause. Show the evidence for it and keep confirmed facts apart from hypotheses.",
      doneWhen: "The root cause is shown with evidence, apart from hypotheses.",
    },
    {
      id: "fix",
      title: "Fix",
      kind: "ai",
      instruction: "Make the smallest change at the cause, then run the reproduction again and the checks that cover it.",
      doneWhen: "The reproduction now passes and the relevant checks pass.",
    },
  ],
  "ui-polisher": [
    {
      id: "reproduce",
      title: "Reproduce",
      kind: "ai",
      instruction: "Open the screen in the rendered app and capture the defect before you edit anything.",
      doneWhen: "The defect is captured in the rendered app.",
    },
    {
      id: "fix",
      title: "Fix",
      kind: "ai",
      instruction: "Fix the defect with the existing components and tokens. Check light and dark themes and a sibling screen that shares the component.",
      doneWhen: "The fix uses existing components and tokens, and both themes and a sibling screen look right.",
    },
    {
      id: "report",
      title: "Report",
      kind: "ai",
      instruction: "Attach before and after screenshots and list what a designer still has to decide.",
      doneWhen: "Before and after screenshots are attached.",
    },
  ],
  shipper: [
    {
      id: "validate",
      title: "Validate",
      kind: "ai",
      instruction: "Read the diff, leave unrelated changes unstaged, run the required checks and commit the scoped change.",
      doneWhen: "The scoped change is committed and the required checks pass locally.",
    },
    { id: "open-draft-pr", title: "Open draft PR", kind: "action", action: { type: "open-draft-pr" } },
    {
      id: "watch-checks",
      title: "Watch checks",
      kind: "action",
      action: { type: "watch-checks", repairAttempts: 2, timeoutMinutes: 30 },
    },
    { id: "ready-for-review", title: "Ready for review", kind: "action", action: { type: "mark-pr-ready" } },
  ],
};
