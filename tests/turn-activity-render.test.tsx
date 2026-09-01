import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TurnActivitySurface } from "@/components/session/TurnActivity";
import { buildTaskExecutionSummary } from "@/lib/fleet/task-execution-summary";

describe("TurnActivity", () => {
  test("reuses the task execution summary in the expanded shelf", () => {
    const executionSummary = buildTaskExecutionSummary({
      providerId: "codex",
      messages: [
        {
          id: "assistant-summary",
          role: "assistant",
          model: "gpt-5.6",
          providerId: "codex",
          content: "Implemented Fleet controls.",
          startedAt: "2026-07-31T00:00:00.000Z",
          completedAt: "2026-07-31T00:00:02.000Z",
          usage: { inputTokens: 100, outputTokens: 20 },
          parts: [
            {
              type: "code_diff",
              filePath: "src/Fleet.tsx",
              oldContent: "",
              newContent: "export const Fleet = true;\n",
              status: "accepted",
            },
          ],
        },
      ],
    });
    const html = renderToStaticMarkup(
      createElement(TurnActivitySurface, {
        activeTurnId: "turn-summary",
        activity: {
          turnId: "turn-summary",
          providerId: "codex",
          startedAt: 1_000,
          lastEventAt: 2_000,
          stalledAt: null,
          pendingInteraction: null,
          workItemsById: {},
          orderedWorkItemIds: [],
        },
        isPlanPreparing: false,
        workItems: [],
        todos: [],
        executionSummary,
      }),
    );

    expect(html).toContain("Task execution summary");
    expect(html).toContain("1 file");
    expect(html).toContain("120 tokens");
    // Account limit and context headroom share one "Headroom" tile so the grid
    // stays at six evenly dividing tiles.
    expect(html).toContain("Headroom");
    expect(html).not.toContain(">Context left<");
    expect(html).not.toContain(">Account limit<");
    expect(html.match(/data-metric="/g)).toHaveLength(6);
  });

  test("keeps Cursor headroom free of Codex account-limit numbers", () => {
    const executionSummary = buildTaskExecutionSummary({
      providerId: "cursor",
      messages: [],
      rateLimits: {
        claude: {
          source: "oauth",
          session: { usedPercent: 18, resetsAt: 10 },
          weekly: { usedPercent: 72, resetsAt: 20 },
          fableWeekly: null,
          error: null,
        },
        codex: {
          source: "rpc",
          buckets: [
            {
              limitId: "standard",
              limitName: "Standard",
              planType: "pro",
              primary: {
                usedPercent: 42,
                windowDurationMins: 300,
                resetsAt: 30,
              },
              secondary: {
                usedPercent: 67,
                windowDurationMins: 10_080,
                resetsAt: 40,
              },
              individualLimit: null,
              credits: null,
            },
          ],
          error: null,
        },
      },
    });
    const html = renderToStaticMarkup(
      createElement(TurnActivitySurface, {
        activeTurnId: "turn-cursor",
        activity: {
          turnId: "turn-cursor",
          providerId: "cursor",
          startedAt: 1_000,
          lastEventAt: 2_000,
          stalledAt: null,
          pendingInteraction: null,
          workItemsById: {},
          orderedWorkItemIds: [],
        },
        isPlanPreparing: false,
        workItems: [],
        todos: [],
        executionSummary,
      }),
    );

    expect(html).toContain("Headroom");
    expect(html).toContain("Not reported");
    expect(html).not.toContain("67% limit");
    expect(html).not.toContain("Standard");
  });

  test("surfaces Kiro context percent and credits instead of a zero-token turn", () => {
    const executionSummary = buildTaskExecutionSummary({
      providerId: "kiro",
      messages: [
        {
          id: "kiro-assistant",
          role: "assistant",
          model: "auto",
          providerId: "kiro",
          content: "Done.",
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            contextUsedPercent: 3.671,
            contextCostAmount: 0.05413,
            contextCostCurrency: "credits",
          },
          parts: [{ type: "text", text: "Done." }],
        },
      ],
    });
    const html = renderToStaticMarkup(
      createElement(TurnActivitySurface, {
        activeTurnId: "turn-kiro",
        activity: {
          turnId: "turn-kiro",
          providerId: "kiro",
          startedAt: 1_000,
          lastEventAt: 2_000,
          stalledAt: null,
          pendingInteraction: null,
          workItemsById: {},
          orderedWorkItemIds: [],
        },
        isPlanPreparing: false,
        workItems: [],
        todos: [],
        executionSummary,
      }),
    );

    // The Headroom tile reports what is left, so a 3.671% used report reads as
    // 96% remaining rather than repeating the used figure.
    expect(html).toContain("96% ctx left");
    expect(html).not.toContain("3.7% ctx");
    expect(html).toContain("0.0541 credits");
    expect(html).not.toContain("0 tokens");
  });

  test("renders live agent work in the stacked activity shelf", () => {
    const html = renderToStaticMarkup(
      createElement(TurnActivitySurface, {
        activeTurnId: "turn-1",
        activity: {
          turnId: "turn-1",
          providerId: "codex",
          startedAt: Date.now() - 12_000,
          lastEventAt: Date.now(),
          stalledAt: null,
          pendingInteraction: null,
          workItemsById: {},
          orderedWorkItemIds: [],
        },
        isPlanPreparing: false,
        workItems: [
          {
            id: "agent-1",
            kind: "subagent",
            status: "running",
            title: "Review Lens diagnostics",
            detail: "Inspecting CDP object lifecycle",
            toolUseId: "tool-1",
            progressMessages: ["Inspecting CDP object lifecycle"],
            startedAt: 1_000,
            updatedAt: 2_000,
            elapsedSeconds: 12,
          },
        ],
        todos: [],
      }),
    );

    expect(html).toContain('data-testid="turn-activity-stack"');
    expect(html).toContain('data-testid="turn-activity"');
    expect(html).toContain('data-testid="turn-activity-orb"');
    expect(html).toContain('data-orb-state="searching"');
    expect(html).toContain("Turn activity");
    expect(html).toContain("Review Lens diagnostics");
    expect(html).toContain("Inspecting CDP object lifecycle");
    expect(html).not.toContain("Agents");
    expect(html).not.toContain("animate-spin");
  });

  test("expands the remaining activities by default and collapses them when the setting is off", () => {
    const activity = {
      turnId: "turn-2",
      providerId: "claude-code" as const,
      startedAt: 1_000,
      lastEventAt: 2_000,
      stalledAt: null,
      pendingInteraction: null,
      workItemsById: {},
      orderedWorkItemIds: [],
    };
    const workItems = [
      {
        id: "agent-1",
        kind: "subagent" as const,
        status: "running" as const,
        title: "Featured headline item",
        toolUseId: "tool-1",
        progressMessages: [],
        startedAt: 1_000,
        updatedAt: 2_000,
      },
      {
        id: "agent-2",
        kind: "subagent" as const,
        status: "running" as const,
        title: "Collapsed list item",
        toolUseId: "tool-2",
        progressMessages: [],
        startedAt: 1_000,
        updatedAt: 2_000,
      },
    ];

    const expandedHtml = renderToStaticMarkup(
      createElement(TurnActivitySurface, {
        activeTurnId: "turn-2",
        activity,
        isPlanPreparing: false,
        workItems,
        todos: [],
        expandedByDefault: true,
      }),
    );
    // Expanded: the header summarizes and every row stays in the list.
    expect(expandedHtml).toContain("2 running");
    expect(expandedHtml).toContain("Featured headline item");
    expect(expandedHtml).toContain("Collapsed list item");
    // Nothing has finished yet, so the ratio stays out of the header.
    expect(expandedHtml).not.toContain("0/2");
    expect(expandedHtml).toContain('aria-expanded="true"');

    const collapsedHtml = renderToStaticMarkup(
      createElement(TurnActivitySurface, {
        activeTurnId: "turn-2",
        activity,
        isPlanPreparing: false,
        workItems,
        todos: [],
        expandedByDefault: false,
      }),
    );
    // Collapsed: the header falls back to the most urgent row plus an overflow
    // count, and the list is gone.
    expect(collapsedHtml).toContain("Featured headline item");
    expect(collapsedHtml).not.toContain("Collapsed list item");
    expect(collapsedHtml).toContain("+1");
    expect(collapsedHtml).toContain('aria-expanded="false"');
  });

  test("ranks blocked work first and keeps finished rows in place", () => {
    const html = renderToStaticMarkup(
      createElement(TurnActivitySurface, {
        activeTurnId: "turn-3",
        activity: {
          turnId: "turn-3",
          providerId: "claude-code",
          startedAt: 1_000,
          lastEventAt: 2_000,
          stalledAt: null,
          pendingInteraction: "approval",
          workItemsById: {},
          orderedWorkItemIds: [],
        },
        isPlanPreparing: false,
        workItems: [
          {
            id: "done-1",
            kind: "tool",
            status: "completed",
            title: "Read",
            detail: "session/TurnActivity.tsx",
            progressMessages: [],
            startedAt: 1_000,
            updatedAt: 2_000,
          },
          {
            id: "agent-1",
            kind: "subagent",
            status: "running",
            title: "Audit the shelf",
            badge: "Explore",
            progressMessages: [],
            startedAt: 1_000,
            updatedAt: 2_000,
          },
        ],
        todos: [],
        expandedByDefault: true,
      }),
    );

    // The attention state names itself instead of showing raw counts.
    expect(html).toContain("Waiting for approval");
    expect(html).toContain("Explore");
    expect(html).not.toContain("Completed (1)");
    expect(html).toContain("1/3");
    expect(html.indexOf("Approval needed")).toBeLessThan(
      html.indexOf("Audit the shelf"),
    );
    // Finished work keeps its original keyed row instead of moving behind a
    // nested disclosure when its status changes.
    expect(html).toContain("session/TurnActivity.tsx");
  });

  test("stays mounted behind a pending interaction card without repeating it", () => {
    const html = renderToStaticMarkup(
      createElement(TurnActivitySurface, {
        activeTurnId: "turn-interaction",
        activity: {
          turnId: "turn-interaction",
          providerId: "claude-code",
          startedAt: 1_000,
          lastEventAt: 2_000,
          stalledAt: null,
          pendingInteraction: "user_input",
          workItemsById: {},
          orderedWorkItemIds: [],
        },
        isPlanPreparing: false,
        workItems: [],
        todos: [{ content: "Verify the shelf", status: "in_progress" }],
        expandedByDefault: true,
        hasPendingInteractionCard: true,
      }),
    );

    // The shelf used to unmount here, replaying its enter animation once the
    // card resolved. It now keeps rendering the surrounding work instead.
    expect(html).toContain('data-testid="turn-activity"');
    expect(html).not.toContain('data-testid="turn-activity-list"');
    expect(html).not.toContain("Verify the shelf");
    // The chat card already asks the question, so the shelf drops its own row.
    expect(html).not.toContain("Input needed");
    // The header still names the attention state.
    expect(html).toContain("Waiting for your input");
  });

  test("names the state instead of parking on a completed count", () => {
    const html = renderToStaticMarkup(
      createElement(TurnActivitySurface, {
        activeTurnId: "turn-finished-rows",
        activity: {
          turnId: "turn-finished-rows",
          providerId: "claude-code",
          startedAt: 1_000,
          lastEventAt: 2_000,
          stalledAt: null,
          pendingInteraction: null,
          workItemsById: {},
          orderedWorkItemIds: [],
        },
        isPlanPreparing: false,
        workItems: [
          {
            id: "tool-1",
            kind: "tool",
            status: "completed",
            title: "Read",
            progressMessages: [],
            startedAt: 1_000,
            updatedAt: 2_000,
          },
          {
            id: "tool-2",
            kind: "tool",
            status: "completed",
            title: "Edit",
            progressMessages: [],
            startedAt: 1_000,
            updatedAt: 2_000,
          },
        ],
        todos: [],
        expandedByDefault: true,
      }),
    );

    // Every tracked row has finished while the model streams its answer, so the
    // header says what is happening rather than `2 done`.
    expect(html).toContain("Working on your request");
    expect(html).not.toContain("2 done");
    // The ratio still carries the numbers.
    expect(html).toContain("2/2");
    expect(html).toContain("Read");
    expect(html).toContain("Edit");
    expect(html).not.toContain("Completed (2)");
  });

  test("renders a completed provider failure without a second loading indicator", () => {
    const html = renderToStaticMarkup(
      createElement(TurnActivitySurface, {
        activeTurnId: "turn-failed",
        activity: {
          turnId: "turn-failed",
          providerId: "claude-code",
          startedAt: 1_000,
          lastEventAt: 2_000,
          stalledAt: null,
          pendingInteraction: null,
          turnError: "Provider stream failed",
          completedAt: 2_000,
          workItemsById: {},
          orderedWorkItemIds: [],
        },
        isPlanPreparing: false,
        workItems: [],
        todos: [],
      }),
    );

    expect(html).toContain("Turn failed");
    expect(html).toContain("Provider stream failed");
    expect(html).toContain('data-testid="turn-activity-orb"');
    expect(html).not.toContain("animate-spin");
  });

  test("renders host-specific chrome and placement controls per variant", () => {
    const baseProps = {
      activeTurnId: "turn-variant",
      activity: {
        turnId: "turn-variant",
        providerId: "claude-code" as const,
        startedAt: 1_000,
        lastEventAt: 2_000,
        stalledAt: null,
        pendingInteraction: null,
        workItemsById: {},
        orderedWorkItemIds: [],
      },
      isPlanPreparing: false,
      workItems: [],
      todos: [],
      onPlacementChange: () => {},
    };

    const docked = renderToStaticMarkup(
      createElement(TurnActivitySurface, {
        ...baseProps,
        variant: "docked",
        placement: "docked",
      }),
    );
    // Docked keeps the tucked-under-composer chrome and offers the other two
    // placements.
    expect(docked).toContain('data-variant="docked"');
    expect(docked).toContain("turn-activity-surface");
    expect(docked).toContain("Float turn activity over the chat");
    expect(docked).toContain("Show turn activity in the side panel");
    expect(docked).not.toContain("Dock turn activity above the input");

    const floating = renderToStaticMarkup(
      createElement(TurnActivitySurface, {
        ...baseProps,
        variant: "floating",
        placement: "floating",
        dragHandleProps: { onPointerDown: () => {} },
      }),
    );
    // Floating swaps the docked chrome for a bordered card with a drag handle.
    expect(floating).toContain('data-variant="floating"');
    expect(floating).not.toContain("turn-activity-surface");
    expect(floating).toContain("cursor-grab");
    expect(floating).toContain("Dock turn activity above the input");
    expect(floating).not.toContain("Float turn activity over the chat");

    const panel = renderToStaticMarkup(
      createElement(TurnActivitySurface, {
        ...baseProps,
        variant: "panel",
        placement: "panel",
      }),
    );
    expect(panel).toContain('data-variant="panel"');
    expect(panel).toContain("Dock turn activity above the input");
    expect(panel).not.toContain("Show turn activity in the side panel");
  });

  test("keeps the panel activity list expanded regardless of the default setting", () => {
    const html = renderToStaticMarkup(
      createElement(TurnActivitySurface, {
        activeTurnId: "turn-panel-expanded",
        activity: {
          turnId: "turn-panel-expanded",
          providerId: "claude-code",
          startedAt: 1_000,
          lastEventAt: 2_000,
          stalledAt: null,
          pendingInteraction: null,
          workItemsById: {},
          orderedWorkItemIds: [],
        },
        isPlanPreparing: false,
        workItems: [
          {
            id: "tool-panel",
            kind: "tool",
            status: "running",
            title: "Inspect panel activity",
            progressMessages: [],
            startedAt: 1_000,
            updatedAt: 2_000,
          },
        ],
        todos: [],
        expandedByDefault: false,
        variant: "panel",
        placement: "panel",
      }),
    );

    expect(html).toContain('data-testid="turn-activity-list"');
    expect(html).toContain("Inspect panel activity");
    expect(html).not.toContain("Expand turn activity");
    expect(html).not.toContain("Minimize turn activity");
  });

  test("makes a row with a tool call reveal-able and leaves the rest inert", () => {
    const html = renderToStaticMarkup(
      createElement(TurnActivitySurface, {
        activeTurnId: "turn-reveal",
        activity: {
          turnId: "turn-reveal",
          providerId: "claude-code",
          startedAt: 1_000,
          lastEventAt: 2_000,
          stalledAt: null,
          pendingInteraction: null,
          workItemsById: {},
          orderedWorkItemIds: [],
        },
        isPlanPreparing: false,
        workItems: [
          {
            id: "tool-revealable",
            kind: "tool",
            status: "completed",
            title: "Search the repo",
            toolUseId: "toolu_reveal",
            progressMessages: [],
            startedAt: 1_000,
            updatedAt: 2_000,
          },
          {
            id: "tool-inert",
            kind: "tool",
            status: "completed",
            title: "Unlinked step",
            progressMessages: [],
            startedAt: 1_000,
            updatedAt: 2_000,
          },
        ],
        todos: [{ content: "Write it up", status: "pending" }],
        onSelectTool: () => {},
        variant: "panel",
        placement: "panel",
      }),
    );

    // Exactly one row becomes a button: a todo or a work item without a tool
    // id would be a control that navigates nowhere.
    expect(html.match(/data-turn-activity-revealable="true"/g)).toHaveLength(1);
    expect(html).toContain("Search the repo — show in conversation");
    expect(html).not.toContain("Unlinked step — show in conversation");
  });

  test("prints the turn timeline offset in the panel but not in the shelf", () => {
    const props = {
      activeTurnId: "turn-offset",
      activity: {
        turnId: "turn-offset",
        providerId: "claude-code" as const,
        startedAt: 1_000,
        lastEventAt: 200_000,
        stalledAt: null,
        pendingInteraction: null,
        workItemsById: {},
        orderedWorkItemIds: [],
      },
      isPlanPreparing: false,
      workItems: [
        {
          id: "tool-late",
          kind: "tool" as const,
          status: "completed" as const,
          title: "Late step",
          progressMessages: [],
          startedAt: 91_000,
          updatedAt: 95_000,
        },
      ],
      todos: [],
    };

    const panel = renderToStaticMarkup(
      createElement(TurnActivitySurface, {
        ...props,
        variant: "panel",
        placement: "panel",
      }),
    );
    // 90s into the turn, and a 4s duration derived from the timestamps even
    // though no provider reported `elapsedSeconds`.
    expect(panel).toContain("+1m 30s");
    expect(panel).toContain("Started +1m 30s into the turn");
    expect(panel).toContain("4s");

    const docked = renderToStaticMarkup(
      createElement(TurnActivitySurface, {
        ...props,
        variant: "docked",
        placement: "docked",
      }),
    );
    // The composer-width shelf has no column to spare for the offset.
    expect(docked).not.toContain("+1m 30s");
    expect(docked).toContain("4s");
  });

  test("renders the armed Advisor in the shelf before any consult", () => {
    const html = renderToStaticMarkup(
      createElement(TurnActivitySurface, {
        activeTurnId: "turn-advisor",
        activity: {
          turnId: "turn-advisor",
          providerId: "codex",
          startedAt: Date.now() - 3_000,
          lastEventAt: Date.now(),
          stalledAt: null,
          pendingInteraction: null,
          workItemsById: {},
          orderedWorkItemIds: [],
        },
        isPlanPreparing: false,
        workItems: [],
        todos: [],
        advisorExchange: {
          turnId: "turn-advisor",
          primaryProviderId: "codex",
          advisorProviderId: "claude-code",
          advisorModel: "claude-fable-5",
          advisorEffort: "xhigh",
          consultLimit: 5,
          startedAt: 1_000,
          outcome: "armed",
          settledConsults: 0,
          stages: [],
        },
      }),
    );

    // The shelf is the surface a user already watches during a turn, so this is
    // where "armed but never asked" has to be legible.
    expect(html).toContain("Advisor armed · 0 consults");
    expect(html).toContain("0/5");
    // No archived consults yet, so the row has nothing to open.
    expect(html).not.toContain("data-turn-activity-opens");
  });

  describe("the advisor row as a consult log entry point", () => {
    const advisorTurn = {
      activeTurnId: "turn-advisor",
      activity: {
        turnId: "turn-advisor",
        providerId: "codex" as const,
        startedAt: 1_000,
        lastEventAt: 5_000,
        stalledAt: null,
        pendingInteraction: null,
        workItemsById: {
          "tool-1": {
            id: "tool-1",
            kind: "tool" as const,
            status: "completed" as const,
            title: "Read src/app.ts",
            toolUseId: "toolu_1",
            progressMessages: [],
            startedAt: 2_000,
            updatedAt: 3_000,
          },
        },
        orderedWorkItemIds: ["tool-1"],
      },
      isPlanPreparing: false,
      todos: [],
      advisorExchange: {
        turnId: "turn-advisor",
        primaryProviderId: "codex" as const,
        advisorProviderId: "claude-code" as const,
        advisorModel: "claude-fable-5",
        consultLimit: 5,
        consultIndex: 1,
        startedAt: 1_000,
        outcome: "completed" as const,
        outcomeAt: 4_000,
        durationMs: 3_000,
        settledConsults: 1,
        stages: [],
      },
    };
    const workItems = [advisorTurn.activity.workItemsById["tool-1"]!];

    test("opens the log without claiming the transcript can reveal it", () => {
      const html = renderToStaticMarkup(
        createElement(TurnActivitySurface, {
          ...advisorTurn,
          workItems,
          hasAdvisorConsultLog: true,
          onOpenAdvisorLog: () => {},
          onSelectTool: () => {},
        }),
      );

      expect(html).toContain('data-turn-activity-opens="advisor-consult-log"');
      // The advisor row must not be mistaken for a revealable tool call: it
      // stands for a consult the transcript never rendered.
      const advisorRow = html.slice(
        html.indexOf('data-turn-activity-item-id="advisor"'),
      );
      expect(
        advisorRow.slice(0, advisorRow.indexOf("</button>")),
      ).not.toContain("data-turn-activity-revealable");
      // The activation refactor must not have cost the tool rows their reveal.
      expect(html).toContain('data-turn-activity-revealable="true"');
    });

    test("stays inert when the task has no archived consults", () => {
      const html = renderToStaticMarkup(
        createElement(TurnActivitySurface, {
          ...advisorTurn,
          workItems,
          onSelectTool: () => {},
        }),
      );

      expect(html).not.toContain("data-turn-activity-opens");
      expect(html).toContain('data-turn-activity-revealable="true"');
    });
  });

  describe("replaying a finished turn in the panel", () => {
    const finishedTurn = {
      activeTurnId: "turn-replay",
      activity: {
        turnId: "turn-replay",
        providerId: "codex" as const,
        startedAt: 100_000,
        lastEventAt: 190_000,
        stalledAt: null,
        pendingInteraction: null,
        completedAt: 190_000,
        workItemsById: {},
        orderedWorkItemIds: [],
      },
      isPlanPreparing: false,
      workItems: [
        {
          id: "tool-replay",
          kind: "tool" as const,
          status: "completed" as const,
          title: "Run the migration",
          toolUseId: "tool-replay",
          progressMessages: [],
          startedAt: 130_000,
          updatedAt: 150_000,
        },
      ],
      todos: [],
      variant: "panel" as const,
      placement: "panel" as const,
    };

    test("names the outcome instead of implying the turn is still working", () => {
      const html = renderToStaticMarkup(
        createElement(TurnActivitySurface, {
          ...finishedTurn,
          replayOutcome: "completed" as const,
        }),
      );

      expect(html).toContain('data-replay="completed"');
      expect(html).toContain('data-testid="turn-activity-replay-badge"');
      expect(html).toContain("Last turn");
      expect(html).toContain("Turn finished");
      // The live fallback headline reads as a turn still in flight, which is
      // exactly the confusion replay exists to remove.
      expect(html).not.toContain("Working on your request");
      // The rows the reducer would otherwise have dropped are the point.
      expect(html).toContain("Run the migration");
      // Frozen: total time held at the completion, not ticking against now.
      expect(html).toContain("1m 30s");
    });

    test("reports a stopped and a failed turn differently", () => {
      expect(
        renderToStaticMarkup(
          createElement(TurnActivitySurface, {
            ...finishedTurn,
            replayOutcome: "stopped" as const,
          }),
        ),
      ).toContain("Turn stopped");
      expect(
        renderToStaticMarkup(
          createElement(TurnActivitySurface, {
            ...finishedTurn,
            activity: { ...finishedTurn.activity, turnError: "stream closed" },
            replayOutcome: "failed" as const,
          }),
        ),
      ).toContain("Turn failed");
    });

    test("a live turn keeps the header free of the replay badge", () => {
      const html = renderToStaticMarkup(
        createElement(TurnActivitySurface, {
          ...finishedTurn,
          activity: { ...finishedTurn.activity, completedAt: undefined },
        }),
      );

      expect(html).not.toContain('data-testid="turn-activity-replay-badge"');
      expect(html).not.toContain("Turn finished");
    });
  });
  test("renders a hook row's provider detail in its own distinct slot", () => {
    const hookWorkItem = {
      kind: "hook" as const,
      status: "completed" as const,
      title: "command",
      progressMessages: [],
      startedAt: 1_000,
      updatedAt: 2_000,
      hookEvent: "sessionStart",
      hookSource: "/Users/dev/.agents/codex/hooks.json",
    };
    const html = renderToStaticMarkup(
      createElement(TurnActivitySurface, {
        activeTurnId: "turn-hooks",
        activity: {
          turnId: "turn-hooks",
          providerId: "codex",
          startedAt: 1_000,
          lastEventAt: 2_000,
          stalledAt: null,
          pendingInteraction: null,
          workItemsById: {},
          orderedWorkItemIds: [],
        },
        isPlanPreparing: false,
        workItems: [
          { ...hookWorkItem, id: "hook:1" },
          { ...hookWorkItem, id: "hook:2" },
        ],
        todos: [],
      }),
    );

    // Normalized: one row for the moment, with the handler count beside it.
    expect(html).toContain("Session start hooks");
    expect(html).toContain("2 handlers");
    // Provider-specific: monospaced and dimmed, so it cannot be mistaken for
    // the normalized half of the row.
    expect(html).toContain(
      '<span class="truncate font-mono text-[10px] text-muted-foreground/70">command · codex/hooks.json</span>',
    );
    // The old presentation's invented ordinals are gone, and the absolute path
    // never reaches the title.
    expect(html).not.toContain("handler 1");
    expect(html).not.toContain("/Users/dev/.agents");
  });
});
