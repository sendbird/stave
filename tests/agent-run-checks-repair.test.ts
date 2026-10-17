import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { AgentRunStore } from "../electron/persistence/agent-run-store";
import { createStageScriptRunner } from "../electron/host-service/supervision/agent-run-workspace-script";
import { createAgentRunActionExecutor, type AgentRunScmPort } from "../electron/host-service/supervision/agent-run-actions";
import { admitWorkspaceCheck } from "../electron/host-service/supervision/workspace-check-admission";
import { getBuiltinAgent } from "../src/lib/agents/starters";
import { unmetInheritedWorkspaceChecks, unmetStageAcceptance } from "../src/lib/agent-runs/acceptance";
import { buildAgentRunTurnContextPart, buildChecksRepairPrompt, compileAgentRunStagePrompt, collectAcceptanceCriteria, inheritedWorkspaceCheckCriteria } from "../src/lib/agent-runs/briefing";
import { currentStageRecord, createStageRecord, EMPTY_STAGE_FACTS, type AgentRunAggregate } from "../src/lib/agent-runs/domain";
import { recordStageReport } from "../src/lib/agent-runs/commands";
import { describeDoneWhen, describeStaveChecks } from "../src/lib/agent-runs/agent-run-status";
import { classifyStageEvidence } from "../src/lib/agent-runs/evidence";
import { buildAgentRunReport } from "../src/lib/agent-runs/report";
import { workspaceActionCheckMet, workspaceCheckMet } from "../src/lib/agent-runs/workspace-check";
import { WorkflowSchema } from "../src/lib/workflows/schema";
import { agentRunFixture, COMPLETE_REPORT } from "./fixtures/agent-run-fixtures";

const checked = { status: "known" as const, revision: "original-commit", contentRevision: "original-content" };
const repaired = { status: "known" as const, revision: "repair-commit", contentRevision: "fixed-content" };
const definition = { scriptId: "test", definitionHash: "a".repeat(64) };
const criterion = { text: "Tests pass", required: true, verification: "stave-check" as const, scriptIds: ["test"], scriptDefinitions: [definition] };

function repairAggregate(actionSource = false): AgentRunAggregate {
  const base = agentRunFixture();
  const workflow = WorkflowSchema.parse({ ...base.agentRun.workflow, stages: [
    actionSource
      ? { id: "work", title: "Test", kind: "action", action: { type: "run-script", scriptId: "test" }, acceptanceCriteria: [{ text: criterion.text, required: true }] }
      : { id: "work", title: "Work", kind: "ai", instruction: "Implement.", doneWhen: "Tested.", acceptanceCriteria: [criterion] },
    { id: "watch", title: "Watch", kind: "action", action: { type: "watch-checks", repairAttempts: 1, timeoutMinutes: 30 } },
    { id: "ready", title: "Ready", kind: "action", action: { type: "mark-pr-ready" } },
  ] });
  const aggregate = agentRunFixture({ workflow: actionSource ? admitWorkspaceCheck({ workflow, agent: null, scripts: [definition] }).workflow : workflow });
  aggregate.stages[0] = { ...aggregate.stages[0]!, status: "completed", report: actionSource ? null : { ...COMPLETE_REPORT, workspaceRevision: checked, acceptanceCriteria: [{ text: criterion.text, status: "met" }] }, facts: {
    ...EMPTY_STAGE_FACTS, workspaceRevision: checked,
    ...(actionSource
      ? { action: { type: "run-script" as const, scriptId: "test", exitCode: 0, outputTail: "ok", verification: { sourceRevision: checked, completedRevision: checked } } }
      : { workspaceScripts: [{ source: "stave" as const, type: "run-script" as const, ...definition, exitCode: 0, outputTail: "ok", durationMs: 1, verification: { sourceRevision: checked, completedRevision: checked } }] }),
  } };
  aggregate.agentRun.currentStageIndex = 1;
  aggregate.stages.push({ ...createStageRecord({ agentRunId: aggregate.agentRun.id, stageId: "watch", attempt: 1 }), status: "running", facts: { ...EMPTY_STAGE_FACTS, workspaceRevision: repaired } });
  return aggregate;
}

