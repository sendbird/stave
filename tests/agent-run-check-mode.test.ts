import { describe, expect, test } from "bun:test";
import { buildAgentRunFixtures } from "../src/dev/agent-run-preview/agent-run-fixtures";
import { unmetStageAcceptance } from "../src/lib/agent-runs/acceptance";
import { describeDoneWhen } from "../src/lib/agent-runs/agent-run-status";
import { describeWorkspaceCheckProgress, workspaceCheckInstruction } from "../src/lib/agent-runs/workspace-check";
import { WorkflowSchema, type AiStage } from "../src/lib/workflows/schema";
import { addStageCheck, removeStageCheck, setStageCheckMode, stageCheckText, toggleStageCheckScript } from "../src/lib/workflows/stage-checks";

const START = new Date("2026-10-01T09:00:00.000Z");
const current = { status: "known" as const, revision: "r1" };
const older = { status: "known" as const, revision: "r0" };
const SCRIPTS = ["lint", "setup", "test"] as const;
const definitions = SCRIPTS.map((scriptId, index) => ({ scriptId, definitionHash: String(index).repeat(64) }));
type Script = (typeof SCRIPTS)[number];

/** Lint and test, both required: the acceptance case of the stage editor's "All must pass". */
const allOfLintAndTest = {
  text: "Workspace checks pass (lint, test)",
  required: true,
  verification: "stave-check" as const,
  scriptIds: ["lint", "test"],
  scriptDefinitions: definitions.filter((entry) => entry.scriptId !== "setup"),
  mode: "all" as const,
};

function result(scriptId: Script, options: { exitCode?: number; revision?: typeof current } = {}) {
  const definition = definitions.find((entry) => entry.scriptId === scriptId)!;
  const revision = options.revision ?? current;
  return {
    source: "stave" as const,
    type: "run-script" as const,
    scriptId,
    definitionHash: definition.definitionHash,
    exitCode: options.exitCode ?? 0,
    durationMs: 1,
    outputTail: "",
    verification: { sourceRevision: revision, completedRevision: revision },
  };
}

function runWith(criterion: NonNullable<AiStage["acceptanceCriteria"]>[number], results: ReturnType<typeof result>[]) {
  const run = structuredClone(buildAgentRunFixtures(START).ready);
  const stage = run.agentRun.workflow.stages.findLast((candidate) => candidate.kind === "ai")!;
  if (stage.kind !== "ai") throw new Error("Expected an AI stage");
  stage.acceptanceCriteria = [criterion];
  const record = run.stages.findLast((candidate) => candidate.stageId === stage.id)!;
  if (record.report?.outcome !== "complete") throw new Error("Expected a complete report");
  record.report = { ...record.report, workspaceRevision: current, acceptanceCriteria: [{ text: criterion.text, status: "met" }] };
  record.facts = { ...record.facts!, workspaceRevision: current, workspaceScripts: results };
  return { run, record };
}

function lineOf(run: ReturnType<typeof runWith>["run"], text: string) {
  return describeDoneWhen(run).find((entry) => entry.text === text);
}

describe("a check that needs all of its scripts", () => {
  test("a passing setup script alone does not meet lint and test", () => {
    const { run, record } = runWith(allOfLintAndTest, [result("setup")]);
    const line = lineOf(run, allOfLintAndTest.text);
    expect(line?.status).toBe("unverified");
    expect(line?.checks).toEqual({ passed: [], total: 2, scripts: ["lint", "test"], mode: "all" });
    expect(describeWorkspaceCheckProgress(line!.checks!)).toBe("Stave checks: none of 2 passed yet; needed: lint and test");
    const block = unmetStageAcceptance(run, record);
    expect(block).toContain("'lint' has not");
    expect(block).toContain("each of the scripts `lint` and `test`");
  });

  test("one of the two passing is not enough, and the line names the one still needed", () => {
    const { run, record } = runWith(allOfLintAndTest, [result("lint"), result("test", { exitCode: 1 })]);
    const line = lineOf(run, allOfLintAndTest.text);
    expect(line?.status).toBe("unverified");
    expect(describeWorkspaceCheckProgress(line!.checks!)).toBe("Stave checks: 1 of 2 passed (lint); still needed: test");
    expect(unmetStageAcceptance(run, record)).toContain("'test' has not");
    expect(unmetStageAcceptance(run, record)).toContain("exited with code 1");
  });

  test("both passing on the current revision meet it", () => {
    const { run, record } = runWith(allOfLintAndTest, [result("lint"), result("setup", { exitCode: 1 }), result("test")]);
    const line = lineOf(run, allOfLintAndTest.text);
    expect(line?.status).toBe("met-verified");
    expect(describeWorkspaceCheckProgress(line!.checks!)).toBe("Stave checks: all 2 passed (lint and test)");
    expect(unmetStageAcceptance(run, record)).toBeNull();
  });

  test("a pass on an earlier revision does not count toward the current one", () => {
    const { run, record } = runWith(allOfLintAndTest, [result("lint", { revision: older }), result("test")]);
    expect(lineOf(run, allOfLintAndTest.text)?.status).toBe("unverified");
    expect(unmetStageAcceptance(run, record)).toContain("'lint' has not");
  });

  test("a later failure of a script supersedes its earlier pass", () => {
    const { run } = runWith(allOfLintAndTest, [result("lint"), result("test"), result("lint", { exitCode: 2 })]);
    expect(lineOf(run, allOfLintAndTest.text)?.status).toBe("unverified");
  });

  test("an inherited check still needs every script on the stage that inherits it", () => {
    const fixtures = buildAgentRunFixtures(START);
    const run = structuredClone(fixtures.ready);
    const template = run.agentRun.workflow.stages.find((stage) => stage.kind === "ai")!;
    if (template.kind !== "ai") throw new Error("Expected an AI stage");
    const templateRecord = run.stages.findLast((record) => record.stageId === template.id)!;
    run.agentRun.workflow.stages = [
      { ...template, id: "build", acceptanceCriteria: [allOfLintAndTest] },
      { ...template, id: "final", acceptanceCriteria: [] },
    ];
    run.agentRun.currentStageIndex = 1;
    const build = { ...structuredClone(templateRecord), stageId: "build" };
    const final = { ...structuredClone(templateRecord), stageId: "final" };
    if (build.report?.outcome !== "complete" || final.report?.outcome !== "complete") throw new Error("Expected complete reports");
    build.report = { ...build.report, workspaceRevision: current, acceptanceCriteria: [{ text: allOfLintAndTest.text, status: "met" }] };
    final.report = { ...final.report, workspaceRevision: current, acceptanceCriteria: [{ text: allOfLintAndTest.text, status: "met" }] };
    final.facts = { ...final.facts!, workspaceRevision: current, workspaceScripts: [] };
    build.facts = { ...build.facts!, workspaceRevision: current, workspaceScripts: [result("lint")] };
    run.stages = [build, final];
    expect(lineOf(run, allOfLintAndTest.text)?.status).toBe("unverified");
    expect(lineOf(run, allOfLintAndTest.text)?.checks).toEqual({ passed: ["lint"], total: 2, scripts: ["lint", "test"], mode: "all" });
    build.facts = { ...build.facts, workspaceScripts: [result("lint"), result("test")] };
    expect(lineOf(run, allOfLintAndTest.text)?.status).toBe("met-verified");
  });
});

