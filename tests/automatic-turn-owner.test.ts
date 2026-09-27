import { describe, expect, test } from "bun:test";
import {
  MISSION_ACTIVE_WAKE_UP_DETAIL,
  refuseWakeUpForMission,
  resolveAutomaticTurnOwner,
} from "../src/lib/supervision/automatic-turn-owner";
import {
  applyWakeUpDecision,
  createWakeUp,
  decideWakeUpAction,
  type WakeUp,
  type WakeUpObservation,
} from "../src/lib/supervision/wake-up-policy";

const NOW = new Date("2026-09-26T10:00:00.000Z");

function wakeUpFixture(patch: Partial<WakeUp> = {}): WakeUp {
  return {
    ...createWakeUp({
      id: "wake-1",
      input: {
        workspaceId: "ws-1",
        taskId: "task-1",
        prompt: "Re-check CI.",
        trigger: { kind: "schedule", schedule: { every: 1, unit: "hours" } },
        maxOccurrences: null,
        expiresAt: null,
      },
      repositoryPath: "/tmp/repo",
      fingerprint: { providerId: "claude-code", model: "sonnet" },
      now: new Date("2026-09-26T08:30:00.000Z"),
    }),
    ...patch,
  };
}

function observe(patch: Partial<WakeUpObservation> = {}): WakeUpObservation {
  return {
    workspaceAvailable: true,
    taskExists: true,
    taskArchived: false,
    hasActiveTurn: false,
    pendingApprovalCount: 0,
    pendingUserInputCount: 0,
    fingerprint: { providerId: "claude-code", model: "sonnet" },
    identity: { ok: true },
    completionObservability: "stave_owned",
    completions: [],
    missionActive: false,
    ...patch,
  };
}

describe("automatic turn owner", () => {
  test("a mission outranks a wake-up; a paused or stopped wake-up owns nothing", () => {
    const wakeUp = { id: "wake-1", state: "scheduled" as const };
    expect(resolveAutomaticTurnOwner({ activeMission: { id: "mission-1" }, wakeUp })).toEqual({
      kind: "mission",
      missionId: "mission-1",
    });
    expect(resolveAutomaticTurnOwner({ activeMission: null, wakeUp })).toEqual({ kind: "wake-up", wakeUpId: "wake-1" });
    expect(resolveAutomaticTurnOwner({ activeMission: null, wakeUp: { ...wakeUp, state: "paused" } })).toBeNull();
    expect(resolveAutomaticTurnOwner({ activeMission: null, wakeUp: null })).toBeNull();
  });

  test("refuses a wake-up only while a mission is active", () => {
    expect(refuseWakeUpForMission({ id: "mission-1" })).toContain("running a mission");
    expect(refuseWakeUpForMission(null)).toBeNull();
  });
});

describe("wake-up policy under a mission", () => {
  test("a due wake-up pauses with mission-active instead of firing, and stays paused", () => {
    const wakeUp = wakeUpFixture();
    const decision = decideWakeUpAction({ wakeUp, observation: observe({ missionActive: true }), now: NOW });
    expect(decision).toEqual({ action: "pause", reason: "mission-active", detail: MISSION_ACTIVE_WAKE_UP_DETAIL });
    const paused = applyWakeUpDecision({ wakeUp, decision, now: NOW });
    expect(decideWakeUpAction({ wakeUp: paused, observation: observe({ missionActive: true }), now: NOW })).toEqual({
      action: "idle",
    });
  });

  test("resumes on its own when the mission ends, from now rather than the stale instant", () => {
    const paused = wakeUpFixture({
      state: "paused",
      pauseReason: "mission-active",
      reasonDetail: MISSION_ACTIVE_WAKE_UP_DETAIL,
    });
    const decision = decideWakeUpAction({ wakeUp: paused, observation: observe(), now: NOW });
    expect(decision).toEqual({ action: "resume" });
    const resumed = applyWakeUpDecision({ wakeUp: paused, decision, now: NOW });
    expect(resumed.state).toBe("scheduled");
    expect(Date.parse(resumed.nextRunAt!)).toBeGreaterThan(NOW.getTime());
  });

  test("stop still beats the mission pause, and the user's own pause is kept", () => {
    expect(
      decideWakeUpAction({ wakeUp: wakeUpFixture(), observation: observe({ missionActive: true, taskArchived: true }), now: NOW }),
    ).toMatchObject({ action: "stop", reason: "task-unavailable" });
    const userPaused = wakeUpFixture({ state: "paused", pauseReason: "paused-by-user", reasonDetail: "Paused by the user." });
    expect(decideWakeUpAction({ wakeUp: userPaused, observation: observe({ missionActive: true }), now: NOW })).toEqual({
      action: "idle",
    });
  });
});