function repairHarness(options: { readonly?: boolean; delegated?: boolean; issued?: boolean; otherAction?: boolean; changedDefinition?: boolean; exitCode?: number; actionSource?: boolean; legacyAction?: boolean; exitCodes?: number[]; unchanged?: boolean; finalAi?: boolean } = {}) {
  const aggregate = repairAggregate(options.actionSource);
  let executions = 0;
  if (options.legacyAction) aggregate.agentRun.workflow.stages[0]!.acceptanceCriteria = [{ text: criterion.text, required: true }];
  if (options.otherAction) aggregate.agentRun.workflow.stages[1] = { id: "watch", title: "Publish", kind: "action", action: { type: "open-draft-pr" } };
  if (options.finalAi) aggregate.agentRun.workflow.stages.splice(1, 2, { id: "watch", title: "Finish", kind: "ai", instruction: "Finish the assignment.", doneWhen: "Verified." });
  const store = new AgentRunStore(new Database(":memory:"));
  const at = new Date(aggregate.agentRun.updatedAt);
  store.create({ agentRun: aggregate.agentRun, upserts: aggregate.stages, events: [] }, at);
  const get = () => {
    const stored = store.getAggregate(aggregate.agentRun.id)!;
    return { ...stored, stages: stored.stages.sort((left, right) =>
      stored.agentRun.workflow.stages.findIndex((stage) => stage.id === left.stageId) - stored.agentRun.workflow.stages.findIndex((stage) => stage.id === right.stageId) || left.attempt - right.attempt) };
  };
  const grant = { agentRunId: aggregate.agentRun.id, stageId: "watch", attempt: 1, taskId: aggregate.agentRun.leadTaskId, turnId: "repair-turn" };
  let active = true;
  const runner = createStageScriptRunner({
    enqueue: async (operation) => operation(),
    requireGrant: (key) => {
      if (key !== "repair-key" || !active) throw new Error("No active grant");
      return { grant, aggregate: get() };
    },
    taskAgent: () => ({ ...getBuiltinAgent("implementer")!, permission: options.readonly ? "read-only" : "auto" }),
    isDelegated: () => options.delegated === true,
    isChecksRepairTurn: (candidate) => options.issued !== false && candidate.turnId === "repair-turn",
    listWorkspaceActionScripts: async () => [{ ...definition, ...(options.changedDefinition ? { definitionHash: "b".repeat(64) } : {}) }, { scriptId: "unrelated", definitionHash: "c".repeat(64) }],
    runWorkspaceScript: async () => {
      executions += 1;
      const revision = options.unchanged ? checked : repaired;
      return { exitCode: options.exitCodes?.[executions - 1] ?? options.exitCode ?? 0, output: "checked", verification: { sourceRevision: revision, completedRevision: revision }, ...definition, executedCommands: "bun test", commandsTruncated: false };
    },
    applyChange: (change) => {
      store.apply(change, at);
    },
  });
  return { runner, get, store, grant, executions: () => executions, revoke: () => { active = false; } };
}

test("an exact host-issued repair can run its inherited frozen check without an action-stage report", async () => {
  const h = repairHarness();
  expect(unmetInheritedWorkspaceChecks(h.get(), currentStageRecord(h.get()))).not.toBeNull();
  expect(await h.runner.run({ agentRunKey: "repair-key", scriptId: "test" })).toMatchObject({ verified: true, exitCode: 0 });
  const record = currentStageRecord(h.get());
  expect(record.report).toBeNull();
  expect(workspaceCheckMet(record, ["test"], [definition])).toBe(false);
  expect(workspaceActionCheckMet(record, ["test"], [definition])).toBe(true);
  expect(unmetInheritedWorkspaceChecks(h.get(), record)).toBeNull();
  expect(collectAcceptanceCriteria(h.get(), true)).toContainEqual({ text: criterion.text, required: true, status: "met" });
  expect(h.executions()).toBe(1);
});

test.each(["ordinary-action-turn", "read-only", "delegated", "other-action", "changed-definition", "unfrozen-script", "ended-turn"])("repair authority refuses %s before execution", async (boundary) => {
  const h = repairHarness({ issued: boundary !== "ordinary-action-turn", readonly: boundary === "read-only", delegated: boundary === "delegated", otherAction: boundary === "other-action", changedDefinition: boundary === "changed-definition" });
  if (boundary === "ended-turn") h.revoke();
  await expect(h.runner.run({ agentRunKey: "repair-key", scriptId: boundary === "unfrozen-script" ? "unrelated" : "test" })).rejects.toThrow();
  expect(h.executions()).toBe(0);
});

