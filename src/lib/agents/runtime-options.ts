import type { ProviderId, ProviderRuntimeOptions } from "@/lib/providers/provider.types";
import { compileAgent, snapshotAgent, type CompiledPrimary } from "./compile";
import { agentPermissionOverrides } from "./permission";
import type { AgentConfig } from "./schema";
import type { WorkerProviderConfig } from "@/lib/providers/worker-mode";

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
 * What every turn of an assigned task adds, the first included: the agent
 * version it started with, compiled for the provider this turn uses, and its
 * permission as a ceiling over the turn's own permissions (see
 * `permission.ts`). Instructions are added only when the turn does not already
 * carry them (the first turn does); the ceiling is applied to every turn, so a
 * user who widens settings mid-task still runs the agent inside its limit.
 */
export function taskAgentRuntimeOptions(args: {
  agent: AgentConfig;
  providerId: ProviderId;
  base?: ProviderRuntimeOptions;
}): Partial<ProviderRuntimeOptions> {
  const base = args.base ?? {};
  // Archive state does not stop a task that already runs as the agent.
  const compiled = compileAgent({ snapshot: snapshotAgent({ ...args.agent, archived: false }), role: "primary", providerId: args.providerId });
  const instructions =
    !base.agentInstructions && compiled.ok && compiled.compiled.role === "primary" ? agentRuntimeOptions(compiled.compiled, base) : {};
  const permission = agentPermissionOverrides({
    permission: args.agent.permission,
    providerId: args.providerId,
    options: { ...base, ...instructions },
  });
  return { ...instructions, ...permission };
}

/**
 * A custom agent as the composer's Worker: the compiled worker copy plus the
 * agent's id and name, so the picker can show which agent is in use. Null when
 * the agent cannot be a Worker on this provider.
 */
export function agentWorkerConfig(
  agent: AgentConfig,
  providerId: ProviderId,
): (WorkerProviderConfig & { agentConfigId: string; agentName: string }) | null {
  const compiled = compileAgent({ snapshot: snapshotAgent(agent), role: "worker", providerId });
  if (!compiled.ok || compiled.compiled.role !== "worker") return null;
  return { ...compiled.compiled.workerConfig, agentConfigId: agent.id, agentName: agent.name };
}
