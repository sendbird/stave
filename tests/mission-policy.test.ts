import { describe, expect, test } from "bun:test";
import {
  createStageRecord,
  currentStageRecord,
  MISSION_LIMITS,
  type MissionAggregate,
} from "../src/lib/missions/domain";
import {
  applyMissionDecision,
  decideMissionAction,
  resolveMissionStageSignOff,
  type MissionObservation,
} from "../src/lib/missions/policy";
import type { Workflow } from "../src/lib/workflows/schema";
import {
  COMPLETE_REPORT,
  MISSION_NOW,
  applyChange,
  missionFixture,
  observe,
  patchCurrent,
  starterWorkflow,
  turn,
} from "./fixtures/mission-fixtures";

function decide(aggregate: MissionAggregate, observation: MissionObservation = observe(), now = MISSION_NOW) {
  return decideMissionAction({ aggregate, observation, now });
}

function step(aggregate: MissionAggregate, observation: MissionObservation = observe()) {
  const decision = decide(aggregate, observation);
  return { decision, next: applyChange(aggregate, applyMissionDecision({ aggregate, decision, now: MISSION_NOW })) };
}

/** A mission whose first stage turn ran and ended. */
function afterFirstTurn(report?: typeof COMPLETE_REPORT | Record<string, unknown>) {
  const started = step(missionFixture()).next;
  return patchCurrent(started, report ? { report: report as never, reportRevision: 1 } : {});
}

describe("mission decision order", () => {
  test("an ended mission is idle", () => {
    const aggregate = missionFixture();
    for (const state of ["completed", "cancelled"] as const) {
      expect(decide({ ...aggregate, mission: { ...aggregate.mission, state } })).toEqual({ action: "idle" });
    }
  });

  test("1. stop: the lead task is gone, archived, or the mission expired", () => {
    const aggregate = missionFixture({ expiresAt: "2026-09-26T09:00:00.000Z" });
    expect(decide(aggregate, observe({ leadTask: { taskExists: false } }))).toMatchObject({
      action: "stop",
      reason: "task-unavailable",
    });
    expect(decide(aggregate, observe({ leadTask: { taskArchived: true } }))).toMatchObject({
      action: "stop",
      reason: "task-unavailable",
    });
    expect(decide(aggregate)).toMatchObject({ action: "stop", reason: "expired" });
  });

  test("an unreadable workspace pauses instead of stopping, once rather than every tick", () => {
    const unreadable = observe({ leadTask: { workspaceAvailable: false, taskExists: false } });
    const paused = step(missionFixture(), unreadable);
    expect(paused.decision).toMatchObject({ action: "pause", reason: "task-identity-changed" });
    expect(decide(paused.next, unreadable)).toEqual({ action: "idle" });
    expect(
      decide(paused.next, observe({ leadTask: { identity: { ok: false, reason: "The task moved." } } })),
    ).toEqual({ action: "idle" });
    expect(
      decide(paused.next, observe({ leadTask: { fingerprint: { providerId: "codex", model: "gpt-5" } } })),
    ).toMatchObject({ action: "pause", reason: "runtime-changed" });
  });

  test("2. pause: identity or runtime changed, and it resumes on its own once cleared", () => {
    const aggregate = missionFixture();
    const identity = step(aggregate, observe({ leadTask: { identity: { ok: false, reason: "The task moved." } } }));
    expect(identity.decision).toEqual({ action: "pause", reason: "task-identity-changed", detail: "The task moved." });
    expect(identity.next.mission.state).toBe("paused");
    expect(decide(identity.next)).toEqual({ action: "resume" });

    const runtime = decide(aggregate, observe({ leadTask: { fingerprint: { providerId: "codex", model: "gpt-5" } } }));
    expect(runtime).toMatchObject({ action: "pause", reason: "runtime-changed" });
    expect(runtime.action === "pause" && runtime.detail).toContain("codex:gpt-5");
  });

  test("a user turn with take-over pauses until Resume, and a manual pause outranks automatic ones", () => {
    const aggregate = missionFixture();
    const takeOver = step(
      aggregate,
      observe({ leadTask: { activeTurn: turn({ startedBy: "user" }) }, userTurnIntent: "take-over" }),
    );
    expect(takeOver.decision).toMatchObject({ action: "pause", reason: "taken-over" });
    expect(decide(takeOver.next)).toEqual({ action: "idle" });
    expect(
      decide(takeOver.next, observe({ leadTask: { fingerprint: { providerId: "codex", model: "gpt-5" } } })),
    ).toEqual({ action: "idle" });
    // Stop still beats a manual pause.
    expect(decide(takeOver.next, observe({ leadTask: { taskArchived: true } }))).toMatchObject({ action: "stop" });
  });

  test("4. wait on an approval or a question, 5. idle while a turn runs", () => {
    const aggregate = missionFixture();
    expect(decide(aggregate, observe({ leadTask: { pendingApprovalCount: 1 } }))).toEqual({
      action: "wait",
      reason: "awaiting-approval",
    });
    expect(decide(aggregate, observe({ leadTask: { pendingUserInputCount: 1 } }))).toEqual({
      action: "wait",
      reason: "awaiting-user-input",
    });
    expect(decide(aggregate, observe({ leadTask: { activeTurn: turn() } }))).toEqual({ action: "idle" });
    expect(
      decide(aggregate, observe({ leadTask: { activeTurn: turn({ startedBy: "user" }) }, userTurnIntent: "continue" })),
    ).toEqual({ action: "idle" });
  });
});

