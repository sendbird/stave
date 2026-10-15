import { describe, expect, test } from "bun:test";
import { getBuiltinAgent } from "@/lib/agents/starters";
import { exportAgentFile } from "@/lib/agents/export";
import { REVIEW_AGENT_ID, resolveReviewBeforeDone } from "@/lib/agents/review-before-done";
import { buildAgentRunWorkflow } from "@/lib/agent-runs/agent-run";
import { buildDelegatedAgentRunInput } from "@/lib/agent-runs/delegated-run";
import { agentCallableIds } from "@/lib/agents/delegate";
import { getStageDisplayTitle } from "@/lib/agent-runs/stage-display";
import { WorkflowSchema } from "@/lib/workflows/schema";

const now = new Date("2026-10-15T00:00:00.000Z");
const implementer = () => getBuiltinAgent("implementer")!;

describe("review before done", () => {
  test("an agent that edits files reviews behavior changes by default; read-only agents, workflows, Lead and bare names do not", () => {
    expect(resolveReviewBeforeDone(implementer())).toBe("behavior-changes");
    expect(resolveReviewBeforeDone({ ...implementer(), reviewBeforeDone: "always" })).toBe("always");
    expect(resolveReviewBeforeDone({ ...implementer(), reviewBeforeDone: "off" })).toBe("off");
    expect(resolveReviewBeforeDone(getBuiltinAgent(REVIEW_AGENT_ID)!)).toBe("off");
    expect(resolveReviewBeforeDone(getBuiltinAgent("lead")!)).toBe("off");
    expect(resolveReviewBeforeDone(getBuiltinAgent("debugger")!)).toBe("off");
    expect(resolveReviewBeforeDone({ permission: undefined })).toBe("off");
  });

  test("a run of such an agent commits its work, then the Reviewer reviews that commit and the agent fixes what it found", () => {
    const workflow = buildAgentRunWorkflow({ agent: implementer(), doneWhen: "The export works.", now });
    expect(WorkflowSchema.safeParse(workflow).success).toBe(true);
    expect(workflow.stages.map((stage) => stage.id)).toEqual(["work", "review", "fix-review"]);
    const [work, review, fix] = workflow.stages;
    expect(work).toMatchObject({ kind: "ai", doneWhen: "The export works." });
    expect(work?.kind === "ai" ? work.instruction : "").toContain("commit it before you report the stage");
    expect(review).toMatchObject({ kind: "ai", agentConfigId: REVIEW_AGENT_ID, pinCommit: true });
    expect(review?.kind === "ai" ? review.instruction : "").toContain("only wording, formatting or comments");
    expect(fix?.kind === "ai" ? fix.instruction : "").toContain("If the review found none");
    expect(getStageDisplayTitle(review!)).toBe("Review");
    expect(getStageDisplayTitle(fix!)).toBe("Fix review findings");
    const always = buildAgentRunWorkflow({ agent: { ...implementer(), reviewBeforeDone: "always" }, now });
    expect(always.stages[1]?.kind === "ai" ? always.stages[1].instruction : "").not.toContain("only wording");
  });

  test("off, a workflow of the agent's own, or a helper run keeps the run as it was", () => {
    const off = buildAgentRunWorkflow({ agent: { ...implementer(), reviewBeforeDone: "off" }, now });
    expect(off.stages.map((stage) => stage.id)).toEqual(["work"]);
    expect(off.stages[0]?.kind === "ai" ? off.stages[0].instruction : "").not.toContain("commit");
    expect(buildAgentRunWorkflow({ agent: getBuiltinAgent("debugger")!, now }).stages.map((stage) => stage.id)).not.toContain("review");
    const helper = buildDelegatedAgentRunInput({ agent: implementer(), now, start: {
      agentRunId: "run-child", workspaceId: "ws", taskId: "child", title: "Fix", prompt: "Fix the export.", maxTurns: 10, model: "sonnet",
      authority: { parentTaskId: "parent", executionId: "exec", agentConfigId: "implementer", agentContentHash: "hash",
        permissionPolicy: { providerId: "claude-code", profile: "auto", source: "agent" } },
    } as never });
    expect(helper.workflow.stages.map((stage) => stage.id)).toEqual(["work"]);
  });

  test("an agent whose runs end with a review may call the Reviewer even when its Can call list leaves it out", () => {
    expect(agentCallableIds({ ...implementer(), canCall: [] })).toEqual([REVIEW_AGENT_ID]);
    expect(agentCallableIds({ ...implementer(), canCall: [], reviewBeforeDone: "off" })).toEqual([]);
    expect(agentCallableIds({ ...implementer(), canCall: [], permission: "read-only" })).toEqual([]);
    expect(agentCallableIds({ ...implementer(), canCall: undefined })).toBeNull();
  });

  test("Run again of a one-stage run stays one stage; the review it ran is carried in its stages", () => {
    // What Run again passes for a run that was one Work stage (`useAgentRunActions.ts`).
    const again = buildAgentRunWorkflow({ agent: { name: "Implementer", permission: "manual", reviewBeforeDone: "off" }, now });
    expect(again.stages.map((stage) => stage.id)).toEqual(["work"]);
    const composed = buildAgentRunWorkflow({ agent: implementer(), now });
    const rerun = buildAgentRunWorkflow({ agent: { name: "Implementer", permission: "auto", workflow: composed.stages }, now });
    expect(rerun.stages.map((stage) => stage.id)).toEqual(["work", "review", "fix-review"]);
  });

  test("an exported agent file lists a set review choice among the fields left out", () => {
    expect(exportAgentFile({ ...implementer(), reviewBeforeDone: "always" }, "claude-md").leftOut).toContain("reviewBeforeDone");
    expect(exportAgentFile(implementer(), "claude-md").leftOut).not.toContain("reviewBeforeDone");
  });
});
