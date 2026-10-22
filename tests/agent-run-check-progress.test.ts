import { describe, expect, test } from "bun:test";
import { buildAgentRunFixtures } from "../src/dev/agent-run-preview/agent-run-fixtures";
import { describeDoneWhen } from "../src/lib/agent-runs/agent-run-status";
import { projectAgentRunStages, summarizePreviousStage } from "../src/lib/agent-runs/agent-run-view";
import { describeWorkspaceCheckProgress } from "../src/lib/agent-runs/workspace-check";

const START = new Date("2026-10-01T09:00:00.000Z");
const revision = { status: "known" as const, revision: "r1" };
const SCRIPTS = ["lint", "setup", "test"] as const;
const definitions = SCRIPTS.map((scriptId, index) => ({ scriptId, definitionHash: String(index).repeat(64) }));
const criterion = {
  text: "Workspace checks pass (lint, setup, test)",
  required: true,
  verification: "stave-check" as const,
  scriptIds: [...SCRIPTS],
  scriptDefinitions: definitions,
};

function passed(scriptId: (typeof SCRIPTS)[number], exitCode = 0) {
  const definition = definitions.find((entry) => entry.scriptId === scriptId)!;
  return {
    source: "stave" as const,
    type: "run-script" as const,
    scriptId,
    definitionHash: definition.definitionHash,
    exitCode,
    durationMs: 1,
    outputTail: "",
    verification: { sourceRevision: revision, completedRevision: revision },
  };
}

/** A finished run whose last AI stage carries the three-action workspace check. */
function runWithChecks(results: ReturnType<typeof passed>[]) {
  const run = structuredClone(buildAgentRunFixtures(START).ready);
  const stage = run.agentRun.workflow.stages.findLast((candidate) => candidate.kind === "ai")!;
  if (stage.kind !== "ai") throw new Error("Expected an AI stage");
  stage.acceptanceCriteria = [criterion];
  const record = run.stages.findLast((candidate) => candidate.stageId === stage.id)!;
  if (record.report?.outcome !== "complete") throw new Error("Expected a complete report");
  record.report = { ...record.report, workspaceRevision: revision, acceptanceCriteria: [{ text: criterion.text, status: "met" }] };
  record.facts = { ...record.facts!, workspaceRevision: revision, workspaceScripts: results };
  return { run, stage };
}

describe("workspace check progress", () => {
  test("one passing action still meets the check, and the line says which one and how many", () => {
    const { run } = runWithChecks([passed("lint", 1), passed("setup")]);
    const line = describeDoneWhen(run).find((entry) => entry.text === criterion.text);
    expect(line?.status).toBe("met-verified");
    expect(line?.checks).toEqual({ passed: ["setup"], total: 3 });
    expect(describeWorkspaceCheckProgress(line!.checks!)).toBe("Stave checks: 1 of 3 passed (setup)");
  });

  test("with no passing action the line is not verified and says none passed", () => {
    const { run } = runWithChecks([passed("lint", 1)]);
    const line = describeDoneWhen(run).find((entry) => entry.text === criterion.text);
    expect(line?.status).toBe("unverified");
    expect(line?.checks).toEqual({ passed: [], total: 3 });
    expect(describeWorkspaceCheckProgress(line!.checks!)).toBe("Stave checks: none of 3 passed yet");
  });

  test("the sign-off summary names the passing actions instead of a bare count", () => {
    const { run, stage } = runWithChecks([passed("setup"), passed("test")]);
    const row = projectAgentRunStages(run, START).find((entry) => entry.stage.id === stage.id);
    expect(summarizePreviousStage(row)).toContain("Stave checks: 2 of 3 passed (setup and test)");
  });

  test("a check inherited from an earlier stage reports the earlier stage's results", () => {
    const fixtures = buildAgentRunFixtures(START);
    const run = structuredClone(fixtures.ready);
    const template = run.agentRun.workflow.stages.find((stage) => stage.kind === "ai")!;
    if (template.kind !== "ai") throw new Error("Expected an AI stage");
    const templateRecord = run.stages.findLast((record) => record.stageId === template.id)!;
    run.agentRun.workflow.stages = [
      { ...template, id: "build", acceptanceCriteria: [criterion] },
      { ...template, id: "final", acceptanceCriteria: [] },
    ];
    run.agentRun.currentStageIndex = 1;
    const buildRecord = { ...structuredClone(templateRecord), stageId: "build" };
    const finalRecord = { ...structuredClone(templateRecord), stageId: "final" };
    if (buildRecord.report?.outcome !== "complete" || finalRecord.report?.outcome !== "complete") throw new Error("Expected complete reports");
    buildRecord.report = { ...buildRecord.report, workspaceRevision: revision, acceptanceCriteria: [{ text: criterion.text, status: "met" }] };
    buildRecord.facts = { ...buildRecord.facts!, workspaceRevision: revision, workspaceScripts: [passed("setup")] };
    finalRecord.report = { ...finalRecord.report, workspaceRevision: revision, acceptanceCriteria: [{ text: criterion.text, status: "met" }] };
    finalRecord.facts = { ...finalRecord.facts!, workspaceRevision: revision, workspaceScripts: [] };
    run.stages = [buildRecord, finalRecord];
    const line = describeDoneWhen(run).find((entry) => entry.text === criterion.text);
    expect(line?.status).toBe("met-verified");
    expect(line?.checks).toEqual({ passed: ["setup"], total: 3 });
  });
});
