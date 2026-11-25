import { expect, test } from "bun:test";
import { buildAgentRunWorkflow } from "../src/lib/agent-runs/agent-run";
import { createStageRecord, EMPTY_STAGE_FACTS } from "../src/lib/agent-runs/domain";
import { decideAgentRunAction, applyAgentRunDecision } from "../src/lib/agent-runs/policy";
import { agentRunChangesStage, describeAgentRunResult } from "../src/lib/agent-runs/agent-run-status";
import { projectTarsResult } from "../src/lib/tars/result-model";
import { AGENT_RUN_NOW, agentRunDetail, agentRunFixture, applyChange, COMPLETE_REPORT, observe, turn } from "./fixtures/agent-run-fixtures";

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

/** The final repair after a review that asked changes, as Stave read it after its report. */
function repaired(fixedTree: string | null = "fixed-tree") {
  const aggregate = reviewed();
  const review = aggregate.stages[1]!;
  if (review.report?.outcome !== "complete") throw new Error("Expected report");
  aggregate.stages[1] = { ...review, status: "completed", startHeadSha: "b".repeat(40), report: { ...review.report, reviewVerdict: "changes-requested", summary: "Unmount guard missing." } };
  aggregate.agentRun.currentStageIndex = 2;
  const tree = fixedTree ? { status: "known" as const, revision: fixedTree } : undefined;
  aggregate.stages.push({ ...createStageRecord({ agentRunId: aggregate.agentRun.id, stageId: "fix-review", attempt: 1 }), status: "running",
    report: { ...COMPLETE_REPORT, summary: "Added the unmount guard.", ...(tree ? { workspaceRevision: tree } : {}), acceptanceCriteria: [] },
    facts: { ...EMPTY_STAGE_FACTS, changedPaths: fixedTree ? ["src/hook.ts"] : [],
      ...(tree ? { workspaceRevision: tree, diff: { filesChanged: 1, insertions: 3, deletions: 0 } } : {}) } });
  return aggregate;
}

test("a repair that changed the reviewed work returns to the Reviewer once, which then finishes the run on the fixed revision", () => {
  // Recorded failure: work, review (changes requested), fix ended on a revision no Reviewer saw, so Tars blocked it as unverified.
  const aggregate = repaired();
  aggregate.stages[0]!.facts = { ...EMPTY_STAGE_FACTS, changedPaths: ["src/table.ts"], diff: { filesChanged: 1, insertions: 10, deletions: 1 } };
  aggregate.stages[2]!.startHeadSha = "b".repeat(40);
  const decision = decide(aggregate);
  expect(decision).toEqual({ action: "complete-stage", next: "start", reReview: true });
  const change = applyAgentRunDecision({ aggregate, decision, now: AGENT_RUN_NOW });
  expect(change.agentRun).toMatchObject({ state: "running", currentStageIndex: 1 });
  expect(change.upserts.map(({ stageId, status, attempt }) => ({ stageId, status, attempt }))).toEqual([
    { stageId: "fix-review", status: "completed", attempt: 1 }, { stageId: "review", status: "pending", attempt: 2 },
  ]);
  expect(change.upserts[1]!.feedback).toContain(`after ${"b".repeat(40)}`);
  expect(change.upserts[1]!.feedback).toContain("Unmount guard missing.");
  expect(change.events.map((event) => [event.kind, event.detail.reason ?? null])).toEqual([["stage-completed", null], ["stage-retried", "fix-re-review"]]);

  // The re-review passes on the fixed revision: the run finishes and skips the second, empty repair.
  const stages = [...aggregate.stages.slice(0, 2), change.upserts[0]!, { ...change.upserts[1]!, status: "running" as const,
    report: { ...COMPLETE_REPORT, reviewVerdict: "passed" as const, workspaceRevision: { status: "known" as const, revision: "fixed-tree" }, acceptanceCriteria: [] },
    facts: { ...EMPTY_STAGE_FACTS, workspaceRevision: { status: "known" as const, revision: "fixed-tree" } } }];
  const atReReview = { agentRun: change.agentRun, stages };
  const decisionAfterReReview = decide(atReReview);
  expect(decisionAfterReReview).toEqual({ action: "complete-stage", next: "finish", skipReviewFix: true });
  const finished = applyChange(atReReview, applyAgentRunDecision({
    aggregate: atReReview, decision: decisionAfterReReview, now: new Date(AGENT_RUN_NOW.getTime() + 1_000),
  }));
  const detail = agentRunDetail(finished);
  const result = describeAgentRunResult(detail, AGENT_RUN_NOW.getTime() + 1_000);
  expect(result.summaries).toEqual([
    expect.objectContaining({ stageId: "work", text: COMPLETE_REPORT.summary }),
    expect.objectContaining({ stageId: "fix-review", text: "Added the unmount guard." }),
    expect.objectContaining({ stageId: "review", reviewVerdict: "passed" }),
  ]);
  expect(result.changes).toBeNull();
  expect(agentRunChangesStage(detail)).toBeNull();
  expect(projectTarsResult({
    outcome: "completed",
    row: { agentRunId: detail.agentRun.id, acceptanceCriteria: [] },
    run: detail,
  }).changes).toEqual({ files: 2, lines: null });
});

test("a re-review that still asks changes gets one more repair, and the run then finishes without a third review", () => {
  const aggregate = repaired();
  const firstReview = aggregate.stages[1]!;
  aggregate.stages.splice(2, 0, { ...firstReview, attempt: 2, startHeadSha: "c".repeat(40) });
  expect(decide(aggregate)).toEqual({ action: "complete-stage", next: "finish" });
});

