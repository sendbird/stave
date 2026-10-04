import { describe, expect, test } from "bun:test";
import {
  AGENT_RUN_ACTIVE_WAKE_UP_DETAIL,
  refuseWakeUpForAgentRun,
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
    agentRunActive: false,
    ...patch,
  };
}

describe("automatic turn owner", () => {
  test("a run outranks a wake-up; a paused or stopped wake-up owns nothing", () => {
    const wakeUp = { id: "wake-1", state: "scheduled" as const };
    expect(resolveAutomaticTurnOwner({ activeAgentRun: { id: "agent-run-1" }, wakeUp })).toEqual({
      kind: "agentRun",
      agentRunId: "agent-run-1",
    });
    expect(resolveAutomaticTurnOwner({ activeAgentRun: null, wakeUp })).toEqual({ kind: "wake-up", wakeUpId: "wake-1" });
    expect(resolveAutomaticTurnOwner({ activeAgentRun: null, wakeUp: { ...wakeUp, state: "paused" } })).toBeNull();
    expect(resolveAutomaticTurnOwner({ activeAgentRun: null, wakeUp: null })).toBeNull();
  });

  test("refuses a wake-up only while a run is active", () => {
    expect(refuseWakeUpForAgentRun({ id: "agent-run-1" })).toContain("has an active run");
    expect(refuseWakeUpForAgentRun(null)).toBeNull();
  });
});

describe("wake-up policy under a run", () => {
  test("a due wake-up pauses with agent-run-active instead of firing, and stays paused", () => {
    const wakeUp = wakeUpFixture();
    const decision = decideWakeUpAction({ wakeUp, observation: observe({ agentRunActive: true }), now: NOW });
    expect(decision).toEqual({ action: "pause", reason: "agent-run-active", detail: AGENT_RUN_ACTIVE_WAKE_UP_DETAIL });
    const paused = applyWakeUpDecision({ wakeUp, decision, now: NOW });
    expect(decideWakeUpAction({ wakeUp: paused, observation: observe({ agentRunActive: true }), now: NOW })).toEqual({
      action: "idle",
    });
  });

  test("resumes on its own when the run ends, from now rather than the stale instant", () => {
    const paused = wakeUpFixture({
      state: "paused",
      pauseReason: "agent-run-active",
      reasonDetail: AGENT_RUN_ACTIVE_WAKE_UP_DETAIL,
    });
    const decision = decideWakeUpAction({ wakeUp: paused, observation: observe(), now: NOW });
    expect(decision).toEqual({ action: "resume" });
    const resumed = applyWakeUpDecision({ wakeUp: paused, decision, now: NOW });
    expect(resumed.state).toBe("scheduled");
    expect(Date.parse(resumed.nextRunAt!)).toBeGreaterThan(NOW.getTime());
  });

  test("stop still beats the run pause, and the user's own pause is kept", () => {
    expect(
      decideWakeUpAction({ wakeUp: wakeUpFixture(), observation: observe({ agentRunActive: true, taskArchived: true }), now: NOW }),
    ).toMatchObject({ action: "stop", reason: "task-unavailable" });
    const userPaused = wakeUpFixture({ state: "paused", pauseReason: "paused-by-user", reasonDetail: "Paused by the user." });
    expect(decideWakeUpAction({ wakeUp: userPaused, observation: observe({ agentRunActive: true }), now: NOW })).toEqual({
      action: "idle",
    });
  });
});
