import { describe, expect, test } from "bun:test";
import {
  buildTurnActivityItems,
  countTurnActivityItems,
  formatTurnActivityCountsLabel,
  hasOutstandingTurnActivity,
  promoteFirstPendingTodoForActiveTurn,
  resolveTurnActivityFeaturedItem,
  resolveTurnActivityHeadline,
  resolveTurnActivityHiddenSeverity,
  resolveTurnActivityOrbState,
  resolveTurnActivitySummary,
  resolveTurnActivityVisibility,
  type TurnActivityRowStatus,
} from "@/components/session/turn-activity.utils";
import type { ProviderTurnWorkItem } from "@/lib/providers/turn-status";
import type { AdvisorExchangeSnapshot } from "@/lib/providers/advisor-activity";

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
  test("uses the connecting orb until the provider activity snapshot arrives", () => {
    expect(
      resolveTurnActivityOrbState({
        activity: null,
        isPlanPreparing: false,
        isStalled: false,
        workItems: [],
      }),
    ).toBe("connecting");
  });

  test("uses distinct orb states for waiting, planning, parallel, and agent work", () => {
    const activity = { pendingInteraction: null };

    expect(
      resolveTurnActivityOrbState({
        activity: { pendingInteraction: "approval" },
        isPlanPreparing: false,
        isStalled: false,
        workItems: [],
      }),
    ).toBe("listening");
    expect(
      resolveTurnActivityOrbState({
        activity,
        isPlanPreparing: false,
        isStalled: true,
        workItems: [],
      }),
    ).toBe("breathing");
    expect(
      resolveTurnActivityOrbState({
        activity,
        isPlanPreparing: true,
        isStalled: false,
        workItems: [],
      }),
    ).toBe("shaping");
    expect(
      resolveTurnActivityOrbState({
        activity,
        isPlanPreparing: false,
        isStalled: false,
        workItems: [
          { kind: "subagent", status: "running" },
          { kind: "tool", status: "running" },
        ],
      }),
    ).toBe("weaving");
    expect(
      resolveTurnActivityOrbState({
        activity,
        isPlanPreparing: false,
        isStalled: false,
        workItems: [{ kind: "subagent", status: "running" }],
      }),
    ).toBe("searching");
    expect(
      resolveTurnActivityOrbState({
        activity,
        isPlanPreparing: false,
        isStalled: false,
        workItems: [{ kind: "tool", status: "running" }],
      }),
    ).toBe("working");
  });

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

  test("keeps the shelf mounted behind pending approval and user-input cards", () => {
    // Hiding the shelf here replayed its enter/exit animation on every
    // interaction, which read as a flicker. The shelf stays; only its duplicate
    // interaction row drops out (see the suppression test below).
    expect(
      resolveTurnActivityVisibility({
        isTurnActive: true,
        isPlanPending: false,
      }),
    ).toBe(true);
  });

  test("drops the interaction row when a chat card already asks the question", () => {
    const args = {
      activity: {
        completedAt: undefined,
        pendingInteraction: "approval" as const,
        turnError: undefined,
        turnErrorRecoverable: undefined,
      },
      idleLabel: null,
      isPlanPreparing: false,
      isStalled: false,
      todos: [{ content: "Keep working", status: "in_progress" as const }],
      workItems: [],
    };

    expect(buildTurnActivityItems(args).map((item) => item.title)).toEqual([
      "Approval needed",
      "Keep working",
    ]);
    expect(
      buildTurnActivityItems({
        ...args,
        hasPendingInteractionCard: true,
      }).map((item) => item.title),
    ).toEqual(["Keep working"]);
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

  test("keeps rows in insertion order and ranks only the featured row", () => {
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

    // Turn-level signals first, then provider work in start order, then todos
    // in authored order. Status never reorders the list: rows that swap places
    // as work lands make the shelf jump on every provider event.
    expect(items.map((item) => item.title)).toEqual([
      "Turn failed",
      "Done work",
      "Live work",
      "First todo",
      "Second todo",
      "Finished todo",
    ]);
    expect(items[2]?.badge).toBe("Explore");
    // The collapsed header still leads with the most urgent row.
    expect(resolveTurnActivityFeaturedItem(items)?.title).toBe("Turn failed");
  });

  test("features the most urgent row and breaks ties by insertion order", () => {
    const build = (statuses: TurnActivityRowStatus[]) =>
      statuses.map((status, index) => ({
        id: `${index}`,
        status,
        title: `${status}-${index}`,
        iconKey: "tool" as const,
      }));

    expect(
      resolveTurnActivityFeaturedItem(build(["completed", "running", "failed"]))
        ?.title,
    ).toBe("failed-2");
    expect(
      resolveTurnActivityFeaturedItem(build(["completed", "waiting", "running"]))
        ?.title,
    ).toBe("waiting-1");
    expect(
      resolveTurnActivityFeaturedItem(build(["running", "running"]))?.title,
    ).toBe("running-0");
    expect(resolveTurnActivityFeaturedItem([])).toBeNull();
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
    expect(formatTurnActivityCountsLabel(countTurnActivityItems([]))).toBeNull();
  });

  test("stops the headline from parking on a bare completed count", () => {
    const finishedCounts = countTurnActivityItems([
      { id: "a", status: "completed", title: "A", iconKey: "tool" },
      { id: "b", status: "completed", title: "B", iconKey: "tool" },
    ]);
    expect(hasOutstandingTurnActivity(finishedCounts)).toBe(false);
    // `formatTurnActivityCountsLabel` degrades to `2 done` here, which sat in
    // the header reading like a finished turn for the whole final-response
    // stream. The state name is the honest label; `2/2` covers the numbers.
    expect(formatTurnActivityCountsLabel(finishedCounts)).toBe("2 done");
    expect(
      resolveTurnActivityHeadline({
        expanded: true,
        needsAttention: false,
        counts: finishedCounts,
        countsLabel: formatTurnActivityCountsLabel(finishedCounts),
        featuredItem: null,
        summaryLabel: "Working on your request",
      }),
    ).toBe("Working on your request");

    const workingCounts = countTurnActivityItems([
      { id: "a", status: "completed", title: "A", iconKey: "tool" },
      { id: "b", status: "running", title: "B", iconKey: "tool" },
    ]);
    expect(hasOutstandingTurnActivity(workingCounts)).toBe(true);
    expect(
      resolveTurnActivityHeadline({
        expanded: true,
        needsAttention: false,
        counts: workingCounts,
        countsLabel: formatTurnActivityCountsLabel(workingCounts),
        featuredItem: null,
        summaryLabel: "Working on your request",
      }),
    ).toBe("1 running · 1 done");
    // Attention states and the collapsed header keep their existing behaviour.
    expect(
      resolveTurnActivityHeadline({
        expanded: true,
        needsAttention: true,
        counts: workingCounts,
        countsLabel: formatTurnActivityCountsLabel(workingCounts),
        featuredItem: null,
        summaryLabel: "Waiting for approval",
      }),
    ).toBe("Waiting for approval");
    const featuredRow = {
      id: "b",
      status: "running" as const,
      title: "Featured row",
      iconKey: "tool" as const,
    };
    expect(
      resolveTurnActivityHeadline({
        expanded: false,
        needsAttention: false,
        counts: workingCounts,
        countsLabel: formatTurnActivityCountsLabel(workingCounts),
        featuredItem: featuredRow,
        summaryLabel: "Working on your request",
      }),
    ).toBe("Featured row");
    // Collapsed attention states must not bury "waiting for you" under whichever
    // tool happens to be running — the shelf now stays mounted behind the card.
    expect(
      resolveTurnActivityHeadline({
        expanded: false,
        needsAttention: true,
        counts: workingCounts,
        countsLabel: formatTurnActivityCountsLabel(workingCounts),
        featuredItem: featuredRow,
        summaryLabel: "Waiting for your input",
      }),
    ).toBe("Waiting for your input");
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

  describe("the advisor row", () => {
    function advisorSnapshot(
      overrides: Partial<AdvisorExchangeSnapshot> = {},
    ): AdvisorExchangeSnapshot {
      return {
        turnId: "turn-1",
        primaryProviderId: "codex",
        advisorProviderId: "claude-code",
        advisorModel: "claude-fable-5",
        advisorEffort: "xhigh",
        consultLimit: 5,
        startedAt: 1_000,
        outcome: "armed",
        settledConsults: 0,
        stages: [],
        ...overrides,
      };
    }

    const baseArgs = {
      activity: null,
      idleLabel: null,
      isPlanPreparing: false,
      isStalled: false,
      todos: [],
      workItems: [],
    };

    test("an armed turn says so before any consult happens", () => {
      const [row] = buildTurnActivityItems({
        ...baseArgs,
        advisor: advisorSnapshot(),
      });

      // The whole point of the row: "armed but never asked" must be readable
      // as such, not as a turn that had no Advisor at all.
      expect(row?.title).toBe("Advisor armed · 0 consults");
      expect(row?.status).toBe("pending");
      expect(row?.badge).toBe("0/5");
      expect(row?.detail).toContain("Fable");
      expect(row?.iconKey).toBe("advisor");
    });

    test("a running consult reports which of the budget it is spending", () => {
      const [row] = buildTurnActivityItems({
        ...baseArgs,
        advisor: advisorSnapshot({
          outcome: "pending",
          consultIndex: 2,
          question: "Is the cancellation path sound?",
        }),
      });

      expect(row?.title).toBe("Advisor consult 2/5");
      expect(row?.status).toBe("running");
      expect(row?.detail).toBe("Is the cancellation path sound?");
    });

    test("a settled consult keeps the turn's count visible", () => {
      const [row] = buildTurnActivityItems({
        ...baseArgs,
        advisor: advisorSnapshot({
          outcome: "completed",
          consultIndex: 1,
          settledConsults: 1,
          durationMs: 2_400,
        }),
      });

      expect(row?.title).toBe("Advisor · 1 consult");
      expect(row?.status).toBe("completed");
      expect(row?.detail).toContain("Advice returned in 2.4s");
    });

    test("a failed consult is a failed row, not a failed turn", () => {
      const [row] = buildTurnActivityItems({
        ...baseArgs,
        advisor: advisorSnapshot({
          outcome: "timeout",
          consultIndex: 1,
          settledConsults: 1,
          durationMs: 90_000,
        }),
      });

      expect(row?.status).toBe("failed");
      expect(row?.detail).toContain("the turn continued");
    });

    test("the row sits ahead of provider work and never reorders it", () => {
      const titles = buildTurnActivityItems({
        ...baseArgs,
        advisor: advisorSnapshot(),
        workItems: [buildWorkItem({ id: "tool-1", title: "Read" })],
      }).map((item) => item.title);

      expect(titles).toEqual(["Advisor armed · 0 consults", "Read"]);
    });

    test("no grant means no row", () => {
      expect(
        buildTurnActivityItems({ ...baseArgs, advisor: null }),
      ).toEqual([]);
    });
  });
});
