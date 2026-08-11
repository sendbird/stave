import { describe, expect, test } from "bun:test";
import type { NormalizedProviderEvent } from "@/lib/providers/provider.types";
import type { ChildTaskSummary } from "@/lib/runs/child-task";
import {
  approvalInteractionId,
  createWorkGraph,
  mergeChildTasksIntoWorkGraph,
  reduceWorkGraphEvent,
  resolveWorkGraphInteractions,
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

/**
 * A graph whose turn has already made the delegating call, which is how a
 * ledger node gets into a turn's graph in the first place. Merging a settled
 * child into a graph that never saw the delegation is not a real sequence — the
 * child belongs to an earlier turn then.
 */
function delegatedGraph(delegationKey = "delegation-1") {
  return reduceAll(graph(), [
    toolEvent({
      toolName: "mcp__stave-local-mcp__stave_delegate_task",
      toolUseId: "toolu_delegate",
      input: JSON.stringify({ delegationKey }),
    }),
  ]);
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

  test("a tool result ends the agent the call spawned", () => {
    // Both runtimes report a subagent's real ending as `tool_result` — Codex
    // exclusively so. Ignoring it leaves every finished worker spinning, and
    // the turn with it, since the tree derives "still working" from node
    // status.
    const next = reduceAll(graph(), [
      toolEvent({ toolUseId: "toolu_1", agentId: "agent_1" }),
      { type: "tool_result", tool_use_id: "toolu_1", output: "Swept 4 files" },
    ]);

    const node = next.nodesByKey[providerAgentNodeKey("claude-code", "agent_1")];
    expect(node?.status).toBe("completed");
    expect(node?.completedAt).toBeDefined();
    expect(next.workItemsById["tool:toolu_1"]?.status).toBe("completed");
    expect(collectLiveWorkGraphIdentities(next).has("agent_1")).toBe(false);
  });

  test("a failed result carries why, and a partial one ends nothing", () => {
    const streaming = reduceAll(graph(), [
      toolEvent({ toolUseId: "toolu_1", agentId: "agent_1" }),
      {
        type: "tool_result",
        tool_use_id: "toolu_1",
        output: "still going",
        isPartial: true,
      },
    ]);
    expect(
      streaming.nodesByKey[providerAgentNodeKey("claude-code", "agent_1")]
        ?.status,
    ).toBe("running");

    const failed = reduceAll(streaming, [
      {
        type: "tool_result",
        tool_use_id: "toolu_1",
        output: "Worker exited with status 1",
        isError: true,
      },
    ]);
    const node = failed.nodesByKey[providerAgentNodeKey("claude-code", "agent_1")];
    expect(node?.status).toBe("failed");
    expect(node?.reason).toBe("Worker exited with status 1");
  });

  test("an agent named after its spawn becomes that node instead of a second one", () => {
    // Claude emits the `Task` call with only a tool-use id; the `task_id` that
    // names the worker arrives later, on the first progress message. Keying a
    // fresh node off it draws one worker twice — and the visible half is the
    // call, which is exactly the half no control may target.
    const late = reduceAll(graph(), [
      toolEvent({ toolUseId: "toolu_1" }),
      {
        type: "subagent_progress",
        toolUseId: "toolu_1",
        agentId: "agent_late",
        content: "Reading callers",
      },
    ]);

    const agentKey = providerAgentNodeKey("claude-code", "agent_late");
    expect(late.nodesByKey[toolCallNodeKey("toolu_1")]).toBeUndefined();
    expect(late.orderedNodeKeys).toEqual([late.rootKey, agentKey]);
    const node = late.nodesByKey[agentKey];
    expect(node?.identitySource).toBe("provider");
    // The spawn's description and the call's own progress survive the rekey.
    expect(node?.label).toBe("Sweep the callers");
    expect(node?.progress).toEqual(["Reading callers"]);
    expect(node?.spawnedByToolUseId).toBe("toolu_1");
    // And the spawn index now points at the agent, so the result that ends the
    // call ends the worker.
    expect(late.nodeKeyBySpawnToolUseId.toolu_1).toBe(agentKey);
    const ended = reduceAll(late, [
      { type: "tool_result", tool_use_id: "toolu_1", output: "done" },
    ]);
    expect(ended.nodesByKey[agentKey]?.status).toBe("completed");
  });

  test("promotion carries the children the call had already collected", () => {
    const promoted = reduceAll(graph(), [
      toolEvent({ toolUseId: "toolu_parent" }),
      toolEvent({
        toolName: "Read",
        toolUseId: "toolu_read",
        parentToolUseId: "toolu_parent",
        input: "{}",
      }),
      {
        type: "subagent_progress",
        toolUseId: "toolu_parent",
        agentId: "agent_parent",
        content: "Working",
      },
    ]);

    const agentKey = providerAgentNodeKey("claude-code", "agent_parent");
    // A work item left pointing at the retired key would vanish from the tree
    // without erroring anywhere.
    expect(promoted.workItemsById["tool:toolu_read"]?.nodeKey).toBe(agentKey);
    expect(buildWorkGraphTree(promoted).map((row) => row.key)).toEqual([
      agentKey,
    ]);
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

  test("a retried child leaves the failure behind instead of staying dead", () => {
    // The delegation key is the node's identity and a retry reuses it by
    // design, so the node is already terminal when the new attempt arrives.
    // Applying the replay guard here — which exists for a stream that repeats
    // itself, not for a queried ledger — pinned the row to the failure forever.
    const failed = mergeChildTasksIntoWorkGraph(
      delegatedGraph(),
      [
        childTask({
          phase: "failed",
          reason: "Child task failed.",
          completedAt: "2026-08-11T01:00:00.000Z",
        }),
      ],
      3_000,
    );
    const key = ledgerNodeKey("delegation-1");
    expect(failed.nodesByKey[key]?.status).toBe("failed");

    const retried = mergeChildTasksIntoWorkGraph(
      failed,
      [childTask({ childTaskId: "task-child-2", attempt: 1, phase: "running" })],
      4_000,
    );
    const node = retried.nodesByKey[key];
    expect(node?.status).toBe("running");
    expect(node?.attempt).toBe(1);
    expect(node?.reason).toBeUndefined();
    expect(node?.completedAt).toBeUndefined();
    // And the control gate agrees: a running attempt is steerable again.
    expect(collectLiveWorkGraphIdentities(retried).has("delegation-1")).toBe(
      true,
    );
  });

  test("the delegating call puts the child under the agent that delegated it", () => {
    // The mixed graph: a provider subagent that delegates a durable child task
    // owns that child in the tree, rather than both floating at the root.
    const next = reduceAll(graph(), [
      toolEvent({ toolUseId: "toolu_worker", agentId: "agent_worker" }),
      toolEvent({
        toolName: "mcp__stave-local-mcp__stave_delegate_task",
        toolUseId: "toolu_delegate",
        ownerAgentId: "agent_worker",
        input: JSON.stringify({
          delegationKey: "delegation-1",
          title: "Port the callers",
          prompt: "…",
        }),
      }),
    ]);

    const workerKey = providerAgentNodeKey("claude-code", "agent_worker");
    const childKey = ledgerNodeKey("delegation-1");
    const child = next.nodesByKey[childKey];
    expect(child?.identitySource).toBe("ledger");
    expect(child?.parentKey).toBe(workerKey);
    expect(child?.label).toBe("Port the callers");
    // The child is queued until the ledger says otherwise — the MCP call
    // returns as soon as the delegation is recorded.
    expect(child?.status).toBe("pending");

    // The call's own result must not end the child: the child task outlives it.
    const afterResult = reduceAll(next, [
      { type: "tool_result", tool_use_id: "toolu_delegate", output: "ok" },
    ]);
    expect(afterResult.nodesByKey[childKey]?.status).toBe("pending");

    // And the ledger's answer lands on that same node, in that same place.
    const merged = mergeChildTasksIntoWorkGraph(
      afterResult,
      [childTask()],
      5_000,
    );
    expect(merged.nodesByKey[childKey]?.status).toBe("running");
    expect(merged.nodesByKey[childKey]?.parentKey).toBe(workerKey);
    expect(buildWorkGraphTree(merged).map((row) => [row.key, row.depth])).toEqual(
      [
        [workerKey, 0],
        [childKey, 1],
      ],
    );
  });

  test("a refused delegation ends instead of haunting the turn as a phantom", () => {
    // The coordinator can refuse before any ledger row exists, and the MCP tool
    // reports that as an ordinary successful call carrying a refusal. Nothing
    // else can correct the node — the ledger has no row to list it — so it
    // would stay "pending" for the life of the turn, counted as a live agent
    // and offering a Stop for a task that was never started.
    const refused = reduceAll(graph(), [
      toolEvent({
        toolName: "mcp__stave-local-mcp__stave_delegate_task",
        toolUseId: "toolu_delegate",
        input: JSON.stringify({ delegationKey: "delegation-1" }),
      }),
      {
        type: "tool_result",
        tool_use_id: "toolu_delegate",
        output: JSON.stringify({
          delegation: {
            accepted: false,
            duplicate: false,
            reason: "workspace-unavailable",
            message: "That workspace is not available right now.",
            child: null,
          },
        }),
      },
    ]);

    const node = refused.nodesByKey[ledgerNodeKey("delegation-1")];
    expect(node?.status).toBe("failed");
    expect(node?.reason).toBe("That workspace is not available right now.");
    expect(collectLiveWorkGraphIdentities(refused).has("delegation-1")).toBe(
      false,
    );
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
        liveIdentities: collectLiveWorkGraphIdentities(refused),
      }).available,
    ).toEqual([]);
  });

  test("an accepted delegation is left for the ledger to end", () => {
    const accepted = reduceAll(graph(), [
      toolEvent({
        toolName: "mcp__stave-local-mcp__stave_delegate_task",
        toolUseId: "toolu_delegate",
        input: JSON.stringify({ delegationKey: "delegation-1" }),
      }),
      {
        type: "tool_result",
        tool_use_id: "toolu_delegate",
        output: JSON.stringify({
          delegation: { accepted: true, duplicate: false, reason: null },
        }),
      },
    ]);

    expect(accepted.nodesByKey[ledgerNodeKey("delegation-1")]?.status).toBe(
      "pending",
    );
  });

  test("every ledger phase maps, so a settled child cannot read as running", () => {
    // A phase with no mapping falls through to "running": the row never
    // finishes, stays counted as live, and keeps offering a Stop.
    for (const [phase, expected] of [
      ["waiting", "waiting"],
      ["interrupted", "cancelled"],
    ] as const) {
      const merged = mergeChildTasksIntoWorkGraph(
        delegatedGraph(),
        [
          childTask({
            phase,
            completedAt:
              phase === "interrupted" ? "2026-08-11T01:00:00.000Z" : null,
          }),
        ],
        3_000,
      );
      expect(merged.nodesByKey[ledgerNodeKey("delegation-1")]?.status).toBe(
        expected,
      );
    }
  });

  test("a delegation from an earlier turn is not replayed into this turn", () => {
    // The parent's listing is its whole history; a graph is one turn. An older
    // child belongs to the child task list, not to this turn's fan-out.
    const before = graph();
    const merged = mergeChildTasksIntoWorkGraph(
      before,
      [childTask({ phase: "completed" })],
      3_000,
    );

    expect(merged).toBe(before);
    expect(merged.nodesByKey[ledgerNodeKey("delegation-1")]).toBeUndefined();
    expect(summarizeWorkGraph(merged).totalCount).toBe(0);
  });

  test("a child still running joins a turn whose events were never replayed", () => {
    // Adopting a restored turn stamps the graph with the adoption, not the
    // turn's start, and never replays the delegating call — so a rule keyed on
    // time would drop a child that is visibly running.
    const adopted = createWorkGraph({
      turnId: "turn-1",
      providerId: "claude-code",
      startedAt: Date.parse("2027-01-01T00:00:00.000Z"),
    });
    const merged = mergeChildTasksIntoWorkGraph(
      adopted,
      [childTask({ phase: "running" })],
      3_000,
    );

    const node = merged.nodesByKey[ledgerNodeKey("delegation-1")];
    expect(node?.status).toBe("running");
    expect(node?.parentKey).toBe(merged.rootKey);
  });

  test("a settled child keeps its ledger reason", () => {
    const merged = mergeChildTasksIntoWorkGraph(
      delegatedGraph(),
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

  test("an approval raised inside a subagent blocks that subagent, not the turn", () => {
    // The whole point of carrying `ownerAgentId` on an approval: a fan-out
    // where one of two workers is waiting on a person must not look like one
    // where both are working.
    const blocked = reduceAll(graph(), [
      toolEvent({ toolUseId: "toolu_a", agentId: "agent_a" }),
      toolEvent({ toolUseId: "toolu_b", agentId: "agent_b" }),
      {
        type: "approval",
        toolName: "Bash",
        requestId: "req-1",
        description: "Run migration?",
        ownerAgentId: "agent_b",
      },
    ]);

    const summary = summarizeWorkGraph(blocked);
    expect(summary.totalCount).toBe(2);
    expect(summary.blockedCount).toBe(1);
    expect(summary.label).toBe("2 agents · 1 blocked");
    expect(blocked.dependenciesById["blocked-on:approval:req-1"]).toEqual({
      id: "blocked-on:approval:req-1",
      kind: "blocked-on",
      from: providerAgentNodeKey("claude-code", "agent_b"),
      to: "approval:req-1",
    });
  });

  test("answering the prompt clears the block the provider never reports", () => {
    const blocked = reduceAll(graph(), [
      toolEvent({ toolUseId: "toolu_a", agentId: "agent_a" }),
      {
        type: "user_input",
        toolName: "AskUserQuestion",
        requestId: "req-2",
        questions: [
          { question: "Which branch?", header: "Branch", options: [] },
        ],
        ownerAgentId: "agent_a",
      },
    ]);
    expect(summarizeWorkGraph(blocked).blockedCount).toBe(1);

    // Nothing in the event stream says "answered" — the runtime simply carries
    // on — so a block left to the provider would never lift.
    const answered = resolveWorkGraphInteractions(blocked, 6_000);
    expect(summarizeWorkGraph(answered).blockedCount).toBe(0);
    expect(answered.interactionsById["user-input:req-2"]?.resolvedAt).toBe(
      6_000,
    );
    expect(answered.dependenciesById["blocked-on:user-input:req-2"]).toBeUndefined();
  });

  test("answering one worker's prompt leaves another's question standing", () => {
    // Both runtimes hold pending approvals in a map, one per subagent. Clearing
    // them together drops the badge off a worker whose question is still on
    // screen — and nothing re-raises it, because the approval event has already
    // been and gone.
    const blocked = reduceAll(graph(), [
      toolEvent({ toolUseId: "toolu_a", agentId: "agent_a" }),
      toolEvent({ toolUseId: "toolu_b", agentId: "agent_b" }),
      {
        type: "approval",
        toolName: "Bash",
        requestId: "req-a",
        description: "Run migration?",
        ownerAgentId: "agent_a",
      },
      {
        type: "approval",
        toolName: "Write",
        requestId: "req-b",
        description: "Overwrite the fixture?",
        ownerAgentId: "agent_b",
      },
    ]);
    expect(summarizeWorkGraph(blocked).blockedCount).toBe(2);

    const answered = resolveWorkGraphInteractions(
      blocked,
      6_000,
      approvalInteractionId("req-a"),
    );
    expect(summarizeWorkGraph(answered).blockedCount).toBe(1);
    expect(answered.interactionsById["approval:req-a"]?.resolvedAt).toBe(6_000);
    expect(answered.interactionsById["approval:req-b"]?.resolvedAt).toBeUndefined();
  });

  test("a finished turn leaves nothing badged as needing a person", () => {
    const settled = reduceAll(graph(), [
      toolEvent({ toolUseId: "toolu_a", agentId: "agent_a" }),
      {
        type: "approval",
        toolName: "Bash",
        requestId: "req-3",
        description: "Run migration?",
        ownerAgentId: "agent_a",
      },
      { type: "done" },
    ]);

    expect(summarizeWorkGraph(settled).blockedCount).toBe(0);
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

  test("a ledger child is steerable even where the runtime steers nothing", () => {
    // The child is a Stave task with its own run, stopped through the child
    // task coordinator against the identity Stage F froze. Gating that on the
    // provider's ability to steer its own in-process subagents would hide a
    // control that works.
    const merged = mergeChildTasksIntoWorkGraph(graph(), [childTask()], 3_000);
    const node = merged.nodesByKey[ledgerNodeKey("delegation-1")]!;

    expect(
      resolveWorkGraphControls({
        node,
        capabilities: {
          agentIdentity: false,
          nesting: false,
          message: false,
          interrupt: false,
          stop: false,
        },
        liveIdentities: collectLiveWorkGraphIdentities(merged),
      }),
    ).toEqual({ available: ["stop"] });
  });

  test("a settled ledger child is refused like any other finished agent", () => {
    const merged = mergeChildTasksIntoWorkGraph(
      delegatedGraph(),
      [childTask({ phase: "completed" })],
      3_000,
    );
    const node = merged.nodesByKey[ledgerNodeKey("delegation-1")]!;

    expect(
      resolveWorkGraphControls({
        node,
        capabilities: fullCapabilities,
        liveIdentities: collectLiveWorkGraphIdentities(merged),
      }),
    ).toEqual({ available: [], reason: "This agent has already finished." });
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
