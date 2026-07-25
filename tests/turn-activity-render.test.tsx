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
