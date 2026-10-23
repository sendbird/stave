import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { ProviderRuntimeOptions } from "../../src/lib/providers/provider.types";

/**
 * A provider turn that only writes text from what Stave put in its prompt
 * (`runtimeOptions.toolsDisabled`): the background turn summary, agent
 * drafting and instruction suggestions. Such a turn runs with no tool of any
 * kind and no MCP server, Stave's own included, the way the host read-only
 * prompt helpers do. Both runtimes also run it as a secondary read-only turn:
 * no bound secrets, no resumed session, approvals declined.
 */
export function isToolsDisabledTurn(
  runtimeOptions: Pick<ProviderRuntimeOptions, "toolsDisabled"> | null | undefined,
): boolean {
  return runtimeOptions?.toolsDisabled === true;
}

/**
 * Claude query options for a tool-less turn, spread last so nothing the turn
 * was configured with brings a tool back: no built-in tools, no allowed tools,
 * no skills, plugins or subagents, only the (empty) MCP servers given here,
 * and no settings layer that could add hooks, permissions or servers.
 */
export const CLAUDE_TOOLLESS_QUERY_OPTIONS = {
  tools: [],
  allowedTools: [],
  skills: [],
  plugins: [],
  agents: {},
  mcpServers: {},
  strictMcpConfig: true,
  settingSources: [],
} satisfies Partial<Options>;

/** Shown when a tool-less turn reaches a provider that cannot switch its tools off. */
export const TOOLLESS_TURN_UNSUPPORTED_MESSAGE =
  "This background call runs only on Claude or Codex, which can run it without tools.";