test("failed repair checks persist honest evidence and never lift the inherited gate", async () => {
  const h = repairHarness({ exitCode: 1 });
  expect(await h.runner.run({ agentRunKey: "repair-key", scriptId: "test" })).toMatchObject({ verified: false, exitCode: 1 });
  expect(unmetInheritedWorkspaceChecks(h.get(), currentStageRecord(h.get()))).not.toBeNull();
  expect(collectAcceptanceCriteria(h.get(), true)).toContainEqual({ text: criterion.text, required: true, status: "unverified" });
});

test.each([false, true])("a later failed repair check supersedes earlier success, including original work (unchanged: %s)", async (unchanged) => {
  const h = repairHarness({ exitCodes: [0, 1], unchanged });
  expect(await h.runner.run({ agentRunKey: "repair-key", scriptId: "test" })).toMatchObject({ verified: true });
  expect(await h.runner.run({ agentRunKey: "repair-key", scriptId: "test" })).toMatchObject({ verified: false });
  const aggregate = h.get(), record = currentStageRecord(aggregate);
  expect(record.facts?.workspaceScripts?.map((result) => result.exitCode)).toEqual([0, 1]);
  expect(unmetInheritedWorkspaceChecks(aggregate, record)).not.toBeNull();
  aggregate.agentRun.workflow.stages.pop();
  expect(unmetStageAcceptance(aggregate, record)).not.toBeNull();
  expect(collectAcceptanceCriteria(aggregate, true)).toContainEqual({ text: criterion.text, required: true, status: "unverified" });
  expect(describeDoneWhen({ ...aggregate, report: null, events: [] })).toContainEqual(expect.objectContaining({ text: criterion.text, status: "unverified" }));
  expect(classifyStageEvidence(null, record.facts)[0]?.freshness).toBe("stale");
});

test.each([false, true])("an inherited check rerun by the final AI agrees across acceptance, report and result status (reported explicitly: %s)", async (explicit) => {
  const h = repairHarness({ finalAi: true });
  await h.runner.run({ agentRunKey: "repair-key", scriptId: "test" });
  h.store.apply(recordStageReport({ aggregate: h.get(), expected: { stageId: "watch", attempt: 1 }, turnId: h.grant.turnId,
    workspaceRevision: repaired, now: new Date(h.get().agentRun.updatedAt), report: { outcome: "complete", summary: "Rechecked the final assignment.",
      ...(explicit ? { acceptanceCriteria: [{ text: criterion.text, status: "met" }] } : {}) } }), new Date(h.get().agentRun.updatedAt));
  let aggregate = h.get();
  expect(unmetStageAcceptance(aggregate, currentStageRecord(aggregate))).toBeNull();
  aggregate = { ...aggregate, agentRun: { ...aggregate.agentRun, state: "completed" }, stages: aggregate.stages.map((record) => ({ ...record, facts: { ...record.facts!, workspaceRevision: repaired } })) };
  const report = buildAgentRunReport({ aggregate, workspace: { branch: "test", branchPushed: true, openPullRequest: null }, endedAt: new Date(aggregate.agentRun.updatedAt) });
  expect(report.acceptanceCriteria).toContainEqual(expect.objectContaining({ text: criterion.text, status: "met" }));
  expect(describeDoneWhen({ ...aggregate, report, events: [] })).toContainEqual(expect.objectContaining({ text: criterion.text, status: "met-verified" }));
  expect(describeStaveChecks({ ...aggregate, report, events: [] })).toContain("test");
  const current = currentStageRecord(aggregate);
  current.facts!.workspaceRevision = { ...repaired, revision: "metadata-after-final-report" };
  expect(unmetStageAcceptance(aggregate, current)).not.toBeNull();
  expect(describeDoneWhen({ ...aggregate, report, events: [] })).toContainEqual(expect.objectContaining({ text: criterion.text, status: "unverified" }));
});

test("an unchanged inherited check remains met in a nudge before the current AI reports", async () => {
  const h = repairHarness({ finalAi: true, unchanged: true });
  const aggregate = h.get(), current = currentStageRecord(aggregate);
  h.store.apply({ agentRun: aggregate.agentRun, events: [], upserts: [{ ...current, facts: { ...current.facts!, workspaceRevision: checked } }] }, new Date(aggregate.agentRun.updatedAt));
  expect(currentStageRecord(h.get()).report).toBeNull();
  expect(collectAcceptanceCriteria(h.get())).toContainEqual({ text: criterion.text, required: true, status: "met" });
  expect(compileAgentRunStagePrompt(h.get())).toContain("- [met] Tests pass");
  expect(unmetInheritedWorkspaceChecks(h.get(), currentStageRecord(h.get()))).not.toBeNull();
  // A new receipt still requires its own AI-stage acknowledgment.
  await h.runner.run({ agentRunKey: "repair-key", scriptId: "test" });
  expect(collectAcceptanceCriteria(h.get())).toContainEqual({ text: criterion.text, required: true, status: "unverified" });
});

