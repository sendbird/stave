import { describe, expect, test } from "bun:test";
import {
  hasStaveVerifiedOutcome, TARS_REVIEW_CHECK_SCOPE, tarsExecutionAgentInstructions, tarsFinalStageRecord, tarsObservation, tarsWorkflow,
} from "../electron/host-service/tars-execution";
import { createAgentRun, createStageRecord, type AgentRunStageRecord } from "../src/lib/agent-runs/domain";
import type { AgentRunDetail } from "../src/lib/agent-runs/api";
import { mayFinishUnchangedWork } from "../src/lib/agent-runs/review-finalization";
import { FIX_REVIEW_STAGE_ID, REVIEW_STAGE_ID } from "../src/lib/agents/review-before-done";
import { getBuiltinAgent } from "../src/lib/agents/starters";
import { AGENT_CONFIG_LIMITS } from "../src/lib/agents/schema";
import { WorkflowSchema, workflowTextLength, MAX_WORKFLOW_TEXT_LENGTH, WORKFLOW_LIMITS, type Workflow } from "../src/lib/workflows/schema";
import type { TarsResponsibility } from "../src/lib/tars/types";

const NOW = "2026-11-12T00:00:00.000Z";
const row = (patch: Partial<TarsResponsibility> = {}) => ({ id: "goal", model: null, agentId: null,
  acceptanceCriteria: ["Search works"], ...patch }) as unknown as TarsResponsibility;
const instructionOf = (workflow: Workflow, index: number) => {
  const stage = workflow.stages[index];
  return stage?.kind === "ai" ? stage.instruction : "";
};

describe("Tars execution workflow", () => {
  test("is one Supervisor work stage followed by the conditional review and fix stages", () => {
    for (const patch of [{}, { agentId: "implementer" }, { model: "gpt-6.1-sol" }]) {
      const workflow = WorkflowSchema.parse(tarsWorkflow(row(patch), NOW));
      expect(workflow.stages.map((stage) => stage.id)).toEqual(["work", REVIEW_STAGE_ID, FIX_REVIEW_STAGE_ID]);
      expect(workflowTextLength(workflow)).toBeLessThan(MAX_WORKFLOW_TEXT_LENGTH);
      const [work, review, fix] = workflow.stages;
      expect(instructionOf(workflow, 1).length).toBeLessThanOrEqual(WORKFLOW_LIMITS.instruction - 150);
      expect(work).toMatchObject({ kind: "ai", acceptanceCriteria: [{ text: "Search works", required: true }] });
      // Review runs only when files changed, and the fix stage only when the review asked for changes.
      expect(review).toMatchObject({ kind: "ai", agentConfigId: "reviewer", pinCommit: true, skipIfWorkUnchanged: true });
      expect(fix).toMatchObject({ kind: "ai", skipIfReviewPassed: true });
      expect(fix && "agentConfigId" in fix ? fix.agentConfigId : undefined).toBeUndefined();
      // The run engine recognizes the shape it may finish early.
      expect(mayFinishUnchangedWork({ workflow, currentStageIndex: 0 })).toBe(true);
    }
  });

  test("the work stage keeps the Supervisor's do-it-yourself guidance and commits for review", () => {
    const work = instructionOf(tarsWorkflow(row(), NOW), 0);
    expect(work).toContain("Do small or tightly coupled work yourself");
    expect(work).toContain("commit only its changes, then run the final checks on that commit");
    expect(work).toContain("do not create an empty commit");
    const assigned = tarsWorkflow(row({ agentId: "implementer" }), NOW);
    expect(assigned.stages[0]).toMatchObject({ agentConfigId: "implementer" });
    expect(instructionOf(assigned, 0)).toContain("same-workspace");
  });

  test("names the full checks once per revision, never in the review", () => {
    const workflow = tarsWorkflow(row(), NOW);
    const [work, review, fix] = [0, 1, 2].map((index) => instructionOf(workflow, index));
    expect(work).toContain("narrowest checks that cover what changed");
    expect(work).toContain("never rerun a check that already passed on that revision");
    expect(fix).toContain("Commit your fix first, then run the full checks once on that final commit");
    expect(work).toContain("Commit first, then run the repository's full checks once on that final commit");
    expect(review).toContain(TARS_REVIEW_CHECK_SCOPE);
    expect(review).not.toMatch(/full (checks|suite)/);
    // The old blanket permission to rerun every script is gone.
    expect(review).not.toContain("test, lint and typecheck scripts");
    expect(review).toContain("provider that did not write the change");
    expect(instructionOf(tarsWorkflow(row({ model: "gpt-6.1-sol" }), NOW), 1)).toContain("stays on this provider and model");
  });

  test("the lead runs the Supervisor's own instructions with the Tars rules after them, within the agent limit", () => {
    const supervisor = getBuiltinAgent("supervisor")!.instructions;
    const composed = tarsExecutionAgentInstructions(supervisor, { model: null, agentId: "implementer",
      workingChanges: { kind: "snapshot", commit: "0123456789abcdef", ref: "refs/stave/x" } as never,
      attachments: { items: Array.from({ length: 8 }, (_, index) => ({ name: `attachment-${index}-with-a-long-file-name.png` })) } as never });
    expect(composed.startsWith(supervisor)).toBe(true);
    expect(composed).toContain("Do small or tightly coupled work yourself");
    expect(composed).toContain("these Tars rules win");
    expect(composed).toContain("do not push, open or update a pull request, or call Shipper");
    expect(composed).toContain("Commit verified work on this workspace's branch");
    expect(composed.length).toBeLessThanOrEqual(AGENT_CONFIG_LIMITS.instructions);
  });
});

