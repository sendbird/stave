import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TurnActivitySurface } from "@/components/session/TurnActivity";
import { WorkGraphTree } from "@/components/session/WorkGraphTree";
import type { ProviderWorkGraphCapabilities } from "@/lib/providers/provider.types";
import { createWorkGraph } from "@/lib/work-graph/work-graph-reducer";
import {
  providerAgentNodeKey,
  toolCallNodeKey,
  type AgentNode,
  type Interaction,
  type WorkGraph,
} from "@/lib/work-graph/work-graph.types";

/**
 * What the tree owes a reader: the shape of the delegation, an honest account
 * of who is stuck on a person, and never a control the resolver refused. Each
 * test names one of those.
 */

const ALL_CAPABILITIES: ProviderWorkGraphCapabilities = {
  agentIdentity: true,
  nesting: true,
  message: true,
  interrupt: true,
  stop: true,
};

const NO_CAPABILITIES: ProviderWorkGraphCapabilities = {
  agentIdentity: true,
  nesting: true,
  message: false,
  interrupt: false,
  stop: false,
};

function agentNode(overrides: Partial<AgentNode> & { key: string }): AgentNode {
  return {
    identitySource: "provider",
    parentKey: null,
    label: "Agent",
    status: "running",
    startedAt: 1_000,
    updatedAt: 1_000,
    progress: [],
    ...overrides,
  };
}

function graphOf(
  nodes: AgentNode[],
  interactions: Interaction[] = [],
): WorkGraph {
  const base = createWorkGraph({
    turnId: "turn-1",
    providerId: "claude-code",
    startedAt: 1_000,
  });
  return {
    ...base,
    nodesByKey: {
      ...base.nodesByKey,
      ...Object.fromEntries(nodes.map((node) => [node.key, node])),
    },
    orderedNodeKeys: [
      ...base.orderedNodeKeys,
      ...nodes.map((node) => node.key),
    ],
    interactionsById: Object.fromEntries(
      interactions.map((interaction) => [interaction.id, interaction]),
    ),
  };
}

function renderTree(args: {
  graph: WorkGraph | null;
  capabilities?: ProviderWorkGraphCapabilities;
}) {
  return renderToStaticMarkup(
    createElement(WorkGraphTree, {
      graph: args.graph,
      capabilities: args.capabilities ?? ALL_CAPABILITIES,
      onControl: () => {},
    }),
  );
}

