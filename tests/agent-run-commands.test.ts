import { describe, expect, test } from "bun:test";
import {
  acceptAgentRunRuntime,
  cancelAgentRun,
  pauseAgentRun,
  recordStageReport,
  requestStageChanges,
  resumeAgentRun,
  retryStage,
  signOffStage,
  skipStage,
} from "../src/lib/agent-runs/commands";
import {
  AGENT_RUN_LIMITS,
  AgentRunCommandError,
  currentStageRecord,
  enterStage,
  type AgentRunAggregate,
} from "../src/lib/agent-runs/domain";
import { applyAgentRunDecision, decideAgentRunAction } from "../src/lib/agent-runs/policy";
import type { Workflow } from "../src/lib/workflows/schema";
import {
  COMPLETE_REPORT,
  AGENT_RUN_NOW,
  applyChange,
  agentRunFixture,
  observe,
  patchCurrent,
  turn,
} from "./fixtures/agent-run-fixtures";

function refusal(run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (error instanceof AgentRunCommandError) return { code: error.code, message: error.message };
    throw error;
  }
  throw new Error("expected the command to be refused");
}

function identity(aggregate: AgentRunAggregate) {
  const record = currentStageRecord(aggregate);
  return { stageId: record.stageId, attempt: record.attempt };
}

/** Drives the supervisor until it needs something from the user or the agent. */
function settle(aggregate: AgentRunAggregate, observation = observe()) {
  let current = aggregate;
  for (let index = 0; index < 20; index += 1) {
    const decision = decideAgentRunAction({ aggregate: current, observation, now: AGENT_RUN_NOW });
    if (decision.action === "idle" || decision.action === "start-stage-turn" || decision.action === "execute-action") {
      return { aggregate: current, decision };
    }
    current = applyChange(current, applyAgentRunDecision({ aggregate: current, decision, now: AGENT_RUN_NOW }));
  }
  throw new Error("the run did not settle");
}

/** Request → PR, waiting at the Build sign-off after Understand reported. */
function atBuildSignOff() {
  const aggregate = agentRunFixture();
  const started = applyChange(
    aggregate,
    applyAgentRunDecision({
      aggregate,
      decision: decideAgentRunAction({ aggregate, observation: observe(), now: AGENT_RUN_NOW }),
      now: AGENT_RUN_NOW,
    }),
  );
  const reported = patchCurrent(started, { report: COMPLETE_REPORT, reportRevision: 1 });
  return settle(reported, observe({ lastEndedTurn: turn() })).aggregate;
}

