import { describe, expect, test } from "bun:test";
import {
  promoteFirstPendingTodoForActiveTurn,
  resolveTurnActivitySummary,
  resolveTurnActivityVisibility,
} from "@/components/session/turn-activity.utils";

describe("turn activity presentation", () => {
  test("shows the activity shelf only while a turn is active and no plan review is open", () => {
    expect(
      resolveTurnActivityVisibility({
        isTurnActive: true,
        isPlanPending: false,
      }),
    ).toBe(true);
    expect(
      resolveTurnActivityVisibility({
        isTurnActive: true,
        isPlanPending: true,
      }),
    ).toBe(false);
    expect(
      resolveTurnActivityVisibility({
        isTurnActive: false,
        isPlanPending: false,
      }),
    ).toBe(false);
    expect(
      resolveTurnActivityVisibility({
        isTurnActive: false,
        isPlanPending: false,
        hasRetainedFailure: true,
      }),
    ).toBe(true);
  });

  test("yields the composer surface to pending approval and user-input cards", () => {
    expect(
      resolveTurnActivityVisibility({
        isTurnActive: true,
        isPlanPending: false,
        hasPendingInteractionCard: true,
      }),
    ).toBe(false);
  });

  test("promotes the first queued todo while preserving provider progress", () => {
    expect(
      promoteFirstPendingTodoForActiveTurn([
        { content: "Inspect", status: "pending" },
        { content: "Implement", status: "pending" },
      ]),
    ).toEqual([
      { content: "Inspect", status: "in_progress" },
      { content: "Implement", status: "pending" },
    ]);

    const providerProgress = [
      { content: "Inspect", status: "completed" as const },
      { content: "Implement", status: "in_progress" as const },
    ];
    expect(promoteFirstPendingTodoForActiveTurn(providerProgress)).toBe(
      providerProgress,
    );
  });

  test("prioritizes interaction requests over background progress", () => {
    expect(
      resolveTurnActivitySummary({
        pendingInteraction: "approval",
        isStalled: false,
        isPlanPreparing: true,
        workItems: [{ status: "running" }],
        todos: [{ content: "Inspect files", status: "in_progress" }],
      }),
    ).toEqual({
      label: "Waiting for approval",
      activeCount: 3,
      completedCount: 0,
      failedCount: 0,
      totalCount: 3,
    });
  });

  test("summarizes active agents before task-list progress", () => {
    expect(
      resolveTurnActivitySummary({
        pendingInteraction: null,
        isStalled: false,
        isPlanPreparing: false,
        workItems: [
          { status: "completed" },
          { status: "running" },
          { status: "waiting" },
        ],
        todos: [
          { content: "Review", status: "completed" },
          { content: "Implement", status: "in_progress" },
        ],
      }),
    ).toEqual({
      label: "2 background activities",
      activeCount: 3,
      completedCount: 2,
      failedCount: 0,
      totalCount: 5,
    });
  });

  test("surfaces failed work before ordinary background progress", () => {
    expect(
      resolveTurnActivitySummary({
        pendingInteraction: null,
        isStalled: false,
        isPlanPreparing: false,
        workItems: [{ status: "failed" }, { status: "running" }],
        todos: [],
      }),
    ).toEqual({
      label: "1 activity failed",
      activeCount: 1,
      completedCount: 0,
      failedCount: 1,
      totalCount: 2,
    });
  });
});
