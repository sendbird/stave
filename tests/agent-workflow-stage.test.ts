import { describe, expect, test } from "bun:test";
import { compileStagePrompt } from "@/lib/workflows/stage-prompt";
import { WorkflowSchema, type Workflow } from "@/lib/workflows/schema";
import { createWorkflowFromStarter, findWorkflowStarter } from "@/dev/fixtures/legacy-workflow-starters";

const NOW = new Date("2026-09-29T09:00:00.000Z");

/** A solo workflow whose review stage is done by another agent. */
function withReviewer(pinCommit: boolean): Workflow {
  const base = createWorkflowFromStarter(findWorkflowStarter("slack-request-to-pr")!, { now: NOW, id: "workflow_review" });
  const index = base.stages.findIndex((stage) => stage.kind === "ai" && stage.role !== "plan" && stage.role !== "publish");
  const stages = base.stages.map((stage, position) =>
    position === index && stage.kind === "ai" ? { ...stage, agentConfigId: "reviewer", ...(pinCommit ? { pinCommit: true } : {}) } : stage,
  );
  return WorkflowSchema.parse({ ...base, team: "solo", stages });
}

function prompt(workflow: Workflow) {
  const index = workflow.stages.findIndex((stage) => stage.kind === "ai" && stage.agentConfigId);
  return compileStagePrompt({
    workflow,
    stageIndex: index,
    assignment: "Review the export change.",
    priorStages: [],
    acceptanceCriteria: [],
    attempt: 1,
    agentNames: { reviewer: "Reviewer" },
  });
}

describe("a stage another agent does", () => {
  test("the lead task delegates it as that agent and reports its result, even in a solo workflow", () => {
    const text = prompt(withReviewer(false));
    expect(text).toContain('delegate it to the "Reviewer" agent with `stave_delegate_task`');
    expect(text).toContain('agentConfigId: "reviewer"');
    expect(text).toContain("Do not do the stage's work yourself");
    expect(text).not.toContain("Do not start workers or delegated tasks");
    expect(text).not.toContain("expectedHead");
  });

  test("a pinned stage passes the commit and forbids changes until the review ends", () => {
    const text = prompt(withReviewer(true));
    expect(text).toContain("`expectedHead` set to the commit `git rev-parse HEAD` prints now");
    expect(text).toContain('workspace: { mode: "same-workspace" }');
  });

  test("the lead task keeps its own provider and instructions: nothing in the stage changes them", () => {
    // Boundary 16: a stage names an agent id and a pin, never a provider or model.
    const stage = withReviewer(true).stages.find((candidate) => candidate.kind === "ai" && candidate.agentConfigId)!;
    expect(stage).not.toHaveProperty("providerId");
    expect(stage).not.toHaveProperty("model");
    // A workflow without agents compiles exactly as before.
    const plain = createWorkflowFromStarter(findWorkflowStarter("slack-request-to-pr")!, { now: NOW, id: "p" });
    const ai = plain.stages.findIndex((candidate) => candidate.kind === "ai");
    const input = { workflow: plain, stageIndex: ai, assignment: "x", priorStages: [], acceptanceCriteria: [], attempt: 1 };
    expect(compileStagePrompt({ ...input, agentNames: { reviewer: "Reviewer" } })).toBe(compileStagePrompt(input));
  });

  test("a stage with an unknown field or a provider is refused by the schema", () => {
    const workflow = withReviewer(false);
    const stages = workflow.stages.map((stage) => (stage.kind === "ai" && stage.agentConfigId ? { ...stage, providerId: "codex" } : stage));
    expect(WorkflowSchema.safeParse({ ...workflow, stages }).success).toBe(false);
  });
});
