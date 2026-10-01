import { describe, expect, test } from "bun:test";
import {
  applyCheckIns,
  createActionStage,
  explainActionUnavailable,
  moveStage,
  setStageSignOff,
  stageAsksFirst,
  uniqueStageId,
} from "../src/lib/playbooks/library";
import { parsePlaybook } from "../src/lib/playbooks/normalize";
import { starterPlaybook } from "./fixtures/mission-fixtures";

describe("workflow stage editing", () => {
  test("stage ids are unique slugs of their titles", () => {
    expect(uniqueStageId("Open draft PR", [])).toBe("open-draft-pr");
    expect(uniqueStageId("Build", ["build", "build-2"])).toBe("build-3");
    expect(uniqueStageId("¿?", [])).toBe("stage");
  });

  test("a long stage title never leaves a dash at the end of its id", () => {
    const id = uniqueStageId("Summarize the findings for the product team in a short note", []);
    expect(id).toBe("summarize-the-findings-for-the-product-team");
    const playbook = starterPlaybook("request-to-pr");
    const stages = [{ ...playbook.stages[0]!, id }, ...playbook.stages.slice(1)];
    expect(parsePlaybook({ ...playbook, stages }).ok).toBe(true);
    expect(uniqueStageId("Summarize the findings for the product team in a short note", [id])).toBe(`${id}-2`);
  });

  test("a sign-off toggle that matches the preset stays on the preset; a preset clears overrides", () => {
    const playbook = starterPlaybook("request-to-pr");
    const verify = playbook.stages.findIndex((stage) => stage.id === "verify");
    expect(stageAsksFirst(playbook, verify)).toBe(false);
    const asked = setStageSignOff(playbook, verify, "ask");
    expect(asked.stages[verify]!.signOff).toBe("ask");
    expect(stageAsksFirst(asked, verify)).toBe(true);
    expect(setStageSignOff(asked, verify, "auto").stages[verify]!.signOff).toBeUndefined();
    expect(applyCheckIns(asked, "plan-and-publishing").stages.some((stage) => stage.signOff)).toBe(false);
  });

  test("moving stages and adding actions respect the workflow's rules", () => {
    const playbook = starterPlaybook("request-to-pr");
    const moved = moveStage(playbook.stages, 0, 2);
    expect(moved.map((stage) => stage.id).slice(0, 3)).toEqual(["build", "verify", "understand"]);
    expect(explainActionUnavailable(playbook, "open-draft-pr")).toBe('The workflow already has "Open draft PR".');
    const withoutPr = { stages: playbook.stages.filter((stage) => stage.kind === "ai") };
    expect(explainActionUnavailable(withoutPr, "open-draft-pr")).toBeNull();
    expect(createActionStage("watch-checks", ["watch-checks"])).toMatchObject({
      id: "watch-checks-2",
      action: { type: "watch-checks", repairAttempts: 2, timeoutMinutes: 30 },
    });
  });
});
