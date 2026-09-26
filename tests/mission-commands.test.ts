import { describe, expect, test } from "bun:test";
import {
  acceptMissionRuntime,
  cancelMission,
  pauseMission,
  recordStageReport,
  requestStageChanges,
  resumeMission,
  retryStage,
  signOffStage,
  skipStage,
} from "../src/lib/missions/commands";
import {
  MISSION_LIMITS,
  MissionCommandError,
  currentStageRecord,
  enterStage,
  type MissionAggregate,
} from "../src/lib/missions/domain";
import { applyMissionDecision, decideMissionAction } from "../src/lib/missions/policy";
import type { Playbook } from "../src/lib/playbooks/schema";
import {
  COMPLETE_REPORT,
  MISSION_NOW,
  applyChange,
  missionFixture,
  observe,
  patchCurrent,
  turn,
} from "./fixtures/mission-fixtures";

function refusal(run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (error instanceof MissionCommandError) return { code: error.code, message: error.message };
    throw error;
  }
  throw new Error("expected the command to be refused");
}

function identity(aggregate: MissionAggregate) {
  const record = currentStageRecord(aggregate);
  return { stageId: record.stageId, attempt: record.attempt };
}

/** Drives the supervisor until it needs something from the user or the agent. */
function settle(aggregate: MissionAggregate, observation = observe()) {
  let current = aggregate;
  for (let index = 0; index < 20; index += 1) {
    const decision = decideMissionAction({ aggregate: current, observation, now: MISSION_NOW });
    if (decision.action === "idle" || decision.action === "start-stage-turn" || decision.action === "execute-action") {
      return { aggregate: current, decision };
    }
    current = applyChange(current, applyMissionDecision({ aggregate: current, decision, now: MISSION_NOW }));
  }
  throw new Error("the mission did not settle");
}

/** Request → PR, waiting at the Build sign-off after Understand reported. */
function atBuildSignOff() {
  const aggregate = missionFixture();
  const started = applyChange(
    aggregate,
    applyMissionDecision({
      aggregate,
      decision: decideMissionAction({ aggregate, observation: observe(), now: MISSION_NOW }),
      now: MISSION_NOW,
    }),
  );
  const reported = patchCurrent(started, { report: COMPLETE_REPORT, reportRevision: 1 });
  return settle(reported, observe({ lastEndedTurn: turn() })).aggregate;
}

