import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unmetInheritedWorkspaceChecks, unmetStageAcceptance } from "../src/lib/agent-runs/acceptance";
import { describeDoneWhen } from "../src/lib/agent-runs/agent-run-status";
import { projectAgentRunStages } from "../src/lib/agent-runs/agent-run-view";
import { buildAgentRunReport } from "../src/lib/agent-runs/report";
import { readWorkspaceRevision } from "../electron/host-service/supervision/workspace-revision";
import { createAgentRunActionExecutor, type AgentRunScmPort } from "../electron/host-service/supervision/agent-run-actions";
import { revisionsMatch } from "../src/lib/agent-runs/verification-contract";
import { createStageRecord, currentStageRecord, EMPTY_STAGE_FACTS } from "../src/lib/agent-runs/domain";
import { decideAgentRunAction } from "../src/lib/agent-runs/policy";
import { WorkflowSchema, type WorkflowStage } from "../src/lib/workflows/schema";
import { agentRunFixture, AGENT_RUN_NOW, COMPLETE_REPORT, observe, patchCurrent, turn } from "./fixtures/agent-run-fixtures";

const original = { status: "known" as const, revision: "tested-tree" };
const edited = { status: "known" as const, revision: "changed-tree" };
const definition = { scriptId: "test", definitionHash: "a".repeat(64) };
const criterion = { text: "Tests pass", required: true, verification: "stave-check" as const, scriptIds: ["test"], scriptDefinitions: [definition] };
const ai = (id: string): WorkflowStage => ({ id, title: id, kind: "ai", instruction: "Continue.", doneWhen: "Done." });
const checkedScript = (revision = original) => ({
  source: "stave" as const, type: "run-script" as const, scriptId: "test", definitionHash: definition.definitionHash,
  exitCode: 0, durationMs: 1, outputTail: "ok", verification: { sourceRevision: revision, completedRevision: revision },
});

function inheritedCheck(options: { action?: boolean; currentRevision?: typeof original; finalAction?: boolean } = {}) {
  const base = agentRunFixture();
  const first: WorkflowStage = options.action
    ? { id: "test", title: "Test", kind: "action", action: { type: "run-script", scriptId: "test" }, acceptanceCriteria: [{ text: criterion.text, required: true }] }
    : { ...ai("test"), acceptanceCriteria: [criterion] };
  const last: WorkflowStage = options.finalAction
    ? { id: "finish", title: "Finish", kind: "action", action: { type: "open-draft-pr" } }
    : ai("finish");
  const aggregate = agentRunFixture({ workflow: WorkflowSchema.parse({ ...base.agentRun.workflow, checkIns: "when-stuck", stages: [first, last] }) });
  aggregate.stages[0] = {
    ...aggregate.stages[0]!, status: "completed",
    report: options.action ? null : { ...COMPLETE_REPORT, acceptanceCriteria: [{ text: criterion.text, status: "met" }], workspaceRevision: original },
    facts: { ...EMPTY_STAGE_FACTS, workspaceRevision: original,
      ...(options.action ? { action: { type: "run-script", scriptId: "test", exitCode: 0, verification: { sourceRevision: original, completedRevision: original }, outputTail: "ok" } } : { workspaceScripts: [checkedScript()] }),
    },
  };
  aggregate.agentRun.currentStageIndex = 1;
  const currentRevision = options.currentRevision ?? edited;
  aggregate.stages.push({
    ...createStageRecord({ agentRunId: aggregate.agentRun.id, stageId: "finish", attempt: 1 }), status: "running",
    report: options.finalAction ? null : { ...COMPLETE_REPORT, acceptanceCriteria: [], workspaceRevision: currentRevision },
    facts: { ...EMPTY_STAGE_FACTS, workspaceRevision: currentRevision },
  });
  return aggregate;
}

test("a prior AI host check cannot complete an edited final revision", () => {
  const aggregate = inheritedCheck();
  expect(unmetStageAcceptance(aggregate, currentStageRecord(aggregate))).not.toBeNull();
  expect(decideAgentRunAction({ aggregate, observation: observe({ lastEndedTurn: turn() }), now: AGENT_RUN_NOW })).toMatchObject({ action: "block", reason: "acceptance-unmet" });
});