test.each([false, true])("a later same-ID ordinary script action cannot replace frozen inherited proof (action source: %s)", async (actionSource) => {
  const aggregate = repairAggregate(actionSource);
  aggregate.agentRun.workflow.stages.splice(1, 0, { id: "repeat-test", title: "Test again", kind: "action", action: { type: "run-script", scriptId: "test" } });
  const repeat = { ...createStageRecord({ agentRunId: aggregate.agentRun.id, stageId: "repeat-test", attempt: 1 }), status: "running" as const, facts: { ...EMPTY_STAGE_FACTS, workspaceRevision: repaired } };
  aggregate.stages.push(repeat);
  const store = new AgentRunStore(new Database(":memory:"));
  const at = new Date(aggregate.agentRun.updatedAt);
  store.create({ agentRun: aggregate.agentRun, upserts: aggregate.stages, events: [] }, at);
  const execute = createAgentRunActionExecutor({ store, scm: {} as AgentRunScmPort, resolveWorkspacePath: async () => "/tmp/workspace",
    runScript: async () => ({ ok: true, exitCode: 0, output: "a different configured script passed", definitionHash: "b".repeat(64),
      verification: { sourceRevision: repaired, completedRevision: repaired } }) });
  await execute({ aggregate });
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const outcome = await execute({ aggregate });
  if (outcome.status !== "succeeded") throw new Error(`Expected successful ordinary action, got ${outcome.status}`);
  expect(outcome.result).not.toHaveProperty("definitionHash");
  store.apply({ agentRun: { ...aggregate.agentRun, currentStageIndex: 2 }, events: [], upserts: [{ ...repeat, status: "completed", facts: { ...repeat.facts, action: outcome.result } }] }, at);
  const published = store.getAggregate(aggregate.agentRun.id)!;
  expect(unmetInheritedWorkspaceChecks(published, currentStageRecord(published))).not.toBeNull();
  expect(collectAcceptanceCriteria(published)).toContainEqual({ text: criterion.text, required: true, status: "unverified" });
});

test("a completed Test action's admitted check can repair CI and remain verified through publication", async () => {
  const h = repairHarness({ actionSource: true });
  expect(inheritedWorkspaceCheckCriteria(h.get())).toEqual([{ text: criterion.text, required: true, scriptIds: ["test"], scriptDefinitions: [definition] }]);
  expect(unmetInheritedWorkspaceChecks(h.get(), currentStageRecord(h.get()))).not.toBeNull();
  expect(await h.runner.run({ agentRunKey: "repair-key", scriptId: "test" })).toMatchObject({ verified: true });
  expect(unmetInheritedWorkspaceChecks(h.get(), currentStageRecord(h.get()))).toBeNull();
  let aggregate = h.get();
  aggregate.stages[1] = { ...aggregate.stages[1]!, status: "completed" };
  aggregate.agentRun.currentStageIndex = 2;
  aggregate.stages.push({ ...createStageRecord({ agentRunId: aggregate.agentRun.id, stageId: "ready", attempt: 1 }), facts: { ...EMPTY_STAGE_FACTS, workspaceRevision: repaired } });
  // A live detail refresh replaces every stage's displayed current revision.
  aggregate = { ...aggregate, stages: aggregate.stages.map((record) => ({ ...record, facts: { ...record.facts!, workspaceRevision: repaired } })) };
  expect(unmetStageAcceptance(aggregate, currentStageRecord(aggregate))).toBeNull();
  expect(collectAcceptanceCriteria(aggregate)).toContainEqual({ text: criterion.text, required: true, status: "met" });
  expect(h.executions()).toBe(1);
});

test.each(["legacy-action", "changed-definition", "unfrozen-script"])("a Test action repair refuses %s without expanding authority", async (boundary) => {
  const h = repairHarness({ actionSource: true, legacyAction: boundary === "legacy-action", changedDefinition: boundary === "changed-definition" });
  await expect(h.runner.run({ agentRunKey: "repair-key", scriptId: boundary === "unfrozen-script" ? "unrelated" : "test" })).rejects.toThrow();
  expect(h.executions()).toBe(0);
  expect(unmetInheritedWorkspaceChecks(h.get(), currentStageRecord(h.get()))).not.toBeNull();
});