describe("AI stages", () => {
  test("the first stage starts without a sign-off and counts a turn", () => {
    const { decision, next } = step(missionFixture());
    expect(decision).toEqual({ action: "start-stage-turn", stageIndex: 0, attempt: 1, reason: "stage-start" });
    expect(next.mission.turnCount).toBe(1);
    expect(currentStageRecord(next).status).toBe("running");
  });

  test("6. a complete report completes the stage; the next one waits for sign-off after a plan stage", () => {
    const { decision, next } = step(afterFirstTurn(COMPLETE_REPORT), observe({ lastEndedTurn: turn() }));
    expect(decision).toEqual({ action: "complete-stage", next: "sign-off" });
    expect(next.mission.currentStageIndex).toBe(1);
    expect(next.stages.find((record) => record.stageId === "understand")?.status).toBe("completed");
    expect(currentStageRecord(next)).toMatchObject({ stageId: "build", attempt: 1, status: "awaiting-sign-off" });
    expect(decide(next)).toEqual({ action: "idle" });
  });

  test("a user turn that continues the stage and reports in that turn completes it", () => {
    const aggregate = afterFirstTurn({ ...COMPLETE_REPORT, turnId: "turn-user", reportedAt: "2026-09-26T10:05:30.000Z" });
    const userTurn = turn({ turnId: "turn-user", startedBy: "user", startedAt: "2026-09-26T10:05:00.000Z" });
    expect(decide(aggregate, observe({ lastEndedTurn: userTurn }))).toEqual({ action: "complete-stage", next: "sign-off" });
  });

  test("a stage cannot complete while its delegated tasks are active", () => {
    const aggregate = afterFirstTurn(COMPLETE_REPORT);
    expect(
      decide(aggregate, observe({ lastEndedTurn: turn(), leadTask: { activeDelegatedTaskCount: 2 } })),
    ).toEqual({ action: "idle" });
  });

  test("7. a blocked report blocks the stage, and a reply in the task resumes it", () => {
    const blockedReport = {
      outcome: "blocked",
      missing: "Which billing plan should the export cover?",
      kind: "input",
      reportedAt: "2026-09-26T10:02:00.000Z",
      turnId: "turn-1",
    };
    const blocked = step(afterFirstTurn(blockedReport), observe({ lastEndedTurn: turn() }));
    expect(blocked.decision).toEqual({
      action: "block",
      reason: "agent-blocked",
      detail: "Which billing plan should the export cover?",
    });
    expect(currentStageRecord(blocked.next)).toMatchObject({ status: "blocked", blockReason: "agent-blocked" });
    expect(decide(blocked.next, observe({ lastEndedTurn: turn() }))).toEqual({ action: "idle" });

    const reply = turn({ turnId: "turn-2", startedBy: "user", startedAt: "2026-09-26T10:10:00.000Z" });
    expect(decide(blocked.next, observe({ lastEndedTurn: reply }))).toEqual({
      action: "start-stage-turn",
      stageIndex: 0,
      attempt: 1,
      reason: "continue-after-user",
    });
  });

  test("8. a turn that ends without a report is nudged once, then marked stuck", () => {
    const first = step(afterFirstTurn(), observe({ lastEndedTurn: turn() }));
    expect(first.decision).toEqual({ action: "nudge" });
    expect(currentStageRecord(first.next).nudged).toBe(true);
    expect(first.next.mission.turnCount).toBe(2);

    const second = step(first.next, observe({ lastEndedTurn: turn({ turnId: "turn-2" }) }));
    expect(second.decision).toMatchObject({ action: "mark-stuck" });
    expect(currentStageRecord(second.next).status).toBe("stuck");
    expect(decide(second.next, observe({ lastEndedTurn: turn({ turnId: "turn-2" }) }))).toEqual({ action: "idle" });
  });

  test("a stage stuck before any turn ended waits instead of replaying its start", () => {
    const stuck = patchCurrent(afterFirstTurn(), {
      status: "stuck",
      detail: "Stave stopped before this stage's turn started.",
    });
    expect(decide(stuck)).toEqual({ action: "idle" });
    // A reply in the task still resumes it.
    expect(
      decide(stuck, observe({ lastEndedTurn: turn({ turnId: "user-1", startedBy: "user" }) })),
    ).toMatchObject({ action: "start-stage-turn", reason: "continue-after-user" });
  });

  test("a stuck stage continues only for a reply that ended after it got stuck", () => {
    const stuck = patchCurrent(afterFirstTurn(), { status: "stuck", detail: "The stage's turn could not start." });
    const stuckAt = "2026-09-26T10:20:00.000Z";
    const reply = (endedAt: string) =>
      turn({ turnId: "user-1", startedBy: "user", startedAt: "2026-09-26T10:10:00.000Z", endedAt });
    // The reply that led to the failed start does not start another turn.
    expect(decide(stuck, observe({ lastEndedTurn: reply("2026-09-26T10:15:00.000Z"), stageStuckAt: stuckAt }))).toEqual({
      action: "idle",
    });
    expect(decide(stuck, observe({ lastEndedTurn: reply(stuckAt), stageStuckAt: stuckAt }))).toEqual({ action: "idle" });
    expect(
      decide(stuck, observe({ lastEndedTurn: reply("2026-09-26T10:25:00.000Z"), stageStuckAt: stuckAt })),
    ).toMatchObject({ action: "start-stage-turn", reason: "continue-after-user" });
  });

  test("a mission turn Stave interrupted resumes the stage without spending the reminder", () => {
    const interrupted = turn({ interrupted: true, endedAt: "2026-09-26T10:03:00.000Z" });
    const resumed = step(afterFirstTurn(), observe({ lastEndedTurn: interrupted }));
    expect(resumed.decision).toEqual({
      action: "start-stage-turn",
      stageIndex: 0,
      attempt: 1,
      reason: "resume-after-restart",
    });
    expect(currentStageRecord(resumed.next).nudged).toBe(false);
    // It still counts against the turn cap.
    expect(resumed.next.mission.turnCount).toBe(2);
    const capped = patchCurrent(afterFirstTurn(), {});
    expect(
      decide({ ...capped, mission: { ...capped.mission, turnCount: capped.mission.maxTurns } }, observe({ lastEndedTurn: interrupted })),
    ).toMatchObject({ action: "stop", reason: "turn-cap-reached" });
  });

  test("a stage whose next stage has no attempts left is marked stuck once instead of failing every tick", () => {
    const done = afterFirstTurn(COMPLETE_REPORT);
    const exhausted: MissionAggregate = {
      ...done,
      stages: [
        ...done.stages,
        {
          ...createStageRecord({ missionId: done.mission.id, stageId: "build", attempt: MISSION_LIMITS.maxStageAttempts }),
          status: "completed",
        },
      ],
    };
    const observation = observe({ lastEndedTurn: turn() });
    const stuck = step(exhausted, observation);
    expect(stuck.decision).toEqual({
      action: "mark-stuck",
      detail: `This stage is done, but "Build" reached its limit of ${MISSION_LIMITS.maxStageAttempts} attempts. Cancel the mission and finish the rest by hand.`,
    });
    expect(currentStageRecord(stuck.next)).toMatchObject({ stageId: "understand", status: "stuck" });
    expect(decide(stuck.next, observation)).toEqual({ action: "idle" });

    // A completion decided elsewhere lands on the same stuck stage.
    const applied = applyMissionDecision({
      aggregate: exhausted,
      decision: { action: "complete-stage", next: "sign-off" },
      now: MISSION_NOW,
    });
    expect(applied.upserts).toHaveLength(1);
    expect(applied.upserts[0]).toMatchObject({ stageId: "understand", status: "stuck" });
  });

  test("3. unreachable reporting blocks instead of nudging, and the stage resumes when it returns", () => {
    const aggregate = missionFixture();
    const down = step(aggregate, observe({ reportingAvailable: false }));
    expect(down.decision).toMatchObject({ action: "block", reason: "reporting-unavailable" });
    expect(decide(down.next, observe({ reportingAvailable: false }))).toEqual({ action: "idle" });
    expect(decide(down.next)).toEqual({
      action: "start-stage-turn",
      stageIndex: 0,
      attempt: 1,
      reason: "reporting-restored",
    });

    // A mission turn that ended while reporting was down is not nudged.
    expect(
      decide(afterFirstTurn(), observe({ lastEndedTurn: turn(), reportingAvailable: false })),
    ).toMatchObject({ action: "block", reason: "reporting-unavailable" });
  });

  test("the turn cap stops before another turn, never before a completion", () => {
    const capped = missionFixture({ maxTurns: 1 });
    const started = step(capped).next;
    expect(started.mission.turnCount).toBe(1);
    expect(decide(patchCurrent(started, {}), observe({ lastEndedTurn: turn() }))).toMatchObject({
      action: "stop",
      reason: "turn-cap-reached",
    });
    expect(
      decide(patchCurrent(started, { report: COMPLETE_REPORT, reportRevision: 1 }), observe({ lastEndedTurn: turn() })),
    ).toMatchObject({ action: "complete-stage" });
  });

  test("an ended turn alone never completes a stage", () => {
    const observations = [
      observe({ lastEndedTurn: turn() }),
      observe({ lastEndedTurn: turn({ startedBy: "user" }) }),
      observe({ lastEndedTurn: turn(), reportingAvailable: false }),
    ];
    for (const aggregate of [afterFirstTurn(), patchCurrent(afterFirstTurn(), { nudged: true })]) {
      for (const observation of observations) {
        expect(decide(aggregate, observation).action).not.toBe("complete-stage");
      }
    }
    // A report from before the last turn does not count for it.
    const stale = afterFirstTurn({ ...COMPLETE_REPORT, reportedAt: "2026-09-26T10:00:30.000Z", turnId: "turn-0" });
    expect(decide(stale, observe({ lastEndedTurn: turn() })).action).toBe("nudge");
  });
});

