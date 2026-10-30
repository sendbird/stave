import type { SDKControlGetContextUsageResponse } from "@anthropic-ai/claude-agent-sdk";
import type { ClaudeContextUsageSnapshot } from "../../src/lib/providers/provider.types";

// The SDK asks hosts to treat future category identities/classifications as
// absent. Keep the row itself so a newer executable still reports its usage.
const CATEGORY_IDS = new Set([
  "system_prompt", "system_tools", "mcp_tools", "mcp_instructions",
  "mcp_tools_deferred", "system_tools_deferred", "custom_agents",
  "memory_files", "skills", "messages", "autocompact_buffer", "compact_buffer",
  "free_space",
]);
const CATEGORY_KINDS = new Set(["used", "free", "buffer", "deferred"]);

export function toClaudeContextUsageSnapshot(
  usage: SDKControlGetContextUsageResponse,
): ClaudeContextUsageSnapshot {
  return {
    categories: usage.categories.map((category) => ({
      ...(category.id && CATEGORY_IDS.has(category.id) ? { id: category.id } : {}),
      name: category.name,
      tokens: category.tokens,
      color: category.color,
      ...(category.isDeferred !== undefined
        ? { isDeferred: category.isDeferred }
        : {}),
      ...(CATEGORY_KINDS.has(category.kind) ? { kind: category.kind } : {}),
    })),
    totalTokens: usage.totalTokens,
    maxTokens: usage.maxTokens,
    rawMaxTokens: usage.rawMaxTokens,
    percentage: usage.percentage,
    model: usage.model,
    memoryFiles: usage.memoryFiles.map((file) => ({
      path: file.path,
      type: file.type,
      tokens: file.tokens,
    })),
    mcpTools: usage.mcpTools.map((tool) => ({
      name: tool.name,
      serverName: tool.serverName,
      tokens: tool.tokens,
      ...(tool.isLoaded !== undefined ? { isLoaded: tool.isLoaded } : {}),
    })),
    ...(Array.isArray(usage.mcpInstructions)
      ? {
          mcpInstructions: usage.mcpInstructions.map((server) => ({
            serverName: server.serverName,
            tokens: server.tokens,
          })),
        }
      : {}),
    ...(Array.isArray(usage.agents)
      ? {
          agents: usage.agents.map((agent) => ({
            agentType: agent.agentType,
            source: agent.source,
            ...(agent.pluginId ? { pluginId: agent.pluginId } : {}),
            ...(agent.path ? { path: agent.path } : {}),
            tokens: agent.tokens,
          })),
        }
      : {}),
    ...(usage.skills
      ? {
          skills: {
            totalSkills: usage.skills.totalSkills,
            includedSkills: usage.skills.includedSkills,
            tokens: usage.skills.tokens,
            skillFrontmatter: usage.skills.skillFrontmatter.map((skill) => ({
              name: skill.name,
              source: skill.source,
              ...(skill.pluginName ? { pluginName: skill.pluginName } : {}),
              ...(skill.pluginId ? { pluginId: skill.pluginId } : {}),
              ...(skill.path ? { path: skill.path } : {}),
              tokens: skill.tokens,
            })),
          },
        }
      : {}),
  };
}
