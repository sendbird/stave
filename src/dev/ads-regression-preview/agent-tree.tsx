import { useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { WorkGraphTree } from "@/components/session/WorkGraphTree";
import type { AgentNode, WorkGraph } from "@/lib/work-graph/work-graph.types";
import { createWorkGraph } from "@/lib/work-graph/work-graph-reducer";
import { providerAgentNodeKey } from "@/lib/work-graph/work-graph.types";
import type { ProviderWorkGraphCapabilities } from "@/lib/providers/provider.types";
import { vars } from "@/components/ads/tokens/tokens.stylex";

const capabilities: ProviderWorkGraphCapabilities = {
  agentIdentity: true,
  nesting: true,
  message: true,
  interrupt: true,
  stop: true,
};

const styles = stylex.create({
  section: {
    display: "grid",
    gap: vars.space8,
    maxInlineSize: "42rem",
    padding: vars.space16,
    borderRadius: vars.radiusPanel,
    backgroundColor: vars.colorSurfaceRaised,
  },
  title: {
    margin: 0,
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
});

function node(overrides: Partial<AgentNode> & { key: string }): AgentNode {
  return {
    identitySource: "provider",
    parentKey: null,
    label: "Agent",
    status: "running",
    startedAt: 1_000,
    updatedAt: 5_000,
    progress: [],
    ...overrides,
  };
}

function fixtureGraph(): WorkGraph {
  const base = createWorkGraph({
    turnId: "ads-regression-agent-tree",
    providerId: "codex",
    startedAt: 1_000,
  });
  const rootKey = providerAgentNodeKey("codex", "preview-root");
  const childKey = providerAgentNodeKey("codex", "preview-child");
  const nodes = [
    node({
      key: rootKey,
      agentId: "preview-root",
      spawnedByToolUseId: "preview-spawn",
      label: "ads-trace-polish-v2",
      badge: "Explore",
      progress: ["Reviewing the current surface geometry"],
    }),
    node({
      key: childKey,
      agentId: "preview-child",
      parentKey: rootKey,
      label:
        "Inspect the model selector and conversation controls at a deliberately long width",
      progress: ["Checking truncation and action alignment"],
    }),
  ];
  return {
    ...base,
    nodesByKey: Object.fromEntries(nodes.map((item) => [item.key, item])),
    orderedNodeKeys: nodes.map((item) => item.key),
  };
}

export function AgentTreeRegressionFixture() {
  const graph = useMemo(fixtureGraph, []);
  const [lastControl, setLastControl] = useState("");
  return (
    <section className={stylex.props(styles.section).className}>
      <h2 className={stylex.props(styles.title).className}>
        Agent tree alignment
      </h2>
      <WorkGraphTree
        graph={graph}
        onSelectTool={(id) => setLastControl(`Reveal: ${id}`)}
        now={5_000}
        capabilities={capabilities}
        onControl={({ control, node: selected }) =>
          setLastControl(`${control}: ${selected.label}`)
        }
      />
      <output aria-live="polite">{lastControl}</output>
    </section>
  );
}
