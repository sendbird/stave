import { expect, test } from "bun:test";
import { withWorkspaceCheck } from "../src/lib/agent-runs/workspace-check";
import { unmetStageAcceptance } from "../src/lib/agent-runs/acceptance";
import { classifyStageEvidence } from "../src/lib/agent-runs/evidence";
import { workspaceCheckBlock } from "../src/lib/agent-runs/workspace-check";
import { i18n } from "../src/i18n/runtime";
import { buildAgentRunWorkflow } from "../src/lib/agent-runs/agent-run";
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
  expect(withWorkspaceCheck(workflow, agent, [frozen("z"), frozen("a")]).stages[0]!.acceptanceCriteria).toEqual([{ ...criterion, text: "Workspace checks pass (a, z)", scriptIds: ["a", "z"], scriptDefinitions: [frozen("a"), frozen("z")] }]);
});