describe("sign-off cards", () => {
  test("approving the waiting stage lets the supervisor start it", () => {
    const waiting = atBuildSignOff();
    expect(currentStageRecord(waiting)).toMatchObject({ stageId: "build", status: "awaiting-sign-off" });
    const approved = applyChange(waiting, signOffStage({ aggregate: waiting, expected: identity(waiting), now: MISSION_NOW }));
    expect(currentStageRecord(approved).status).toBe("running");
    expect(decideMissionAction({ aggregate: approved, observation: observe(), now: MISSION_NOW })).toEqual({
      action: "start-stage-turn",
      stageIndex: 1,
      attempt: 1,
      reason: "stage-start",
    });
  });

  test("a card rendered for an earlier attempt is refused as stale", () => {
    const waiting = atBuildSignOff();
    expect(
      refusal(() => signOffStage({ aggregate: waiting, expected: { stageId: "build", attempt: 2 }, now: MISSION_NOW })),
    ).toMatchObject({ code: "stale-identity" });
    expect(
      refusal(() => signOffStage({ aggregate: waiting, expected: { stageId: "understand", attempt: 1 }, now: MISSION_NOW })),
    ).toMatchObject({ code: "stale-identity" });
  });

  test("Ask for changes starts the previous AI stage at attempt + 1 with the feedback", () => {
    const waiting = atBuildSignOff();
    const change = requestStageChanges({
      aggregate: waiting,
      expected: identity(waiting),
      feedback: "  Also cover the invoices table.  ",
      now: MISSION_NOW,
    });
    const rerun = applyChange(waiting, change);
    expect(rerun.mission.currentStageIndex).toBe(0);
    expect(currentStageRecord(rerun)).toMatchObject({
      stageId: "understand",
      attempt: 2,
      status: "pending",
      feedback: "Also cover the invoices table.",
    });
    // The card's own record never started, so it waits as pending.
    expect(rerun.stages.find((record) => record.stageId === "build")?.status).toBe("pending");
    expect(decideMissionAction({ aggregate: rerun, observation: observe(), now: MISSION_NOW })).toEqual({
      action: "start-stage-turn",
      stageIndex: 0,
      attempt: 2,
      reason: "stage-start",
      feedback: "Also cover the invoices table.",
    });
    expect(change.events.map((event) => event.kind)).toEqual(["changes-requested"]);
  });

  test("Ask for changes needs an earlier AI stage and some feedback", () => {
    const actionsOnly: Playbook = {
      ...missionFixture().mission.playbook,
      checkIns: "every-stage",
      stages: [
        { id: "open", title: "Open draft PR", kind: "action", action: { type: "open-draft-pr" } },
        { id: "ready", title: "Ready for review", kind: "action", action: { type: "mark-pr-ready" } },
      ],
    };
    const aggregate = missionFixture({ playbook: actionsOnly });
    const waiting: MissionAggregate = {
      mission: { ...aggregate.mission, currentStageIndex: 1 },
      stages: [
        { ...aggregate.stages[0]!, status: "completed" },
        { ...aggregate.stages[0]!, stageId: "ready", status: "awaiting-sign-off" },
      ],
    };
    expect(
      refusal(() => requestStageChanges({ aggregate: waiting, expected: identity(waiting), feedback: "Wait", now: MISSION_NOW })),
    ).toMatchObject({ code: "no-previous-ai-stage" });
    expect(
      refusal(() => requestStageChanges({ aggregate: atBuildSignOff(), expected: { stageId: "build", attempt: 1 }, feedback: "  ", now: MISSION_NOW })),
    ).toMatchObject({ code: "invalid-state" });
  });
});

describe("stage controls", () => {
  test("skip moves on, and skipping the last stage completes the mission", () => {
    const waiting = atBuildSignOff();
    const skipped = applyChange(waiting, skipStage({ aggregate: waiting, expected: identity(waiting), now: MISSION_NOW }));
    expect(skipped.stages.find((record) => record.stageId === "build")?.status).toBe("skipped");
    expect(currentStageRecord(skipped).stageId).toBe("verify");

    const last: MissionAggregate = {
      mission: { ...waiting.mission, currentStageIndex: 5 },
      stages: [...waiting.stages, { ...waiting.stages[0]!, stageId: "ready-for-review", attempt: 1, status: "awaiting-sign-off", report: null }],
    };
    const done = skipStage({ aggregate: last, expected: identity(last), now: MISSION_NOW });
    expect(done.mission.state).toBe("completed");
    expect(done.events.map((event) => event.kind)).toEqual(["stage-skipped", "mission-ended"]);
  });

  test("retry replaces a stuck attempt with a fresh one", () => {
    const stuck = patchCurrent(missionFixture(), { status: "stuck", detail: "No report." });
    const retried = applyChange(stuck, retryStage({ aggregate: stuck, expected: identity(stuck), now: MISSION_NOW }));
    expect(retried.stages.map((record) => [record.attempt, record.status])).toEqual([
      [1, "cancelled"],
      [2, "pending"],
    ]);
    expect(refusal(() => retryStage({ aggregate: missionFixture(), expected: { stageId: "understand", attempt: 1 }, now: MISSION_NOW }))).toMatchObject({
      code: "invalid-state",
    });
  });

  test("a stage stops taking new attempts at its limit", () => {
    const aggregate = missionFixture();
    const exhausted = patchCurrent(aggregate, { attempt: MISSION_LIMITS.maxStageAttempts, status: "completed" });
    expect(refusal(() => enterStage({ aggregate: exhausted, index: 0 }))).toMatchObject({ code: "attempt-limit" });
  });
});

