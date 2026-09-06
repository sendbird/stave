import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChildTaskRowsSurface } from "@/components/session/ChildTaskRows";
import {
  CHILD_TASK_DETACHED_REASON,
  type ChildTaskActionResponse,
  type ChildTaskSummary,
} from "@/lib/runs/child-task";
import { resolveChildTaskActionError } from "@/lib/runs/child-task-view";

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
    phase: "waiting",
    reason: null,
    attempt: 0,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:01.000Z",
    completedAt: null,
    ...overrides,
  };
}

function renderRows(
  rows: readonly ChildTaskSummary[],
  errorByDelegationKey?: Record<string, string>,
  blockedByDelegationKey?: Record<string, "user-input" | "approval">,
) {
  return renderToStaticMarkup(
    createElement(ChildTaskRowsSurface, {
      rows,
      errorByDelegationKey,
      blockedByDelegationKey,
      busyDelegationKey: null,
      onOpen: () => {},
      onFollowUp: () => {},
      onRetry: () => {},
      onStop: () => {},
      onDetach: () => {},
    }),
  );
}

describe("ChildTaskRowsSurface", () => {
  test("renders nothing at all when the task has no children", () => {
    expect(renderRows([])).toBe("");
  });

  test("shows identity, phase and controls for a live delegation", () => {
    const html = renderRows([buildChild()]);

    expect(html).toContain("Waiting");
    expect(html).toContain("review");
    expect(html).toContain("Open");
    expect(html).toContain("Follow-up");
    expect(html).toContain("Stop");
    expect(html).toContain("Detach");
    expect(html).not.toContain("Retry");
  });

  test("labels recorded model and effort as requested details", () => {
    const html = renderRows([
      buildChild({
        requestedModel: "gpt-5.3-codex",
        requestedEffort: "high",
      }),
    ]);

    expect(html).toContain("Requested: model gpt-5.3-codex · effort high");

    const modelOnly = renderRows([
      buildChild({ requestedModel: "claude-sonnet-4" }),
    ]);
    expect(modelOnly).toContain("Requested: model claude-sonnet-4");
    expect(modelOnly).not.toContain("effort");
  });

  test("reads a detached delegation apart from the row's reason line", () => {
    const html = renderRows([
      buildChild({ phase: "cancelled", reason: CHILD_TASK_DETACHED_REASON }),
    ]);

    expect(html).toContain("Detached");
    expect(html).toContain(CHILD_TASK_DETACHED_REASON);
  });

  test("shows the attempt only once the delegation has been retried", () => {
    expect(renderRows([buildChild({ attempt: 0 })])).not.toContain("Attempt");
    expect(renderRows([buildChild({ attempt: 1 })])).toContain("Attempt 2");
  });

  test("says a child is blocked on a person instead of showing its phase", () => {
    const running = buildChild({ phase: "running" });

    expect(renderRows([running])).toContain("Running");

    const html = renderRows([running], undefined, { review: "approval" });
    expect(html).toContain("Needs approval");
    expect(html).not.toContain(">Running<");
    expect(html).toContain('data-child-task-blocked="true"');
    expect(html).toContain("waiting on a tool approval");
  });

  test("names an unanswered question apart from an unanswered approval", () => {
    const html = renderRows([buildChild({ phase: "running" })], undefined, {
      review: "user-input",
    });

    expect(html).toContain("Needs answer");
    expect(html).toContain("asked a question");
  });

  test("leaves an unblocked row unmarked", () => {
    const html = renderRows([buildChild({ phase: "running" })]);

    expect(html).not.toContain("data-child-task-blocked");
    expect(html).not.toContain("Needs approval");
  });

  test("surfaces a refused action's message on the row it was sent from", () => {
    const refusal: ChildTaskActionResponse = {
      accepted: false,
      duplicate: false,
      reason: "stale-identity",
      message:
        "The child was retried after this control was shown. Review the latest attempt.",
      child: null,
    };
    const rowError = resolveChildTaskActionError(refusal);
    expect(rowError).toBe(refusal.message);

    const html = renderRows([buildChild()], { review: rowError ?? "" });

    expect(html).toContain('role="alert"');
    expect(html).toContain(
      "The child was retried after this control was shown.",
    );
  });
});
