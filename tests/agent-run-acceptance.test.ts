import { expect, test } from "bun:test";
import { unmetStageAcceptance, unreportedStageCriteria } from "../src/lib/agent-runs/acceptance";
import { currentStageRecord, createStageRecord, StageCompleteReportInputSchema } from "../src/lib/agent-runs/domain";
import { decideAgentRunAction } from "../src/lib/agent-runs/policy";
import { WorkflowSchema, WORKFLOW_LIMITS, MAX_WORKFLOW_STAGES, MAX_STAGE_ACCEPTANCE_CRITERIA } from "../src/lib/workflows/schema";
import { COMPLETE_REPORT, AGENT_RUN_NOW, agentRunFixture, observe, patchCurrent, turn } from "./fixtures/agent-run-fixtures";

const ai = (id: string) => ({ id, title: id, kind: "ai" as const, instruction: "Do this stage.", doneWhen: "This stage is done." });

test("a last-stage report can restate the full workflow's criteria, each as long as a Done when", () => {
  const text = (index: number) => `${index} ${"x".repeat(WORKFLOW_LIMITS.doneWhen - 4)}`;
  const report = (count: number) => ({ summary: "Done", acceptanceCriteria: Array.from({ length: count }, (_, index) => ({ text: text(index), status: "met" as const })) });
  const capacity = MAX_WORKFLOW_STAGES * MAX_STAGE_ACCEPTANCE_CRITERIA;
  expect(capacity).toBe(240);
  expect(StageCompleteReportInputSchema.safeParse(report(capacity)).success).toBe(true);
  expect(StageCompleteReportInputSchema.safeParse(report(capacity + 1)).success).toBe(false);
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

test("the unmet detail says whether the report named the criterion and with which status", () => {
  const stage = { ...ai("answer"), acceptanceCriteria: [{ text: "Answer supplied" }] };
  const detail = (criteria: typeof COMPLETE_REPORT.acceptanceCriteria) => unmetStageAcceptance(reported([stage], criteria), currentStageRecord(reported([stage], criteria)));
  expect(detail([])).toBe("The stage report did not name this criterion by its exact text: Answer supplied");
  expect(detail([{ text: "Answer: supplied with evidence", status: "met" }])).toBe("The stage report did not name this criterion by its exact text: Answer supplied");
  expect(detail([{ text: "Answer supplied", status: "unverified" }])).toBe("The stage report marked this criterion unverified: Answer supplied");
  expect(detail([{ text: "Answer supplied", status: "unmet" }])).toBe("The stage report marked this criterion unmet: Answer supplied");
  expect(detail([{ text: " Answer supplied ", status: "met" }])).toBeNull();
});

test("a report must name each required criterion by its exact text, but not optional criteria or host checks", () => {
  const stage = { ...ai("work"), acceptanceCriteria: [{ text: "Readable text" }, { text: "Focus ring" }, { text: "Nice to have", required: false }, { text: "Tests pass", verification: "stave-check", scriptIds: ["test"] }] };
  const aggregate = reported([stage, ai("review")]);
  const record = currentStageRecord(aggregate);
  expect(unreportedStageCriteria(aggregate, record, { acceptanceCriteria: [{ text: "Readable text: tokens applied", status: "met" }] })).toEqual(["Readable text", "Focus ring"]);
  expect(unreportedStageCriteria(aggregate, record, { acceptanceCriteria: [{ text: "Readable text ", status: "met" }, { text: "Focus ring", status: "unverified" }] })).toEqual([]);
  expect(unreportedStageCriteria(aggregate, record, {})).toEqual(["Readable text", "Focus ring"]);
  // A re-report replaces the earlier one: its criteria neither count nor add requirements.
  const earlier = patchCurrent(aggregate, { report: { ...COMPLETE_REPORT, acceptanceCriteria: [{ text: "Readable text", status: "met" }, { text: "Focus ring", status: "met" }, { text: "Extra claim", status: "met" }] } });
  expect(unreportedStageCriteria(earlier, currentStageRecord(earlier), {})).toEqual(["Readable text", "Focus ring"]);
  expect(unreportedStageCriteria(earlier, currentStageRecord(earlier), { acceptanceCriteria: [{ text: "Readable text", status: "met" }, { text: "Focus ring", status: "met" }] })).toEqual([]);
});

test("the final stage must also name the goal criteria an earlier stage left unmet; a planning stage only its own", () => {
  let aggregate = aggregateFor([{ ...ai("plan"), role: "plan", acceptanceCriteria: [{ text: "Plan written" }] }, ai("build")]);
  aggregate = patchCurrent(aggregate, { status: "running" });
  expect(unreportedStageCriteria(aggregate, currentStageRecord(aggregate), { acceptanceCriteria: [{ text: "Tests pass", status: "unverified" }] })).toEqual(["Plan written"]);
  aggregate.stages[0] = { ...aggregate.stages[0]!, status: "completed", report: { ...COMPLETE_REPORT, acceptanceCriteria: [{ text: "Tests pass", status: "unverified" }, { text: "Docs updated", status: "met" }] } };
  aggregate.agentRun.currentStageIndex = 1;
  aggregate.stages.push({ ...createStageRecord({ agentRunId: aggregate.agentRun.id, stageId: "build", attempt: 1 }), status: "running" });
  const record = currentStageRecord(aggregate);
  // "Docs updated" was met earlier and stands; "Tests pass" must be restated.
  expect(unreportedStageCriteria(aggregate, record, { acceptanceCriteria: [] })).toEqual(["Tests pass"]);
  expect(unreportedStageCriteria(aggregate, record, { acceptanceCriteria: [{ text: "Tests pass", status: "met" }] })).toEqual([]);
});

test("a delegated run whose report leaves a criterion unmet ends for its parent instead of halting", () => {
  // A reviewer that reports the reviewed work's problem as unmet: a primary run halts, a delegated one ends.
  const aggregate = reported([ai("review")], [{ text: "Design-system violations fixed without changing the check", status: "unmet" }]);
  expect(decide(aggregate)).toMatchObject({ action: "block", reason: "acceptance-unmet" });
  const delegated = decideAgentRunAction({ aggregate, observation: { ...observe({ lastEndedTurn: turn({ turnId: "turn-1" }) }), delegated: true }, now: AGENT_RUN_NOW });
  expect(delegated).toMatchObject({ action: "stop", reason: "acceptance-unmet", detail: expect.stringContaining("Design-system violations") });
  // A delegated run whose report meets its criteria still completes.
  const met = reported([ai("review")], [{ text: "Review written", status: "met" }]);
  expect(decideAgentRunAction({ aggregate: met, observation: { ...observe({ lastEndedTurn: turn({ turnId: "turn-1" }) }), delegated: true }, now: AGENT_RUN_NOW })).toEqual({ action: "complete-stage", next: "finish" });
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
  // An optional host check of the same text on the last stage that has not passed reopens the required criterion.
  aggregate.agentRun.workflow.stages[1] = { ...ai("fix"), acceptanceCriteria: [{ text: "The review lists each defect", required: false, verification: "stave-check", scriptDefinitions: [{ scriptId: "check", definitionHash: "a".repeat(64) }] }] };
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
