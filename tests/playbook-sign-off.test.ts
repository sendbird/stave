import { describe, expect, test } from "bun:test";
import type { CheckIns, Playbook, PlaybookStage } from "../src/lib/playbooks/schema";
import {
  deriveStageSignOff,
  listSignOffStageIndexes,
  resolveStageSignOff,
} from "../src/lib/playbooks/sign-off";
import { findPlaybookStarter } from "../src/dev/fixtures/legacy-playbook-starters";

function ai(id: string, role?: "plan" | "publish"): PlaybookStage {
  return {
    id,
    title: id,
    kind: "ai",
    instruction: `Do ${id}.`,
    doneWhen: `${id} done.`,
    ...(role ? { role } : {}),
  };
}

function act(id: string, type: "open-draft-pr" | "mark-pr-ready"): PlaybookStage {
  return { id, title: id, kind: "action", action: { type } };
}

// understand(plan) · build · verify · open · publish-note(publish) · ready
const STAGES: PlaybookStage[] = [
  ai("understand", "plan"),
  ai("build"),
  ai("verify"),
  act("open", "open-draft-pr"),
  ai("note", "publish"),
  act("ready", "mark-pr-ready"),
];

function playbook(checkIns: CheckIns, stages = STAGES): Pick<Playbook, "checkIns" | "stages"> {
  return { checkIns, stages };
}

describe("sign-off derivation", () => {
  test("every stage asks before every stage after the first", () => {
    expect(listSignOffStageIndexes(playbook("every-stage"))).toEqual([1, 2, 3, 4, 5]);
  });

  test("plan and publishing asks after a plan stage, before publish stages and before ready for review", () => {
    expect(
      STAGES.map((_, index) => deriveStageSignOff("plan-and-publishing", STAGES, index)),
    ).toEqual(["auto", "ask", "auto", "auto", "ask", "ask"]);
  });

  test("only when stuck asks before nothing", () => {
    expect(listSignOffStageIndexes(playbook("when-stuck"))).toEqual([]);
  });

  test("starting a mission signs off the first stage, even a publish stage or an override", () => {
    const publishFirst = [{ ...ai("post", "publish"), signOff: "ask" as const }, ai("next")];
    expect(resolveStageSignOff(playbook("every-stage", publishFirst), 0)).toBe("auto");
  });

  test("a stage override wins", () => {
    const stages = STAGES.map((stage) =>
      stage.id === "verify" ? { ...stage, signOff: "ask" as const } : stage,
    );
    const custom = playbook("plan-and-publishing", stages);
    expect(resolveStageSignOff(custom, 2)).toBe("ask");

    const quiet = playbook(
      "plan-and-publishing",
      STAGES.map((stage) => (stage.id === "ready" ? { ...stage, signOff: "auto" as const } : stage)),
    );
    expect(resolveStageSignOff(quiet, 5)).toBe("auto");
  });

  test("rejects an index outside the playbook", () => {
    expect(() => resolveStageSignOff(playbook("every-stage"), 6)).toThrow(RangeError);
    expect(() => deriveStageSignOff("every-stage", STAGES, -1)).toThrow(RangeError);
  });
});

describe("starter sign-offs under the default check-ins", () => {
  function asks(starterId: string) {
    const template = findPlaybookStarter(starterId)!.template;
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
