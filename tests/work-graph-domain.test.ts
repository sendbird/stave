import { describe, expect, test } from "bun:test";
import type { NormalizedProviderEvent } from "@/lib/providers/provider.types";
import type { ChildTaskSummary } from "@/lib/runs/child-task";
import {
  createWorkGraph,
  mergeChildTasksIntoWorkGraph,
  recordWorkGraphInteraction,
  reduceWorkGraphEvent,
} from "@/lib/work-graph/work-graph-reducer";
import {
  buildWorkGraphTree,
  collectLiveWorkGraphIdentities,
  resolveWorkGraphControls,
  summarizeWorkGraph,
} from "@/lib/work-graph/work-graph-tree";
import {
  ledgerNodeKey,
  providerAgentNodeKey,
  toolCallNodeKey,
  type WorkGraph,
} from "@/lib/work-graph/work-graph.types";

/**
 * The work graph's contract is that it survives a stream that lies about
 * ordering, repeats itself, and omits most fields. Each test here names the
 * specific way a naive reducer breaks under that stream.
 */

function graph() {
  return createWorkGraph({
    turnId: "turn-1",
    providerId: "claude-code",
    startedAt: 1_000,
  });
}

function toolEvent(
  overrides: Partial<Extract<NormalizedProviderEvent, { type: "tool" }>> = {},
): NormalizedProviderEvent {
  return {
    type: "tool",
    toolName: "Task",
    input: JSON.stringify({ description: "Sweep the callers" }),
    state: "input-available",
    ...overrides,
  } as NormalizedProviderEvent;
}

function reduceAll(
  start: WorkGraph,
  events: NormalizedProviderEvent[],
  startAt = 2_000,
) {
  return events.reduce(
    (acc, event, index) => reduceWorkGraphEvent(acc, event, startAt + index),
    start,
  );
}

function childTask(overrides: Partial<ChildTaskSummary> = {}): ChildTaskSummary {
  return {
    runId: "run-1",
    stepId: "step-1",
    parentTaskId: "task-parent",
    delegationKey: "delegation-1",
    childTaskId: "task-child",
    childWorkspaceId: "ws-child",
    childTurnId: null,
    providerId: "claude-code",
    lifecycle: "managed",
    phase: "running",
    reason: null,
    attempt: 0,
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    completedAt: null,
    ...overrides,
  } as ChildTaskSummary;
}

describe("work graph node identity", () => {
  test("a named agent keys off provider identity, never off the tool-use id", () => {
    const next = reduceAll(graph(), [
      toolEvent({ toolUseId: "toolu_1", agentId: "agent_explore" }),
    ]);

    const key = providerAgentNodeKey("claude-code", "agent_explore");
    expect(next.nodesByKey[key]?.identitySource).toBe("provider");
    expect(next.nodesByKey[toolCallNodeKey("toolu_1")]).toBeUndefined();
    // The spawn index still resolves the call, so later nesting and progress
    // find the agent without a second node existing for the same worker.
    expect(next.nodeKeyBySpawnToolUseId.toolu_1).toBe(key);
  });

  test("an unnamed spawn falls back to the call but is marked unsteerable", () => {
    const next = reduceAll(graph(), [toolEvent({ toolUseId: "toolu_2" })]);

    const node = next.nodesByKey[toolCallNodeKey("toolu_2")];
    expect(node?.identitySource).toBe("tool-call");
    expect(
      resolveWorkGraphControls({
        node: node!,
        capabilities: {
          agentIdentity: true,
          nesting: true,
          message: true,
          interrupt: true,
          stop: true,
        },
        liveIdentities: new Set(["toolu_2"]),
      }),
    ).toEqual({
      available: [],
      reason:
        "This provider does not name the agent behind this call, so it cannot be steered on its own.",
    });
  });

  test("`agentId` and `ownerAgentId` never merge, so a spawn edge cannot invert", () => {
    // Claude's hook `agent_id` says "this ran inside agent X"; Codex's child
    // `agentThreadId` says "this call *is* agent X". Reading one as the other
    // hangs a parent off its own child.
    const next = reduceAll(graph(), [
      toolEvent({ toolUseId: "toolu_parent", agentId: "agent_parent" }),
      toolEvent({
        toolUseId: "toolu_child",
        agentId: "agent_child",
        ownerAgentId: "agent_parent",
      }),
    ]);

    const parentKey = providerAgentNodeKey("claude-code", "agent_parent");
    const childKey = providerAgentNodeKey("claude-code", "agent_child");
    expect(next.nodesByKey[childKey]?.parentKey).toBe(parentKey);
    expect(next.nodesByKey[parentKey]?.parentKey).toBe(next.rootKey);
  });

  test("reported nesting via parentToolUseId attaches to the spawned agent", () => {
    const next = reduceAll(graph(), [
      toolEvent({ toolUseId: "toolu_parent", agentId: "agent_parent" }),
      toolEvent({
        toolName: "Read",
        toolUseId: "toolu_read",
        parentToolUseId: "toolu_parent",
        input: "{}",
      }),
    ]);

    const parentKey = providerAgentNodeKey("claude-code", "agent_parent");
    expect(next.workItemsById["tool:toolu_read"]?.nodeKey).toBe(parentKey);
  });
});

