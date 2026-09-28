import type { ProviderId } from "@/lib/providers/provider.types";
import { AGENT_PERMISSION_LABELS, AGENT_ROLE_LABELS, AGENT_SOURCE_LABELS, AGENT_WORKSPACE_LABELS, type AgentConfig, type AgentSource } from "./schema";
import { compileAgent, snapshotAgent, type AgentSupportLevel } from "./compile";

/**
 * What the Agents tab shows for an agent, derived from its config. Pure, so
 * the words on screen are tested once here instead of in every component.
 */

export const SUPPORT_LEVEL_LABELS: Readonly<Record<AgentSupportLevel, string>> = {
  enforced: "Enforced",
  instructed: "Asked in instructions",
  unavailable: "Not available",
};

/** "Auto-routing · Current workspace · Read only". */
export function describeAgent(agent: AgentConfig): string {
  const model = agent.model.mode === "fixed" ? (agent.model.model ?? agent.model.providerId) : "Auto-routing";
  return [model, AGENT_WORKSPACE_LABELS[agent.workspace], AGENT_PERMISSION_LABELS[agent.permission]].join(" · ");
}

export function describeUsableAs(agent: AgentConfig): string {
  return agent.usableAs.map((role) => AGENT_ROLE_LABELS[role]).join(", ");
}

export interface AgentProviderSupport {
  providerId: ProviderId;
  /** Null when the agent can run as a main agent here; otherwise why not. */
  refusal: string | null;
  instructions: AgentSupportLevel | null;
  tools: AgentSupportLevel | null;
}

/** How each provider would run this agent as a main agent. */
export function describeProviderSupport(agent: AgentConfig, providers: readonly ProviderId[]): AgentProviderSupport[] {
  const snapshot = snapshotAgent({ ...agent, archived: false });
  return providers.map((providerId) => {
    const result = compileAgent({ snapshot, role: "primary", providerId });
    if (!result.ok) return { providerId, refusal: result.message, instructions: null, tools: null };
    const level = (field: "instructions" | "tools") =>
      result.compiled.support.find((entry) => entry.field === field)?.level ?? null;
    return { providerId, refusal: null, instructions: level("instructions"), tools: level("tools") };
  });
}

export interface AgentListGroup {
  source: AgentSource;
  label: string;
  agents: AgentConfig[];
}

/** Custom first (what the user made), then repository, then built-in. */
export function groupAgents(agents: readonly AgentConfig[], query = ""): AgentListGroup[] {
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? agents.filter((agent) => `${agent.name} ${agent.description}`.toLowerCase().includes(needle))
    : agents;
  return (["custom", "repository", "builtin"] as const)
    .map((source) => ({
      source,
      label: AGENT_SOURCE_LABELS[source],
      agents: matches.filter((agent) => agent.source === source),
    }))
    .filter((group) => group.agents.length > 0);
}