describe("WorkGraphTree", () => {
  test("draws nesting as depth, and a flat graph as one level", () => {
    const parentKey = providerAgentNodeKey("claude-code", "agent_parent");
    const childKey = providerAgentNodeKey("claude-code", "agent_child");
    const nestedHtml = renderTree({
      graph: graphOf([
        agentNode({
          key: parentKey,
          agentId: "agent_parent",
          label: "Sweep the callers",
          badge: "Explore",
        }),
        agentNode({
          key: childKey,
          agentId: "agent_child",
          parentKey,
          label: "Read the shelf",
          progress: ["Reading TurnActivity.tsx"],
        }),
      ]),
    });

    expect(nestedHtml).toContain('data-testid="work-graph-tree"');
    expect(nestedHtml).toContain('data-work-graph-depth="0"');
    expect(nestedHtml).toContain('data-work-graph-depth="1"');
    // The child is indented by exactly one level past the row inset.
    expect(nestedHtml).toContain("padding-inline-start:8px");
    expect(nestedHtml).toContain("padding-inline-start:22px");
    // The parent's spawn qualifier rides the same badge the shelf uses.
    expect(nestedHtml).toContain("Explore");
    expect(nestedHtml).toContain("Reading TurnActivity.tsx");
    expect(nestedHtml.indexOf("Sweep the callers")).toBeLessThan(
      nestedHtml.indexOf("Read the shelf"),
    );

    const flatHtml = renderTree({
      graph: graphOf([
        agentNode({
          key: parentKey,
          agentId: "agent_parent",
          label: "Sweep the callers",
        }),
        agentNode({
          key: childKey,
          agentId: "agent_child",
          label: "Read the shelf",
        }),
      ]),
    });

    // A provider that never reports nesting produces siblings, not a fake tree.
    expect(flatHtml).toContain('data-work-graph-depth="0"');
    expect(flatHtml).not.toContain('data-work-graph-depth="1"');
    expect(flatHtml).not.toContain("padding-inline-start:22px");
    expect(flatHtml).toContain("Sweep the callers");
    expect(flatHtml).toContain("Read the shelf");
  });

  test("renders no control the capabilities deny, and says why instead", () => {
    const graph = graphOf([
      agentNode({
        key: providerAgentNodeKey("claude-code", "agent_live"),
        agentId: "agent_live",
        label: "Audit the shelf",
      }),
    ]);

    const steerableHtml = renderTree({ graph, capabilities: ALL_CAPABILITIES });
    expect(steerableHtml).toContain('aria-label="Message Audit the shelf"');
    expect(steerableHtml).toContain('aria-label="Interrupt Audit the shelf"');
    expect(steerableHtml).toContain('aria-label="Stop Audit the shelf"');

    const deniedHtml = renderTree({ graph, capabilities: NO_CAPABILITIES });
    expect(deniedHtml).not.toContain("<button");
    expect(deniedHtml).not.toContain('aria-label="Message Audit the shelf"');
    expect(deniedHtml).toContain(
      "This provider cannot steer one agent without ending the turn.",
    );
  });

  test("refuses a control for a node the provider never named", () => {
    const html = renderTree({
      graph: graphOf([
        agentNode({
          key: toolCallNodeKey("toolu_1"),
          identitySource: "tool-call",
          spawnedByToolUseId: "toolu_1",
          label: "Task",
        }),
      ]),
      capabilities: ALL_CAPABILITIES,
    });

    // Every capability is granted; identity is the gate that fails here.
    expect(html).not.toContain("<button");
    expect(html).toContain(
      "This provider does not name the agent behind this call, so it cannot be steered on its own.",
    );
  });

  test("a finished agent keeps its row but loses its controls", () => {
    const html = renderTree({
      graph: graphOf([
        agentNode({
          key: providerAgentNodeKey("claude-code", "agent_done"),
          agentId: "agent_done",
          label: "Summarize the diff",
          status: "cancelled",
          reason: "Cancelled by the parent turn",
        }),
      ]),
      capabilities: ALL_CAPABILITIES,
    });

    expect(html).toContain("Summarize the diff");
    expect(html).toContain("Cancelled by the parent turn");
    // Borrowed glyph, honest announcement.
    expect(html).toContain("Cancelled");
    expect(html).not.toContain("Queued");
    expect(html).not.toContain("<button");
    expect(html).toContain("This agent has already finished.");
  });

  test("a blocked node reads as needing a person", () => {
    const blockedKey = providerAgentNodeKey("claude-code", "agent_blocked");
    const html = renderTree({
      graph: graphOf(
        [
          agentNode({
            key: blockedKey,
            agentId: "agent_blocked",
            label: "Apply the migration",
          }),
        ],
        [
          {
            id: "interaction-1",
            nodeKey: blockedKey,
            kind: "approval",
            title: "Approve the write",
            raisedAt: 1_500,
          },
        ],
      ),
    });

    expect(html).toContain('data-work-graph-blocked="true"');
    expect(html).toContain("Needs you");
    // The runtime still calls it running; the person is the critical path.
    expect(html).toContain("Waiting");
  });

  test("an empty graph renders nothing at all", () => {
    const emptyGraph = createWorkGraph({
      turnId: "turn-empty",
      providerId: "codex",
      startedAt: 1_000,
    });

    expect(renderTree({ graph: emptyGraph })).toBe("");
    expect(renderTree({ graph: null })).toBe("");
  });

  test("rides along in the expanded turn activity shelf", () => {
    const graph = graphOf([
      agentNode({
        key: providerAgentNodeKey("claude-code", "agent_shelf"),
        agentId: "agent_shelf",
        label: "Trace the reducer",
      }),
    ]);
    const activity = {
      turnId: "turn-shelf",
      providerId: "claude-code" as const,
      startedAt: 1_000,
      lastEventAt: 2_000,
      stalledAt: null,
      pendingInteraction: null,
      workItemsById: {},
      orderedWorkItemIds: [],
      workGraph: graph,
    };

    const html = renderToStaticMarkup(
      createElement(TurnActivitySurface, {
        activeTurnId: "turn-shelf",
        activity,
        isPlanPreparing: false,
        workItems: [],
        todos: [],
        workGraph: graph,
        workGraphCapabilities: NO_CAPABILITIES,
        expandedByDefault: true,
      }),
    );

    expect(html).toContain('data-testid="work-graph-tree"');
    expect(html).toContain("Trace the reducer");

    // Without a graph the shelf is exactly what it was before the tree existed.
    const withoutGraphHtml = renderToStaticMarkup(
      createElement(TurnActivitySurface, {
        activeTurnId: "turn-shelf",
        activity,
        isPlanPreparing: false,
        workItems: [],
        todos: [],
        expandedByDefault: true,
      }),
    );
    expect(withoutGraphHtml).not.toContain('data-testid="work-graph-tree"');
  });
});