describe("work graph tolerates late, duplicate, and partial events", () => {
  test("a replayed running state cannot resurrect a finished agent", () => {
    const next = reduceAll(graph(), [
      toolEvent({ toolUseId: "toolu_1", agentId: "agent_1" }),
      toolEvent({
        toolUseId: "toolu_1",
        agentId: "agent_1",
        state: "output-available",
      }),
      toolEvent({ toolUseId: "toolu_1", agentId: "agent_1" }),
    ]);

    const node = next.nodesByKey[providerAgentNodeKey("claude-code", "agent_1")];
    expect(node?.status).toBe("completed");
    expect(next.orderedNodeKeys).toHaveLength(2);
    expect(next.orderedWorkItemIds).toEqual(["tool:toolu_1"]);
  });

  test("a child that arrives before its parent is adopted, not stranded", () => {
    const early = reduceAll(graph(), [
      toolEvent({
        toolUseId: "toolu_child",
        agentId: "agent_child",
        ownerAgentId: "agent_parent",
      }),
    ]);
    const parentKey = providerAgentNodeKey("claude-code", "agent_parent");
    const childKey = providerAgentNodeKey("claude-code", "agent_child");

    // The parent is materialized from the child's claim, so the edge exists
    // immediately rather than waiting for a spawn Stave may never see.
    expect(early.nodesByKey[parentKey]).toBeDefined();
    expect(early.dependenciesById[`spawn:${parentKey}->${childKey}`]).toBeDefined();

    const late = reduceAll(early, [
      toolEvent({ toolUseId: "toolu_parent", agentId: "agent_parent" }),
    ]);
    expect(late.nodesByKey[childKey]?.parentKey).toBe(parentKey);
    expect(late.nodesByKey[parentKey]?.label).toBe("Sweep the callers");
  });

  test("an absent field leaves what the graph already knew intact", () => {
    const next = reduceAll(graph(), [
      toolEvent({
        toolUseId: "toolu_1",
        agentId: "agent_1",
        input: JSON.stringify({
          description: "Audit the reducer",
          subagent_type: "Explore",
        }),
      }),
      toolEvent({
        toolUseId: "toolu_1",
        agentId: "agent_1",
        input: "{}",
        state: "output-available",
      }),
    ]);

    const node = next.nodesByKey[providerAgentNodeKey("claude-code", "agent_1")];
    expect(node?.label).toBe("Audit the reducer");
    expect(node?.badge).toBe("Explore");
    expect(node?.status).toBe("completed");
  });

  test("repeated identical progress does not grow the node's narration", () => {
    const progress = (content: string): NormalizedProviderEvent => ({
      type: "subagent_progress",
      toolUseId: "toolu_1",
      agentId: "agent_1",
      content,
    });
    const next = reduceAll(graph(), [
      toolEvent({ toolUseId: "toolu_1", agentId: "agent_1" }),
      progress("Reading callers"),
      progress("Reading callers"),
      progress("Found 4"),
    ]);

    expect(
      next.nodesByKey[providerAgentNodeKey("claude-code", "agent_1")]?.progress,
    ).toEqual(["Reading callers", "Found 4"]);
  });

  test("a no-op event returns the same graph reference", () => {
    const first = reduceAll(graph(), [
      toolEvent({ toolUseId: "toolu_1", agentId: "agent_1" }),
    ]);
    const second = reduceWorkGraphEvent(
      first,
      toolEvent({ toolUseId: "toolu_1", agentId: "agent_1" }),
      9_000,
    );

    expect(second).toBe(first);
  });
});

describe("work graph ledger nodes", () => {
  test("a delegated child is keyed by delegation key so a retry stays one node", () => {
    const merged = mergeChildTasksIntoWorkGraph(
      graph(),
      [childTask()],
      3_000,
    );
    const retried = mergeChildTasksIntoWorkGraph(
      merged,
      [childTask({ childTaskId: "task-child-2", attempt: 1 })],
      4_000,
    );

    const key = ledgerNodeKey("delegation-1");
    expect(retried.orderedNodeKeys.filter((entry) => entry === key)).toHaveLength(1);
    expect(retried.nodesByKey[key]?.identitySource).toBe("ledger");
    // The node survives the retry, but it follows the delegation to the child
    // task that is actually running now — an "open child" aimed at the dead
    // first attempt would be a broken link.
    expect(retried.nodesByKey[key]?.childTaskId).toBe("task-child-2");
  });

  test("a settled child keeps its ledger reason", () => {
    const merged = mergeChildTasksIntoWorkGraph(
      graph(),
      [
        childTask({
          phase: "cancelled",
          reason: "Detached from the parent task.",
          completedAt: "2026-08-11T01:00:00.000Z",
        }),
      ],
      3_000,
    );

    const node = merged.nodesByKey[ledgerNodeKey("delegation-1")];
    expect(node?.status).toBe("cancelled");
    expect(node?.reason).toBe("Detached from the parent task.");
  });
});

