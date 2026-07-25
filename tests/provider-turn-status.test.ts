import { describe, expect, test } from "bun:test";
import {
  applyProviderTurnActivityEvents,
  clearProviderTurnActivity,
  formatProviderTurnIdleDuration,
  markProviderTurnInteractionResolved,
  markProviderTurnStalled,
  PROVIDER_TURN_STALL_THRESHOLD_MS,
  resolveProviderTurnStallThresholdMs,
  resolveProviderTurnDisplayState,
  startProviderTurnActivity,
} from "../src/lib/providers/turn-status";

describe("provider turn status helpers", () => {
  test("starts tracking a new active turn", () => {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 1000,
    });

    expect(started["task-1"]).toEqual({
      turnId: "turn-1",
      providerId: "claude-code",
      startedAt: 1000,
      lastEventAt: 1000,
      stalledAt: null,
      pendingInteraction: null,
      workItemsById: {},
      orderedWorkItemIds: [],
    });
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

  test("resumes activity after approval resolution", () => {
    const pending = {
      "task-1": {
        turnId: "turn-1",
        providerId: "claude-code" as const,
        startedAt: 1000,
        lastEventAt: 2000,
        stalledAt: null,
        pendingInteraction: "user_input" as const,
        workItemsById: {},
        orderedWorkItemIds: [],
      },
    };
    const resumed = markProviderTurnInteractionResolved({
      activityByTask: pending,
      taskId: "task-1",
      turnId: "turn-1",
      now: 5000,
    });

    expect(resumed["task-1"]).toEqual({
      turnId: "turn-1",
      providerId: "claude-code",
      startedAt: 1000,
      lastEventAt: 5000,
      stalledAt: null,
      pendingInteraction: null,
      workItemsById: {},
      orderedWorkItemIds: [],
    });
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

  test("safely correlates progress that arrives before its tool event", () => {
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

    expect(progressFirst["task-1"]?.workItemsById["agent-1"]).toMatchObject({
      kind: "tool",
      title: "Background work",
      detail: "Inspecting files",
      startedAt: 2000,
    });
    expect(identified["task-1"]?.workItemsById["agent-1"]).toMatchObject({
      kind: "subagent",
      title: "lens audit",
      detail: "Review the renderer event flow",
      progressMessages: ["Inspecting files"],
      startedAt: 2000,
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

  test("uses the same UI stall threshold across provider ids", () => {
    expect(
      resolveProviderTurnStallThresholdMs({ providerId: "claude-code" }),
    ).toBe(PROVIDER_TURN_STALL_THRESHOLD_MS);
    expect(resolveProviderTurnStallThresholdMs({ providerId: "codex" })).toBe(
      PROVIDER_TURN_STALL_THRESHOLD_MS,
    );
  });
});
