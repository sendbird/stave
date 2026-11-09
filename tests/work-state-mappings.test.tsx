import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { agentStateWorkState, type AgentStepState } from "@/components/aui/components/agent-state";
import { WORK_STATE, type WorkState } from "@/components/aui/components/state-vocabulary";
import { DelegationsBlock } from "@/components/delegation/DelegationsBlock";
import { ExchangeRow } from "@/components/delegation/ExchangeRow";
import { applyRuntimeLocale } from "@/i18n/runtime";
import { AGENT_RUN_BADGES, agentRunBadgeToWorkState } from "@/lib/agent-runs/agent-run-status";
import {
  countDelegationExchanges,
  formatDelegationCounts,
  fromDelegatedTask,
  isDelegationExchangeLive,
  selectDelegationExchanges,
  type DelegationExchange,
} from "@/lib/delegation/exchange";
import {
  describeExchangeStatus,
  EXCHANGE_STATUSES,
  exchangeStatusFromDelegatedTaskPhase,
  exchangeStatusFromWorkGraphStatus,
  exchangeStatusToWorkState,
  isExchangeStatusLive,
  workGraphStatusToWorkState,
  type ExchangeStatus,
} from "@/lib/delegation/format";
import { countSubagentFilters, subagentFilterOf } from "@/lib/delegation/subagent-list";
import { describeSubagentState, planSubagentLine } from "@/lib/delegation/subagent-summary";
import { fleetStatusToWorkState, type FleetDisplayStatus } from "@/lib/fleet/task-status";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import { createWorkGraph } from "@/lib/work-graph/work-graph-reducer";
import { providerAgentNodeKey, type AgentNode, type WorkGraphStatus } from "@/lib/work-graph/work-graph.types";

/**
 * Every status source maps onto the one work-state vocabulary exactly once.
 * These tables spell out every source state, so adding a state to a source
 * without deciding its mark fails here rather than drawing a guess.
 */

afterEach(() => applyRuntimeLocale("en"));

const T0 = Date.parse("2026-10-22T10:00:00.000Z");

describe("exchange statuses", () => {
  const EXPECTED: Record<ExchangeStatus, { state: WorkState; live: boolean; label: string }> = {
    queued: { state: "queued", live: true, label: "Queued" },
    running: { state: "working", live: true, label: "Running" },
    waiting: { state: "waiting", live: true, label: "Waiting" },
    needs_user: { state: "needs-you", live: true, label: "Needs you" },
    returned: { state: "ready", live: false, label: "Returned" },
    failed: { state: "failed", live: false, label: "Failed" },
    cancelled: { state: "stopped", live: false, label: "Cancelled" },
    timed_out: { state: "failed", live: false, label: "Timed out" },
    unresolved: { state: "unknown", live: false, label: "Unresolved" },
  };

  test("every status has one work state, a liveness and a word", () => {
    expect([...EXCHANGE_STATUSES].sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const status of EXCHANGE_STATUSES) {
      expect({ status, state: exchangeStatusToWorkState(status) }).toEqual({ status, state: EXPECTED[status].state });
      expect({ status, live: isExchangeStatusLive(status) }).toEqual({ status, live: EXPECTED[status].live });
      expect(describeExchangeStatus(status).label).toBe(EXPECTED[status].label);
      expect(WORK_STATE[exchangeStatusToWorkState(status)]).toBeDefined();
    }
  });

  test("waiting on a person and waiting between turns are two states, both live", () => {
    expect(exchangeStatusToWorkState("needs_user")).not.toBe(exchangeStatusToWorkState("waiting"));
    expect(describeExchangeStatus("needs_user").tone).toBe("warning");
    expect(describeExchangeStatus("waiting").tone).toBe("neutral");
    applyRuntimeLocale("ko");
    expect(describeExchangeStatus("needs_user").label).toBe("확인 필요");
    expect(describeExchangeStatus("waiting").label).toBe("대기 중");
  });
});

describe("delegated-task phases", () => {
  const PHASES = ["pending", "running", "waiting", "completed", "failed", "interrupted", "cancelled"] as const;
  const EXPECTED: Record<(typeof PHASES)[number], [open: ExchangeStatus, blocked: ExchangeStatus]> = {
    pending: ["queued", "needs_user"],
    running: ["running", "needs_user"],
    waiting: ["waiting", "needs_user"],
    completed: ["returned", "returned"],
    failed: ["failed", "failed"],
    interrupted: ["failed", "failed"],
    cancelled: ["cancelled", "cancelled"],
  };

  test("a blocked live child needs the user; a settled one keeps its outcome", () => {
    for (const phase of PHASES) {
      expect([phase, exchangeStatusFromDelegatedTaskPhase(phase)]).toEqual([phase, EXPECTED[phase][0]]);
      expect([phase, exchangeStatusFromDelegatedTaskPhase(phase, { blocked: true })]).toEqual([phase, EXPECTED[phase][1]]);
    }
  });
});

describe("work-graph statuses", () => {
  const STATUSES: readonly WorkGraphStatus[] = ["pending", "running", "waiting", "completed", "failed", "cancelled"];
  const EXPECTED: Record<WorkGraphStatus, [open: WorkState, blocked: WorkState]> = {
    pending: ["queued", "needs-you"],
    running: ["working", "needs-you"],
    waiting: ["waiting", "needs-you"],
    completed: ["ready", "ready"],
    failed: ["failed", "failed"],
    cancelled: ["stopped", "stopped"],
  };

  test("the tree and the delegation rows read one node the same way", () => {
    for (const status of STATUSES) {
      for (const blocked of [false, true]) {
        const state = workGraphStatusToWorkState(status, { blocked });
        expect([status, blocked, state]).toEqual([status, blocked, EXPECTED[status][blocked ? 1 : 0]]);
        expect(state).toBe(exchangeStatusToWorkState(exchangeStatusFromWorkGraphStatus(status, { blocked })));
      }
    }
  });
});