describe("sign-off cards", () => {
  test("approving the waiting stage lets the supervisor start it", () => {
    const waiting = atBuildSignOff();
    expect(currentStageRecord(waiting)).toMatchObject({ stageId: "build", status: "awaiting-sign-off" });
    const approved = applyChange(waiting, signOffStage({ aggregate: waiting, expected: identity(waiting), now: AGENT_RUN_NOW }));
    expect(currentStageRecord(approved).status).toBe("running");
    expect(decideAgentRunAction({ aggregate: approved, observation: observe(), now: AGENT_RUN_NOW })).toEqual({
      action: "start-stage-turn",
      stageIndex: 1,
      attempt: 1,
      reason: "stage-start",
    });
  });

  test("a card rendered for an earlier attempt is refused as stale", () => {
    const waiting = atBuildSignOff();
    expect(
      refusal(() => signOffStage({ aggregate: waiting, expected: { stageId: "build", attempt: 2 }, now: AGENT_RUN_NOW })),
    ).toMatchObject({ code: "stale-identity" });
    expect(
      refusal(() => signOffStage({ aggregate: waiting, expected: { stageId: "understand", attempt: 1 }, now: AGENT_RUN_NOW })),
    ).toMatchObject({ code: "stale-identity" });
  });

  test("Ask for changes starts the previous AI stage at attempt + 1 with the feedback", () => {
    const waiting = atBuildSignOff();
    const change = requestStageChanges({
      aggregate: waiting,
      expected: identity(waiting),
      feedback: "  Also cover the invoices table.  ",
      now: AGENT_RUN_NOW,
    });
    const rerun = applyChange(waiting, change);
    expect(rerun.agentRun.currentStageIndex).toBe(0);
    expect(currentStageRecord(rerun)).toMatchObject({
      stageId: "understand",
      attempt: 2,
      status: "pending",
      feedback: "Also cover the invoices table.",
    });
    // The card's own record never started, so it waits as pending.
    expect(rerun.stages.find((record) => record.stageId === "build")?.status).toBe("pending");
    expect(decideAgentRunAction({ aggregate: rerun, observation: observe(), now: AGENT_RUN_NOW })).toEqual({
      action: "start-stage-turn",
      stageIndex: 0,
      attempt: 2,
      reason: "stage-start",
      feedback: "Also cover the invoices table.",
    });
    expect(change.events.map((event) => event.kind)).toEqual(["changes-requested"]);
  });

  test("Ask for changes needs an earlier AI stage and some feedback", () => {
    const actionsOnly: Workflow = {
      ...agentRunFixture().agentRun.workflow,
      checkIns: "every-stage",
      stages: [
        { id: "open", title: "Open draft PR", kind: "action", action: { type: "open-draft-pr" } },
        { id: "ready", title: "Ready for review", kind: "action", action: { type: "mark-pr-ready" } },
      ],
    };
    const aggregate = agentRunFixture({ workflow: actionsOnly });
    const waiting: AgentRunAggregate = {
      agentRun: { ...aggregate.agentRun, currentStageIndex: 1 },
      stages: [
        { ...aggregate.stages[0]!, status: "completed" },
        { ...aggregate.stages[0]!, stageId: "ready", status: "awaiting-sign-off" },
      ],
    };
    expect(
      refusal(() => requestStageChanges({ aggregate: waiting, expected: identity(waiting), feedback: "Wait", now: AGENT_RUN_NOW })),
    ).toMatchObject({ code: "no-previous-ai-stage" });
    expect(
      refusal(() => requestStageChanges({ aggregate: atBuildSignOff(), expected: { stageId: "build", attempt: 1 }, feedback: "  ", now: AGENT_RUN_NOW })),
    ).toMatchObject({ code: "invalid-state" });
  });
});

describe("stage controls", () => {
  test("skip moves on, and skipping the last stage completes the run", () => {
    const waiting = atBuildSignOff();
    const skipped = applyChange(waiting, skipStage({ aggregate: waiting, expected: identity(waiting), now: AGENT_RUN_NOW }));
    expect(skipped.stages.find((record) => record.stageId === "build")?.status).toBe("skipped");
    expect(currentStageRecord(skipped).stageId).toBe("verify");

    const last: AgentRunAggregate = {
      agentRun: { ...waiting.agentRun, currentStageIndex: 5 },
      stages: [...waiting.stages, { ...waiting.stages[0]!, stageId: "ready-for-review", attempt: 1, status: "awaiting-sign-off", report: null }],
    };
    const done = skipStage({ aggregate: last, expected: identity(last), now: AGENT_RUN_NOW });
    expect(done.agentRun.state).toBe("completed");
    expect(done.events.map((event) => event.kind)).toEqual(["stage-skipped", "agent-run-ended"]);
  });

  test("a running stage can be skipped only while no turn runs", () => {
    const running = patchCurrent(agentRunFixture(), { status: "running", startedAt: AGENT_RUN_NOW.toISOString() });
    expect(refusal(() => skipStage({ aggregate: running, expected: identity(running), now: AGENT_RUN_NOW }))).toMatchObject({
      code: "invalid-state",
      message: '"Understand" is running, so this is not available.',
    });
    const skipped = applyChange(
      running,
      skipStage({ aggregate: running, expected: identity(running), now: AGENT_RUN_NOW, betweenTurns: true }),
    );
    expect(skipped.stages.find((record) => record.stageId === "understand")?.status).toBe("skipped");
    expect(currentStageRecord(skipped).stageId).toBe("build");
  });

  test("retry replaces a stuck attempt with a fresh one", () => {
    const stuck = patchCurrent(agentRunFixture(), { status: "stuck", detail: "No report." });
    const retried = applyChange(stuck, retryStage({ aggregate: stuck, expected: identity(stuck), now: AGENT_RUN_NOW }));
    expect(retried.stages.map((record) => [record.attempt, record.status])).toEqual([
      [1, "cancelled"],
      [2, "pending"],
    ]);
    expect(refusal(() => retryStage({ aggregate: agentRunFixture(), expected: { stageId: "understand", attempt: 1 }, now: AGENT_RUN_NOW }))).toMatchObject({
      code: "invalid-state",
    });
  });

  test("a stage stops taking new attempts at its limit", () => {
    const aggregate = agentRunFixture();
    const exhausted = patchCurrent(aggregate, { attempt: AGENT_RUN_LIMITS.maxStageAttempts, status: "completed" });
    expect(refusal(() => enterStage({ aggregate: exhausted, index: 0 }))).toMatchObject({ code: "attempt-limit" });
  });
});