test("a prior host check stands when the final report and workspace still match its revision", () => {
  const aggregate = inheritedCheck({ currentRevision: original });
  expect(unmetStageAcceptance(aggregate, currentStageRecord(aggregate))).toBeNull();
  const unknown = { status: "unknown" as const, reason: "unavailable" as const };
  const missing = patchCurrent(aggregate, { facts: { ...EMPTY_STAGE_FACTS, workspaceRevision: unknown } });
  expect(unmetStageAcceptance(missing, currentStageRecord(missing))).not.toBeNull();
  const editedAfterReport = patchCurrent(aggregate, { facts: { ...EMPTY_STAGE_FACTS, workspaceRevision: edited } });
  expect(unmetStageAcceptance(editedAfterReport, currentStageRecord(editedAfterReport))).not.toBeNull();
});

test("the final stage can satisfy an inherited host requirement by rerunning its frozen script", () => {
  let aggregate = inheritedCheck();
  aggregate = patchCurrent(aggregate, { facts: { ...EMPTY_STAGE_FACTS, workspaceRevision: edited, workspaceScripts: [checkedScript(edited)] } });
  expect(unmetStageAcceptance(aggregate, currentStageRecord(aggregate))).toBeNull();
  for (const check of [
    { ...checkedScript(edited), exitCode: 1 },
    { ...checkedScript(edited), definitionHash: "b".repeat(64) },
    { ...checkedScript(edited), scriptId: "unrelated" },
    checkedScript(original),
  ]) {
    const failed = patchCurrent(aggregate, { facts: { ...EMPTY_STAGE_FACTS, workspaceRevision: edited, workspaceScripts: [check] } });
    expect(unmetStageAcceptance(failed, currentStageRecord(failed))).not.toBeNull();
  }
});

test("an agent's final met claim cannot replace a host check of a different revision", () => {
  const aggregate = patchCurrent(inheritedCheck(), { report: { ...COMPLETE_REPORT, workspaceRevision: edited, acceptanceCriteria: [{ text: criterion.text, status: "met" }] } });
  expect(unmetStageAcceptance(aggregate, currentStageRecord(aggregate))).not.toBeNull();
});

test("Run script action checks also remain tied to the final revision", () => {
  for (const finalAction of [false, true]) {
    const changed = inheritedCheck({ action: true, finalAction });
    expect(unmetStageAcceptance(changed, currentStageRecord(changed))).not.toBeNull();
    const unchanged = inheritedCheck({ action: true, finalAction, currentRevision: original });
    expect(unmetStageAcceptance(unchanged, currentStageRecord(unchanged))).toBeNull();
  }
});

test("metadata-only publication keeps action-check evidence consistent in goals, stages and the final report", () => {
  const checked = { ...original, contentRevision: "tested-content" };
  const committed = { ...edited, contentRevision: "tested-content" };
  const aggregate = inheritedCheck({ action: true, finalAction: true, currentRevision: committed });
  aggregate.agentRun.state = "completed";
  const record = aggregate.stages[0]!;
  record.facts = { ...EMPTY_STAGE_FACTS, workspaceRevision: committed, action: {
    type: "run-script", scriptId: "test", exitCode: 0, outputTail: "ok",
    verification: { sourceRevision: checked, completedRevision: checked },
  } };
  const report = buildAgentRunReport({ aggregate, workspace: { branch: "test", branchPushed: true, openPullRequest: null }, endedAt: AGENT_RUN_NOW });
  const detail = { ...aggregate, report, events: [] };
  expect(unmetStageAcceptance(aggregate, currentStageRecord(aggregate))).toBeNull();
  expect(describeDoneWhen(detail)).toContainEqual(expect.objectContaining({ text: criterion.text, status: "met-verified" }));
  expect(projectAgentRunStages(detail, AGENT_RUN_NOW)[0]?.evidence[0]?.freshness).toBe("current");
  expect(report.stages[0]?.evidence[0]?.freshness).toBe("current");
  for (const stage of aggregate.stages) stage.facts.workspaceRevision = { ...committed, contentRevision: "changed" };
  expect(describeDoneWhen(detail)).toContainEqual(expect.objectContaining({ text: criterion.text, status: "unverified" }));
  expect(projectAgentRunStages(detail, AGENT_RUN_NOW)[0]?.evidence[0]?.freshness).toBe("stale");
});

