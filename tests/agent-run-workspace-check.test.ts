import { expect, test } from "bun:test";
import { withWorkspaceCheck } from "../src/lib/agent-runs/workspace-check";
import { unmetStageAcceptance } from "../src/lib/agent-runs/acceptance";
import { classifyStageEvidence } from "../src/lib/agent-runs/evidence";
import { workspaceCheckBlock } from "../src/lib/agent-runs/workspace-check";
import { i18n } from "../src/i18n/runtime";
import { buildAgentRunWorkflow } from "../src/lib/agent-runs/agent-run";
import { admitWorkspaceCheck } from "../electron/host-service/supervision/workspace-check-admission";
import { getBuiltinAgent } from "../src/lib/agents/starters";
import { currentStageRecord, EMPTY_STAGE_FACTS, AgentRunStageRecordSchema } from "../src/lib/agent-runs/domain";
import { agentRunFixture, COMPLETE_REPORT, patchCurrent, AGENT_RUN_NOW } from "./fixtures/agent-run-fixtures";

const revision = { status: "known" as const, revision: "checked" };
const other = { status: "known" as const, revision: "edited" };
const definitionHash = "a".repeat(64);
const frozen = (scriptId: string) => ({ scriptId, definitionHash });
const criterion = { text: "Workspace checks pass", required: true, verification: "stave-check" as const, scriptIds: ["check"], scriptDefinitions: [frozen("check")] };

test("AI stave-check requires host success at both report and final workspace revisions", () => {
  const base = agentRunFixture();
  let aggregate = agentRunFixture({ workflow: { ...base.agentRun.workflow, stages: [{ id: "work", title: "Work", kind: "ai", instruction: "Implement", doneWhen: "Checked", acceptanceCriteria: [criterion] }] } });
  aggregate = patchCurrent(aggregate, { status: "running", report: { ...COMPLETE_REPORT, workspaceRevision: revision, acceptanceCriteria: [{ text: criterion.text, status: "met" }] }, facts: { ...EMPTY_STAGE_FACTS, workspaceRevision: revision } });
  const record = currentStageRecord(aggregate);
  expect(unmetStageAcceptance(aggregate, record)).toContain("stave_run_workspace_script");
  const check = { source: "stave" as const, type: "run-script" as const, scriptId: "check", definitionHash, executedCommands: "sh check.sh", exitCode: 0, durationMs: 10, outputTail: "ok", verification: { sourceRevision: revision, completedRevision: revision } };
  const checked = { ...record, facts: { ...record.facts!, workspaceScripts: [check] } };
  expect(classifyStageEvidence({ ...COMPLETE_REPORT, workspaceRevision: revision }, checked.facts)[0]).toMatchObject({ source: "stave", freshness: "current", exitCode: 0 });
  expect(classifyStageEvidence({ ...COMPLETE_REPORT, workspaceRevision: other }, checked.facts)[0]).toMatchObject({ source: "stave", freshness: "stale" });
  expect(unmetStageAcceptance(aggregate, AgentRunStageRecordSchema.parse(JSON.parse(JSON.stringify(checked))))).toBeNull();
  for (const bad of [
    { ...check, exitCode: 1 }, { ...check, scriptId: "other" }, { ...check, definitionHash: "b".repeat(64) },
    { ...check, verification: { sourceRevision: revision, completedRevision: other } },
    { ...check, verification: { sourceRevision: { status: "unknown" as const, reason: "unavailable" as const }, completedRevision: revision } },
  ]) expect(unmetStageAcceptance(aggregate, { ...checked, facts: { ...checked.facts, workspaceScripts: [bad] } })).not.toBeNull();
  expect(unmetStageAcceptance(aggregate, { ...checked, facts: { ...checked.facts, workspaceRevision: other } })).not.toBeNull();
  expect(unmetStageAcceptance(aggregate, { ...checked, report: { ...COMPLETE_REPORT, workspaceRevision: other } })).not.toBeNull();
});

