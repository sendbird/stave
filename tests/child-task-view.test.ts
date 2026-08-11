import { describe, expect, test } from "bun:test";
import {
  CHILD_TASK_DETACHED_REASON,
  CHILD_TASK_STOPPED_REASON,
  resolveChildTaskControls,
  type ChildTaskActionResponse,
  type ChildTaskSummary,
} from "@/lib/runs/child-task";
import {
  buildChildTaskExpectedIdentity,
  describeChildTaskPhase,
  resolveChildTaskActionError,
  selectChildTaskBlockedKinds,
  sortChildTaskRows,
} from "@/lib/runs/child-task-view";

function buildChild(
  overrides: Partial<ChildTaskSummary> = {},
): ChildTaskSummary {
  return {
    runId: "child-task:task-parent:review",
    stepId: "child-task:task-parent:review:turn",
    parentTaskId: "task-parent",
    delegationKey: "review",
    childTaskId: "task-child",
    childWorkspaceId: "workspace-child",
    childTurnId: null,
    providerId: "claude-code",
    lifecycle: "detached",
    phase: "running",
    reason: null,
    attempt: 0,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:01.000Z",
    completedAt: null,
    ...overrides,
  };
}

describe("describeChildTaskPhase", () => {
  test("names every live and terminal phase", () => {
    expect(describeChildTaskPhase(buildChild({ phase: "pending" }))).toEqual({
      label: "Queued",
      tone: "waiting",
      blocked: false,
    });
    expect(describeChildTaskPhase(buildChild({ phase: "running" }))).toEqual({
      label: "Running",
      tone: "active",
      blocked: false,
    });
    expect(describeChildTaskPhase(buildChild({ phase: "waiting" }))).toEqual({
      label: "Waiting",
      tone: "waiting",
      blocked: false,
    });
    expect(describeChildTaskPhase(buildChild({ phase: "completed" }))).toEqual({
      label: "Completed",
      tone: "done",
      blocked: false,
    });
    expect(describeChildTaskPhase(buildChild({ phase: "failed" }))).toEqual({
      label: "Failed",
      tone: "failed",
      blocked: false,
    });
    expect(
      describeChildTaskPhase(buildChild({ phase: "interrupted" })),
    ).toEqual({ label: "Interrupted", tone: "failed", blocked: false });
  });

  test("reads a detached delegation apart from a stopped one", () => {
    const detached = describeChildTaskPhase(
      buildChild({ phase: "cancelled", reason: CHILD_TASK_DETACHED_REASON }),
    );
    const stopped = describeChildTaskPhase(
      buildChild({ phase: "cancelled", reason: CHILD_TASK_STOPPED_REASON }),
    );

    expect(detached).toEqual({ label: "Detached", tone: "released", blocked: false });
    expect(stopped).toEqual({ label: "Stopped", tone: "failed", blocked: false });
    expect(detached.label).not.toBe(stopped.label);
    expect(detached.tone).not.toBe(stopped.tone);
  });

  test("treats a cancelled delegation without a reason as a stop", () => {
    expect(
      describeChildTaskPhase(buildChild({ phase: "cancelled", reason: null })),
    ).toEqual({ label: "Stopped", tone: "failed", blocked: false });
  });

  test("a blocked child reads as needing a person, not as running", () => {
    expect(
      describeChildTaskPhase(buildChild({ phase: "running" }), "approval"),
    ).toEqual({ label: "Needs approval", tone: "waiting", blocked: true });
    expect(
      describeChildTaskPhase(buildChild({ phase: "running" }), "user-input"),
    ).toEqual({ label: "Needs answer", tone: "waiting", blocked: true });
  });

  test("a settled delegation is never reported as blocked", () => {
    // A leftover request on a finished child is history, so the terminal phase
    // still wins and the row keeps reading as completed.
    expect(
      describeChildTaskPhase(buildChild({ phase: "completed" }), "approval"),
    ).toEqual({ label: "Completed", tone: "done", blocked: false });
  });
});

describe("selectChildTaskBlockedKinds", () => {
  const child = buildChild();

  function buildNotification(overrides: Record<string, unknown> = {}) {
    return {
      kind: "task.approval_requested",
      taskId: "task-child",
      resolvedAt: null,
      ...overrides,
    };
  }

  test("maps an open request onto the delegation that raised it", () => {
    expect(
      selectChildTaskBlockedKinds({
        children: [child],
        notifications: [buildNotification()],
      }),
    ).toEqual({ review: "approval" });
  });

  test("prefers an unanswered question over an unanswered approval", () => {
    expect(
      selectChildTaskBlockedKinds({
        children: [child],
        notifications: [
          buildNotification(),
          buildNotification({ kind: "task.user_input_requested" }),
          buildNotification(),
        ],
      }),
    ).toEqual({ review: "user-input" });
  });

  test("ignores resolved requests, other tasks, and unrelated kinds", () => {
    expect(
      selectChildTaskBlockedKinds({
        children: [child],
        notifications: [
          buildNotification({ resolvedAt: "2026-08-10T00:00:02.000Z" }),
          buildNotification({ taskId: "task-other" }),
          buildNotification({ kind: "task.turn_completed" }),
          buildNotification({ taskId: null }),
        ],
      }),
    ).toEqual({});
  });

  test("a settled delegation cannot be blocked", () => {
    expect(
      selectChildTaskBlockedKinds({
        children: [buildChild({ phase: "completed" })],
        notifications: [buildNotification()],
      }),
    ).toEqual({});
  });
});

