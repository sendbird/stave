import { describe, expect, test } from "bun:test";
import {
  buildTurnActivityItems,
  countTurnActivityItems,
  formatTurnActivityCountsLabel,
  partitionTurnActivityItems,
  promoteFirstPendingTodoForActiveTurn,
  resolveTurnActivityHiddenSeverity,
  resolveTurnActivitySummary,
  resolveTurnActivityVisibility,
} from "@/components/session/turn-activity.utils";
import type { ProviderTurnWorkItem } from "@/lib/providers/turn-status";

function buildWorkItem(
  overrides: Partial<ProviderTurnWorkItem> & Pick<ProviderTurnWorkItem, "id">,
): ProviderTurnWorkItem {
  return {
    kind: "subagent",
    status: "running",
    title: overrides.id,
    progressMessages: [],
    startedAt: 1_000,
    updatedAt: 2_000,
    ...overrides,
  };
}

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
      // `promoted` keeps the shelf honest: the provider never reported this
      // todo as running, so the row labels it instead of faking progress.
      { content: "Inspect", status: "in_progress", promoted: true },
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

  test("ranks rows by severity and keeps authored order inside a bucket", () => {
    const items = buildTurnActivityItems({
      activity: {
        turnError: "Provider stream failed",
        turnErrorRecoverable: false,
        completedAt: undefined,
        pendingInteraction: null,
      },
      idleLabel: null,
      isPlanPreparing: false,
      isStalled: false,
      todos: [
        { content: "First todo", status: "pending" },
        { content: "Second todo", status: "pending" },
        { content: "Finished todo", status: "completed" },
      ],
      workItems: [
        buildWorkItem({ id: "done", status: "completed", title: "Done work" }),
        buildWorkItem({
          id: "live",
          status: "running",
          title: "Live work",
          badge: "Explore",
        }),
      ],
    });

    expect(items.map((item) => item.title)).toEqual([
      "Turn failed",
      "Live work",
      "First todo",
      "Second todo",
      "Done work",
      "Finished todo",
    ]);
    expect(items[1]?.badge).toBe("Explore");
  });

  test("labels a promoted todo instead of reporting it as provider progress", () => {
    const [item] = buildTurnActivityItems({
      activity: null,
      idleLabel: null,
      isPlanPreparing: false,
      isStalled: false,
      todos: promoteFirstPendingTodoForActiveTurn([
        { content: "Inspect", status: "pending" },
      ]),
      workItems: [],
    });

    expect(item).toMatchObject({
      title: "Inspect",
      status: "running",
      badge: "Next",
    });
  });

  test("counts rows and summarizes them for the expanded header", () => {
    const items = buildTurnActivityItems({
      activity: null,
      idleLabel: null,
      isPlanPreparing: true,
      isStalled: false,
      todos: [{ content: "Queued", status: "pending" }],
      workItems: [
        buildWorkItem({ id: "a", status: "running", title: "A" }),
        buildWorkItem({ id: "b", status: "failed", title: "B" }),
        buildWorkItem({ id: "c", status: "completed", title: "C" }),
      ],
    });
    const counts = countTurnActivityItems(items);

    expect(counts).toEqual({
      failedCount: 1,
      waitingCount: 0,
      runningCount: 2,
      pendingCount: 1,
      completedCount: 1,
      totalCount: 5,
    });
    expect(formatTurnActivityCountsLabel(counts)).toBe(
      "1 failed · 2 running · 1 queued · 1 done",
    );
    expect(partitionTurnActivityItems(items).completed.map((i) => i.title)).toEqual(["C"]);
    expect(formatTurnActivityCountsLabel(countTurnActivityItems([]))).toBeNull();
  });

  test("escalates the collapsed overflow badge to the worst hidden row", () => {
    const failed = { id: "1", status: "failed" as const, title: "x", iconKey: "tool" as const };
    const waiting = { id: "2", status: "waiting" as const, title: "y", iconKey: "pause" as const };
    const running = { id: "3", status: "running" as const, title: "z", iconKey: "tool" as const };

    expect(resolveTurnActivityHiddenSeverity([running, failed, waiting])).toBe("failed");
    expect(resolveTurnActivityHiddenSeverity([running, waiting])).toBe("waiting");
    expect(resolveTurnActivityHiddenSeverity([running])).toBe("default");
    expect(resolveTurnActivityHiddenSeverity([])).toBe("default");
  });
});