describe("run controls", () => {
  test("pause and resume by hand; a supervisor pause cannot be resumed by hand", () => {
    const aggregate = agentRunFixture();
    const paused = applyChange(aggregate, pauseAgentRun({ aggregate, reason: "paused-by-user", now: AGENT_RUN_NOW }));
    expect(paused.agentRun).toMatchObject({ state: "paused", pauseReason: "paused-by-user" });
    const resumed = applyChange(paused, resumeAgentRun({ aggregate: paused, now: AGENT_RUN_NOW }));
    expect(resumed.agentRun).toMatchObject({ state: "running", pauseReason: null });

    const automatic: AgentRunAggregate = {
      ...aggregate,
      agentRun: { ...aggregate.agentRun, state: "paused", pauseReason: "runtime-changed", reasonDetail: "Runtime changed." },
    };
    expect(refusal(() => resumeAgentRun({ aggregate: automatic, now: AGENT_RUN_NOW }))).toEqual({
      code: "invalid-state",
      message: "Runtime changed.",
    });
    const accepted = acceptAgentRunRuntime({
      aggregate: automatic,
      fingerprint: { providerId: "codex", model: "gpt-5" },
      now: AGENT_RUN_NOW,
    });
    expect(accepted.agentRun).toMatchObject({
      state: "running",
      pauseReason: null,
      fingerprint: { providerId: "codex", model: "gpt-5" },
    });
  });

  test("cancel ends the run and its current stage, once", () => {
    const aggregate = agentRunFixture();
    const cancelled = applyChange(aggregate, cancelAgentRun({ aggregate, now: AGENT_RUN_NOW }));
    expect(cancelled.agentRun.state).toBe("cancelled");
    expect(currentStageRecord(cancelled).status).toBe("cancelled");
    expect(refusal(() => cancelAgentRun({ aggregate: cancelled, now: AGENT_RUN_NOW }))).toMatchObject({ code: "not-active" });
    expect(refusal(() => pauseAgentRun({ aggregate: cancelled, reason: "taken-over", now: AGENT_RUN_NOW }))).toMatchObject({
      code: "not-active",
    });
  });
});

describe("stage reports", () => {
  function running() {
    return patchCurrent(agentRunFixture(), { status: "running", startedAt: AGENT_RUN_NOW.toISOString() });
  }

  test("records the report for the stage the grant names, stamped by the host", () => {
    const aggregate = running();
    const change = recordStageReport({
      aggregate,
      expected: identity(aggregate),
      report: { outcome: "complete", summary: "Done.", decisions: [], evidence: [], artifacts: [] },
      turnId: "turn-9",
      now: AGENT_RUN_NOW,
    });
    expect(change.upserts[0]).toMatchObject({
      reportRevision: 1,
      report: { outcome: "complete", summary: "Done.", turnId: "turn-9", reportedAt: AGENT_RUN_NOW.toISOString() },
    });
    expect(change.events[0]).toMatchObject({ kind: "report", detail: { outcome: "complete", summary: "Done." } });
  });

  test("refuses a report for a stage that moved on, one that has not started, and past the revision limit", () => {
    const aggregate = running();
    const report = { outcome: "blocked" as const, missing: "Need access.", kind: "permission" as const };
    expect(
      refusal(() => recordStageReport({ aggregate, expected: { stageId: "build", attempt: 1 }, report, turnId: null, now: AGENT_RUN_NOW })),
    ).toMatchObject({ code: "stale-identity" });
    const pending = agentRunFixture();
    expect(
      refusal(() => recordStageReport({ aggregate: pending, expected: identity(pending), report, turnId: null, now: AGENT_RUN_NOW })),
    ).toMatchObject({ code: "invalid-state" });
    const full = patchCurrent(aggregate, { reportRevision: AGENT_RUN_LIMITS.maxReportRevisions });
    expect(
      refusal(() => recordStageReport({ aggregate: full, expected: identity(full), report, turnId: null, now: AGENT_RUN_NOW })),
    ).toMatchObject({ code: "report-limit" });
  });
});
