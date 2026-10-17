import { expect, test } from "bun:test";
import { buildAgentRunWorkflow } from "../src/lib/agent-runs/agent-run";
import { createStageRecord, EMPTY_STAGE_FACTS } from "../src/lib/agent-runs/domain";
import { decideAgentRunAction, applyAgentRunDecision } from "../src/lib/agent-runs/policy";
import { AGENT_RUN_NOW, agentRunFixture, COMPLETE_REPORT, observe, turn } from "./fixtures/agent-run-fixtures";

function reviewed() {
  const workflow = buildAgentRunWorkflow({ agent: { name: "Writer", permission: "auto", reviewBeforeDone: "always" }, now: AGENT_RUN_NOW });
  const aggregate = agentRunFixture({ workflow });
  aggregate.stages[0] = { ...aggregate.stages[0]!, status: "completed", report: { ...COMPLETE_REPORT, acceptanceCriteria: [{ text: "Answer checked", status: "met" }] } };
  aggregate.agentRun.currentStageIndex = 1;
  aggregate.stages.push({ ...createStageRecord({ agentRunId: aggregate.agentRun.id, stageId: "review", attempt: 1 }), status: "running",
    report: { ...COMPLETE_REPORT, reviewVerdict: "passed", workspaceRevision: { status: "known", revision: "reviewed-tree" }, acceptanceCriteria: [] },
    facts: { ...EMPTY_STAGE_FACTS, workspaceRevision: { status: "known", revision: "reviewed-tree" } } });
  return aggregate;
}
const decide = (aggregate: ReturnType<typeof reviewed>) => decideAgentRunAction({ aggregate, observation: observe({ lastEndedTurn: turn() }), now: AGENT_RUN_NOW });

test("a successful independent review skips only its empty final repair and records why", () => {
  const aggregate = reviewed();
  const decision = decide(aggregate);
  expect(decision).toEqual({ action: "complete-stage", next: "finish", skipReviewFix: true });
  const change = applyAgentRunDecision({ aggregate, decision, now: AGENT_RUN_NOW });
  expect(change.agentRun).toMatchObject({ state: "completed", currentStageIndex: 2, turnCount: aggregate.agentRun.turnCount });
  expect(change.upserts.map(({ stageId, status }) => ({ stageId, status }))).toEqual([
    { stageId: "review", status: "completed" }, { stageId: "fix-review", status: "skipped" },
  ]);
  expect(change.upserts[1]!.detail).toContain("independent review passed");
  expect(change.events.map((event) => event.kind)).toEqual(["stage-completed", "stage-skipped", "agent-run-ended"]);
});

test.each(["missing-verdict", "findings", "changed-workspace", "unknown-workspace", "unmet-goal", "explicit-check", "custom-stage", "sign-off", "no-independent-review"])("does not skip repair when %s", (boundary) => {
  const aggregate = reviewed(), record = aggregate.stages[1]!;
  if (record.report?.outcome !== "complete") throw new Error("Expected report");
  if (boundary === "missing-verdict") delete record.report.reviewVerdict;
  if (boundary === "findings") record.report.reviewVerdict = "changes-requested";
  if (boundary === "changed-workspace") record.facts!.workspaceRevision = { status: "known", revision: "changed" };
  if (boundary === "unknown-workspace") delete record.facts!.workspaceRevision;
  if (boundary === "unmet-goal") aggregate.stages[0]!.report = { ...COMPLETE_REPORT, acceptanceCriteria: [{ text: "Required check", status: "unverified" }] };
  if (boundary === "explicit-check") aggregate.agentRun.workflow.stages[2]!.acceptanceCriteria = [{ text: "Check final revision", verification: "stave-check" }];
  const next = aggregate.agentRun.workflow.stages[2]!, review = aggregate.agentRun.workflow.stages[1]!;
  if (boundary === "custom-stage" && next.kind === "ai") delete next.skipIfReviewPassed;
  if (boundary === "sign-off") next.signOff = "ask";
  if (boundary === "no-independent-review" && review.kind === "ai") delete review.agentConfigId;
  expect(decide(aggregate)).not.toHaveProperty("skipReviewFix");
});

test("optional verification stays optional while skipping empty repair", () => {
  const aggregate = reviewed();
  aggregate.stages[0]!.report = { ...COMPLETE_REPORT, acceptanceCriteria: [{ text: "Live check", required: false, status: "unverified" }] };
  expect(decide(aggregate)).toHaveProperty("skipReviewFix", true);
});

test.each([false, true])("empty repair cannot bypass an inherited host check (stale: %s)", (stale) => {
  const aggregate = reviewed();
  const work = aggregate.agentRun.workflow.stages[0]!;
  const revision = { status: "known" as const, revision: stale ? "earlier-tree" : "reviewed-tree" };
  const definition = { scriptId: "test", definitionHash: "a".repeat(64) };
  work.acceptanceCriteria = [{ text: "Tests pass", verification: "stave-check", scriptIds: ["test"], scriptDefinitions: [definition] }];
  aggregate.stages[0] = { ...aggregate.stages[0]!, report: { ...COMPLETE_REPORT, workspaceRevision: revision, acceptanceCriteria: [{ text: "Tests pass", status: "met" }] }, facts: {
    ...EMPTY_STAGE_FACTS, workspaceRevision: revision, workspaceScripts: [{ source: "stave", type: "run-script", ...definition, exitCode: 0, durationMs: 1, outputTail: "ok", verification: { sourceRevision: revision, completedRevision: revision } }],
  } };
  expect(decide(aggregate)).toMatchObject(stale ? { next: "start" } : { skipReviewFix: true });
});
