import { describe, expect, test } from "bun:test";
import type { SDKControlGetContextUsageResponse } from "@anthropic-ai/claude-agent-sdk";
import { toClaudeContextUsageSnapshot } from "../electron/providers/claude-context-usage-snapshot";

const legacyUsage = {
  categories: [
    { name: "Messages", tokens: 1_200, color: "blue" },
    { name: "Deferred tools", tokens: 200, color: "gray", isDeferred: true },
  ],
  totalTokens: 1_200,
  maxTokens: 100_000,
  rawMaxTokens: 200_000,
  percentage: 1.2,
  model: "claude-test",
  memoryFiles: [{ path: "/workspace/CLAUDE.md", type: "Project", tokens: 30 }],
  mcpTools: [{ name: "search", serverName: "docs", tokens: 20, isLoaded: false }],
};

describe("Claude context usage snapshots", () => {
  test("keeps older runtime categories, memory and MCP tools without optional metadata", () => {
    expect(toClaudeContextUsageSnapshot(
      legacyUsage as SDKControlGetContextUsageResponse,
    )).toEqual(legacyUsage);
  });

  test("preserves stable categories and provider-reported MCP, agent and skill provenance", () => {
    const usage = {
      ...legacyUsage,
      categories: [
        { id: "messages", name: "Conversation", kind: "used", tokens: 1_200, color: "blue" },
        { id: "mcp_tools_deferred", name: "Deferred tools", kind: "deferred", tokens: 200, color: "gray", isDeferred: true },
        { id: "compact_buffer", name: "Reserve", kind: "buffer", tokens: 500, color: "gray" },
        { id: "free_space", name: "Available", kind: "free", tokens: 98_300, color: "gray" },
      ],
      mcpInstructions: [{ serverName: "Docs Server", tokens: 15 }],
      agents: [{
        agentType: "reviewer", source: "plugin", pluginId: "tools@catalog",
        path: "/workspace/plugins/reviewer.md", tokens: 25,
      }],
      skills: {
        totalSkills: 2, includedSkills: 1, tokens: 10,
        skillFrontmatter: [{
          name: "verify", source: "plugin", pluginName: "tools",
          pluginId: "tools@catalog", path: "/workspace/plugins/verify/SKILL.md", tokens: 10,
        }],
      },
    } satisfies Partial<SDKControlGetContextUsageResponse>;

    const snapshot = toClaudeContextUsageSnapshot(usage as SDKControlGetContextUsageResponse);
    expect(snapshot).toEqual(usage);
    // Deferred tools, buffer and free space are separate rows, not additional
    // occupancy or API billing tokens to add to the provider's aggregate.
    expect(snapshot.totalTokens).toBe(1_200);
    expect(snapshot.percentage).toBe(1.2);
    expect(snapshot.categories[0]?.id).toBe("messages");
  });

  test("keeps future rows while ignoring unknown identities and classifications", () => {
    const snapshot = toClaudeContextUsageSnapshot({
      ...legacyUsage,
      categories: [
        { id: "future_category", name: "Future", kind: "future_kind", tokens: 4, color: "green" },
        { id: "messages", name: "Renamed messages", kind: "used", tokens: 8, color: "blue" },
      ],
    } as unknown as SDKControlGetContextUsageResponse);

    expect(snapshot.categories).toEqual([
      { name: "Future", tokens: 4, color: "green" },
      { id: "messages", name: "Renamed messages", kind: "used", tokens: 8, color: "blue" },
    ]);
  });

  test("does not invent unavailable provenance for agents or skills", () => {
    const usage = {
      ...legacyUsage,
      mcpInstructions: [],
      agents: [{ agentType: "reviewer", source: "project", tokens: 25 }],
      skills: {
        totalSkills: 1, includedSkills: 1, tokens: 10,
        skillFrontmatter: [{ name: "verify", source: "project", tokens: 10 }],
      },
    };
    expect(toClaudeContextUsageSnapshot(usage as SDKControlGetContextUsageResponse)).toEqual(usage);
  });
});
