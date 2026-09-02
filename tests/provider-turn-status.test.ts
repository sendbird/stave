import { describe, expect, test } from "bun:test";
import {
  applyProviderTurnActivityEvents,
  clearProviderTurnActivity,
  formatProviderTurnIdleDuration,
  markProviderTurnInteractionResolved,
  markProviderTurnStalled,
  PROVIDER_TURN_STALL_THRESHOLD_MS,
  reduceProviderTurnActivityEvents,
  resolveProviderTurnStallThresholdMs,
  resolveProviderTurnDisplayState,
  RETAINED_TURN_ACTIVITY_LIMIT,
  retainRetiredTurnActivity,
  startProviderTurnActivity,
} from "../src/lib/providers/turn-status";
import { userInputInteractionId } from "../src/lib/work-graph/work-graph-reducer";
import {
  buildWorkGraphTree,
  summarizeWorkGraph,
} from "../src/lib/work-graph/work-graph-tree";

describe("provider turn status helpers", () => {
  test("starts tracking a new active turn", () => {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 1000,
    });

    expect(started["task-1"]).toMatchObject({
      turnId: "turn-1",
      providerId: "claude-code",
      startedAt: 1000,
      lastEventAt: 1000,
      stalledAt: null,
      pendingInteraction: null,
      workItemsById: {},
      orderedWorkItemIds: [],
    });
    // A turn that has activity always has a graph: the two projections share
    // one lifecycle so neither can outlive the other.
    expect(started["task-1"]?.workGraph).toMatchObject({
      turnId: "turn-1",
      providerId: "claude-code",
      startedAt: 1000,
    });
  });

  test("preserves a pending interaction when the same turn is refreshed", () => {
    const pending = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      pendingInteraction: "user_input",
      now: 1000,
    });
    const refreshed = startProviderTurnActivity({
      activityByTask: pending,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 2000,
    });

    expect(refreshed["task-1"]?.pendingInteraction).toBe("user_input");
  });

  test("tracks pending approval without marking the turn stalled", () => {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 1000,
    });
    const pending = applyProviderTurnActivityEvents({
      activityByTask: started,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 2000,
      events: [
        {
          type: "approval",
          toolName: "Bash",
          requestId: "req-1",
          description: "Run command",
        },
      ],
    });
    const stalled = markProviderTurnStalled({
      activityByTask: pending,
      taskId: "task-1",
      turnId: "turn-1",
      now: 50_000,
    });

    expect(pending["task-1"]?.pendingInteraction).toBe("approval");
    expect(stalled).toBe(pending);
    expect(
      resolveProviderTurnDisplayState({
        activeTurnId: "turn-1",
        activity: stalled["task-1"],
      }),
    ).toBe("responding");
  });

  test.each([
    {
      label: "approval",
      event: {
        type: "approval" as const,
        toolName: "Bash",
        requestId: "req-approval",
        description: "Run command",
      },
      expected: "approval" as const,
    },
    {
      label: "user input",
      event: {
        type: "user_input" as const,
        toolName: "AskUserQuestion",
        requestId: "req-user-input",
        questions: [],
      },
      expected: "user_input" as const,
    },
  ])(
    "keeps pending $label across unrelated events until explicitly resolved",
    ({ event, expected }) => {
      const started = startProviderTurnActivity({
        activityByTask: {},
        taskId: "task-1",
        turnId: "turn-1",
        providerId: "claude-code",
        now: 1000,
      });
      const pending = applyProviderTurnActivityEvents({
        activityByTask: started,
        taskId: "task-1",
        turnId: "turn-1",
        providerId: "claude-code",
        now: 2000,
        events: [event],
      });
      const unrelated = applyProviderTurnActivityEvents({
        activityByTask: pending,
        taskId: "task-1",
        turnId: "turn-1",
        providerId: "claude-code",
        now: 3000,
        events: [{ type: "text", text: "Background work continued" }],
      });
      const resolved = markProviderTurnInteractionResolved({
        activityByTask: unrelated,
        taskId: "task-1",
        turnId: "turn-1",
        now: 4000,
      });

      expect(unrelated["task-1"]?.pendingInteraction).toBe(expected);
      expect(resolved["task-1"]?.pendingInteraction).toBeNull();
    },
  );

  test("marks a quiet turn as stalled once user interaction is not pending", () => {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 1000,
    });
    const running = applyProviderTurnActivityEvents({
      activityByTask: started,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 2000,
      events: [{ type: "text", text: "Working..." }],
    });
    const stalled = markProviderTurnStalled({
      activityByTask: running,
      taskId: "task-1",
      turnId: "turn-1",
      now: 60_000,
    });

    expect(stalled["task-1"]?.stalledAt).toBe(60_000);
    expect(
      resolveProviderTurnDisplayState({
        activeTurnId: "turn-1",
        activity: stalled["task-1"],
      }),
    ).toBe("stalled");
    expect(
      formatProviderTurnIdleDuration({
        activity: stalled["task-1"],
        now: 63_000,
      }),
    ).toBe("1m 1s");
  });

  test("drops a pending-interaction hint the transcript no longer backs", () => {
    // Regression: `pendingInteraction` is a cached hint, cleared only when the
    // user answers through the store. A prompt resolved any other way (managed
    // host answering for the agent, runtime auto-decline, message replay) left
    // the hint set, which exempted the turn from the stall net for good and
    // pinned the task to "active" with nothing left to reclaim it.
    const pending = applyProviderTurnActivityEvents({
      activityByTask: startProviderTurnActivity({
        activityByTask: {},
        taskId: "task-1",
        turnId: "turn-1",
        providerId: "claude-code",
        now: 1000,
      }),
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 2000,
      events: [
        {
          type: "approval",
          toolName: "Bash",
          requestId: "req-1",
          description: "Run command",
        },
      ],
    });
    expect(pending["task-1"]?.pendingInteraction).toBe("approval");

    // The prompt is gone from the transcript → the hint is stale.
    const stalled = markProviderTurnStalled({
      activityByTask: pending,
      taskId: "task-1",
      turnId: "turn-1",
      now: 60_000,
      hasPendingPrompt: false,
    });
    expect(stalled["task-1"]?.stalledAt).toBe(60_000);
    expect(stalled["task-1"]?.pendingInteraction).toBeNull();
    expect(
      resolveProviderTurnDisplayState({
        activeTurnId: "turn-1",
        activity: stalled["task-1"],
      }),
    ).toBe("stalled");
  });

  test("keeps exempting a turn whose prompt is still unanswered", () => {
    const pending = applyProviderTurnActivityEvents({
      activityByTask: startProviderTurnActivity({
        activityByTask: {},
        taskId: "task-1",
        turnId: "turn-1",
        providerId: "claude-code",
        now: 1000,
      }),
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 2000,
      events: [
        {
          type: "user_input",
          toolName: "AskUserQuestion",
          requestId: "req-1",
          questions: [],
        },
      ],
    });

    // A caller that sees the prompt still waiting, and a caller that cannot
    // check at all, must both leave the exemption in place.
    for (const hasPendingPrompt of [true, undefined]) {
      const stalled = markProviderTurnStalled({
        activityByTask: pending,
        taskId: "task-1",
        turnId: "turn-1",
        now: 60_000,
        hasPendingPrompt,
      });
      expect(stalled).toBe(pending);
      expect(stalled["task-1"]?.pendingInteraction).toBe("user_input");
    }
  });

  test("resumes activity after approval resolution", () => {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 1000,
    });
    const pending = applyProviderTurnActivityEvents({
      activityByTask: started,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 2000,
      events: [
        {
          type: "tool",
          toolUseId: "toolu_1",
          toolName: "Task",
          input: JSON.stringify({ description: "Sweep the callers" }),
          state: "input-available",
          agentId: "agent_1",
        },
        {
          type: "user_input",
          toolName: "AskUserQuestion",
          requestId: "req-1",
          questions: [],
          ownerAgentId: "agent_1",
        },
      ],
    });
    expect(pending["task-1"]?.pendingInteraction).toBe("user_input");
    expect(
      summarizeWorkGraph(pending["task-1"]!.workGraph).blockedCount,
    ).toBe(1);

    const resumed = markProviderTurnInteractionResolved({
      activityByTask: pending,
      taskId: "task-1",
      turnId: "turn-1",
      now: 5000,
      interactionId: userInputInteractionId("req-1"),
    });

    expect(resumed["task-1"]).toMatchObject({
      turnId: "turn-1",
      providerId: "claude-code",
      startedAt: 1000,
      lastEventAt: 5000,
      stalledAt: null,
      pendingInteraction: null,
    });
    // The graph hears "answered" from the same place the shelf does: no
    // provider event reports it, so otherwise the agent stays badged as
    // needing a person while it is visibly working again.
    expect(summarizeWorkGraph(resumed["task-1"]!.workGraph).blockedCount).toBe(
      0,
    );
  });

  test("clears activity when the turn finishes", () => {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 1000,
    });
    const clearedByDone = applyProviderTurnActivityEvents({
      activityByTask: started,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 2000,
      events: [{ type: "done" }],
    });

    expect(clearedByDone).toEqual({});
    expect(
      clearProviderTurnActivity({
        activityByTask: started,
        taskId: "task-1",
      }),
    ).toEqual({});
  });

  test.each(["claude-code", "codex"] as const)(
    "retains a %s turn failure long enough for the activity shelf to show it",
    (providerId) => {
      const started = startProviderTurnActivity({
        activityByTask: {},
        taskId: "task-1",
        turnId: "turn-1",
        providerId,
        now: 1000,
      });
      const failed = applyProviderTurnActivityEvents({
        activityByTask: started,
        taskId: "task-1",
        turnId: "turn-1",
        providerId,
        now: 2000,
        events: [
          {
            type: "error",
            message: "Provider connection closed",
            recoverable: false,
          },
          { type: "done", stop_reason: "aborted" },
        ],
      });

      expect(failed["task-1"]).toMatchObject({
        turnId: "turn-1",
        providerId,
        pendingInteraction: null,
        turnError: "Provider connection closed",
        turnErrorRecoverable: false,
        completedAt: 2000,
      });

      const restarted = startProviderTurnActivity({
        activityByTask: failed,
        taskId: "task-1",
        turnId: "turn-2",
        providerId,
        now: 3000,
      });
      expect(restarted["task-1"]?.turnError).toBeUndefined();
      expect(restarted["task-1"]?.completedAt).toBeUndefined();
    },
  );

  test("clears a recoverable provider warning after work resumes", () => {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 1000,
    });
    const completed = applyProviderTurnActivityEvents({
      activityByTask: started,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 2000,
      events: [
        {
          type: "error",
          message: "Approval timed out; retry is available",
          recoverable: true,
        },
        { type: "text", text: "Continuing after the denied tool" },
        { type: "done" },
      ],
    });

    expect(completed).toEqual({});
  });

  test.each(["claude-code", "codex"] as const)(
    "retains an unresolved recoverable %s error when the turn ends",
    (providerId) => {
      const started = startProviderTurnActivity({
        activityByTask: {},
        taskId: "task-1",
        turnId: "turn-1",
        providerId,
        now: 1000,
      });
      const failed = applyProviderTurnActivityEvents({
        activityByTask: started,
        taskId: "task-1",
        turnId: "turn-1",
        providerId,
        now: 2000,
        events: [
          {
            type: "error",
            message: "Provider runtime unavailable",
            recoverable: true,
          },
          { type: "done" },
        ],
      });

      expect(failed["task-1"]).toMatchObject({
        turnError: "Provider runtime unavailable",
        turnErrorRecoverable: true,
        completedAt: 2000,
      });
    },
  );

  test("clears a recoverable provider warning when recovery arrives in a later batch", () => {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 1000,
    });
    const warning = applyProviderTurnActivityEvents({
      activityByTask: started,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 2000,
      events: [
        {
          type: "error",
          message: "Rate limit retry scheduled",
          recoverable: true,
        },
      ],
    });
    const recovered = applyProviderTurnActivityEvents({
      activityByTask: warning,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 3000,
      events: [{ type: "thinking", text: "Retry succeeded" }],
    });
    const completed = applyProviderTurnActivityEvents({
      activityByTask: recovered,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 4000,
      events: [{ type: "done" }],
    });

    expect(warning["task-1"]).toMatchObject({
      turnError: "Rate limit retry scheduled",
      turnErrorRecoverable: true,
    });
    expect(recovered["task-1"]?.turnError).toBeUndefined();
    expect(completed).toEqual({});
  });

  test.each([
    {
      label: "approval",
      event: {
        type: "approval" as const,
        toolName: "Bash",
        requestId: "approval-1",
        description: "Review command",
      },
      expected: "approval" as const,
    },
    {
      label: "user input",
      event: {
        type: "user_input" as const,
        toolName: "AskUserQuestion",
        requestId: "input-1",
        questions: [],
      },
      expected: "user_input" as const,
    },
  ])(
    "replaces a recoverable warning with a later $label request",
    ({ event, expected }) => {
      const started = startProviderTurnActivity({
        activityByTask: {},
        taskId: "task-1",
        turnId: "turn-1",
        providerId: "claude-code",
        now: 1000,
      });
      const warning = applyProviderTurnActivityEvents({
        activityByTask: started,
        taskId: "task-1",
        turnId: "turn-1",
        providerId: "claude-code",
        now: 2000,
        events: [
          {
            type: "error",
            message: "Previous interaction timed out",
            recoverable: true,
          },
        ],
      });
      const pending = applyProviderTurnActivityEvents({
        activityByTask: warning,
        taskId: "task-1",
        turnId: "turn-1",
        providerId: "claude-code",
        now: 3000,
        events: [event],
      });

      expect(pending["task-1"]?.turnError).toBeUndefined();
      expect(pending["task-1"]?.pendingInteraction).toBe(expected);
    },
  );

  test("does not treat usage metadata as recovery from a provider error", () => {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 1000,
    });
    const failed = applyProviderTurnActivityEvents({
      activityByTask: started,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 2000,
      events: [
        {
          type: "error",
          message: "Provider output overflowed",
          recoverable: true,
        },
        { type: "usage", inputTokens: 10, outputTokens: 20 },
        { type: "done", stop_reason: "output_overflow" },
      ],
    });

    expect(failed["task-1"]).toMatchObject({
      turnError: "Provider output overflowed",
      turnErrorRecoverable: true,
      completedAt: 2000,
    });
  });

  test.each(["user_abort", "cancelled", "canceled", "interrupted"])(
    "clears a recoverable warning when the turn is explicitly %s",
    (stopReason) => {
      const started = startProviderTurnActivity({
        activityByTask: {},
        taskId: "task-1",
        turnId: "turn-1",
        providerId: "codex",
        now: 1000,
      });
      const cancelled = applyProviderTurnActivityEvents({
        activityByTask: started,
        taskId: "task-1",
        turnId: "turn-1",
        providerId: "codex",
        now: 2000,
        events: [
          {
            type: "error",
            message: "Retry pending",
            recoverable: true,
          },
          { type: "done", stop_reason: stopReason },
        ],
      });

      expect(cancelled).toEqual({});
    },
  );

  test("keeps a nonrecoverable error sticky after later provider output", () => {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 1000,
    });
    const failed = applyProviderTurnActivityEvents({
      activityByTask: started,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 2000,
      events: [
        {
          type: "error",
          message: "Authentication failed",
          recoverable: false,
        },
        { type: "text", text: "Trailing provider output" },
        { type: "done" },
      ],
    });

    expect(failed["task-1"]).toMatchObject({
      turnError: "Authentication failed",
      turnErrorRecoverable: false,
      completedAt: 2000,
    });
  });

  test.each([
    "aborted",
    "error",
    "failed",
    "max_tokens",
    "output_overflow",
    "runtime_failure",
  ])(
    "retains a terminal %s stop reason even without an error event",
    (stopReason) => {
      const started = startProviderTurnActivity({
        activityByTask: {},
        taskId: "task-1",
        turnId: "turn-1",
        providerId: "codex",
        now: 1000,
      });
      const failed = applyProviderTurnActivityEvents({
        activityByTask: started,
        taskId: "task-1",
        turnId: "turn-1",
        providerId: "codex",
        now: 2000,
        events: [{ type: "done", stop_reason: stopReason }],
      });

      expect(failed["task-1"]).toMatchObject({
        turnErrorRecoverable: false,
        completedAt: 2000,
      });
    },
  );

  test("tracks provider hooks as transient work without transcript output", () => {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 1000,
    });
    const running = applyProviderTurnActivityEvents({
      activityByTask: started,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 2000,
      events: [
        {
          type: "hook_activity",
          hookId: "hook-1",
          hookName: "command",
          hookSource: "/tmp/hooks.json",
          hookEvent: "user_prompt_submit",
          status: "running",
        },
      ],
    });
    const completed = applyProviderTurnActivityEvents({
      activityByTask: running,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 3000,
      events: [
        {
          type: "hook_activity",
          hookId: "hook-1",
          hookName: "command",
          hookSource: "/tmp/hooks.json",
          hookEvent: "user_prompt_submit",
          status: "completed",
        },
      ],
    });

    expect(running["task-1"]?.orderedWorkItemIds).toEqual(["hook:hook-1"]);
    expect(running["task-1"]?.workItemsById["hook:hook-1"]).toEqual({
      id: "hook:hook-1",
      kind: "hook",
      status: "running",
      title: "command",
      progressMessages: [],
      startedAt: 2000,
      updatedAt: 2000,
      hookEvent: "user_prompt_submit",
      hookSource: "/tmp/hooks.json",
    });
    expect(completed["task-1"]?.workItemsById["hook:hook-1"]).toMatchObject({
      status: "completed",
      startedAt: 2000,
      updatedAt: 3000,
    });
  });

  test("tracks a subagent lifecycle with bounded progress detail", () => {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 1000,
    });
    const running = applyProviderTurnActivityEvents({
      activityByTask: started,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 2000,
      events: [
        {
          type: "tool",
          toolUseId: "agent-1",
          toolName: "Agent",
          input: JSON.stringify({
            description: "Review renderer lifecycle",
            prompt: "Inspect the session presentation path",
          }),
          state: "input-available",
        },
        {
          type: "subagent_progress",
          toolUseId: "agent-1",
          content: "Reading session resolver",
        },
        {
          type: "tool_progress",
          toolUseId: "agent-1",
          toolName: "Agent",
          elapsedSeconds: 12,
        },
      ],
    });
    const completed = applyProviderTurnActivityEvents({
      activityByTask: running,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 3000,
      events: [
        {
          type: "tool_result",
          tool_use_id: "agent-1",
          output: "Lifecycle review complete",
        },
      ],
    });

    expect(running["task-1"]?.orderedWorkItemIds).toEqual(["agent-1"]);
    expect(running["task-1"]?.workItemsById["agent-1"]).toEqual({
      id: "agent-1",
      kind: "subagent",
      status: "running",
      title: "Review renderer lifecycle",
      detail: "Reading session resolver",
      toolUseId: "agent-1",
      progressMessages: ["Reading session resolver"],
      startedAt: 2000,
      updatedAt: 2000,
      elapsedSeconds: 12,
    });
    expect(completed["task-1"]?.workItemsById["agent-1"]).toMatchObject({
      status: "completed",
      detail: "Lifecycle review complete",
      updatedAt: 3000,
    });
  });

  test("ignores unidentified subagent progress until its tool event arrives", () => {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 1000,
    });
    const progressFirst = applyProviderTurnActivityEvents({
      activityByTask: started,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 2000,
      events: [
        {
          type: "subagent_progress",
          toolUseId: "agent-1",
          content: "Inspecting files",
        },
      ],
    });
    const identified = applyProviderTurnActivityEvents({
      activityByTask: progressFirst,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 3000,
      events: [
        {
          type: "tool",
          toolUseId: "agent-1",
          toolName: "collaboration.spawn_agent",
          input: JSON.stringify({
            task_name: "lens audit",
            message: "Review the renderer event flow",
          }),
          state: "input-available",
        },
      ],
    });

    expect(progressFirst["task-1"]?.workItemsById["agent-1"]).toBeUndefined();
    expect(progressFirst["task-1"]?.orderedWorkItemIds).toEqual([]);
    expect(identified["task-1"]?.workItemsById["agent-1"]).toMatchObject({
      kind: "subagent",
      title: "lens audit",
      detail: "Review the renderer event flow",
      progressMessages: [],
      startedAt: 3000,
      updatedAt: 3000,
    });
  });

  test("keeps a bounded ordered list while preferring active work", () => {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 1000,
    });
    const tracked = applyProviderTurnActivityEvents({
      activityByTask: started,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 2000,
      events: Array.from({ length: 14 }, (_, index) => ({
        type: "tool" as const,
        toolUseId: `agent-${index + 1}`,
        toolName: "Task",
        input: JSON.stringify({ description: `Task ${index + 1}` }),
        state:
          index < 4
            ? ("output-available" as const)
            : ("input-available" as const),
      })),
    });

    expect(tracked["task-1"]?.orderedWorkItemIds).toHaveLength(12);
    expect(tracked["task-1"]?.orderedWorkItemIds).not.toContain("agent-1");
    expect(tracked["task-1"]?.orderedWorkItemIds).not.toContain("agent-2");
    expect(tracked["task-1"]?.orderedWorkItemIds).toContain("agent-3");
    expect(tracked["task-1"]?.orderedWorkItemIds).toContain("agent-14");
  });

  test("does not resurrect pruned agents from progress-only events", () => {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 1000,
    });
    const tracked = applyProviderTurnActivityEvents({
      activityByTask: started,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 2000,
      events: Array.from({ length: 15 }, (_, index) => ({
        type: "tool" as const,
        toolUseId: `agent-${index + 1}`,
        toolName: "Agent",
        input: JSON.stringify({ description: `Agent ${index + 1}` }),
        state: "input-available" as const,
      })),
    });
    const originalIds = tracked["task-1"]?.orderedWorkItemIds ?? [];
    expect(originalIds).toHaveLength(12);
    expect(originalIds).not.toContain("agent-1");

    const progressed = applyProviderTurnActivityEvents({
      activityByTask: tracked,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 3000,
      events: [
        {
          type: "tool_progress",
          toolUseId: "agent-1",
          toolName: "Agent",
          elapsedSeconds: 1,
        },
        {
          type: "subagent_progress",
          toolUseId: "agent-1",
          content: "Still working",
        },
      ],
    });

    expect(progressed["task-1"]?.orderedWorkItemIds).toEqual(originalIds);
    expect(progressed["task-1"]?.workItemsById["agent-1"]).toBeUndefined();
  });

  test("keeps creating a fallback row for unknown plain-tool progress", () => {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 1000,
    });
    const progressed = applyProviderTurnActivityEvents({
      activityByTask: started,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 2000,
      events: [
        {
          type: "tool_progress",
          toolUseId: "bash-1",
          toolName: "bash",
          elapsedSeconds: 2,
        },
      ],
    });

    expect(progressed["task-1"]?.workItemsById["bash-1"]).toMatchObject({
      kind: "tool",
      title: "Run command",
      elapsedSeconds: 2,
    });
  });

  test("titles the same operation identically across providers", () => {
    const buildToolRow = (toolName: string, input: string) => {
      const started = startProviderTurnActivity({
        activityByTask: {},
        taskId: "task-1",
        turnId: "turn-1",
        providerId: "codex",
        now: 1000,
      });
      const tracked = applyProviderTurnActivityEvents({
        activityByTask: started,
        taskId: "task-1",
        turnId: "turn-1",
        providerId: "codex",
        now: 2000,
        events: [
          {
            type: "tool",
            toolUseId: "tool-1",
            toolName,
            input,
            state: "input-available",
          },
        ],
      });
      return tracked["task-1"]?.workItemsById["tool-1"];
    };

    // Claude sends `Bash` with JSON input; Codex sends `bash` with the bare
    // command. Both rows must name the same operation.
    expect(buildToolRow("bash", "bun test").title).toBe("Run command");
    expect(
      buildToolRow("Bash", JSON.stringify({ command: "bun test" })).title,
    ).toBe("Run command");
    expect(buildToolRow("web_search", "stave releases").title).toBe(
      "Web search",
    );
    expect(buildToolRow("WebSearch", JSON.stringify({ query: "x" })).title).toBe(
      "Web search",
    );
    // Codex namespaces MCP tools with `:` where Claude uses `__`; the leaf must
    // survive both spellings.
    expect(buildToolRow("ibis:ibis_create_page", "{}").title).toBe(
      "ibis create page",
    );
    expect(buildToolRow("mcp__ibis__ibis_create_page", "{}").title).toBe(
      "ibis create page",
    );
    // A runtime placeholder is not a tool name.
    expect(buildToolRow("tool_use", "").title).toBe("Background work");
  });

  test("renders a Codex file edit like a Claude one, counting extra files", () => {
    const buildRow = (toolName: string, input: string) => {
      const started = startProviderTurnActivity({
        activityByTask: {},
        taskId: "task-1",
        turnId: "turn-1",
        providerId: "codex",
        now: 1000,
      });
      const tracked = applyProviderTurnActivityEvents({
        activityByTask: started,
        taskId: "task-1",
        turnId: "turn-1",
        providerId: "codex",
        now: 2000,
        events: [
          {
            type: "tool",
            toolUseId: "edit-1",
            toolName,
            input,
            state: "input-available",
          },
        ],
      });
      return tracked["task-1"]?.workItemsById["edit-1"];
    };

    // Codex reports a whole patch as one item; Claude reports one edit per file.
    // Both name the same operation.
    const codex = buildRow(
      "fileChange",
      JSON.stringify({
        paths: ["/repo/src/lib/providers/turn-status.ts", "/repo/src/App.tsx"],
      }),
    );
    expect(codex?.title).toBe("Edit file");
    expect(codex?.detail).toBe("providers/turn-status.ts +1 more");
    expect(codex?.toolName).toBe("fileChange");

    const claude = buildRow(
      "Edit",
      JSON.stringify({ file_path: "/repo/src/lib/providers/turn-status.ts" }),
    );
    expect(claude?.title).toBe("Edit file");
    expect(claude?.detail).toBe("providers/turn-status.ts");
  });

  test("keeps MCP argument keys out of plain tool titles", () => {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 1000,
    });
    const tracked = applyProviderTurnActivityEvents({
      activityByTask: started,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 2000,
      events: [
        {
          type: "tool",
          toolUseId: "mcp-1",
          toolName: "ibis:ibis_create_page",
          // `name` is this MCP tool's own argument, not a label for the row.
          input: JSON.stringify({ name: "Q3 planning", spaceId: "abc" }),
          state: "input-available",
        },
      ],
    });

    expect(tracked["task-1"]?.workItemsById["mcp-1"]?.title).toBe(
      "ibis create page",
    );
  });

  test("drops todo bookkeeping rows that duplicate the todo list", () => {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 1000,
    });
    const tracked = applyProviderTurnActivityEvents({
      activityByTask: started,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 2000,
      events: [
        {
          type: "tool",
          toolUseId: "todo-1",
          toolName: "TodoWrite",
          input: JSON.stringify({ todos: [] }),
          state: "input-available",
        },
        {
          type: "tool",
          toolUseId: "bash-1",
          toolName: "bash",
          input: "bun test",
          state: "input-available",
        },
      ],
    });

    expect(tracked["task-1"]?.orderedWorkItemIds).toEqual(["bash-1"]);
  });

  test("does not prefix a delegation already named Worker", () => {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "cursor",
      now: 1000,
    });
    const tracked = applyProviderTurnActivityEvents({
      activityByTask: started,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "cursor",
      now: 2000,
      events: [
        {
          type: "tool",
          toolUseId: "worker-1",
          // ACP agents name the delegation tool `Worker`, which used to yield
          // a row reading `Worker · Worker`.
          toolName: "Worker",
          input: "Sweep the callers",
          state: "input-available",
          workerExecution: {
            providerId: "codex",
            primaryModel: "gpt-5.6-sol",
            presetId: "verified-patch",
            workerModel: "gpt-5.6-terra",
            workerEffort: "max",
          },
        },
      ],
    });

    const item = tracked["task-1"]?.workItemsById["worker-1"];
    expect(item?.title).toBe("Worker");
    expect(item?.kind).toBe("subagent");
  });

  test("tracks plain tool calls with input-derived detail and a bounded tail", () => {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 1000,
    });
    const tracked = applyProviderTurnActivityEvents({
      activityByTask: started,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 2000,
      events: [
        {
          type: "tool",
          toolUseId: "tool-read",
          toolName: "Read",
          input: JSON.stringify({
            file_path: "/repo/src/components/session/TurnActivity.tsx",
          }),
          state: "output-available",
        },
        {
          type: "tool",
          toolUseId: "tool-bash",
          toolName: "Bash",
          input: JSON.stringify({
            description: "Run focused tests",
            command: "bun test tests/turn-activity.test.ts",
          }),
          state: "input-available",
        },
      ],
    });

    expect(tracked["task-1"]?.workItemsById["tool-read"]).toMatchObject({
      kind: "tool",
      status: "completed",
      // Normalized operation, not the provider's `Read` token; the token is
      // kept alongside for the row's provider-specific slot.
      title: "Read file",
      detail: "session/TurnActivity.tsx",
      toolName: "Read",
    });
    expect(tracked["task-1"]?.workItemsById["tool-bash"]).toMatchObject({
      kind: "tool",
      status: "running",
      title: "Run focused tests",
      detail: "bun test tests/turn-activity.test.ts",
    });

    const withOverflow = applyProviderTurnActivityEvents({
      activityByTask: tracked,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 3000,
      events: Array.from({ length: 3 }, (_, index) => ({
        type: "tool" as const,
        toolUseId: `tool-extra-${index}`,
        toolName: "Grep",
        input: JSON.stringify({ pattern: `pattern-${index}` }),
        state: "output-available" as const,
      })),
    });

    // The finished Read drops out first; the still-running Bash survives.
    expect(
      withOverflow["task-1"]?.orderedWorkItemIds.filter((id) =>
        id.startsWith("tool-"),
      ),
    ).toEqual(["tool-bash", "tool-extra-1", "tool-extra-2"]);
  });

  test("keeps a plain tool's input detail but shows its failure output", () => {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 1000,
    });
    const running = applyProviderTurnActivityEvents({
      activityByTask: started,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 2000,
      events: [
        {
          type: "tool",
          toolUseId: "tool-1",
          toolName: "Bash",
          input: JSON.stringify({ command: "bun run typecheck" }),
          state: "input-available",
        },
      ],
    });
    const succeeded = applyProviderTurnActivityEvents({
      activityByTask: running,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 3000,
      events: [
        {
          type: "tool_result",
          tool_use_id: "tool-1",
          output: "a very long stdout dump nobody wants in the shelf",
        },
      ],
    });
    const failed = applyProviderTurnActivityEvents({
      activityByTask: running,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      now: 3000,
      events: [
        {
          type: "tool_result",
          tool_use_id: "tool-1",
          output: "error TS2345: argument mismatch",
          isError: true,
        },
      ],
    });

    expect(succeeded["task-1"]?.workItemsById["tool-1"]).toMatchObject({
      status: "completed",
      detail: "bun run typecheck",
    });
    expect(failed["task-1"]?.workItemsById["tool-1"]).toMatchObject({
      status: "failed",
      detail: "error TS2345: argument mismatch",
    });
  });

  test("carries the subagent type through as a row badge", () => {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 1000,
    });
    const running = applyProviderTurnActivityEvents({
      activityByTask: started,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 2000,
      events: [
        {
          type: "tool",
          toolUseId: "agent-1",
          toolName: "Task",
          input: JSON.stringify({
            description: "Map the renderer",
            subagent_type: "Explore",
          }),
          state: "input-available",
        },
      ],
    });

    expect(running["task-1"]?.workItemsById["agent-1"]).toMatchObject({
      kind: "subagent",
      title: "Map the renderer",
      badge: "Explore",
    });
  });

  test("uses the same UI stall threshold across provider ids", () => {
    expect(
      resolveProviderTurnStallThresholdMs({ providerId: "claude-code" }),
    ).toBe(PROVIDER_TURN_STALL_THRESHOLD_MS);
    expect(resolveProviderTurnStallThresholdMs({ providerId: "codex" })).toBe(
      PROVIDER_TURN_STALL_THRESHOLD_MS,
    );
  });
});

