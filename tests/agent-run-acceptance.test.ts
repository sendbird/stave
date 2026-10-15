import { expect, test } from "bun:test";
import { unmetStageAcceptance } from "../src/lib/agent-runs/acceptance";
import { currentStageRecord, createStageRecord, StageCompleteReportInputSchema } from "../src/lib/agent-runs/domain";
import { decideAgentRunAction } from "../src/lib/agent-runs/policy";
import { WorkflowSchema, WORKFLOW_LIMITS } from "../src/lib/workflows/schema";
import { COMPLETE_REPORT, AGENT_RUN_NOW, agentRunFixture, observe, patchCurrent, turn } from "./fixtures/agent-run-fixtures";

const ai = (id: string) => ({ id, title: id, kind: "ai" as const, instruction: "Do this stage.", doneWhen: "This stage is done." });

test("a last-stage report can restate two full stages of criteria, each as long as a Done when", () => {
  const text = (index: number) => `${index} ${"x".repeat(WORKFLOW_LIMITS.doneWhen - 4)}`;
  const report = (count: number) => ({ summary: "Done", acceptanceCriteria: Array.from({ length: count }, (_, index) => ({ text: text(index), status: "met" as const })) });
  expect(StageCompleteReportInputSchema.safeParse(report(40)).success).toBe(true);
  expect(StageCompleteReportInputSchema.safeParse(report(41)).success).toBe(false);
});
function aggregateFor(stages: unknown[]) {
  const base = agentRunFixture();
  return agentRunFixture({ workflow: WorkflowSchema.parse({ ...base.agentRun.workflow, checkIns: "when-stuck", stages }) });
}
function reported(stages: unknown[], criteria: typeof COMPLETE_REPORT.acceptanceCriteria = []) {
  return patchCurrent(aggregateFor(stages), { status: "running", report: { ...COMPLETE_REPORT, acceptanceCriteria: criteria } });
}
const decide = (aggregate: ReturnType<typeof agentRunFixture>, id = "turn-1") => decideAgentRunAction({ aggregate, observation: observe({ lastEndedTurn: turn({ turnId: id }) }), now: AGENT_RUN_NOW });

test("complete reports with unmet or missing stage requirements block; simple answers need no shell", () => {
  const stage = { ...ai("answer"), acceptanceCriteria: [{ text: "Answer supplied" }] };
  expect(decide(reported([stage]))).toMatchObject({ action: "block", reason: "acceptance-unmet" });
  expect(decide(reported([stage], [{ text: "Answer supplied", status: "unverified" }]))).toMatchObject({ action: "block" });
  expect(decide(reported([stage], [{ text: "Answer supplied", status: "met" }]))).toEqual({ action: "complete-stage", next: "finish" });
  expect(decide(reported([ai("answer")]))).toEqual({ action: "complete-stage", next: "finish" });
  expect(decide(reported([{ ...stage, acceptanceCriteria: [{ text: "Answer supplied", required: false }] }], [{ text: "Answer supplied", status: "unverified" }]))).toEqual({ action: "complete-stage", next: "finish" });
});

test("a build stage can precede testing, but final integration cannot leave goal criteria unresolved", () => {
  let aggregate = aggregateFor([{ ...ai("plan"), role: "plan" }, ai("build"), ai("test")]);
  aggregate.stages[0] = { ...aggregate.stages[0]!, status: "completed", report: { ...COMPLETE_REPORT, acceptanceCriteria: [{ text: "Tests pass", status: "unverified" }] } };
  aggregate.agentRun.currentStageIndex = 1;
  aggregate.stages.push({ ...createStageRecord({ agentRunId: aggregate.agentRun.id, stageId: "build", attempt: 1 }), status: "running", report: { ...COMPLETE_REPORT, acceptanceCriteria: [] } });
  expect(decide(aggregate)).toEqual({ action: "complete-stage", next: "start" });
  aggregate = patchCurrent(aggregate, { report: { ...COMPLETE_REPORT, acceptanceCriteria: [{ text: "Tests pass", status: "unverified" }] } });
  expect(decide(aggregate)).toEqual({ action: "complete-stage", next: "start" });
  aggregate.agentRun.currentStageIndex = 2;
  aggregate.stages.push({ ...createStageRecord({ agentRunId: aggregate.agentRun.id, stageId: "test", attempt: 1 }), status: "running", report: { ...COMPLETE_REPORT, acceptanceCriteria: [] } });
  expect(decide(aggregate)).toMatchObject({ action: "block", reason: "acceptance-unmet" });
  aggregate = patchCurrent(aggregate, { report: { ...COMPLETE_REPORT, acceptanceCriteria: [{ text: "Tests pass", status: "met" }] } });
  expect(decide(aggregate)).toEqual({ action: "complete-stage", next: "finish" });
});