describe("Stave action stages", () => {
  function atOpenDraftPr() {
    let aggregate = missionFixture();
    const index = aggregate.mission.workflow.stages.findIndex((stage) => stage.id === "open-draft-pr");
    aggregate = { ...aggregate, mission: { ...aggregate.mission, currentStageIndex: index } };
    return {
      ...aggregate,
      stages: [
        ...aggregate.stages,
        { ...aggregate.stages[0]!, stageId: "open-draft-pr", status: "pending" as const },
      ],
    };
  }

  test("an action executes, completes on its result, and blocks with Stave's own reason on failure", () => {
    const aggregate = atOpenDraftPr();
    const executing = step(aggregate);
    expect(executing.decision).toEqual({ action: "execute-action", stageIndex: 3 });
    expect(currentStageRecord(executing.next).status).toBe("running");
    expect(decide(executing.next, observe({ actionOutcome: { status: "in-progress" } }))).toEqual({
      action: "execute-action",
      stageIndex: 3,
    });
    expect(
      decide(executing.next, observe({
        actionOutcome: {
          status: "succeeded",
          result: { type: "open-draft-pr", prUrl: "https://github.com/o/r/pull/12", prNumber: 12, created: true },
        },
      })),
    ).toEqual({ action: "complete-stage", next: "start" });

    const failed = step(
      executing.next,
      observe({ actionOutcome: { status: "failed", detail: "gh is not authenticated." } }),
    );
    expect(failed.decision).toEqual({ action: "block", reason: "action-failed", detail: "gh is not authenticated." });
    expect(decide(failed.next, observe({ actionOutcome: { status: "failed", detail: "x" } }))).toEqual({ action: "idle" });
    expect(
      decide(executing.next, observe({ actionOutcome: { status: "stuck", detail: "ci/build pending for 45 minutes" } })),
    ).toMatchObject({ action: "mark-stuck" });
  });

  test("an action that needs a turn gets one, counted against the turn cap", () => {
    const executing = step(atOpenDraftPr()).next;
    const needsTurn = {
      actionOutcome: {
        status: "needs-turn" as const,
        reason: "repair-checks" as const,
        prompt: "Fix unit tests.",
        detail: "Checks failed: unit tests.",
      },
    };
    const repair = step(executing, observe(needsTurn));
    expect(repair.decision).toEqual({ action: "start-action-turn", stageIndex: 3, attempt: 1 });
    expect(repair.next.mission.turnCount).toBe(executing.mission.turnCount + 1);
    expect(currentStageRecord(repair.next).status).toBe("running");

    const capped = { ...executing, mission: { ...executing.mission, turnCount: executing.mission.maxTurns } };
    expect(decide(capped, observe(needsTurn))).toMatchObject({ action: "stop", reason: "turn-cap-reached" });
    // A running repair turn keeps the action idle.
    expect(
      decide(executing, observe({ ...needsTurn, leadTask: { activeTurn: turn({ turnId: "repair-1" }) } })),
    ).toEqual({ action: "idle" });
  });

  test("completing the last stage completes the mission", () => {
    const workflow = starterWorkflow("fix-failing-checks");
    let aggregate = missionFixture({ workflow });
    aggregate = {
      mission: { ...aggregate.mission, currentStageIndex: 2 },
      stages: [...aggregate.stages, { ...aggregate.stages[0]!, stageId: "watch-checks", status: "running" as const }],
    };
    const done = step(
      aggregate,
      observe({ actionOutcome: { status: "succeeded", result: { type: "watch-checks", outcome: "passed", checks: [] } } }),
    );
    expect(done.decision).toEqual({ action: "complete-stage", next: "finish" });
    expect(done.next.mission.state).toBe("completed");
  });
});

describe("mission sign-off", () => {
  test("uses the check-ins recorded at start, not the saved workflow's", () => {
    const aggregate = missionFixture({ consent: { checkIns: "when-stuck" } });
    const buildIndex = 1;
    expect(resolveMissionStageSignOff(aggregate.mission, buildIndex)).toBe("auto");
    const everyStage = missionFixture({ consent: { checkIns: "every-stage" } });
    expect(resolveMissionStageSignOff(everyStage.mission, 2)).toBe("ask");
  });

  test("a stage with an external effect the user did not authorize always asks", () => {
    const workflow: Workflow = starterWorkflow("request-to-pr");
    const aggregate = missionFixture({
      workflow,
      consent: { checkIns: "when-stuck", authorizedEffectStageIds: ["open-draft-pr", "watch-checks"] },
    });
    const readyIndex = workflow.stages.findIndex((stage) => stage.id === "ready-for-review");
    expect(resolveMissionStageSignOff(aggregate.mission, readyIndex)).toBe("ask");
    expect(resolveMissionStageSignOff(aggregate.mission, readyIndex - 1)).toBe("auto");
  });
});