test("unknown revision reasons identify each of the four snapshots and localize the Halted detail", async () => {
  const base = agentRunFixture();
  const report = { ...COMPLETE_REPORT, workspaceRevision: revision };
  const check = { source: "stave" as const, type: "run-script" as const, scriptId: "check", definitionHash, exitCode: 0, durationMs: 1, outputTail: "", verification: { sourceRevision: revision, completedRevision: revision } };
  const record = { ...currentStageRecord(base), report, facts: { ...EMPTY_STAGE_FACTS, workspaceRevision: revision, workspaceScripts: [check] } };
  const unknown = { status: "unknown" as const, reason: "limit" as const };
  for (const phase of ["source", "completed", "report", "final workspace"]) {
    const candidate = phase === "report" ? { ...record, report: { ...report, workspaceRevision: unknown } } : phase === "final workspace" ? { ...record, facts: { ...record.facts, workspaceRevision: unknown } } :
      { ...record, facts: { ...record.facts, workspaceScripts: [{ ...check, verification: { ...check.verification, [phase + "Revision"]: unknown } }] } };
    const detail = workspaceCheckBlock(candidate, criterion);
    expect(detail).toContain(phase);
    expect(detail).toContain("200-file");
  }
  const previous = i18n.language;
  try {
    await i18n.changeLanguage("ko");
    const detail = workspaceCheckBlock({ ...record, facts: EMPTY_STAGE_FACTS }, criterion);
    expect(detail).toContain("검사 기록이 없습니다");
    expect(detail).toContain("Run `stave_run_workspace_script` with script `check`");
  } finally { await i18n.changeLanguage(previous); }
});

test("only primary write work gets a default check; built-in workflows check their last AI stage", () => {
  for (const id of ["implementer", "debugger", "ui-polisher", "researcher", "reviewer", "lead"]) {
    const agent = getBuiltinAgent(id)!;
    const workflow = buildAgentRunWorkflow({ agent, now: AGENT_RUN_NOW });
    const checked = withWorkspaceCheck(workflow, agent, [frozen("test")]);
    const checks = checked.stages.flatMap(stage => stage.acceptanceCriteria ?? []);
    if (["implementer", "debugger", "ui-polisher"].includes(id)) {
      expect(checks).toEqual([{ ...criterion, scriptIds: ["test"], scriptDefinitions: [frozen("test")] }]);
      expect(checked.stages.at(-1)!.acceptanceCriteria).toHaveLength(1);
    } else expect(checks).toEqual([]);
    expect(withWorkspaceCheck(workflow, { ...agent, permission: "read-only" }, [frozen("test")])).toBe(workflow);
    expect(withWorkspaceCheck(workflow, agent, [])).toBe(workflow);
  }
  const agent = getBuiltinAgent("implementer")!;
  const workflow = buildAgentRunWorkflow({ agent, now: AGENT_RUN_NOW });
  // With review before done the check gates the stage that fixes the findings, the last AI stage.
  expect(workflow.stages.at(-1)!.id).toBe("fix-review");
  expect(withWorkspaceCheck(workflow, agent, [frozen("z"), frozen("a")]).stages.at(-1)!.acceptanceCriteria).toEqual([{ ...criterion, text: "Workspace checks pass (a, z)", scriptIds: ["a", "z"], scriptDefinitions: [frozen("a"), frozen("z")] }]);
});

test("every explicit AI check is bound without adding a default to a custom workflow", () => {
  const agent = getBuiltinAgent("implementer")!;
  const base = buildAgentRunWorkflow({ agent, now: AGENT_RUN_NOW });
  const stage = base.stages[0]!;
  if (stage.kind !== "ai") throw new Error("Expected AI stage");
  const workflow = { ...base, stages: ["prepare", "finish"].map(id => ({ ...stage, id, acceptanceCriteria: [{ text: id, verification: "stave-check" as const }] })) };
  const bound = withWorkspaceCheck(workflow, null, [frozen("z"), frozen("a")]);
  expect(bound.stages.map(entry => entry.acceptanceCriteria)).toEqual(["prepare", "finish"].map(text => [{ text, verification: "stave-check", scriptIds: ["a", "z"], scriptDefinitions: [frozen("a"), frozen("z")] }]));
  const updated = [{ scriptId: "a", definitionHash: "b".repeat(64) }, frozen("z")];
  expect(withWorkspaceCheck(bound, null, updated).stages[0]!.acceptanceCriteria?.[0]?.scriptDefinitions).toEqual(updated);
});

