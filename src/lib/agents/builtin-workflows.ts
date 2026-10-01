/**
 * The workflow each built-in agent recommends: its ordered stages, each with
 * the condition that makes the stage done. Data only. The Workflow feature
 * reads this to offer a starting point; an agent's saved config has no
 * workflow field and nothing here changes how an agent runs today.
 */

export interface BuiltinWorkflowStage {
  title: string;
  /** What must be true before the stage counts as finished. */
  doneWhen: string;
}

export const BUILTIN_AGENT_WORKFLOW_IDS = [
  "implementer",
  "lead",
  "debugger",
  "ui-polisher",
  "reviewer",
  "researcher",
  "shipper",
] as const;
export type BuiltinWorkflowAgentId = (typeof BUILTIN_AGENT_WORKFLOW_IDS)[number];

export const BUILTIN_AGENT_WORKFLOWS: Readonly<Record<BuiltinWorkflowAgentId, readonly BuiltinWorkflowStage[]>> = {
  implementer: [
    { title: "Understand", doneWhen: "The change is scoped and the code it touches is read." },
    { title: "Change", doneWhen: "The change follows the surrounding code and stays in scope." },
    { title: "Verify", doneWhen: "The relevant tests, typecheck and build pass." },
    { title: "Commit", doneWhen: "The verified work is committed and the report lists what is left." },
  ],
  lead: [
    { title: "Plan", doneWhen: "Acceptance criteria are written for the whole goal." },
    { title: "Delegate", doneWhen: "Each part has an agent, a scope and the commit to review." },
    { title: "Verify", doneWhen: "Every report is checked against the real diff and checks." },
    { title: "Report", doneWhen: "Outcome, evidence and remaining risks are stated." },
  ],
  debugger: [
    { title: "Reproduce", doneWhen: "The steps and the observed behaviour are recorded." },
    { title: "Cause", doneWhen: "The root cause is shown with evidence, apart from hypotheses." },
    { title: "Fix", doneWhen: "The smallest change at the cause is made." },
    { title: "Verify", doneWhen: "The reproduction now passes." },
  ],
  "ui-polisher": [
    { title: "Reproduce", doneWhen: "The defect is captured in the rendered app." },
    { title: "Fix", doneWhen: "The fix uses existing components and tokens." },
    { title: "Verify", doneWhen: "Light and dark themes and a sibling screen look right." },
    { title: "Report", doneWhen: "Before and after screenshots are attached." },
  ],
  reviewer: [
    { title: "Pin", doneWhen: "The workspace is at the commit to review." },
    { title: "Review", doneWhen: "The change is read in context and existing behaviour is checked." },
    { title: "Report", doneWhen: "Findings are listed with file, line, severity and a failure scenario." },
  ],
  researcher: [
    { title: "Question", doneWhen: "The question and what counts as an answer are clear." },
    { title: "Search", doneWhen: "The relevant code and documents are read." },
    { title: "Conclude", doneWhen: "The answer comes first, each claim has a source and unknowns are named." },
  ],
  shipper: [
    { title: "Scope", doneWhen: "The diff is understood and unrelated changes are left out." },
    { title: "Validate", doneWhen: "The required checks pass locally." },
    { title: "Publish", doneWhen: "The pull request is open and auto-merge is queued." },
    { title: "CI", doneWhen: "All required checks are finished and failures are fixed or reported." },
  ],
};
