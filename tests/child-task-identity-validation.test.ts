import { describe, expect, test } from "bun:test";
import {
  validateChildTaskIdentity,
  type ChildTaskSummary,
} from "@/lib/runs/child-task";
import { buildChildTaskExpectedIdentity } from "@/lib/runs/child-task-view";

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

/**
 * Every control the parent renders is prepared against the child identity that
 * was on screen at the time. These cases pin the contract that a control whose
 * identity has since moved is refused with a reason a surface can show, rather
 * than being applied to whatever delegation now occupies the key.
 */
describe("validateChildTaskIdentity", () => {
  test("accepts an identity that still matches the live delegation", () => {
    const child = buildChild();

    expect(
      validateChildTaskIdentity({
        expected: buildChildTaskExpectedIdentity(child),
        child,
      }),
    ).toEqual({ ok: true });
  });

  test("refuses with a reason when the delegation left the ledger", () => {
    const result = validateChildTaskIdentity({
      expected: buildChildTaskExpectedIdentity(buildChild()),
      child: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a refusal");
    }
    expect(result.reason).toBe("not-found");
    expect(result.message.length).toBeGreaterThan(0);
  });

  test("refuses when the delegation key now names a different child task", () => {
    const result = validateChildTaskIdentity({
      expected: buildChildTaskExpectedIdentity(buildChild()),
      child: buildChild({ childTaskId: "task-other-child" }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a refusal");
    }
    expect(result.reason).toBe("stale-identity");
    expect(result.message.length).toBeGreaterThan(0);
  });

  test("refuses when the child moved to a different workspace", () => {
    const result = validateChildTaskIdentity({
      expected: buildChildTaskExpectedIdentity(buildChild()),
      child: buildChild({ childWorkspaceId: "workspace-other" }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a refusal");
    }
    expect(result.reason).toBe("stale-identity");
  });

  test("refuses a control prepared before a retry bumped the attempt", () => {
    const result = validateChildTaskIdentity({
      expected: buildChildTaskExpectedIdentity(buildChild({ attempt: 0 })),
      child: buildChild({ attempt: 1 }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a refusal");
    }
    expect(result.reason).toBe("stale-identity");
    expect(result.message).toContain("retried");
  });

  test("refuses a control prepared against a phase the child has left", () => {
    const result = validateChildTaskIdentity({
      expected: buildChildTaskExpectedIdentity(buildChild({ phase: "running" })),
      child: buildChild({ phase: "completed" }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a refusal");
    }
    expect(result.reason).toBe("stale-identity");
  });

  test("ignores phase when the caller did not pin one", () => {
    const child = buildChild({ phase: "completed" });

    expect(
      validateChildTaskIdentity({
        expected: {
          childTaskId: child.childTaskId,
          childWorkspaceId: child.childWorkspaceId,
          attempt: child.attempt,
        },
        child,
      }),
    ).toEqual({ ok: true });
  });

  test("refuses when the child's turn changed under the control", () => {
    const result = validateChildTaskIdentity({
      expected: {
        childTaskId: "task-child",
        childWorkspaceId: "workspace-child",
        attempt: 0,
        childTurnId: "turn-first",
      },
      child: buildChild({ childTurnId: "turn-second" }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a refusal");
    }
    expect(result.reason).toBe("stale-identity");
    expect(result.message).toContain("turn");
  });

  test("ignores the turn when the caller did not pin one", () => {
    expect(
      validateChildTaskIdentity({
        expected: {
          childTaskId: "task-child",
          childWorkspaceId: "workspace-child",
          attempt: 0,
        },
        child: buildChild({ childTurnId: "turn-second" }),
      }),
    ).toEqual({ ok: true });
  });

  test("pins a null turn as a real expectation rather than an absent one", () => {
    const result = validateChildTaskIdentity({
      expected: {
        childTaskId: "task-child",
        childWorkspaceId: "workspace-child",
        attempt: 0,
        childTurnId: null,
      },
      child: buildChild({ childTurnId: "turn-started" }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a refusal");
    }
    expect(result.reason).toBe("stale-identity");
  });
});
