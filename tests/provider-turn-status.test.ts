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

  test("promotes the effective provider when stave resolves to claude", () => {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "stave",
      now: 1000,
    });
    const updated = applyProviderTurnActivityEvents({
      activityByTask: started,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "stave",
      now: 2000,
      events: [
        {
          type: "model_resolved",
          resolvedProviderId: "claude-code",
          resolvedModel: "claude-sonnet-4-6",
        },
      ],
    });

    expect(updated["task-1"]?.providerId).toBe("claude-code");
  });

  test("uses the same UI stall threshold across provider ids", () => {
    expect(
      resolveProviderTurnStallThresholdMs({ providerId: "claude-code" }),
    ).toBe(PROVIDER_TURN_STALL_THRESHOLD_MS);
    expect(resolveProviderTurnStallThresholdMs({ providerId: "codex" })).toBe(
      PROVIDER_TURN_STALL_THRESHOLD_MS,
    );
    expect(resolveProviderTurnStallThresholdMs({ providerId: "stave" })).toBe(
      PROVIDER_TURN_STALL_THRESHOLD_MS,
    );
  });
});