test.each(["unchanged-repair", "review-passed", "review-sign-off"])("a repair finishes the run without a re-review when %s", (boundary) => {
  const aggregate = repaired(boundary === "unchanged-repair" ? null : "fixed-tree");
  if (boundary === "unchanged-repair") aggregate.stages[2]!.facts!.workspaceRevision = { status: "known", revision: "reviewed-tree" };
  const review = aggregate.stages[1]!;
  if (boundary === "review-passed" && review.report?.outcome === "complete") review.report.reviewVerdict = "passed";
  if (boundary === "review-sign-off") aggregate.agentRun.workflow.stages[1]!.signOff = "ask";
  expect(decide(aggregate)).toEqual({ action: "complete-stage", next: "finish" });
});

/** A behavior-changes run whose work stage answered without changing a file, as Stave read it after the report. */
function answered(mode: "behavior-changes" | "always" = "behavior-changes") {
  const workflow = buildAgentRunWorkflow({ agent: { name: "Supervisor", permission: "auto", reviewBeforeDone: mode }, now: AGENT_RUN_NOW });
  const aggregate = agentRunFixture({ workflow });
  const tree = { status: "known" as const, revision: "answered-tree" };
  aggregate.stages[0] = { ...aggregate.stages[0]!, status: "running", startHeadSha: "a".repeat(40),
    report: { ...COMPLETE_REPORT, workspaceRevision: tree, acceptanceCriteria: [{ text: "Question answered", status: "met" }] },
    facts: { ...EMPTY_STAGE_FACTS, changedPaths: [], workspaceRevision: tree } };
  return aggregate;
}

test("work that changed no files finishes without its review and repair, and records why for both", () => {
  const aggregate = answered();
  const decision = decide(aggregate);
  expect(decision).toEqual({ action: "complete-stage", next: "finish", skipUnchangedReview: true });
  const change = applyAgentRunDecision({ aggregate, decision, now: AGENT_RUN_NOW });
  expect(change.agentRun).toMatchObject({ state: "completed", currentStageIndex: 2, turnCount: aggregate.agentRun.turnCount });
  expect(change.upserts.map(({ stageId, status }) => ({ stageId, status }))).toEqual([
    { stageId: "work", status: "completed" }, { stageId: "review", status: "skipped" }, { stageId: "fix-review", status: "skipped" },
  ]);
  expect(change.upserts[1]!.detail).toContain("changed no files");
  expect(change.upserts[2]!.detail).toContain("changed no files");
  expect(change.events.map((event) => event.kind)).toEqual(["stage-completed", "stage-skipped", "stage-skipped", "agent-run-ended"]);
  expect(change.events.filter((event) => event.kind === "stage-skipped").map((event) => event.detail.reason)).toEqual(["work-unchanged", "work-unchanged"]);
});

test.each(["changed-files", "truncated-paths", "unread-paths", "no-start-commit", "changed-after-report", "unknown-workspace", "unmet-goal", "always", "review-sign-off", "repair-sign-off", "explicit-check"])(
  "work is reviewed as before when %s",
  (boundary) => {
    const aggregate = answered(boundary === "always" ? "always" : "behavior-changes"), record = aggregate.stages[0]!;
    if (boundary === "changed-files") record.facts!.changedPaths = ["src/billing.ts"];
    if (boundary === "truncated-paths") record.facts!.changedPathsTruncated = true;
    if (boundary === "unread-paths") delete record.facts!.changedPaths;
    if (boundary === "no-start-commit") record.startHeadSha = null;
    if (boundary === "changed-after-report") record.facts!.workspaceRevision = { status: "known", revision: "edited-after-report" };
    if (boundary === "unknown-workspace") record.facts!.workspaceRevision = { status: "unknown", reason: "unavailable" };
    if (boundary === "unmet-goal") record.report = { ...COMPLETE_REPORT, acceptanceCriteria: [{ text: "Question answered", status: "unverified" }] };
    const [, review, repair] = aggregate.agentRun.workflow.stages;
    if (boundary === "review-sign-off") review!.signOff = "ask";
    if (boundary === "repair-sign-off") repair!.signOff = "ask";
    if (boundary === "explicit-check") repair!.acceptanceCriteria = [{ text: "Check final revision", verification: "stave-check" }];
    const decision = decide(aggregate);
    expect(decision).not.toHaveProperty("skipUnchangedReview");
    // Unmet work blocks; everything else moves on to the review (or asks first).
    if (boundary !== "unmet-goal") expect(decision).toMatchObject({ action: "complete-stage", next: boundary === "review-sign-off" ? "sign-off" : "start" });
  },
);

test("a decision to skip the review is re-checked when applied: work changed since it was made is reviewed", () => {
  const aggregate = answered();
  const decision = decide(aggregate);
  aggregate.stages[0]!.facts!.changedPaths = ["src/billing.ts"];
  const change = applyAgentRunDecision({ aggregate, decision, now: AGENT_RUN_NOW });
  expect(change.agentRun).toMatchObject({ state: "running", currentStageIndex: 1 });
  expect(change.upserts.map(({ stageId, status }) => ({ stageId, status }))).toEqual([
    { stageId: "work", status: "completed" }, { stageId: "review", status: "pending" },
  ]);
});
