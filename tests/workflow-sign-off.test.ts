import { describe, expect, test } from "bun:test";
import type { CheckIns, Workflow, WorkflowStage } from "../src/lib/workflows/schema";
import {
  deriveStageSignOff,
  listSignOffStageIndexes,
  resolveStageSignOff,
} from "../src/lib/workflows/sign-off";
import { findWorkflowStarter } from "../src/dev/fixtures/legacy-workflow-starters";

function ai(id: string, role?: "plan" | "publish"): WorkflowStage {
  return {
    id,
    title: id,
    kind: "ai",
    instruction: `Do ${id}.`,
    doneWhen: `${id} done.`,
    ...(role ? { role } : {}),
  };
}

function act(id: string, type: "open-draft-pr" | "mark-pr-ready"): WorkflowStage {
  return { id, title: id, kind: "action", action: { type } };
}

// understand(plan) · build · verify · open · publish-note(publish) · ready
const STAGES: WorkflowStage[] = [
  ai("understand", "plan"),
  ai("build"),
  ai("verify"),
  act("open", "open-draft-pr"),
  ai("note", "publish"),
  act("ready", "mark-pr-ready"),
];

function workflow(checkIns: CheckIns, stages = STAGES): Pick<Workflow, "checkIns" | "stages"> {
  return { checkIns, stages };
}

describe("sign-off derivation", () => {
  test("every stage asks before every stage after the first", () => {
    expect(listSignOffStageIndexes(workflow("every-stage"))).toEqual([1, 2, 3, 4, 5]);
  });

  test("plan and publishing asks after a plan stage, before publish stages and before ready for review", () => {
    expect(
      STAGES.map((_, index) => deriveStageSignOff("plan-and-publishing", STAGES, index)),
    ).toEqual(["auto", "ask", "auto", "auto", "ask", "ask"]);
  });

  test("only when stuck asks before nothing", () => {
    expect(listSignOffStageIndexes(workflow("when-stuck"))).toEqual([]);
  });

  test("starting a run signs off the first stage, even a publish stage or an override", () => {
    const publishFirst = [{ ...ai("post", "publish"), signOff: "ask" as const }, ai("next")];
    expect(resolveStageSignOff(workflow("every-stage", publishFirst), 0)).toBe("auto");
  });

  test("a stage override wins", () => {
    const stages = STAGES.map((stage) =>
      stage.id === "verify" ? { ...stage, signOff: "ask" as const } : stage,
    );
    const custom = workflow("plan-and-publishing", stages);
    expect(resolveStageSignOff(custom, 2)).toBe("ask");

    const quiet = workflow(
      "plan-and-publishing",
      STAGES.map((stage) => (stage.id === "ready" ? { ...stage, signOff: "auto" as const } : stage)),
    );
    expect(resolveStageSignOff(quiet, 5)).toBe("auto");
  });

  test("rejects an index outside the workflow", () => {
    expect(() => resolveStageSignOff(workflow("every-stage"), 6)).toThrow(RangeError);
    expect(() => deriveStageSignOff("every-stage", STAGES, -1)).toThrow(RangeError);
  });
});

describe("starter sign-offs under the default check-ins", () => {
  function asks(starterId: string) {
    const template = findWorkflowStarter(starterId)!.template;
    return listSignOffStageIndexes(template).map((index) => template.stages[index]!.title);
  }

  test("Request → PR asks before building and before ready for review", () => {
    expect(asks("request-to-pr")).toEqual(["Build", "Ready for review"]);
  });

  test("Slack request → PR asks for the plan with its issue, ready for review and the reply", () => {
    expect(asks("slack-request-to-pr")).toEqual([
      "Create issue",
      "Ready for review",
      "Report back to the thread",
    ]);
  });

  test("Fix failing checks never asks and Address review asks twice", () => {
    expect(asks("fix-failing-checks")).toEqual([]);
    expect(asks("address-review")).toEqual(["Change", "Reply to reviewers"]);
  });
});
