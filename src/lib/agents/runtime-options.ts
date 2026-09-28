import type { ProviderRuntimeOptions } from "@/lib/providers/provider.types";
import { compileAgent, snapshotAgent, type CompiledPrimary } from "./compile";

/**
 * The runtime options a task running as an Agent adds to its usual ones.
 *
 * - `agentInstructions` carries the Agent's instructions to the Claude and
 *   Codex instruction channels.
 * - A Claude denylist is merged into `claudeDisallowedTools`, never replacing
 *   what the user or Stave already disallowed. A limit can only narrow.
 * - Cursor and Kiro get nothing here: intake prepends `promptPreamble` to the
 *   first message instead.
 */
export function agentRuntimeOptions(
  compiled: CompiledPrimary,
  base: Pick<ProviderRuntimeOptions, "claudeDisallowedTools"> = {},
): Pick<ProviderRuntimeOptions, "agentInstructions" | "claudeDisallowedTools"> {
  if (compiled.promptPreamble) return {};
  const disallowed = compiled.disallowedTools?.length
    ? [...new Set([...(base.claudeDisallowedTools ?? []), ...compiled.disallowedTools])]
    : undefined;
  return {
    agentInstructions: compiled.instructions,
    ...(disallowed ? { claudeDisallowedTools: disallowed } : {}),
  };
}

/**
 * The options a later turn of an assigned task adds: the task keeps running as
 * the agent version it started with, compiled for the provider this turn uses.
 * Returns nothing when the turn already carries agent instructions (the first
 * turn), or when the agent cannot run as a main agent on that provider.
 */
export function taskAgentRuntimeOptions(args: {
  agent: import("./schema").AgentConfig;
  providerId: import("@/lib/providers/provider.types").ProviderId;
  base?: Pick<ProviderRuntimeOptions, "agentInstructions" | "claudeDisallowedTools">;
}): Pick<ProviderRuntimeOptions, "agentInstructions" | "claudeDisallowedTools"> {
  if (args.base?.agentInstructions) return {};
  // Archive state does not stop a task that already runs as the agent.
  const compiled = compileAgent({ snapshot: snapshotAgent({ ...args.agent, archived: false }), role: "primary", providerId: args.providerId });
  if (!compiled.ok || compiled.compiled.role !== "primary") return {};
  return agentRuntimeOptions(compiled.compiled, args.base);
}
