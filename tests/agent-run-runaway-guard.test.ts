import { describe, expect, test } from "bun:test";
import { AGENT_RUN_LIMITS, type AgentRunAggregate } from "../src/lib/agent-runs/domain";
import { resumeAgentRun } from "../src/lib/agent-runs/commands";
import { TEAM_LIMITS } from "../src/lib/agent-runs/resources";
import { applyAgentRunDecision, decideAgentRunAction, type AgentRunObservation } from "../src/lib/agent-runs/policy";
import { AGENT_RUN_NOW, COMPLETE_REPORT, agentRunFixture, applyChange, observe, patchCurrent, turn } from "./fixtures/agent-run-fixtures";

/**
 * A turn count alone no longer pauses or ends a run. Time (`expiresAt`) and
 * provider usage do; a high internal ceiling only stops a run that loops.
 */
function decide(aggregate: AgentRunAggregate, observation: AgentRunObservation = observe(), now = AGENT_RUN_NOW) {
  return decideAgentRunAction({ aggregate, observation, now });
}

/** A run whose stage turn ended without a report, after `turnCount` turns. */
function endedTurnAt(turnCount: number, { expiresAt = null, ...overrides }: Parameters<typeof agentRunFixture>[0] = {}) {
  const base = agentRunFixture(overrides);
  const started = applyChange(base, applyAgentRunDecision({ aggregate: base, decision: decide(base), now: AGENT_RUN_NOW }));
  return patchCurrent({ ...started, agentRun: { ...started.agentRun, turnCount, expiresAt } }, {});
}

const ended = observe({ lastEndedTurn: turn() });
const OLD_DEFAULT_CAP = 30;

describe("run budget: time and usage, not turns", () => {
  test("a healthy run continues past the old turn cap, primary and delegated", () => {
    const run = endedTurnAt(OLD_DEFAULT_CAP, { maxTurns: OLD_DEFAULT_CAP });
    expect(decide(run, ended)).toMatchObject({ action: "nudge" });
    expect(decide(run, { ...ended, delegated: true })).toMatchObject({ action: "nudge" });
    // A smaller saved cap no longer stops it either.
    expect(decide(endedTurnAt(3, { maxTurns: 3 }), { ...ended, delegated: true })).toMatchObject({ action: "nudge" });
  });

  test("a run and its helpers share one ceiling, not a budget a person extends", () => {
    expect(TEAM_LIMITS.maxTeamTurns).toBe(AGENT_RUN_LIMITS.safetyTurnCeiling);
  });

  test("a looping run halts at the internal ceiling and is never paused for more turns", () => {
    const looping = endedTurnAt(AGENT_RUN_LIMITS.safetyTurnCeiling);
    for (const delegated of [false, true]) {
      const decision = decide(looping, { ...ended, delegated });
      expect(decision).toMatchObject({ action: "stop", reason: "turn-cap-reached" });
      expect(JSON.stringify(decision)).not.toContain("limit-reached");
    }
    // A report on the last allowed turn still completes.
    const reported = patchCurrent(looping, { report: COMPLETE_REPORT, reportRevision: 1 });
    expect(decide(reported, ended)).toMatchObject({ action: "complete-stage" });
  });

  test("a run ends at its time bound however few turns it used", () => {
    const run = endedTurnAt(45, { expiresAt: "2026-09-26T09:59:59.000Z" });
    expect(decide(run, ended)).toMatchObject({ action: "stop", reason: "expired" });
    expect(decide(run, { ...ended, delegated: true })).toMatchObject({ action: "stop", reason: "expired" });
    const before = endedTurnAt(45, { expiresAt: "2026-09-26T10:00:01.000Z" });
    expect(decide(before, ended)).toMatchObject({ action: "nudge" });
  });

  test("a run paused at the old turn limit before the update resumes with Resume and keeps going", () => {
    const legacy = endedTurnAt(OLD_DEFAULT_CAP, { maxTurns: OLD_DEFAULT_CAP });
    const paused: AgentRunAggregate = { ...legacy, agentRun: { ...legacy.agentRun, state: "paused", pauseReason: "limit-reached",
      reasonDetail: "This run reached its limit of 30 turns." } };
    // It stays paused until someone resumes it: an update does not spend usage on its own.
    expect(decide(paused, ended)).toEqual({ action: "idle" });
    const resumed = applyChange(paused, resumeAgentRun({ aggregate: paused, now: AGENT_RUN_NOW }));
    expect(resumed.agentRun).toMatchObject({ state: "running", pauseReason: null, reasonDetail: null, turnCount: OLD_DEFAULT_CAP });
    expect(decide(resumed, ended)).toMatchObject({ action: "nudge" });
  });
});
