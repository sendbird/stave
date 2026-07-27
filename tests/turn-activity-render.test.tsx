import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TurnActivitySurface } from "@/components/session/TurnActivity";

describe("TurnActivity", () => {
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

  test("ranks blocked work first and tucks finished rows behind a disclosure", () => {
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
    expect(html).toContain("Completed (1)");
    expect(html).toContain("1/3");
    expect(html.indexOf("Approval needed")).toBeLessThan(
      html.indexOf("Audit the shelf"),
    );
    // Finished rows stay hidden until the disclosure is opened.
    expect(html).not.toContain("session/TurnActivity.tsx");
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
    expect(html).toContain("Verify the shelf");
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
    expect(html).toContain("Completed (2)");
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
});