test("a final Watch action can satisfy its inherited goal with its current repair check", async () => {
  const h = repairHarness();
  await h.runner.run({ agentRunKey: "repair-key", scriptId: "test" });
  const aggregate = h.get();
  aggregate.agentRun.workflow.stages.pop();
  expect(unmetStageAcceptance(aggregate, currentStageRecord(aggregate))).toBeNull();
});

test("mark-ready reuses current repair evidence after historical facts refresh but rejects subsequent content changes", async () => {
  const h = repairHarness();
  await h.runner.run({ agentRunKey: "repair-key", scriptId: "test" });
  let aggregate = h.get();
  aggregate.stages[1] = { ...aggregate.stages[1]!, status: "completed" };
  aggregate.agentRun.currentStageIndex = 2;
  const current = { ...createStageRecord({ agentRunId: aggregate.agentRun.id, stageId: "ready", attempt: 1 }), status: "running" as const, facts: { ...EMPTY_STAGE_FACTS, workspaceRevision: repaired } };
  aggregate.stages.push(current);
  // getDetail refreshes the displayed workspace revision on historical facts.
  aggregate = { ...aggregate, stages: aggregate.stages.map((record) => ({ ...record, facts: { ...record.facts!, workspaceRevision: repaired } })) };
  expect(unmetStageAcceptance(aggregate, currentStageRecord(aggregate))).toBeNull();
  expect(collectAcceptanceCriteria(aggregate)).toContainEqual({ text: criterion.text, required: true, status: "met" });
  const metadataOnly = { ...repaired, revision: "later-metadata" };
  aggregate = { ...aggregate, stages: aggregate.stages.map((record) => ({ ...record, facts: { ...record.facts!, workspaceRevision: metadataOnly } })) };
  expect(unmetStageAcceptance(aggregate, currentStageRecord(aggregate))).toBeNull();
  expect(collectAcceptanceCriteria(aggregate)).toContainEqual({ text: criterion.text, required: true, status: "met" });
  const changed = { ...repaired, revision: "untested", contentRevision: "untested-content" };
  aggregate = { ...aggregate, stages: aggregate.stages.map((record) => ({ ...record, facts: { ...record.facts!, workspaceRevision: changed } })) };
  expect(unmetStageAcceptance(aggregate, currentStageRecord(aggregate))).not.toBeNull();
  expect(collectAcceptanceCriteria(aggregate)).toContainEqual({ text: criterion.text, required: true, status: "unverified" });
});

test("repair prompt and context require frozen checks after the fix commit and no stage report", () => {
  const aggregate = repairAggregate();
  for (const text of [buildChecksRepairPrompt(aggregate, "Repair failing checks."), buildAgentRunTurnContextPart({ aggregate, reason: "repair-checks" }).content]) {
    expect(text).toContain("Commit the finished fix first");
    expect(text).toContain("stave_run_workspace_script");
    expect(text).toContain("`test`");
    expect(text).toContain("verified: true");
    expect(text).toContain("Do not call `stave_report_stage`");
  }
});

test("a later plan reset does not resurrect obsolete host checks through repair evidence", () => {
  const aggregate = repairAggregate();
  aggregate.agentRun.workflow.stages.splice(1, 0, {
    id: "replan", title: "Replan", kind: "ai", role: "plan", instruction: "Replace the goal.", doneWhen: "The new goal is recorded.",
  });
  aggregate.stages.push({ ...createStageRecord({ agentRunId: aggregate.agentRun.id, stageId: "replan", attempt: 1 }), status: "completed", report: {
    ...COMPLETE_REPORT, acceptanceCriteria: [{ text: "New goal", status: "met" }],
  } });
  aggregate.stages[1] = { ...aggregate.stages[1]!, status: "completed", facts: {
    ...EMPTY_STAGE_FACTS, workspaceRevision: repaired, workspaceScripts: [{ source: "stave", type: "run-script", ...definition, exitCode: 0, outputTail: "ok", durationMs: 1, verification: { sourceRevision: repaired, completedRevision: repaired } }],
  } };
  aggregate.agentRun.currentStageIndex = 3;
  aggregate.stages.push({ ...createStageRecord({ agentRunId: aggregate.agentRun.id, stageId: "ready", attempt: 1 }), facts: { ...EMPTY_STAGE_FACTS, workspaceRevision: repaired } });
  expect(collectAcceptanceCriteria(aggregate)).toEqual([{ text: "New goal", status: "met" }]);
  expect(inheritedWorkspaceCheckCriteria(aggregate)).toEqual([]);
});