test("admission replaces incoming hashes and preserves explicit script subsets", () => {
  const agent = getBuiltinAgent("implementer")!;
  const workflow = buildAgentRunWorkflow({ agent, now: AGENT_RUN_NOW });
  workflow.stages[0]!.acceptanceCriteria = [{ ...criterion, scriptIds: ["lint"], scriptDefinitions: [frozen("forged")] }];
  const lint = { scriptId: "lint", definitionHash: "b".repeat(64) };
  const admitted = admitWorkspaceCheck({ workflow, agent, scripts: [frozen("check"), lint] });
  expect(admitted.workflow.stages[0]!.acceptanceCriteria).toEqual([{ ...criterion, scriptIds: ["lint"], scriptDefinitions: [lint] }]);
  expect(() => admitWorkspaceCheck({ workflow, agent, scripts: [frozen("check")] })).toThrow("'lint'");
});

test("admission refuses explicit checks without actions instead of preserving stale client definitions", () => {
  const workflow = buildAgentRunWorkflow({ agent: getBuiltinAgent("implementer")!, now: AGENT_RUN_NOW });
  workflow.stages[0]!.acceptanceCriteria = [criterion];
  expect(() => admitWorkspaceCheck({ workflow, agent: null, scripts: [] })).toThrow("no action script");
});

test("upgrading the default text and rebinding a host check preserve required false", () => {
  // One Work stage: these cases are about the stage a default check lands on, not the review stages.
  const agent = { ...getBuiltinAgent("implementer")!, reviewBeforeDone: "off" as const };
  for (const verification of ["agent-report", "stave-check"] as const) {
    const workflow = buildAgentRunWorkflow({ agent, now: AGENT_RUN_NOW });
    workflow.stages[0]!.acceptanceCriteria = [{ text: criterion.text, required: false, verification }];
    const admitted = admitWorkspaceCheck({ workflow, agent, scripts: [frozen("check")] });
    expect(admitted.workflow.stages[0]!.acceptanceCriteria).toEqual([{ ...criterion, required: false }]);
  }
});

test("admission adds the default gate and binds explicit checks without any revision input", () => {
  // One Work stage: these cases are about the stage a default check lands on, not the review stages.
  const agent = { ...getBuiltinAgent("implementer")!, reviewBeforeDone: "off" as const };
  const workflow = buildAgentRunWorkflow({ agent, now: AGENT_RUN_NOW });
  const admitted = admitWorkspaceCheck({ workflow, agent, scripts: [frozen("check")] });
  expect(admitted.notice).toBeUndefined();
  expect(admitted.workflow.stages[0]!.acceptanceCriteria).toEqual([criterion]);
  const explicit = { ...workflow, stages: workflow.stages.map(stage => ({ ...stage, acceptanceCriteria: [{ text: "Custom check", verification: "stave-check" as const }] })) };
  expect(admitWorkspaceCheck({ workflow: explicit, agent: null, scripts: [frozen("check")] }).workflow.stages[0]!.acceptanceCriteria?.[0]).toMatchObject({ verification: "stave-check", scriptDefinitions: [frozen("check")] });
  expect(admitWorkspaceCheck({ workflow, agent, scripts: [] }).workflow).toBe(workflow);
});

test("a default insertion beyond the criterion limit still preserves a valid workflow with a notice", () => {
  // One Work stage: these cases are about the stage a default check lands on, not the review stages.
  const agent = { ...getBuiltinAgent("implementer")!, reviewBeforeDone: "off" as const };
  const workflow = buildAgentRunWorkflow({ agent, now: AGENT_RUN_NOW });
  workflow.stages[0]!.acceptanceCriteria = Array.from({ length: 20 }, (_, i) => ({ text: `Criterion ${i}` }));
  const admitted = admitWorkspaceCheck({ workflow, agent, scripts: [frozen("check")] });
  expect(admitted.workflow).toBe(workflow);
  expect(admitted.notice).toContain("invalid");
});
