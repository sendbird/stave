import { describe, expect, test } from "bun:test";
import {
  validateDelegatedTaskIdentity,
  type DelegatedTaskSummary,
} from "@/lib/runs/delegated-task";
import { buildDelegatedTaskExpectedIdentity } from "@/lib/runs/delegated-task-view";

function buildChild(
  overrides: Partial<DelegatedTaskSummary> = {},
): DelegatedTaskSummary {
  return {
    runId: "child-task:task-parent:review",
    stepId: "child-task:task-parent:review:turn",
    parentTaskId: "task-parent",
    delegationKey: "review",
    delegatedTaskId: "task-child",
    delegatedWorkspaceId: "workspace-child",
    delegatedTurnId: null,
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
describe("validateDelegatedTaskIdentity", () => {
  test("accepts an identity that still matches the live delegation", () => {
    const child = buildChild();

    expect(
      validateDelegatedTaskIdentity({
        expected: buildDelegatedTaskExpectedIdentity(child),
        child,
      }),
    ).toEqual({ ok: true });
  });

  test("refuses with a reason when the delegation left the ledger", () => {
    const result = validateDelegatedTaskIdentity({
      expected: buildDelegatedTaskExpectedIdentity(buildChild()),
      child: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a refusal");
    }
    expect(result.reason).toBe("not-found");
    expect(result.message.length).toBeGreaterThan(0);
  });

  test("refuses when the delegation key now names a different delegated task", () => {
    const result = validateDelegatedTaskIdentity({
      expected: buildDelegatedTaskExpectedIdentity(buildChild()),
      child: buildChild({ delegatedTaskId: "task-other-child" }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a refusal");
    }
    expect(result.reason).toBe("stale-identity");
    expect(result.message.length).toBeGreaterThan(0);
  });

  test("refuses when the child moved to a different workspace", () => {
    const result = validateDelegatedTaskIdentity({
      expected: buildDelegatedTaskExpectedIdentity(buildChild()),
      child: buildChild({ delegatedWorkspaceId: "workspace-other" }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a refusal");
    }
    expect(result.reason).toBe("stale-identity");
  });

  test("refuses a control prepared before a retry bumped the attempt", () => {
    const result = validateDelegatedTaskIdentity({
      expected: buildDelegatedTaskExpectedIdentity(buildChild({ attempt: 0 })),
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
    const result = validateDelegatedTaskIdentity({
      expected: buildDelegatedTaskExpectedIdentity(buildChild({ phase: "running" })),
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
      validateDelegatedTaskIdentity({
        expected: {
          delegatedTaskId: child.delegatedTaskId,
          delegatedWorkspaceId: child.delegatedWorkspaceId,
          attempt: child.attempt,
        },
        child,
      }),
    ).toEqual({ ok: true });
  });

  test("refuses when the child's turn changed under the control", () => {
    const result = validateDelegatedTaskIdentity({
      expected: {
        delegatedTaskId: "task-child",
        delegatedWorkspaceId: "workspace-child",
        attempt: 0,
        delegatedTurnId: "turn-first",
      },
      child: buildChild({ delegatedTurnId: "turn-second" }),
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
      validateDelegatedTaskIdentity({
        expected: {
          delegatedTaskId: "task-child",
          delegatedWorkspaceId: "workspace-child",
          attempt: 0,
        },
        child: buildChild({ delegatedTurnId: "turn-second" }),
      }),
    ).toEqual({ ok: true });
  });

  test("pins a null turn as a real expectation rather than an absent one", () => {
    const result = validateDelegatedTaskIdentity({
      expected: {
        delegatedTaskId: "task-child",
        delegatedWorkspaceId: "workspace-child",
        attempt: 0,
        delegatedTurnId: null,
      },
      child: buildChild({ delegatedTurnId: "turn-started" }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a refusal");
    }
    expect(result.reason).toBe("stale-identity");
  });
});
