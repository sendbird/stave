import type { ProviderId, ProviderRuntimeOptions } from "@/lib/providers/provider.types";
import { compileAgent, snapshotAgent, type CompiledPrimary, type CompiledDelegate } from "./compile";
import { agentPermissionOverrides } from "./permission";
import { AgentConfigSchema, type AgentConfig } from "./schema";

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
 * `permission.ts`). The saved instructions are authoritative
 * for every turn; the ceiling is applied to every turn, so a
 * user who widens settings mid-task still runs the agent inside its limit.
 */
export function taskAgentRuntimeOptions(args: {
  agent: AgentConfig;
  providerId: ProviderId;
  base?: ProviderRuntimeOptions;
  /** The standards the task started with. */
  standards?: string | null;
}): Partial<ProviderRuntimeOptions> {
  const base = args.base ?? {};
  // Archive state does not stop a task that already runs as the agent.
  const compiled = compileTaskAgent(args);
  return compiledTaskAgentRuntimeOptions(compiled, args.providerId, base);
}

/** Mandatory task policy is compiled once; unavailable constraints refuse execution. */
export function compileTaskAgent(args: {
  agent: AgentConfig;
  providerId: ProviderId;
  standards?: string | null;
}): CompiledPrimary {
  const compiled = compileTaskAgentRole({ ...args, role: "primary" });
  if (compiled.role !== "primary") throw new Error("The task's Agent cannot run as a main agent.");
  return compiled;
}

export function compileTaskAgentRole(args: {
  agent: AgentConfig;
  providerId: ProviderId;
  standards?: string | null;
  role: "primary" | "delegate";
}): CompiledPrimary | CompiledDelegate {
  const parsed = AgentConfigSchema.safeParse({ ...args.agent, archived: false });
  if (!parsed.success) throw new Error("The task's saved Agent configuration is invalid.");
  const result = compileAgent({
    snapshot: snapshotAgent(parsed.data), role: args.role, providerId: args.providerId,
    ...(args.standards ? { standards: args.standards } : {}),
  });
  if (!result.ok) throw new Error(result.message);
  if (result.compiled.role !== "primary" && result.compiled.role !== "delegate") {
    throw new Error("The task's Agent role is unavailable.");
  }
  const unavailable = result.compiled.support.find((entry) => entry.level === "unavailable");
  if (unavailable) throw new Error(unavailable.reason ?? `The Agent's ${unavailable.field} constraint is unavailable.`);
  return result.compiled;
}

export function compiledTaskAgentRuntimeOptions(
  compiled: CompiledPrimary,
  providerId: ProviderId,
  base: ProviderRuntimeOptions = {},
): Partial<ProviderRuntimeOptions> {
  const instructions = agentRuntimeOptions(compiled, base);
  const permission = agentPermissionOverrides({
    permission: compiled.permission, providerId, options: { ...base, ...instructions },
  });
  return { ...instructions, ...permission };
}

/**
 * What a task's turns carry after the user released its Agent, in the
 * Agent instruction channel (Claude's system prompt, Codex's developer
 * instructions). A resumed provider session still holds the Agent's earlier
 * instructions and the agent run prompts that named it, and a model that only
 * stops receiving them keeps obeying the copy in its history. Codex re-sends
 * changed developer instructions as a refresh block, so this line is also what
 * tells it the old limits were lifted rather than merely omitted.
 */
export function releasedAgentInstructions(agentName: string): string {
  const name = agentName.trim() || "an Agent";
  return [
    "# Agent released",
    `This task ran as the ${name} agent earlier. The user released it: the task no longer runs as ${name}. That agent's role, instructions and limits, and the stage reporting of the ${name} run, no longer apply, even where earlier messages in this conversation state them.`,
    "Follow the current instructions, any run context attached to this turn, the user's latest request and the permissions this turn actually has. Do not refuse work because the released agent's role forbade it.",
  ].join("\n\n");
}