describe("retained turn activity", () => {
  function runningTurn(args?: { taskId?: string; turnId?: string }) {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: args?.taskId ?? "task-1",
      turnId: args?.turnId ?? "turn-1",
      providerId: "claude-code",
      now: 1000,
    });
    return applyProviderTurnActivityEvents({
      activityByTask: started,
      taskId: args?.taskId ?? "task-1",
      turnId: args?.turnId ?? "turn-1",
      providerId: "claude-code",
      now: 2000,
      events: [
        {
          type: "tool",
          toolUseId: "tool-1",
          toolName: "Grep",
          input: JSON.stringify({ pattern: "retain" }),
          state: "output-available",
        },
      ],
    });
  }

  test("keeps the finished turn's work items after the reducer drops them", () => {
    const running = runningTurn();
    const reduced = reduceProviderTurnActivityEvents({
      activityByTask: running,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 3000,
      events: [{ type: "done" }],
    });
    // The live map is the thing Fleet reads as "busy", so a clean turn still
    // has to leave it entirely.
    expect(reduced.activityByTask["task-1"]).toBeUndefined();

    const retained = retainRetiredTurnActivity({
      retainedByTask: {},
      previous: running,
      next: reduced.activityByTask,
      taskId: "task-1",
      snapshot: reduced.retiredSnapshot,
      now: 3000,
    });

    expect(retained["task-1"]?.outcome).toBe("completed");
    expect(retained["task-1"]?.snapshot.turnId).toBe("turn-1");
    expect(retained["task-1"]?.snapshot.completedAt).toBe(3000);
    expect(retained["task-1"]?.snapshot.orderedWorkItemIds).toEqual(["tool-1"]);
  });

  test("keeps the work that arrived in the very batch that ended the turn", () => {
    // `done` is flushed together with everything queued behind it, and after a
    // spell with the window hidden the animation-frame flush can be paused long
    // enough for that batch to be the whole turn. Reading the retired snapshot
    // off the live map would then replay an empty turn.
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 1000,
    });
    const reduced = reduceProviderTurnActivityEvents({
      activityByTask: started,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 2000,
      events: [
        {
          type: "tool",
          toolUseId: "tool-1",
          toolName: "Grep",
          input: JSON.stringify({ pattern: "retain" }),
          state: "input-available",
        },
        { type: "tool_result", tool_use_id: "tool-1", output: "3 matches" },
        { type: "done" },
      ],
    });

    expect(reduced.activityByTask["task-1"]).toBeUndefined();
    expect(reduced.retiredSnapshot?.orderedWorkItemIds).toEqual(["tool-1"]);
    // And the row is finished, not left spinning at its last pre-`done` state.
    expect(reduced.retiredSnapshot?.workItemsById["tool-1"]?.status).toBe(
      "completed",
    );

    const retained = retainRetiredTurnActivity({
      retainedByTask: {},
      previous: started,
      next: reduced.activityByTask,
      taskId: "task-1",
      snapshot: reduced.retiredSnapshot,
      now: 2000,
    });
    expect(retained["task-1"]?.snapshot.orderedWorkItemIds).toEqual(["tool-1"]);
  });

  test("a still-running batch retires nothing", () => {
    const reduced = reduceProviderTurnActivityEvents({
      activityByTask: runningTurn(),
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 2500,
      events: [{ type: "text", text: "thinking" }],
    });

    expect(reduced.retiredSnapshot).toBeNull();
    expect(reduced.activityByTask["task-1"]).toBeDefined();
  });

  test("leaves the map untouched while the same turn is still running", () => {
    const running = runningTurn();
    const stillRunning = applyProviderTurnActivityEvents({
      activityByTask: running,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 2500,
      events: [
        {
          type: "tool",
          toolUseId: "tool-2",
          toolName: "Read",
          input: "{}",
          state: "input-available",
        },
      ],
    });
    const retainedByTask = {};

    expect(
      retainRetiredTurnActivity({
        retainedByTask,
        previous: running,
        next: stillRunning,
        taskId: "task-1",
        now: 2500,
      }),
    ).toBe(retainedByTask);
  });

  test("records an errored turn as failed and does not re-record it on the clear", () => {
    const running = runningTurn();
    const failed = applyProviderTurnActivityEvents({
      activityByTask: running,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 3000,
      events: [
        { type: "error", message: "stream closed" },
        { type: "done" },
      ],
    });
    // A failed turn keeps its snapshot on screen for a linger window before it
    // is cleared, so retention must fire on the completion, not the removal.
    expect(failed["task-1"]?.completedAt).toBe(3000);

    const retained = retainRetiredTurnActivity({
      retainedByTask: {},
      previous: running,
      next: failed,
      taskId: "task-1",
      now: 3000,
    });
    expect(retained["task-1"]?.outcome).toBe("failed");

    const afterLingerClear = retainRetiredTurnActivity({
      retainedByTask: retained,
      previous: failed,
      next: clearProviderTurnActivity({
        activityByTask: failed,
        taskId: "task-1",
      }),
      taskId: "task-1",
      now: 8000,
    });
    expect(afterLingerClear).toBe(retained);
  });

  test("an errored turn stays failed even when the caller says it was stopped", () => {
    const running = runningTurn();
    const failed = applyProviderTurnActivityEvents({
      activityByTask: running,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 3000,
      events: [{ type: "error", message: "stream closed" }, { type: "done" }],
    });

    expect(
      retainRetiredTurnActivity({
        retainedByTask: {},
        previous: failed,
        next: {},
        taskId: "task-1",
        outcome: "stopped",
        now: 4000,
      })["task-1"]?.outcome,
    ).toBe("failed");
  });

  test("freezes a stopped turn so replay stops asking for an answer", () => {
    // A subagent raises the prompt, so the block lands on its own graph node
    // rather than on the turn root (which the tree does not render).
    const waiting = applyProviderTurnActivityEvents({
      activityByTask: runningTurn(),
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 2500,
      events: [
        {
          type: "tool",
          toolUseId: "agent-1",
          toolName: "Task",
          input: JSON.stringify({ description: "Sweep the callers" }),
          state: "input-available",
          agentId: "agent_a",
        },
        {
          type: "approval",
          requestId: "req-1",
          toolName: "Bash",
          ownerAgentId: "agent_a",
        },
      ],
    });
    expect(waiting["task-1"]?.pendingInteraction).toBe("approval");
    expect(
      buildWorkGraphTree(waiting["task-1"]!.workGraph).some(
        (row) => row.blocked,
      ),
    ).toBe(true);

    const retained = retainRetiredTurnActivity({
      retainedByTask: {},
      previous: waiting,
      next: clearProviderTurnActivity({
        activityByTask: waiting,
        taskId: "task-1",
      }),
      taskId: "task-1",
      outcome: "stopped",
      now: 4000,
    });

    expect(retained["task-1"]?.outcome).toBe("stopped");
    expect(retained["task-1"]?.snapshot.pendingInteraction).toBeNull();
    expect(retained["task-1"]?.snapshot.stalledAt).toBeNull();
    expect(retained["task-1"]?.snapshot.completedAt).toBe(4000);
    // The stop paths never send a `done` through the graph, so its own open
    // interactions have to be settled here too — otherwise the node that raised
    // the prompt replays badged "Needs you" with no way to answer it.
    expect(
      Object.values(retained["task-1"]!.snapshot.workGraph.interactionsById)
        .filter((interaction) => !interaction.resolvedAt),
    ).toEqual([]);
    expect(
      buildWorkGraphTree(retained["task-1"]!.snapshot.workGraph).some(
        (row) => row.blocked,
      ),
    ).toBe(false);
  });

  test("keeps only the most recently finished turns", () => {
    let retainedByTask = {};
    const overflow = RETAINED_TURN_ACTIVITY_LIMIT + 2;
    for (let index = 0; index < overflow; index += 1) {
      const taskId = `task-${index}`;
      const running = runningTurn({ taskId, turnId: `turn-${index}` });
      retainedByTask = retainRetiredTurnActivity({
        retainedByTask,
        previous: running,
        next: {},
        taskId,
        now: 10_000 + index,
      });
    }

    const kept = Object.keys(retainedByTask).sort();
    expect(kept).toHaveLength(RETAINED_TURN_ACTIVITY_LIMIT);
    // Oldest out first: replay answers "the turn I was just watching".
    expect(kept).not.toContain("task-0");
    expect(kept).toContain(`task-${overflow - 1}`);
  });
});