describe("work graph projection", () => {
  test("the tree nests children under parents and sorts siblings by urgency", () => {
    const next = reduceAll(graph(), [
      toolEvent({ toolUseId: "toolu_a", agentId: "agent_a" }),
      toolEvent({
        toolUseId: "toolu_b",
        agentId: "agent_b",
        state: "output-available",
      }),
      toolEvent({
        toolUseId: "toolu_c",
        agentId: "agent_c",
        ownerAgentId: "agent_a",
        state: "output-error",
      }),
    ]);

    const rows = buildWorkGraphTree(next);
    expect(rows.map((row) => [row.node.agentId, row.depth])).toEqual([
      ["agent_a", 0],
      ["agent_c", 1],
      ["agent_b", 0],
    ]);
    expect(rows[0]?.hasChildren).toBe(true);
  });

  test("a blocked node leads the Fleet summary", () => {
    const next = reduceAll(graph(), [
      toolEvent({ toolUseId: "toolu_a", agentId: "agent_a" }),
      toolEvent({ toolUseId: "toolu_b", agentId: "agent_b" }),
    ]);
    const blocked = recordWorkGraphInteraction(
      next,
      {
        id: "interaction-1",
        nodeKey: providerAgentNodeKey("claude-code", "agent_b"),
        kind: "approval",
        title: "Run migration?",
        raisedAt: 5_000,
      },
      5_000,
    );

    const summary = summarizeWorkGraph(blocked);
    expect(summary.totalCount).toBe(2);
    expect(summary.blockedCount).toBe(1);
    expect(summary.label).toBe("2 agents · 1 blocked");
    expect(
      blocked.dependenciesById["blocked-on:interaction-1"]?.kind,
    ).toBe("blocked-on");
  });

  test("an empty graph says so rather than rendering a bare count", () => {
    expect(summarizeWorkGraph(graph()).label).toBe("No agents");
  });
});

describe("work graph controls", () => {
  const fullCapabilities = {
    agentIdentity: true,
    nesting: true,
    message: true,
    interrupt: true,
    stop: true,
  };

  test("a live named agent is offered exactly the capabilities the runtime declares", () => {
    const next = reduceAll(graph(), [
      toolEvent({ toolUseId: "toolu_1", agentId: "agent_1" }),
    ]);
    const node = next.nodesByKey[providerAgentNodeKey("claude-code", "agent_1")]!;

    expect(
      resolveWorkGraphControls({
        node,
        capabilities: { ...fullCapabilities, interrupt: false },
        liveIdentities: collectLiveWorkGraphIdentities(next),
      }).available,
    ).toEqual(["message", "stop"]);
  });

  test("a control prepared against a departed agent is refused with a reason", () => {
    const next = reduceAll(graph(), [
      toolEvent({ toolUseId: "toolu_1", agentId: "agent_1" }),
    ]);
    const node = next.nodesByKey[providerAgentNodeKey("claude-code", "agent_1")]!;

    expect(
      resolveWorkGraphControls({
        node,
        capabilities: fullCapabilities,
        liveIdentities: new Set(["agent_other"]),
      }),
    ).toEqual({
      available: [],
      reason: "This agent is no longer running in the current turn.",
    });
  });

  test("a runtime without per-agent steering offers nothing and says why", () => {
    const next = reduceAll(graph(), [
      toolEvent({ toolUseId: "toolu_1", agentId: "agent_1" }),
    ]);
    const node = next.nodesByKey[providerAgentNodeKey("claude-code", "agent_1")]!;

    expect(
      resolveWorkGraphControls({
        node,
        capabilities: {
          agentIdentity: true,
          nesting: true,
          message: false,
          interrupt: false,
          stop: false,
        },
        liveIdentities: collectLiveWorkGraphIdentities(next),
      }),
    ).toEqual({
      available: [],
      reason: "This provider cannot steer one agent without ending the turn.",
    });
  });

  test("a finished agent is never live, so the tree and the gate agree", () => {
    const next = reduceAll(graph(), [
      toolEvent({ toolUseId: "toolu_1", agentId: "agent_1" }),
      toolEvent({
        toolUseId: "toolu_1",
        agentId: "agent_1",
        state: "output-available",
      }),
    ]);

    expect(collectLiveWorkGraphIdentities(next).has("agent_1")).toBe(false);
  });
});
