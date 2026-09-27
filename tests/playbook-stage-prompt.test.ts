import { describe, expect, test } from "bun:test";
import {
  compileStagePrompt,
  type StagePromptInput,
} from "../src/lib/playbooks/stage-prompt";
import {
  createPlaybookFromStarter,
  findPlaybookStarter,
} from "../src/lib/playbooks/starters";

const NOW = new Date("2026-09-26T09:00:00.000Z");
const slack = createPlaybookFromStarter(findPlaybookStarter("slack-request-to-pr")!, {
  now: NOW,
  id: "playbook_slack",
});

function input(overrides: Partial<StagePromptInput> = {}): StagePromptInput {
  return {
    playbook: slack,
    stageIndex: 2,
    assignment: "Add CSV export to the billing page. Thread: https://example.slack.com/archives/C1/p1",
    priorStages: [
      { title: "Understand", summary: "Export the visible rows as CSV." },
      { title: "Create issue", summary: "Created BILL-42." },
    ],
    acceptanceCriteria: [
      { text: "The billing page has an Export CSV button.", status: "unverified" },
      { text: "The file contains the visible rows.", status: "met" },
    ],
    attempt: 1,
    ...overrides,
  };
}

describe("stage prompt", () => {
  test("orders purpose, stage, prior summaries, criteria, reporting, constraints and permissions", () => {
    const prompt = compileStagePrompt(input());
    const markers = [
      "# Slack request → PR — Stage 3 of 8: Build",
      "## Purpose",
      "## Assignment",
      "## This stage: Build",
      "**Done when:**",
      "## Earlier stages",
      "- **Create issue:** Created BILL-42.",
      "## Acceptance criteria",
      "- [unverified] The billing page has an Export CSV button.",
      "## Reporting",
      "## Working rules",
      "## Constraints",
      "Saved playbooks grant no permissions.",
    ];
    const positions = markers.map((marker) => prompt.indexOf(marker));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  test("states the reporting contract", () => {
    const prompt = compileStagePrompt(input());
    expect(prompt).toContain("`stave_report_stage`");
    expect(prompt).toContain("`stave_block_stage`");
    expect(prompt).toContain("Never report unverified work as complete.");
    expect(prompt).toContain("do not begin later stages in this turn");
  });

  test("never names the mission, playbook or stage ids", () => {
    const prompt = compileStagePrompt(input());
    expect(prompt).not.toContain("playbook_slack");
    for (const stage of slack.stages) {
      expect(prompt).not.toContain(`"${stage.id}"`);
    }
    expect(prompt.toLowerCase()).not.toContain("mission id");
  });

  test("adds the plan and publish rules to those stages only", () => {
    const plan = compileStagePrompt(input({ stageIndex: 0, priorStages: [], acceptanceCriteria: [] }));
    expect(plan).toContain("This is a planning stage. Do not change files");
    expect(plan).not.toContain("## Earlier stages");
    expect(plan).not.toContain("## Acceptance criteria");
    const publish = compileStagePrompt(input({ stageIndex: 7 }));
    expect(publish).toContain("This stage has an external effect. Do it once");
    expect(compileStagePrompt(input())).not.toContain("external effect");
  });

  test("carries the user's feedback on a later attempt", () => {
    const prompt = compileStagePrompt(
      input({ attempt: 2, feedback: "  Use the existing download helper.  " }),
    );
    expect(prompt).toContain("## Attempt 2");
    expect(prompt).toContain("The user asked for changes to the previous attempt:\n\nUse the existing download helper.");
    expect(prompt.indexOf("## Attempt 2")).toBeGreaterThan(prompt.indexOf("## This stage: Build"));
    expect(prompt.indexOf("## Attempt 2")).toBeLessThan(prompt.indexOf("## Earlier stages"));
    expect(compileStagePrompt(input())).not.toContain("## Attempt");
  });

  test("follows the team setting", () => {
    expect(compileStagePrompt(input())).toContain("Do not start workers or delegated tasks.");
    expect(
      compileStagePrompt(input({ playbook: { ...slack, team: "workers" } })),
    ).toContain("You may hand bounded parts of this stage to workers.");
  });

  test("omits empty constraints", () => {
    const prompt = compileStagePrompt(input({ playbook: { ...slack, constraints: "" } }));
    expect(prompt).not.toContain("## Constraints");
  });

  test("refuses Stave action stages and out-of-range indexes", () => {
    expect(() => compileStagePrompt(input({ stageIndex: 4 }))).toThrow(TypeError);
    expect(() => compileStagePrompt(input({ stageIndex: 8 }))).toThrow(RangeError);
  });
});
