import { expect, test } from "bun:test";
import { unmetStageAcceptance } from "../src/lib/missions/acceptance";
import { currentStageRecord, createStageRecord } from "../src/lib/missions/domain";
import { decideMissionAction } from "../src/lib/missions/policy";
import { WorkflowSchema } from "../src/lib/workflows/schema";
import { COMPLETE_REPORT, MISSION_NOW, missionFixture, observe, patchCurrent, turn } from "./fixtures/mission-fixtures";

const ai = (id: string) => ({ id, title: id, kind: "ai" as const, instruction: "Do this stage.", doneWhen: "This stage is done." });
function aggregateFor(stages: unknown[]) {
  const base = missionFixture();
  return missionFixture({ workflow: WorkflowSchema.parse({ ...base.mission.workflow, checkIns: "when-stuck", stages }) });
}
function reported(stages: unknown[], criteria: typeof COMPLETE_REPORT.acceptanceCriteria = []) {
  return patchCurrent(aggregateFor(stages), { status: "running", report: { ...COMPLETE_REPORT, acceptanceCriteria: criteria } });
}
const decide = (aggregate: ReturnType<typeof missionFixture>, id = "turn-1") => decideMissionAction({ aggregate, observation: observe({ lastEndedTurn: turn({ turnId: id }) }), now: MISSION_NOW });

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
  aggregate.mission.currentStageIndex = 1;
  aggregate.stages.push({ ...createStageRecord({ missionId: aggregate.mission.id, stageId: "build", attempt: 1 }), status: "running", report: { ...COMPLETE_REPORT, acceptanceCriteria: [] } });
  expect(decide(aggregate)).toEqual({ action: "complete-stage", next: "start" });
  aggregate = patchCurrent(aggregate, { report: { ...COMPLETE_REPORT, acceptanceCriteria: [{ text: "Tests pass", status: "unverified" }] } });
  expect(decide(aggregate)).toEqual({ action: "complete-stage", next: "start" });
  aggregate.mission.currentStageIndex = 2;
  aggregate.stages.push({ ...createStageRecord({ missionId: aggregate.mission.id, stageId: "test", attempt: 1 }), status: "running", report: { ...COMPLETE_REPORT, acceptanceCriteria: [] } });
  expect(decide(aggregate)).toMatchObject({ action: "block", reason: "acceptance-unmet" });
  aggregate = patchCurrent(aggregate, { report: { ...COMPLETE_REPORT, acceptanceCriteria: [{ text: "Tests pass", status: "met" }] } });
  expect(decide(aggregate)).toEqual({ action: "complete-stage", next: "finish" });
});

test("a later timestamp cannot make a previous turn's explicit report current", () => {
  const aggregate = patchCurrent(reported([ai("answer")]), { report: { ...COMPLETE_REPORT, acceptanceCriteria: [], reportedAt: "2026-09-26T11:00:00.000Z" } });
  expect(decide(aggregate, "turn-2").action).not.toBe("complete-stage");
  expect(decide(aggregate).action).toBe("complete-stage");
});

test("Stave checks are reachable only through a Run script action, whose omitted verification defaults to a check", () => {
  const base = aggregateFor([ai("answer")]).mission.workflow;
  expect(WorkflowSchema.safeParse({ ...base, stages: [{ ...ai("answer"), acceptanceCriteria: [{ text: "Tests pass", verification: "stave-check" }] }] }).success).toBe(false);
  expect(WorkflowSchema.safeParse({ ...base, stages: [{ id: "publish", title: "Publish", kind: "action", action: { type: "open-draft-pr" }, acceptanceCriteria: [{ text: "Tests pass" }] }] }).success).toBe(false);
  const aggregate = aggregateFor([{ id: "check", title: "Check", kind: "action", action: { type: "run-script", scriptId: "test" }, acceptanceCriteria: [{ text: "Tests pass" }] }]);
  const record = currentStageRecord(aggregate);
  expect(unmetStageAcceptance(aggregate, record)).not.toBeNull();
});

test("final actions cannot bypass an unresolved global goal criterion", () => {
  for (const action of [{ type: "open-draft-pr" as const }, { type: "run-script" as const, scriptId: "test" }]) {
    const aggregate = aggregateFor([{ ...ai("plan"), role: "plan" }, { id: "finish", title: "Finish", kind: "action", action }]);
    aggregate.stages[0] = { ...aggregate.stages[0]!, status: "completed", report: COMPLETE_REPORT };
    aggregate.mission.currentStageIndex = 1;
    const record = { ...createStageRecord({ missionId: aggregate.mission.id, stageId: "finish", attempt: 1 }), status: "running" as const };
    aggregate.stages.push(record);
    expect(unmetStageAcceptance(aggregate, record)).toContain("Export button exists");
  }
});
