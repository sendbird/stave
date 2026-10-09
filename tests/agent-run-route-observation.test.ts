import { describe, expect, test } from "bun:test";
import { AgentRunEventSchema, buildAgentRunTurnKey, buildAgentRunTurnOutcomeKey, type AgentRunEvent } from "../src/lib/agent-runs/domain";
import { AgentRunRouteSelectionSchema, projectAgentRunRoutes, type AgentRunRouteTurnFacts } from "../src/lib/agent-runs/route-observation";
import { agentRunFixture } from "./fixtures/agent-run-fixtures";

const selection = AgentRunRouteSelectionSchema.parse({
  version: 1, source: "classifier_fallback",
  previous: { providerId: "claude-code", model: "sonnet" },
  selected: { providerId: "codex", model: "gpt-5.5" },
  requestedEffort: "high", effortSource: "auto",
  inputs: { quota: "not-provided", catalog: "not-provided", availability: "not-provided" },
});
const key = buildAgentRunTurnKey({ agentRunId: "agent-run-1", stageId: "understand", attempt: 1, turn: 1 });
const start = AgentRunEventSchema.parse({
  id: "start-1", agentRunId: "agent-run-1", sequence: 1, kind: "turn-started", idempotencyKey: key,
  detail: { stageId: "understand", attempt: 1, routeSelection: selection }, createdAt: "2026-10-09T00:00:00.000Z",
});
const linked = AgentRunEventSchema.parse({
  ...start, id: "linked-1", sequence: 2, kind: "turn-linked", idempotencyKey: buildAgentRunTurnOutcomeKey(key, "linked"),
  detail: { stageId: "understand", attempt: 1, turnId: "turn-1" },
});
const stages = agentRunFixture().stages;
const facts: AgentRunRouteTurnFacts = { completed: true, ending: "completed", usage: { inputTokens: 10, outputTokens: 5 } };
const project = (events: AgentRunEvent[], turns = new Map([["turn-1", facts]])) =>
  projectAgentRunRoutes({ agentRunId: "agent-run-1", events, stages, turns });

describe("route observation evidence", () => {
  test("joins by dispatch identity, deduplicates replay and keeps native execution and unreported cost unknown", () => {
    const result = project([linked, start, start, linked]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      decisionId: key, turnId: "turn-1", selection, providerChanged: true,
      turnOutcome: "completed", attemptStatus: "pending", latestInAttempt: true, effectiveModel: null, effectiveEffort: null,
      usage: { inputTokens: 10, outputTokens: 5 }, reportedCostUsd: null,
    });
  });

  test("does not borrow a newer attempt, another run or an unrelated nearby turn", () => {
    const newerAttempt = { ...linked, detail: { ...linked.detail, attempt: 2 } };
    const anotherRun = { ...linked, agentRunId: "another-run" };
    const nearby = { ...linked, idempotencyKey: "a-different-start:linked" };
    for (const wrong of [newerAttempt, anotherRun, nearby]) {
      expect(project([start, wrong])[0]).toMatchObject({ turnId: null, turnOutcome: "unknown", usage: null });
    }
    const result = projectAgentRunRoutes({ agentRunId: "agent-run-1", events: [start, linked],
      stages: stages.map((stage) => ({ ...stage, attempt: 2, status: "completed" })), turns: new Map([["turn-1", facts]]) });
    expect(result[0]?.attemptStatus).toBeNull();
  });

  test("old or malformed selection detail loads without inventing historical routing", () => {
    for (const detail of [
      { stageId: "understand", attempt: 1, model: "codex:gpt-5.5", route: "auto" },
      { ...start.detail, routeSelection: { ...selection, secretEnv: "must not survive" } },
    ]) {
      expect(project([{ ...start, detail }, linked])[0]).toMatchObject({ selection: null, providerChanged: null, effectiveEffort: null });
    }
    expect(AgentRunEventSchema.safeParse({ ...start, detail: { model: "codex:gpt-5.5" } }).success).toBe(true);
  });

  test("a start failure has no usage; interruption overrides a completed transport row", () => {
    const failed: AgentRunEvent = { ...linked, kind: "turn-failed", idempotencyKey: buildAgentRunTurnOutcomeKey(key, "failed") };
    expect(project([start, failed])[0]).toMatchObject({ turnId: null, turnOutcome: "start-failed", usage: null, reportedCostUsd: null });
    const interrupted: AgentRunEvent = { ...linked, id: "interrupted-1", sequence: 3, kind: "turn-interrupted",
      idempotencyKey: buildAgentRunTurnOutcomeKey(key, "interrupted") };
    expect(project([start, linked, interrupted])[0]?.turnOutcome).toBe("interrupted");
  });

  test("active or missing turns do not masquerade as measured completed work", () => {
    expect(project([start, linked], new Map())[0]).toMatchObject({ turnOutcome: "unknown", usage: null, reportedCostUsd: null });
    expect(project([start, linked], new Map([["turn-1", { ...facts, completed: false }]]))[0])
      .toMatchObject({ turnOutcome: "running", usage: null, reportedCostUsd: null });
  });

  test("multiple nudge decisions share attempt state without attributing its acceptance to every turn", () => {
    const nextKey = buildAgentRunTurnKey({ agentRunId: "agent-run-1", stageId: "understand", attempt: 1, turn: 2 });
    const nextStart = { ...start, id: "start-2", sequence: 3, idempotencyKey: nextKey };
    const nextLinked = { ...linked, id: "linked-2", sequence: 4, idempotencyKey: buildAgentRunTurnOutcomeKey(nextKey, "linked"),
      detail: { ...linked.detail, turnId: "turn-2" } };
    const result = projectAgentRunRoutes({ agentRunId: "agent-run-1", events: [nextLinked, start, linked, nextStart],
      stages: stages.map((stage) => ({ ...stage, status: "completed" })),
      turns: new Map([["turn-1", facts], ["turn-2", facts]]) });
    expect(result.map(({ turnId, attemptStatus, latestInAttempt }) => ({ turnId, attemptStatus, latestInAttempt })))
      .toEqual([
        { turnId: "turn-1", attemptStatus: "completed", latestInAttempt: false },
        { turnId: "turn-2", attemptStatus: "completed", latestInAttempt: true },
      ]);
  });
});
