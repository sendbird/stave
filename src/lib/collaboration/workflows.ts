/** Small, editable starters: instructions do not execute until the user sends. */
export const WORKFLOW_STARTERS = [
  {
    id: "research",
    label: "Research a question",
    description: "Compare sources, identify uncertainty, and keep evidence with your work.",
    prompt: "Research this question: [question and decision to inform].\nUse relevant workspace context and primary sources. Record source links and dates, separate findings from assumptions, explain conflicting evidence, and give a practical recommendation. Keep the confirmed decision and next steps in workspace Information.",
  },
  {
    id: "document",
    label: "Draft a decision document",
    description: "Turn notes and evidence into a clear proposal for a specific audience.",
    prompt: "Prepare this document: [audience, purpose, and expected format].\nUse the available notes and evidence. State the problem, options, tradeoffs, proposed decision, and concrete next actions. Identify missing evidence and claims that need verification. Save the artifact in the workspace and report where it can be reviewed.",
  },
  {
    id: "investigate",
    label: "Investigate a problem",
    description:
      "Reproduce, gather evidence, and explain the cause before changing code.",
    prompt:
      "Investigate this problem: [describe the problem].\nReproduce it, inspect the relevant code and prior decisions, and distinguish confirmed facts from hypotheses. Explain the cause and propose the smallest safe fix with a validation plan.",
  },
  {
    id: "deliver",
    label: "Plan, build, and verify",
    description:
      "Turn an outcome into bounded implementation and an evidence-backed report.",
    prompt:
      "Deliver this outcome: [describe the outcome and constraints].\nInspect the existing architecture, define completion checks, implement the change, and verify the affected behavior. Keep decisions and remaining work in the workspace Information panel. Finish with results, validation evidence, and unresolved risks.",
  },
  {
    id: "collaborate",
    label: "Coordinate independent tasks",
    description:
      "Delegate bounded work, collect results, and reconcile decisions.",
    prompt:
      "Coordinate this work: [describe the outcome].\nIdentify independent assignments with explicit ownership and completion checks. Use durable child tasks for cross-provider work and separate worktrees for independent file edits. Set each task's provider and permissions explicitly. Inspect child status, read their results using the available task tools, reconcile conflicting findings, and verify the integrated outcome. Report assignments, evidence, unresolved questions, and next steps. Do not treat a completed run as verified work.",
  },
  {
    id: "review",
    label: "Request an independent review",
    description:
      "Check correctness, failure recovery, accessibility, and actual evidence.",
    prompt:
      "Review the current work against its original goal and completion checks. Inspect correctness, failure and restart behavior, performance-sensitive paths, and accessibility. Use an advisor for an independent assessment when configured. Report actionable findings with evidence and severity, distinguish untested claims, and verify any fixes.",
  },
] as const;

export function appendWorkflowDraft(
  current: string,
  instruction: string,
): string {
  return current.trim()
    ? `${current.trimEnd()}\n\n${instruction}`
    : instruction;
}