describe("Tars completion over the conditional stages", () => {
  const workflow = tarsWorkflow(row(), NOW);
  const run = createAgentRun({ id: "run", input: { workspaceId: "execution", leadTaskId: "task", origin: "agent", workflow,
    assignment: "Fix search.", consent: { checkIns: "when-stuck", permissionMode: "auto", authorizedEffectStageIds: [] } },
  repositoryPath: "/tmp/repository", fingerprint: { providerId: "codex", model: "model" }, now: new Date(NOW) }).agentRun;
  const at = (minutes: number) => new Date(Date.parse(NOW) + minutes * 60_000).toISOString();
  const revision = (value: string) => ({ status: "known", revision: value }) as const;
  type Patch = Partial<Omit<AgentRunStageRecord, "report" | "facts">> & { report?: Record<string, unknown> | null; facts?: Record<string, unknown> | null };
  const record = (stageId: string, patch: Patch = {}, attempt = 1) => ({
    ...createStageRecord({ agentRunId: "run", stageId, attempt }), status: "completed", startedAt: at(1), endedAt: at(2), ...patch,
  }) as unknown as AgentRunStageRecord;
  const facts = (rev: string, extra: Record<string, unknown> = {}) => ({ currentTurnId: "turn", workspaceRevision: revision(rev), diff: null,
    commands: [], toolCalls: [], action: null, ...extra });
  const complete = (extra: Record<string, unknown> = {}) => ({ outcome: "complete", summary: "Done.", decisions: [], evidence: [], artifacts: [],
    reportedAt: at(2), turnId: "turn", ...extra });
  const checked = (rev: string, exitCode = 0) => ({
    report: complete({ evidence: [{ label: "Tests pass", kind: "check", command: "bun test tests/search.test.ts" }] }),
    facts: facts(rev, { commands: [{ command: "bun test tests/search.test.ts", exitCode, toolCallId: "call", turnId: "turn",
      outcome: exitCode === 0 ? "succeeded" : "failed", provenance: "provider-structured", sourceRevision: revision(rev) }] }),
  });
  const skipped = (stageId: string) => record(stageId, { status: "skipped", startedAt: null });
  const ended = (stages: AgentRunStageRecord[]): AgentRunDetail => ({ agentRun: { ...run, state: "completed", currentStageIndex: 2 }, stages, events: [],
    report: { outcome: "completed", acceptanceCriteria: [{ text: "Search works", required: true, status: "met" }] } } as unknown as AgentRunDetail);
  const observe = (detail: AgentRunDetail, reverifyAfter: string | null = null) =>
    tarsObservation(detail, ["Search works"], reverifyAfter, { completionGoal: "implementation" });
  const unverified = { state: "blocked", detailCode: "unverifiedCompletion" };
  const stale = { state: "blocked", detailCode: "staleVerification" };

  // An answer: Stave read the workspace after the report and found nothing changed since the stage began.
  const answer = (patch: Patch = {}) => record("work", { startHeadSha: "a".repeat(40),
    report: complete({ workspaceRevision: revision("r1") }), facts: facts("r1", { changedPaths: [] }), ...patch });
  const reviewed = (verdict: "passed" | "changes-requested", rev = "r2", patch: Patch = {}) => record(REVIEW_STAGE_ID, {
    report: complete({ reviewVerdict: verdict, workspaceRevision: revision(rev) }), facts: facts(rev), ...patch });

  test("a turn-limit pause preserves its reason even when the current stage has explanatory words", () => {
    const detail = ended([record("work", { status: "running", detail: "Finishing the checks." })]);
    detail.agentRun = { ...detail.agentRun, state: "paused", pauseReason: "limit-reached", currentStageIndex: 0, turnCount: 30 };
    expect(observe(detail)).toMatchObject({ state: "waiting", detail: "Finishing the checks.", detailCode: "runPaused",
      detailParams: { reason: "limit-reached" }, runTurns: 30, runStage: "work#1" });
  });

  test("unchanged work completes from its report with the review and fix skipped", () => {
    const detail = ended([answer(), skipped(REVIEW_STAGE_ID), skipped(FIX_REVIEW_STAGE_ID)]);
    expect(tarsFinalStageRecord(detail)?.stageId).toBe("work");
    expect(observe(detail)).toMatchObject({ state: "completed", resultVerifiedRunId: "run" });
    // Changed files, or a list Stave could not read in full, still need a check or a review.
    for (const patch of [{ facts: facts("r1", { changedPaths: ["src/search.ts"] }) }, { facts: facts("r1", { changedPaths: [], changedPathsTruncated: true }) },
      { startHeadSha: null }, { facts: facts("r9", { changedPaths: [] }) }])
      expect(observe(ended([answer(patch), skipped(REVIEW_STAGE_ID), skipped(FIX_REVIEW_STAGE_ID)]))).toMatchObject(unverified);
  });

  test("changed work skipped past its review by the user still needs a Stave check", () => {
    const work = record("work", { report: complete(), facts: facts("r2", { changedPaths: ["src/search.ts"] }) });
    expect(observe(ended([work, skipped(REVIEW_STAGE_ID), skipped(FIX_REVIEW_STAGE_ID)]))).toMatchObject(unverified);
    expect(observe(ended([record("work", { ...checked("r2") }), skipped(REVIEW_STAGE_ID), skipped(FIX_REVIEW_STAGE_ID)])).state).toBe("completed");
  });

  test("a passed review completes the work with the fix stage skipped, only on the revision it reviewed", () => {
    const work = record("work", { report: complete(), facts: facts("r2", { changedPaths: ["src/search.ts"] }) });
    const detail = ended([work, reviewed("passed"), skipped(FIX_REVIEW_STAGE_ID)]);
    expect(tarsFinalStageRecord(detail)?.stageId).toBe(REVIEW_STAGE_ID);
    expect(observe(detail).state).toBe("completed");
    // The reviewer reported a revision other than the one Stave read at the stage's end.
    expect(observe(ended([work, reviewed("passed", "r1", { facts: facts("r2") }), skipped(FIX_REVIEW_STAGE_ID)]))).toMatchObject(unverified);
    expect(observe(ended([work, reviewed("changes-requested"), skipped(FIX_REVIEW_STAGE_ID)]))).toMatchObject(unverified);
  });

  test("a check the work stage passed on the revision the review left unchanged also verifies it", () => {
    // The reviewer's own verdict was lost, but the work's check ran on the very revision the run ended on.
    const detail = ended([record("work", checked("r2")), reviewed("changes-requested"), skipped(FIX_REVIEW_STAGE_ID)]);
    expect(hasStaveVerifiedOutcome(detail, tarsFinalStageRecord(detail))).toBe(true);
    expect(observe(ended([record("work", checked("r1")), reviewed("changes-requested"), skipped(FIX_REVIEW_STAGE_ID)]))).toMatchObject(unverified);
  });

  test("after requested changes, the fix stage's own check on the final revision completes the work", () => {
    const work = record("work", checked("r2"));
    const fixed = (rev: string, exitCode = 0) => ended([work, reviewed("changes-requested"), record(FIX_REVIEW_STAGE_ID, checked(rev, exitCode))]);
    expect(tarsFinalStageRecord(fixed("r3"))?.stageId).toBe(FIX_REVIEW_STAGE_ID);
    expect(observe(fixed("r3")).state).toBe("completed");
    expect(observe(fixed("r3", 1))).toMatchObject(unverified);
    // A fix without a check rests on the agent's claim: the review saw r2, the run ended on r3.
    expect(observe(ended([work, reviewed("changes-requested"), record(FIX_REVIEW_STAGE_ID, { report: complete(), facts: facts("r3") })])))
      .toMatchObject(unverified);
  });

  test("a hand-back needs fresh evidence on whichever stage the run ended", () => {
    const handedBack = at(3);
    // The review's attempt started before the hand-back: its pass may predate the user's changes.
    const work = record("work", { report: complete(), facts: facts("r2", { changedPaths: ["src/search.ts"] }) });
    expect(observe(ended([work, reviewed("passed"), skipped(FIX_REVIEW_STAGE_ID)]), handedBack)).toMatchObject(stale);
    expect(observe(ended([work, reviewed("passed", "r2", { startedAt: at(4), endedAt: at(5) }), skipped(FIX_REVIEW_STAGE_ID)]), handedBack).state)
      .toBe("completed");
    // Unchanged work read after the hand-back covers anything the user changed since the stage began.
    expect(observe(ended([answer({ endedAt: at(4) }), skipped(REVIEW_STAGE_ID), skipped(FIX_REVIEW_STAGE_ID)]), handedBack).state).toBe("completed");
    expect(observe(ended([answer(), skipped(REVIEW_STAGE_ID), skipped(FIX_REVIEW_STAGE_ID)]), handedBack)).toMatchObject(stale);
    // The fix stage's check counts only from an attempt that started after it.
    const fixedAt = (startedAt: string) => ended([work, reviewed("changes-requested"),
      record(FIX_REVIEW_STAGE_ID, { ...checked("r3"), startedAt, endedAt: at(6) })]);
    expect(observe(fixedAt(at(2)), handedBack)).toMatchObject(stale);
    expect(observe(fixedAt(at(4)), handedBack).state).toBe("completed");
  });

  test("only the latest attempt of a stage counts", () => {
    const work = record("work", { report: complete(), facts: facts("r2", { changedPaths: ["src/search.ts"] }) });
    const detail = ended([work, reviewed("passed"), reviewed("changes-requested", "r2", {}), skipped(FIX_REVIEW_STAGE_ID)]
      .map((item, index) => index === 2 ? { ...item, attempt: 2 } : item));
    expect(observe(detail)).toMatchObject(unverified);
  });
});