test("a goal criterion an earlier stage met need not be restated by the last stage, unless the last stage reports it otherwise", () => {
  let aggregate = aggregateFor([ai("review"), ai("fix")]);
  aggregate.stages[0] = { ...aggregate.stages[0]!, status: "completed", report: { ...COMPLETE_REPORT, acceptanceCriteria: [{ text: "The review lists each defect", status: "met" }, { text: "Tests pass", status: "unverified" }] } };
  aggregate.agentRun.currentStageIndex = 1;
  aggregate.stages.push({ ...createStageRecord({ agentRunId: aggregate.agentRun.id, stageId: "fix", attempt: 1 }), status: "running", report: { ...COMPLETE_REPORT, acceptanceCriteria: [] } });
  // The not-yet-met goal criterion must still be met here.
  expect(decide(aggregate)).toMatchObject({ action: "block", reason: "acceptance-unmet" });
  aggregate = patchCurrent(aggregate, { report: { ...COMPLETE_REPORT, acceptanceCriteria: [{ text: "Tests pass", status: "met" }] } });
  expect(decide(aggregate)).toEqual({ action: "complete-stage", next: "finish" });
  // Reported again as unmet on the final work, the earlier "met" no longer stands.
  aggregate = patchCurrent(aggregate, { report: { ...COMPLETE_REPORT, acceptanceCriteria: [{ text: "Tests pass", status: "met" }, { text: "The review lists each defect", status: "unmet" }] } });
  expect(decide(aggregate)).toMatchObject({ action: "block", reason: "acceptance-unmet" });
  // Restating a required criterion as optional and unverified does not lift it.
  aggregate = patchCurrent(aggregate, { report: { ...COMPLETE_REPORT, acceptanceCriteria: [{ text: "Tests pass", status: "met" }, { text: "The review lists each defect", required: false, status: "unverified" }] } });
  expect(decide(aggregate)).toMatchObject({ action: "block", reason: "acceptance-unmet" });
  // The last stage's own criterion is checked whatever an earlier stage reported.
  aggregate.agentRun.workflow.stages[1] = { ...ai("fix"), acceptanceCriteria: [{ text: "The review lists each defect" }] };
  aggregate = patchCurrent(aggregate, { report: { ...COMPLETE_REPORT, acceptanceCriteria: [{ text: "Tests pass", status: "met" }] } });
  expect(decide(aggregate)).toMatchObject({ action: "block", reason: "acceptance-unmet" });
});

test("a later timestamp cannot make a previous turn's explicit report current", () => {
  const aggregate = patchCurrent(reported([ai("answer")]), { report: { ...COMPLETE_REPORT, acceptanceCriteria: [], reportedAt: "2026-09-26T11:00:00.000Z" } });
  expect(decide(aggregate, "turn-2").action).not.toBe("complete-stage");
  expect(decide(aggregate).action).toBe("complete-stage");
});

test("Stave checks are allowed on AI and Run script stages; action defaults remain checks", () => {
  const base = aggregateFor([ai("answer")]).agentRun.workflow;
  expect(WorkflowSchema.safeParse({ ...base, stages: [{ ...ai("answer"), acceptanceCriteria: [{ text: "Tests pass", verification: "stave-check" }] }] }).success).toBe(true);
  expect(WorkflowSchema.safeParse({ ...base, stages: [{ id: "publish", title: "Publish", kind: "action", action: { type: "open-draft-pr" }, acceptanceCriteria: [{ text: "Tests pass" }] }] }).success).toBe(false);
  const aggregate = aggregateFor([{ id: "check", title: "Check", kind: "action", action: { type: "run-script", scriptId: "test" }, acceptanceCriteria: [{ text: "Tests pass" }] }]);
  const record = currentStageRecord(aggregate);
  expect(unmetStageAcceptance(aggregate, record)).not.toBeNull();
});

test("final actions cannot bypass an unresolved global goal criterion", () => {
  for (const action of [{ type: "open-draft-pr" as const }, { type: "run-script" as const, scriptId: "test" }]) {
    const aggregate = aggregateFor([{ ...ai("plan"), role: "plan" }, { id: "finish", title: "Finish", kind: "action", action }]);
    aggregate.stages[0] = { ...aggregate.stages[0]!, status: "completed", report: COMPLETE_REPORT };
    aggregate.agentRun.currentStageIndex = 1;
    const record = { ...createStageRecord({ agentRunId: aggregate.agentRun.id, stageId: "finish", attempt: 1 }), status: "running" as const };
    aggregate.stages.push(record);
    expect(unmetStageAcceptance(aggregate, record)).toContain("Export button exists");
  }
});