describe("mission controls", () => {
  test("pause and resume by hand; a supervisor pause cannot be resumed by hand", () => {
    const aggregate = missionFixture();
    const paused = applyChange(aggregate, pauseMission({ aggregate, reason: "paused-by-user", now: MISSION_NOW }));
    expect(paused.mission).toMatchObject({ state: "paused", pauseReason: "paused-by-user" });
    const resumed = applyChange(paused, resumeMission({ aggregate: paused, now: MISSION_NOW }));
    expect(resumed.mission).toMatchObject({ state: "running", pauseReason: null });

    const automatic: MissionAggregate = {
      ...aggregate,
      mission: { ...aggregate.mission, state: "paused", pauseReason: "runtime-changed", reasonDetail: "Runtime changed." },
    };
    expect(refusal(() => resumeMission({ aggregate: automatic, now: MISSION_NOW }))).toEqual({
      code: "invalid-state",
      message: "Runtime changed.",
    });
    const accepted = acceptMissionRuntime({
      aggregate: automatic,
      fingerprint: { providerId: "codex", model: "gpt-5" },
      now: MISSION_NOW,
    });
    expect(accepted.mission).toMatchObject({
      state: "running",
      pauseReason: null,
      fingerprint: { providerId: "codex", model: "gpt-5" },
    });
  });

  test("cancel ends the mission and its current stage, once", () => {
    const aggregate = missionFixture();
    const cancelled = applyChange(aggregate, cancelMission({ aggregate, now: MISSION_NOW }));
    expect(cancelled.mission.state).toBe("cancelled");
    expect(currentStageRecord(cancelled).status).toBe("cancelled");
    expect(refusal(() => cancelMission({ aggregate: cancelled, now: MISSION_NOW }))).toMatchObject({ code: "not-active" });
    expect(refusal(() => pauseMission({ aggregate: cancelled, reason: "taken-over", now: MISSION_NOW }))).toMatchObject({
      code: "not-active",
    });
  });
});

describe("stage reports", () => {
  function running() {
    return patchCurrent(missionFixture(), { status: "running", startedAt: MISSION_NOW.toISOString() });
  }

  test("records the report for the stage the grant names, stamped by the host", () => {
    const aggregate = running();
    const change = recordStageReport({
      aggregate,
      expected: identity(aggregate),
      report: { outcome: "complete", summary: "Done.", decisions: [], evidence: [], artifacts: [] },
      turnId: "turn-9",
      now: MISSION_NOW,
    });
    expect(change.upserts[0]).toMatchObject({
      reportRevision: 1,
      report: { outcome: "complete", summary: "Done.", turnId: "turn-9", reportedAt: MISSION_NOW.toISOString() },
    });
    expect(change.events[0]).toMatchObject({ kind: "report", detail: { outcome: "complete", summary: "Done." } });
  });

  test("refuses a report for a stage that moved on, one that has not started, and past the revision limit", () => {
    const aggregate = running();
    const report = { outcome: "blocked" as const, missing: "Need access.", kind: "permission" as const };
    expect(
      refusal(() => recordStageReport({ aggregate, expected: { stageId: "build", attempt: 1 }, report, turnId: null, now: MISSION_NOW })),
    ).toMatchObject({ code: "stale-identity" });
    const pending = missionFixture();
    expect(
      refusal(() => recordStageReport({ aggregate: pending, expected: identity(pending), report, turnId: null, now: MISSION_NOW })),
    ).toMatchObject({ code: "invalid-state" });
    const full = patchCurrent(aggregate, { reportRevision: MISSION_LIMITS.maxReportRevisions });
    expect(
      refusal(() => recordStageReport({ aggregate: full, expected: identity(full), report, turnId: null, now: MISSION_NOW })),
    ).toMatchObject({ code: "report-limit" });
  });
});