describe("resolveChildTaskControls matrix", () => {
  test("offers follow-up only on a detached child that is waiting", () => {
    expect(
      resolveChildTaskControls(
        buildChild({ lifecycle: "detached", phase: "waiting" }),
      ),
    ).toEqual({
      canFollowUp: true,
      canStop: true,
      canDetach: true,
      canRetry: false,
    });
    expect(
      resolveChildTaskControls(
        buildChild({ lifecycle: "one-turn", phase: "waiting" }),
      ).canFollowUp,
    ).toBe(false);
  });

  test("offers stop and detach while the child is live", () => {
    for (const phase of ["pending", "running", "waiting"] as const) {
      const controls = resolveChildTaskControls(buildChild({ phase }));
      expect(controls.canStop).toBe(true);
      expect(controls.canDetach).toBe(true);
      expect(controls.canRetry).toBe(false);
    }
  });

  test("offers retry only on an unfinished ending with attempts left", () => {
    expect(
      resolveChildTaskControls(buildChild({ phase: "failed", attempt: 0 }))
        .canRetry,
    ).toBe(true);
    expect(
      resolveChildTaskControls(buildChild({ phase: "interrupted", attempt: 2 }))
        .canRetry,
    ).toBe(true);
    expect(
      resolveChildTaskControls(buildChild({ phase: "failed", attempt: 3 }))
        .canRetry,
    ).toBe(false);
    expect(
      resolveChildTaskControls(buildChild({ phase: "completed" })).canRetry,
    ).toBe(false);
    expect(
      resolveChildTaskControls(
        buildChild({ phase: "cancelled", reason: CHILD_TASK_DETACHED_REASON }),
      ).canRetry,
    ).toBe(false);
  });

  test("offers nothing but Open on a completed child", () => {
    expect(
      resolveChildTaskControls(buildChild({ phase: "completed" })),
    ).toEqual({
      canFollowUp: false,
      canStop: false,
      canDetach: false,
      canRetry: false,
    });
  });
});

describe("buildChildTaskExpectedIdentity", () => {
  test("carries the identity the row was rendered against", () => {
    expect(
      buildChildTaskExpectedIdentity(
        buildChild({ phase: "waiting", attempt: 1 }),
      ),
    ).toEqual({
      childTaskId: "task-child",
      childWorkspaceId: "workspace-child",
      attempt: 1,
      phase: "waiting",
    });
  });
});

describe("resolveChildTaskActionError", () => {
  function buildResponse(
    overrides: Partial<ChildTaskActionResponse> = {},
  ): ChildTaskActionResponse {
    return {
      accepted: true,
      duplicate: false,
      reason: null,
      message: null,
      child: null,
      ...overrides,
    };
  }

  test("reports no error for an accepted action", () => {
    expect(resolveChildTaskActionError(buildResponse())).toBeNull();
  });

  test("surfaces the refusal sentence as-is", () => {
    expect(
      resolveChildTaskActionError(
        buildResponse({
          accepted: false,
          reason: "stale-identity",
          message: "The child was retried after this control was shown.",
        }),
      ),
    ).toBe("The child was retried after this control was shown.");
  });

  test("falls back to the reason's sentence when no message is carried", () => {
    expect(
      resolveChildTaskActionError(
        buildResponse({ accepted: false, reason: "already-active" }),
      ),
    ).toBe("This child is already running.");
  });

  test("never lets a refusal pass silently", () => {
    expect(
      resolveChildTaskActionError(buildResponse({ accepted: false })),
    ).toBeTruthy();
  });
});

describe("sortChildTaskRows", () => {
  test("puts the most recently moved delegation first without mutating input", () => {
    const rows = [
      buildChild({
        delegationKey: "older",
        updatedAt: "2026-08-10T00:00:01.000Z",
      }),
      buildChild({
        delegationKey: "newer",
        updatedAt: "2026-08-10T00:00:09.000Z",
      }),
    ];
    const sorted = sortChildTaskRows(rows);

    expect(sorted.map((row) => row.delegationKey)).toEqual(["newer", "older"]);
    expect(rows.map((row) => row.delegationKey)).toEqual(["older", "newer"]);
  });
});