test("agent-reported criteria already met remain valid across later work", () => {
  const aggregate = inheritedCheck();
  aggregate.agentRun.workflow.stages[0] = { ...ai("test"), acceptanceCriteria: [{ text: "Review written", required: true }] };
  aggregate.stages[0] = { ...aggregate.stages[0]!, report: { ...COMPLETE_REPORT, acceptanceCriteria: [{ text: "Review written", status: "met" }] }, facts: EMPTY_STAGE_FACTS };
  expect(unmetStageAcceptance(aggregate, currentStageRecord(aggregate))).toBeNull();
});

for (const hookChangesContents of [false, true]) {
  test(`a publication commit preserves inherited verification only when file contents stay tested (hook changes: ${hookChangesContents})`, async () => {
    const cwd = mkdtempSync(join(tmpdir(), "stave-inherited-publication-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" });
    const commit = () => git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: save work");
    try {
      git("init"); writeFileSync(join(cwd, "code.txt"), "original"); git("add", "."); commit();
      writeFileSync(join(cwd, "code.txt"), "tested implementation");
      writeFileSync(join(cwd, "new.txt"), "tested new file");
      const checked = await readWorkspaceRevision(cwd);
      if (checked.status !== "known") throw new Error("Expected checked revision");
      const aggregate = inheritedCheck({ finalAction: true, currentRevision: checked });
      aggregate.stages[0] = {
        ...aggregate.stages[0]!, report: { ...COMPLETE_REPORT, workspaceRevision: checked, acceptanceCriteria: [{ text: criterion.text, status: "met" }] },
        facts: { ...EMPTY_STAGE_FACTS, workspaceRevision: checked, workspaceScripts: [checkedScript(checked)] },
      };
      expect(unmetInheritedWorkspaceChecks(aggregate, currentStageRecord(aggregate))).toBeNull();
      if (hookChangesContents) {
        const hook = join(cwd, ".git", "hooks", "pre-commit");
        writeFileSync(hook, "#!/bin/sh\nprintf '%s' 'untested hook modification' > code.txt\ngit add code.txt\n");
        chmodSync(hook, 0o755);
      }
      let pushes = 0, opened = 0;
      const executor = createAgentRunActionExecutor({
        store: { recordEvent: () => true, listEventsByKind: () => [] }, resolveWorkspacePath: async () => cwd,
        scm: {
          currentBranch: async () => "feature", readBaseBranch: async () => "main", readPullRequest: async () => ({ ok: true, value: null }),
          hasUncommittedChanges: async () => true,
          commitAll: async () => { git("add", "."); commit(); return { ok: true, value: true }; },
          hasUnpushedCommits: async () => true,
          push: async () => { pushes += 1; return { ok: true, value: true }; },
          readCommitLog: async () => ({ baseBranch: "main", log: "test: save work" }),
          createDraftPullRequest: async () => { opened += 1; return { ok: true, value: { url: "https://github.com/acme/app/pull/1", created: true } }; },
        } as AgentRunScmPort,
      });
      const outcome = await executor({ aggregate, verifyWorkspace: async () => {
        const current = await readWorkspaceRevision(cwd);
        return unmetInheritedWorkspaceChecks(aggregate, { ...currentStageRecord(aggregate), facts: { ...EMPTY_STAGE_FACTS, workspaceRevision: current } });
      } });
      const completed = await readWorkspaceRevision(cwd);
      if (completed.status !== "known") throw new Error("Expected committed revision");
      expect(revisionsMatch(checked, completed)).toBe(false);
      const final = patchCurrent(aggregate, { facts: { ...EMPTY_STAGE_FACTS, workspaceRevision: completed } });
      if (hookChangesContents) {
        expect(outcome.status).toBe("failed");
        expect(pushes).toBe(0); expect(opened).toBe(0);
        expect(completed.contentRevision).not.toBe(checked.contentRevision);
        expect(unmetStageAcceptance(final, currentStageRecord(final))).not.toBeNull();
      } else {
        expect(outcome.status).toBe("succeeded");
        expect(pushes).toBe(1); expect(opened).toBe(1);
        expect(completed.contentRevision).toBe(checked.contentRevision);
        expect(unmetStageAcceptance(final, currentStageRecord(final))).toBeNull();
      }
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
}
