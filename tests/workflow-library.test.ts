import { describe, expect, test } from "bun:test";
import {
  applyCheckIns,
  createActionStage,
  explainActionUnavailable,
  moveStage,
  setStageSignOff,
  stageAsksFirst,
  uniqueStageId,
} from "../src/lib/workflows/library";
import { parseWorkflow } from "../src/lib/workflows/normalize";
import { starterWorkflow } from "./fixtures/agent-run-fixtures";

describe("workflow stage editing", () => {
  test("stage ids are unique slugs of their titles", () => {
    expect(uniqueStageId("Open draft PR", [])).toBe("open-draft-pr");
    expect(uniqueStageId("Build", ["build", "build-2"])).toBe("build-3");
    expect(uniqueStageId("¿?", [])).toBe("stage");
  });

  test("a long stage title never leaves a dash at the end of its id", () => {
    const id = uniqueStageId("Summarize the findings for the product team in a short note", []);
    expect(id).toBe("summarize-the-findings-for-the-product-team");
    const workflow = starterWorkflow("request-to-pr");
    const stages = [{ ...workflow.stages[0]!, id }, ...workflow.stages.slice(1)];
    expect(parseWorkflow({ ...workflow, stages }).ok).toBe(true);
    expect(uniqueStageId("Summarize the findings for the product team in a short note", [id])).toBe(`${id}-2`);
  });

  test("a sign-off toggle that matches the preset stays on the preset; a preset clears overrides", () => {
    const workflow = starterWorkflow("request-to-pr");
    const verify = workflow.stages.findIndex((stage) => stage.id === "verify");
    expect(stageAsksFirst(workflow, verify)).toBe(false);
    const asked = setStageSignOff(workflow, verify, "ask");
    expect(asked.stages[verify]!.signOff).toBe("ask");
    expect(stageAsksFirst(asked, verify)).toBe(true);
    expect(setStageSignOff(asked, verify, "auto").stages[verify]!.signOff).toBeUndefined();
    expect(applyCheckIns(asked, "plan-and-publishing").stages.some((stage) => stage.signOff)).toBe(false);
  });

  test("moving stages and adding actions respect the workflow's rules", () => {
    const workflow = starterWorkflow("request-to-pr");
    const moved = moveStage(workflow.stages, 0, 2);
    expect(moved.map((stage) => stage.id).slice(0, 3)).toEqual(["build", "verify", "understand"]);
    expect(explainActionUnavailable(workflow, "open-draft-pr")).toBe('The workflow already has "Open draft PR".');
    const withoutPr = { stages: workflow.stages.filter((stage) => stage.kind === "ai") };
    expect(explainActionUnavailable(withoutPr, "open-draft-pr")).toBeNull();
    expect(createActionStage("watch-checks", ["watch-checks"])).toMatchObject({
      id: "watch-checks-2",
      action: { type: "watch-checks", repairAttempts: 2, timeoutMinutes: 30 },
    });
  });
});