describe("a check saved before the mode existed", () => {
  const saved = {
    version: 1,
    id: "ship",
    name: "Ship",
    purpose: "Ship the change.",
    checkIns: "when-stuck",
    team: "solo",
    stages: [{
      id: "work", title: "Work", kind: "ai", instruction: "Do the work.", doneWhen: "It is done.",
      acceptanceCriteria: [{ text: "Workspace checks pass (lint, setup, test)", required: true, verification: "stave-check", scriptIds: ["lint", "setup", "test"] }],
    }],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };

  test("parses unchanged and is still met by any one passing script", () => {
    const workflow = WorkflowSchema.parse(saved);
    const stage = workflow.stages[0]!;
    if (stage.kind !== "ai") throw new Error("Expected an AI stage");
    const criterion = stage.acceptanceCriteria![0]!;
    expect("mode" in criterion).toBe(false);
    const { run, record } = runWith({ ...criterion, scriptDefinitions: definitions }, [result("setup")]);
    expect(lineOf(run, criterion.text)?.status).toBe("met-verified");
    expect(unmetStageAcceptance(run, record)).toBeNull();
    expect(workspaceCheckInstruction(criterion)).toContain("with script `lint` or `setup` or `test`");
  });

  test("an unknown mode is refused instead of guessed", () => {
    const stage = { ...saved.stages[0]!, acceptanceCriteria: [{ ...saved.stages[0]!.acceptanceCriteria[0]!, mode: "every" }] };
    expect(WorkflowSchema.safeParse({ ...saved, stages: [stage] }).success).toBe(false);
  });
});

describe("editing a stage's checks", () => {
  const stage: AiStage = { id: "work", title: "Work", kind: "ai", instruction: "Do it.", doneWhen: "Done." };

  test("a new check needs all of its scripts and is named after them", () => {
    const added = addStageCheck(stage, "lint");
    const grown = toggleStageCheckScript(added.stage, added.index, "test");
    expect(grown.acceptanceCriteria).toEqual([
      { text: stageCheckText(["lint", "test"]), required: true, verification: "stave-check", scriptIds: ["lint", "test"], mode: "all" },
    ]);
  });

  test("editing a stored check keeps its meaning and its own name, and drops frozen bindings", () => {
    const stored: AiStage = { ...stage, acceptanceCriteria: [{ text: "Tests are green", verification: "stave-check", scriptIds: ["lint"], scriptDefinitions: [definitions[0]!] }] };
    const edited = toggleStageCheckScript(stored, 0, "test");
    expect(edited.acceptanceCriteria).toEqual([{ text: "Tests are green", verification: "stave-check", scriptIds: ["lint", "test"] }]);
    expect(setStageCheckMode(edited, 0, "all").acceptanceCriteria?.[0]?.mode).toBe("all");
  });

  test("removing its last script removes the check, keeping the stage's other criteria", () => {
    const reported = { text: "The docs say so", verification: "agent-report" as const };
    const added = addStageCheck({ ...stage, acceptanceCriteria: [reported] }, "lint");
    expect(toggleStageCheckScript(added.stage, added.index, "lint").acceptanceCriteria).toEqual([reported]);
    expect(removeStageCheck(addStageCheck(stage, "lint").stage, 0)).toEqual(stage);
  });
});
