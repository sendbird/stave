import { describe, expect, test } from "bun:test";
import {
  buildTurnActivityItems,
  countTurnActivityItems,
  describeRetainedTurnHeadline,
  formatTurnActivityCountsLabel,
  hasOutstandingTurnActivity,
  mergeTurnActivityCounts,
  promoteFirstPendingTodoForActiveTurn,
  resolveTurnActivityFeaturedItem,
  resolveTurnActivityHeadline,
  resolveTurnActivityHiddenSeverity,
  resolveTurnActivityLoaderVariant,
  resolveTurnActivityReplay,
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
  test("uses the signal loader until the provider activity snapshot arrives", () => {
    expect(
      resolveTurnActivityLoaderVariant({
        activity: null,
        isPlanPreparing: false,
        isStalled: false,
        workItems: [],
      }),
    ).toBe("signal");
  });

  test("uses meaning-led loaders for waiting, planning, parallel, and agent work", () => {
    const activity = { pendingInteraction: null };

    expect(
      resolveTurnActivityLoaderVariant({
        activity: { pendingInteraction: "approval" },
        isPlanPreparing: false,
        isStalled: false,
        workItems: [],
      }),
    ).toBe("handoff");
    expect(
      resolveTurnActivityLoaderVariant({
        activity,
        isPlanPreparing: false,
        isStalled: true,
        workItems: [],
      }),
    ).toBe("signal");
    expect(
      resolveTurnActivityLoaderVariant({
        activity,
        isPlanPreparing: true,
        isStalled: false,
        workItems: [],
      }),
    ).toBe("route");
    expect(
      resolveTurnActivityLoaderVariant({
        activity,
        isPlanPreparing: false,
        isStalled: false,
        workItems: [
          { kind: "subagent", status: "running" },
          { kind: "tool", status: "running" },
        ],
      }),
    ).toBe("parallel");
    expect(
      resolveTurnActivityLoaderVariant({
        activity,
        isPlanPreparing: false,
        isStalled: false,
        workItems: [{ kind: "subagent", status: "running" }],
      }),
    ).toBe("handoff");
    expect(
      resolveTurnActivityLoaderVariant({
        activity,
        isPlanPreparing: false,
        isStalled: false,
        workItems: [{ kind: "tool", status: "running" }],
      }),
    ).toBe("steps");
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
    expect(
      resolveTurnActivityVisibility({
        isTurnActive: false,
        isPlanPending: false,
        hasReplay: true,
      }),
    ).toBe(true);
  });

  describe("replaying the last finished turn", () => {
    const retained = { turnId: "turn-1" };

    test("only the panel keeps a finished turn on screen", () => {
      expect(
        resolveTurnActivityReplay({
          placement: "panel",
          isTurnActive: false,
          retained,
        }),
      ).toBe(retained);
      // The docked shelf has to give the composer its space back, and a
      // floating card would hang a dead turn over the chat forever.
      for (const placement of ["docked", "floating"] as const) {
        expect(
          resolveTurnActivityReplay({
            placement,
            isTurnActive: false,
            retained,
          }),
        ).toBeNull();
      }
    });

    test("a live turn is never replaced by the replay", () => {
      expect(
        resolveTurnActivityReplay({
          placement: "panel",
          isTurnActive: true,
          retained,
        }),
      ).toBeNull();
    });

    test("nothing retained leaves the panel on its idle placeholder", () => {
      expect(
        resolveTurnActivityReplay({
          placement: "panel",
          isTurnActive: false,
          retained: null,
        }),
      ).toBeNull();
    });

    test("the headline says the turn is over instead of guessing at live work", () => {
      expect(describeRetainedTurnHeadline("completed")).toBe("Turn finished");
      expect(describeRetainedTurnHeadline("stopped")).toBe("Turn stopped");
      expect(describeRetainedTurnHeadline("failed")).toBe("Turn failed");
    });
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

  test("carries the tool call id so a row can reveal itself in the transcript", () => {
    const [withTool, withoutTool] = buildTurnActivityItems({
      activity: null,
      idleLabel: null,
      isPlanPreparing: false,
      isStalled: false,
      todos: [],
      workItems: [
        buildWorkItem({ id: "a", kind: "tool", toolUseId: "toolu_1" }),
        buildWorkItem({ id: "b", kind: "tool" }),
      ],
    });

    expect(withTool?.toolUseId).toBe("toolu_1");
    // A work item the provider never gave a tool id must stay inert rather
    // than render a button that cannot navigate anywhere.
    expect(withoutTool?.toolUseId).toBeUndefined();
  });

  test("derives a finished row's duration when the provider reports none", () => {
    const [claudeRow, codexDone, codexRunning] = buildTurnActivityItems({
      activity: null,
      idleLabel: null,
      isPlanPreparing: false,
      isStalled: false,
      todos: [],
      workItems: [
        // Claude reports elapsed through `tool_progress`; keep its number.
        buildWorkItem({
          id: "a",
          status: "completed",
          elapsedSeconds: 12,
          startedAt: 1_000,
          updatedAt: 9_000,
        }),
        // Codex reports none, so a settled row derives from its timestamps.
        buildWorkItem({
          id: "b",
          status: "completed",
          startedAt: 1_000,
          updatedAt: 4_500,
        }),
        // A live row must not derive: that would need a per-second clock in
        // the memoized row list.
        buildWorkItem({
          id: "c",
          status: "running",
          startedAt: 1_000,
          updatedAt: 4_500,
        }),
      ],
    });

    expect(claudeRow?.elapsedSeconds).toBe(12);
    expect(codexDone?.elapsedSeconds).toBe(3.5);
    expect(codexRunning?.elapsedSeconds).toBeUndefined();
  });

  test("places each work row on the turn's own timeline", () => {
    const [first, second] = buildTurnActivityItems({
      activity: null,
      idleLabel: null,
      isPlanPreparing: false,
      isStalled: false,
      todos: [],
      turnStartedAt: 1_000,
      workItems: [
        buildWorkItem({ id: "a", startedAt: 1_000 }),
        buildWorkItem({ id: "b", startedAt: 65_000 }),
      ],
    });

    expect(first?.startOffsetSeconds).toBe(0);
    expect(second?.startOffsetSeconds).toBe(64);
  });

  test("folds hook handler runs into one provider-agnostic row per event", () => {
    const items = buildTurnActivityItems({
      activity: null,
      idleLabel: null,
      isPlanPreparing: false,
      isStalled: false,
      todos: [],
      workItems: [
        buildWorkItem({
          id: "hook:1",
          kind: "hook",
          status: "completed",
          title: "command",
          hookEvent: "sessionStart",
          hookSource: "/Users/dev/.agents/codex/hooks.json",
        }),
        buildWorkItem({
          id: "hook:2",
          kind: "hook",
          status: "completed",
          title: "command",
          hookEvent: "sessionStart",
          hookSource: "/Users/dev/.agents/codex/hooks.json",
        }),
        buildWorkItem({
          id: "hook:3",
          kind: "hook",
          status: "running",
          title: "command",
          hookEvent: "user_prompt_submit",
          hookSource: "/Users/dev/project/hooks.json",
        }),
      ],
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "work:hook:1",
      status: "completed",
      title: "Session start hooks",
      badge: "2 handlers",
      // `sessionStart` is dropped: the title is the same word re-cased.
      providerDetail: "command · codex/hooks.json",
      iconKey: "hook",
    });
    expect(items[0]?.detail).toBeUndefined();
    expect(items[1]).toMatchObject({
      id: "work:hook:3",
      status: "running",
      title: "Prompt submit hook",
      providerDetail: "user_prompt_submit · command · project/hooks.json",
    });
    expect(items[1]?.badge).toBeUndefined();
  });

  test("titles the same hook event identically across providers", () => {
    const buildHookRow = (hookEvent: string) =>
      buildTurnActivityItems({
        activity: null,
        idleLabel: null,
        isPlanPreparing: false,
        isStalled: false,
        todos: [],
        workItems: [
          buildWorkItem({
            id: "hook:1",
            kind: "hook",
            status: "completed",
            title: "command",
            hookEvent,
          }),
        ],
      })[0];

    // Claude reports PascalCase, Codex camelCase or snake_case, for the same
    // moment in the turn. The row must not read as a different feature.
    expect(buildHookRow("UserPromptSubmit")?.title).toBe("Prompt submit hook");
    expect(buildHookRow("userPromptSubmit")?.title).toBe("Prompt submit hook");
    expect(buildHookRow("user_prompt_submit")?.title).toBe(
      "Prompt submit hook",
    );
    expect(buildHookRow("PreToolUse")?.title).toBe("Before tool use hook");
    // An event no map entry covers still renders readably rather than raw.
    expect(buildHookRow("someFutureEvent")?.title).toBe(
      "Some future event hook",
    );
  });

  test("keeps a descriptive hook label when the provider names no event", () => {
    const [row] = buildTurnActivityItems({
      activity: null,
      idleLabel: null,
      isPlanPreparing: false,
      isStalled: false,
      todos: [],
      workItems: [
        buildWorkItem({
          id: "hook:feedback",
          kind: "hook",
          status: "failed",
          title: "Hook feedback",
          hookEvent: "unknown",
        }),
      ],
    });

    expect(row).toMatchObject({
      title: "Hook feedback",
      status: "failed",
      detail: "Handler failed",
    });
    expect(row?.providerDetail).toBeUndefined();
  });

  test("reports a failed handler on the grouped hook row", () => {
    const [row] = buildTurnActivityItems({
      activity: null,
      idleLabel: null,
      isPlanPreparing: false,
      isStalled: false,
      todos: [],
      workItems: [
        buildWorkItem({
          id: "hook:1",
          kind: "hook",
          status: "completed",
          title: "command",
          hookEvent: "stop",
        }),
        buildWorkItem({
          id: "hook:2",
          kind: "hook",
          status: "failed",
          title: "command",
          hookEvent: "stop",
        }),
      ],
    });

    expect(row).toMatchObject({
      title: "Turn stop hooks",
      status: "failed",
      badge: "2 handlers",
      detail: "1 of 2 handlers failed",
    });
  });

  test("shows the provider's tool token in its own slot, not the title", () => {
    const [row] = buildTurnActivityItems({
      activity: null,
      idleLabel: null,
      isPlanPreparing: false,
      isStalled: false,
      todos: [],
      workItems: [
        buildWorkItem({
          id: "tool-1",
          kind: "tool",
          status: "completed",
          title: "Run command",
          detail: "bun test",
          toolName: "bash",
        }),
      ],
    });

    expect(row).toMatchObject({
      title: "Run command",
      detail: "bun test",
      providerDetail: "bash",
    });
  });

  test("omits the tool token when the title was derived from it", () => {
    const [row] = buildTurnActivityItems({
      activity: null,
      idleLabel: null,
      isPlanPreparing: false,
      isStalled: false,
      todos: [],
      workItems: [
        buildWorkItem({
          id: "tool-1",
          kind: "tool",
          status: "running",
          // What `formatToolDisplayName` produces for this very token: a second
          // copy in the provider slot would say nothing new.
          title: "ibis create page",
          toolName: "ibis:ibis_create_page",
        }),
      ],
    });

    expect(row?.providerDetail).toBeUndefined();
  });

  test("omits the timeline offset when the turn start is unknown", () => {
    const [row] = buildTurnActivityItems({
      activity: null,
      idleLabel: null,
      isPlanPreparing: false,
      isStalled: false,
      todos: [],
      workItems: [buildWorkItem({ id: "a" })],
    });

    expect(row?.startOffsetSeconds).toBeUndefined();
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
      subagentFailedCount: 1,
      subagentWaitingCount: 0,
      subagentRunningCount: 1,
      subagentPendingCount: 0,
      subagentCompletedCount: 1,
      hasGraphSubagentCounts: false,
    });
    expect(formatTurnActivityCountsLabel(counts)).toBe(
      "1 failed · 2 running · 1 queued · 1 done",
    );
    expect(formatTurnActivityCountsLabel(countTurnActivityItems([]))).toBeNull();
  });

  test("replaces the bounded flat subagent counts with the graph summary", () => {
    const flatCounts = countTurnActivityItems(
      Array.from({ length: 12 }, (_, index) => ({
        id: `agent-${index}`,
        status: "running" as const,
        title: `Agent ${index}`,
        iconKey: "subagent" as const,
      })),
    );
    const counts = mergeTurnActivityCounts(flatCounts, {
      totalCount: 16,
      runningCount: 14,
      blockedCount: 0,
      failedCount: 1,
      completedCount: 1,
      maxDepth: 1,
      label: "16 agents · 1 failed",
    });
    const countsLabel = formatTurnActivityCountsLabel(counts);

    expect(counts).toEqual({
      failedCount: 1,
      waitingCount: 0,
      runningCount: 14,
      pendingCount: 0,
      completedCount: 1,
      totalCount: 16,
      subagentFailedCount: 1,
      subagentWaitingCount: 0,
      subagentRunningCount: 14,
      subagentPendingCount: 0,
      subagentCompletedCount: 1,
      hasGraphSubagentCounts: true,
    });
    expect(countsLabel).toBe("1 failed · 14 running · 1 done");
    expect(
      resolveTurnActivityHeadline({
        expanded: false,
        needsAttention: false,
        counts,
        countsLabel,
        featuredItem: {
          id: "agent-0",
          status: "running",
          title: "Review module 0",
          iconKey: "subagent",
        },
        summaryLabel: "Working on your request",
      }),
    ).toBe("1 failed · 14 running · 1 done");
  });

  test("keeps a single graph agent's description as the collapsed headline", () => {
    const item = {
      id: "agent-1",
      status: "running" as const,
      title: "Review the renderer",
      iconKey: "subagent" as const,
    };
    const counts = mergeTurnActivityCounts(countTurnActivityItems([item]), {
      totalCount: 1,
      runningCount: 1,
      blockedCount: 0,
      failedCount: 0,
      completedCount: 0,
      maxDepth: 0,
      label: "1 agent",
    });

    expect(
      resolveTurnActivityHeadline({
        expanded: false,
        needsAttention: false,
        counts,
        countsLabel: formatTurnActivityCountsLabel(counts),
        featuredItem: item,
        summaryLabel: "Working on your request",
      }),
    ).toBe("Review the renderer");
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
        advisorModel: "claude-fable-5-1",
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
