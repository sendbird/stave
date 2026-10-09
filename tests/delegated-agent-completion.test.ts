import { describe, expect, test } from "bun:test";
import type { AgentRunDetail } from "../src/lib/agent-runs/api";
import { readDelegatedAgentCompletion } from "../src/lib/agent-runs/delegated-completion";
import { buildAgentRunTurnKey, buildAgentRunTurnOutcomeKey } from "../src/lib/agent-runs/domain";
import { projectAgentRunRoutes } from "../src/lib/agent-runs/route-observation";
import { buildAgentRunReport } from "../src/lib/agent-runs/report";
import { agentRunFixture, AGENT_RUN_NOW, patchCurrent } from "./fixtures/agent-run-fixtures";

const expected = { agentRunId: "agent-run-1", workspaceId: "ws-1", taskId: "task-1" };
function detail(): AgentRunDetail {
  const aggregate = agentRunFixture();
  return { ...aggregate, events: [], report: null };
}
function ended(state: "completed" | "cancelled" | "stopped"): AgentRunDetail {
  const result = detail();
  result.agentRun = { ...result.agentRun, state };
  result.report = buildAgentRunReport({ aggregate: result, workspace: { branch: null, branchPushed: false, openPullRequest: null },
    endedAt: AGENT_RUN_NOW });
  return result;
}
const read = (value: AgentRunDetail | null) => readDelegatedAgentCompletion({ expected, detail: value });

describe("supervised delegation completion contract", () => {
  test("an ended provider turn does not complete an active assignment", () => {
    const value = detail();
    const stageId = value.agentRun.workflow.stages[0]!.id;
    const key = buildAgentRunTurnKey({ agentRunId: expected.agentRunId, stageId, attempt: 1, turn: 1 });
    value.events = [
      { id: "started-turn", agentRunId: expected.agentRunId, sequence: 1, kind: "turn-started",
        idempotencyKey: key, createdAt: AGENT_RUN_NOW.toISOString(), detail: { stageId, attempt: 1 } },
      { id: "linked-turn", agentRunId: expected.agentRunId, sequence: 2, kind: "turn-linked",
        idempotencyKey: buildAgentRunTurnOutcomeKey(key, "linked"), createdAt: AGENT_RUN_NOW.toISOString(),
        detail: { stageId, attempt: 1, turnId: "turn-1" } },
    ];
    value.routing = projectAgentRunRoutes({ agentRunId: expected.agentRunId, stages: value.stages, events: value.events,
      turns: new Map([["turn-1", { completed: true, ending: "completed", usage: null }]]) });
    expect(value.routing[0]?.turnOutcome).toBe("completed");
    // A prior terminal report or a turn's transport outcome cannot complete this run.
    value.report = ended("completed").report;
    expect(read(value)).toEqual({ kind: "running" });
  });

  test("only the exact run, task and workspace can supply completion", () => {
    expect(read(null)).toEqual({ kind: "unknown", reason: "unavailable" });
    for (const patch of [{ id: "old-run" }, { leadTaskId: "other-task" }, { workspaceId: "other-workspace" }]) {
      const value = ended("completed");
      value.agentRun = { ...value.agentRun, ...patch };
      expect(read(value)).toEqual({ kind: "unknown", reason: "identity-mismatch" });
    }
  });

  test("accepts the supervisor's completed report, and keeps missing or contradictory reports unknown", () => {
    const value = ended("completed");
    expect(read(value)).toEqual({ kind: "completed", report: value.report });
    expect(read({ ...value, report: null })).toEqual({ kind: "unknown", reason: "report-unavailable" });
    expect(read({ ...value, report: { ...value.report!, agentRunId: "old-run" } }))
      .toEqual({ kind: "unknown", reason: "report-mismatch" });
    expect(read({ ...value, report: { ...value.report!, outcome: "stopped" } }))
      .toEqual({ kind: "unknown", reason: "report-mismatch" });
  });

  test("blocked, stuck, sign-off and paused assignments remain open", () => {
    for (const status of ["blocked", "stuck", "awaiting-sign-off"] as const) {
      const aggregate = patchCurrent(agentRunFixture(), { status });
      expect(read({ ...aggregate, events: [], report: null })).toEqual({ kind: "waiting", reason: status });
    }
    const value = detail();
    value.agentRun = { ...value.agentRun, state: "paused", pauseReason: "taken-over" };
    expect(read(value)).toEqual({ kind: "waiting", reason: "paused" });
  });

  test("a newer attempt wins, while another run's blocked stage cannot be borrowed", () => {
    const value = detail();
    value.stages = [{ ...value.stages[0]!, status: "blocked" },
      { ...value.stages[0]!, attempt: 2, status: "running" },
      { ...value.stages[0]!, agentRunId: "another-run", attempt: 3, status: "stuck" }];
    expect(read(value)).toEqual({ kind: "running" });
  });

  test("cancellation and a reached limit remain terminal without borrowing a success report", () => {
    for (const state of ["cancelled", "stopped"] as const) {
      const value = ended(state);
      expect(read(value)).toEqual({ kind: state, report: value.report });
      expect(read({ ...value, report: null })).toEqual({ kind: state, report: null });
      expect(read({ ...value, report: ended("completed").report })).toEqual({ kind: state, report: null });
    }
  });
});