describe("Fleet task statuses", () => {
  const EXPECTED: Record<FleetDisplayStatus, WorkState> = {
    "waiting-input": "needs-you",
    "waiting-approval": "approval",
    error: "failed",
    // A quiet turn is still working: silence does not establish a stop.
    stalled: "working",
    running: "working",
    idle: "idle",
    unknown: "unknown",
  };

  test("every status has one work state", () => {
    for (const [status, state] of Object.entries(EXPECTED) as Array<[FleetDisplayStatus, WorkState]>) {
      expect([status, fleetStatusToWorkState(status)]).toEqual([status, state]);
    }
  });
});

describe("agent-run badges and agent steps", () => {
  test("every run badge has one work state", () => {
    expect(Object.fromEntries(AGENT_RUN_BADGES.map((badge) => [badge, agentRunBadgeToWorkState(badge)]))).toEqual({
      running: "working",
      "needs-answer": "needs-you",
      paused: "paused",
      halted: "halted",
      completed: "ready",
      stopped: "stopped",
    });
  });

  test("every agent step state has one work state", () => {
    const steps = Object.keys(agentStateWorkState) as AgentStepState[];
    expect(steps.length).toBe(15);
    for (const step of steps) expect(WORK_STATE[agentStateWorkState[step]]).toBeDefined();
    expect(agentStateWorkState.approval).toBe("approval");
    expect(agentStateWorkState.canceled).toBe("stopped");
  });
});

function child(overrides: Partial<DelegatedTaskSummary> = {}): DelegatedTaskSummary {
  return {
    runId: "run-1", stepId: "step-1", parentTaskId: "parent", delegationKey: "writer", delegatedTaskId: "child-1",
    delegatedWorkspaceId: "ws-1", delegatedTurnId: null, providerId: "claude-code", lifecycle: "isolated",
    phase: "running", reason: null, attempt: 0, createdAt: new Date(T0).toISOString(), updatedAt: new Date(T0).toISOString(),
    completedAt: null, ...overrides,
  } as DelegatedTaskSummary;
}

describe("a subagent waiting on the user", () => {
  const blockedGraph = () => {
    const graph = createWorkGraph({ turnId: "turn-1", providerId: "claude-code", startedAt: T0 });
    const key = providerAgentNodeKey("claude-code", "plan-1");
    const node: AgentNode = {
      key, identitySource: "provider", agentId: "plan-1", parentKey: graph.rootKey, label: "Plan the rollout",
      status: "running", startedAt: T0, updatedAt: T0, progress: [],
    };
    return {
      ...graph,
      nodesByKey: { ...graph.nodesByKey, [key]: node },
      orderedNodeKeys: [...graph.orderedNodeKeys, key],
      interactionsById: { "approval:1": { id: "approval:1", nodeKey: key, kind: "approval" as const, title: "Write docs", raisedAt: T0 } },
    };
  };

  test("reads as needs you in the model, the counts, the line and the filters, never as running", () => {
    const rows = selectDelegationExchanges({
      delegatedTasks: [child(), child({ delegationKey: "ship", phase: "waiting" })],
      childBlockedByDelegationKey: { writer: "user-input" },
      workGraph: blockedGraph(),
      includeSubagents: true,
    });
    expect(rows.map((row) => [row.title, row.outcome.status])).toEqual([
      ["writer", "needs_user"],
      ["ship", "waiting"],
      ["Plan the rollout", "needs_user"],
    ]);
    expect(rows.every(isDelegationExchangeLive)).toBe(true);
    const counts = countDelegationExchanges(rows);
    expect(counts).toEqual({ needsYou: 2, running: 1, done: 0, failed: 0, total: 3 });
    expect(formatDelegationCounts(counts)).toBe("2 need you · 1 running");
    expect(rows.map(describeSubagentState)).toEqual(["needs you", "waiting", "needs you"]);
    expect(planSubagentLine(rows).shown.map((row) => row.title)).toEqual(["writer", "Plan the rollout", "ship"]);
    expect(rows.map(subagentFilterOf)).toEqual(["needs-you", "running", "needs-you"]);
    expect(countSubagentFilters(rows)).toEqual({ "needs-you": 2, failed: 0, running: 1, done: 0, stopped: 0 });
  });

  test("the delegation row wears the needs-you mark, and the block header counts it", () => {
    const asking: DelegationExchange = fromDelegatedTask(child(), { blockedKind: "approval" });
    const row = renderToStaticMarkup(createElement(ExchangeRow, { exchange: asking, nowMs: T0 + 60_000 }));
    expect(row).toContain('data-exchange-status="needs_user"');
    expect(row).toContain('data-state="needs-you"');
    expect(row).toContain('aria-label="Needs you"');
    expect(row).not.toContain('data-state="working"');
    const between = renderToStaticMarkup(createElement(ExchangeRow, { exchange: fromDelegatedTask(child({ phase: "waiting" })), nowMs: T0 }));
    expect(between).toContain('data-state="waiting"');
    const block = renderToStaticMarkup(createElement(DelegationsBlock, { exchanges: [asking], nowMs: T0 + 60_000 }));
    expect(block).toContain("1 needs you");
  });
});