test.each(["same-text", "empty", "current"])("a plan preserves host authority for goals it retains: %s", (mode) => {
  const aggregate = repairAggregate();
  aggregate.agentRun.workflow.stages.splice(1, 0, { id: "replan", title: "Replan", kind: "ai", role: "plan", instruction: "Replace the goal.", doneWhen: "Recorded." });
  aggregate.stages.push({ ...createStageRecord({ agentRunId: aggregate.agentRun.id, stageId: "replan", attempt: 1 }), status: mode === "current" ? "running" : "completed", report: {
    ...COMPLETE_REPORT, acceptanceCriteria: mode === "empty" ? [] : [{ text: criterion.text, status: "met" }],
  }, facts: { ...EMPTY_STAGE_FACTS, workspaceRevision: repaired } });
  aggregate.agentRun.currentStageIndex = mode === "current" ? 1 : 2;
  if (mode === "same-text") {
    expect(collectAcceptanceCriteria(aggregate)).toEqual([{ text: criterion.text, status: "met" }]);
  }
  expect(inheritedWorkspaceCheckCriteria(aggregate)).toEqual([criterion]);
  expect(unmetInheritedWorkspaceChecks(aggregate, currentStageRecord(aggregate))).not.toBeNull();
});

test("a plan drops absent host goals and later ordinary reports cannot resurrect their removed authority", () => {
  const aggregate = repairAggregate();
  aggregate.agentRun.workflow.stages.splice(1, 0,
    { id: "replan", title: "Replan", kind: "ai", role: "plan", instruction: "Replace the goal.", doneWhen: "Recorded." },
    { id: "reintroduce", title: "Continue", kind: "ai", instruction: "Report another result.", doneWhen: "Reported." });
  for (const [stageId, text] of [["replan", "New goal"], ["reintroduce", criterion.text]] as const) {
    aggregate.stages.push({ ...createStageRecord({ agentRunId: aggregate.agentRun.id, stageId, attempt: 1 }), status: "completed", report: {
      ...COMPLETE_REPORT, acceptanceCriteria: [{ text, status: "met" }],
    }, facts: { ...EMPTY_STAGE_FACTS, workspaceRevision: repaired } });
  }
  aggregate.agentRun.currentStageIndex = 3;
  expect(collectAcceptanceCriteria(aggregate)).toEqual([{ text: "New goal", status: "met" }, { text: criterion.text, status: "met" }]);
  expect(inheritedWorkspaceCheckCriteria(aggregate)).toEqual([]);
  expect(unmetInheritedWorkspaceChecks(aggregate, currentStageRecord(aggregate))).toBeNull();
});

test("a plan's explicitly admitted host check overrides the retained goal's previous binding", () => {
  const aggregate = repairAggregate();
  const replacement = { ...criterion, scriptIds: ["replacement"], scriptDefinitions: [{ scriptId: "replacement", definitionHash: "b".repeat(64) }] };
  aggregate.agentRun.workflow.stages.splice(1, 0, { id: "replan", title: "Replan", kind: "ai", role: "plan", instruction: "Recheck the retained goal.", doneWhen: "Checked.", acceptanceCriteria: [replacement] });
  aggregate.stages.push({ ...createStageRecord({ agentRunId: aggregate.agentRun.id, stageId: "replan", attempt: 1 }), status: "completed", report: {
    ...COMPLETE_REPORT, workspaceRevision: repaired, acceptanceCriteria: [{ text: criterion.text, status: "met" }],
  }, facts: { ...EMPTY_STAGE_FACTS, workspaceRevision: repaired, workspaceScripts: [{ source: "stave", type: "run-script", ...replacement.scriptDefinitions[0]!,
    exitCode: 0, durationMs: 1, outputTail: "ok", verification: { sourceRevision: repaired, completedRevision: repaired } }] } });
  aggregate.agentRun.currentStageIndex = 2;
  expect(inheritedWorkspaceCheckCriteria(aggregate)).toEqual([replacement]);
  expect(unmetInheritedWorkspaceChecks(aggregate, currentStageRecord(aggregate))).toBeNull();
});
