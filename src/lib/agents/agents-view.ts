import { getAgentDisplayName, getAgentDisplayDescription } from "./display";
import { i18n } from "@/i18n/runtime";
import type { ProviderId } from "@/lib/providers/provider.types";
import { AGENT_PERMISSION_LABELS, AGENT_ROLE_LABELS, AGENT_SOURCE_LABELS, AGENT_WORKSPACE_LABELS, type AgentConfig, type AgentSource } from "./schema";
import { compileAgent, snapshotAgent, type AgentReceivedInstruction, type AgentSupportEntry, type AgentSupportLevel } from "./compile";

/**
 * What the Agents tab shows for an agent, derived from its config. Pure, so
 * the words on screen are tested once here instead of in every component.
 */

export const SUPPORT_LEVEL_LABELS: Readonly<Record<AgentSupportLevel, string>> = {
  get enforced() { return i18n.t("agents:agentsView.enforced"); },
  get instructed() { return i18n.t("agents:agentsView.instructed"); },
  get unavailable() { return i18n.t("agents:agentsView.unavailable"); },
};

/** "Auto-routing · Current workspace · Read only". */
export function describeAgent(agent: AgentConfig): string {
  const model = agent.model.mode === "fixed" ? (agent.model.model ?? agent.model.providerId) : "Auto-routing";
  return [model, AGENT_WORKSPACE_LABELS[agent.workspace], AGENT_PERMISSION_LABELS[agent.permission]].join(" · ");
}

/**
 * What a task started as the agent may do, in the words the assign surfaces
 * show. An Auto agent adds no limit: the task runs on the user's own
 * permission settings. The others are ceilings over those settings.
 */
export function describeAgentPermissionForTask(permission: AgentConfig["permission"]): string {
  switch (permission) {
    case "auto":
      return i18n.t("agents:agentsView.describeAgentPermissionForTask");
    case "read-only":
      return i18n.t("agents:agentsView.describeAgentPermissionForTask2");
    default:
      return i18n.t("agents:agentsView.describeAgentPermissionForTask3", { value1: AGENT_PERMISSION_LABELS[permission] });
  }
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
  /** Null for Auto: the turn keeps the user's own permission settings. */
  permission: AgentSupportLevel | null;
}

/** How each provider would run this agent as a main agent. */
export function describeProviderSupport(agent: AgentConfig, providers: readonly ProviderId[]): AgentProviderSupport[] {
  const snapshot = snapshotAgent({ ...agent, archived: false });
  return providers.map((providerId) => {
    const result = compileAgent({ snapshot, role: "primary", providerId });
    if (!result.ok) return { providerId, refusal: result.message, instructions: null, tools: null, permission: null };
    const level = (field: "instructions" | "tools" | "permission") =>
      result.compiled.support.find((entry) => entry.field === field)?.level ?? null;
    return { providerId, refusal: null, instructions: level("instructions"), tools: level("tools"), permission: level("permission") };
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
    ? agents.filter((agent) => `${agent.id} ${agent.name} ${agent.description} ${getAgentDisplayName(agent)} ${getAgentDisplayDescription(agent)}`.toLowerCase().includes(needle))
    : agents;
  return (["custom", "repository", "builtin"] as const)
    .map((source) => ({
      source,
      label: AGENT_SOURCE_LABELS[source],
      agents: matches.filter((agent) => agent.source === source),
    }))
    .filter((group) => group.agents.length > 0);
}

export interface AssignmentReceivedView {
  /** Short form of the version the task runs, e.g. "a1b2c3d4". */
  version: string;
  lines: Array<{ label: string; detail: string }>;
  /**
   * Set when the agent was edited after this task started. Later turns keep
   * the version used; assigning again uses the edit.
   */
  changedSince: string | null;
}

const RECEIVED_FIELD_LABELS: Readonly<Record<AgentSupportEntry["field"], string>> = {
  get instructions() { return i18n.t("agents:agentsView.instructions"); },
  get tools() { return i18n.t("agents:agentsView.tools"); },
  get model() { return i18n.t("agents:agentsView.model"); },
  get permission() { return i18n.t("agents:agentsView.permission"); },
};

/**
 * "What it received" for one assignment: the agent version the task runs,
 * each instruction source that went in, and how firmly each field is held on
 * the provider. `current` is the agent as it is now, when it still exists.
 */
export function describeAssignmentReceived(args: {
  agentName: string;
  agentContentHash: string;
  received: readonly AgentReceivedInstruction[];
  support: readonly AgentSupportEntry[];
  current: AgentConfig | null;
}): AssignmentReceivedView {
  const lines = [
    ...args.received.map((entry) => ({
      label:
        entry.kind === "agent"
          ? i18n.t("agents:remaining.presentationCopy457", { v1: args.agentName })
          : entry.kind === "standards"
            ? i18n.t("agents:agentsView.label")
            : i18n.t("agents:agentsView.label2", { value1: entry.sourceId.replace(/^skill:/, "") }),
      detail: entry.included ? i18n.t("agents:agentsView.detail") : i18n.t("agents:agentsView.detail2", { value1: entry.reason ? `: ${entry.reason}` : "" }),
    })),
    ...args.support.map((entry) => ({
      label: RECEIVED_FIELD_LABELS[entry.field],
      detail: `${SUPPORT_LEVEL_LABELS[entry.level]}${entry.reason ? ` — ${entry.reason}` : ""}`,
    })),
  ];
  const now = args.current ? snapshotAgent(args.current).contentHash : null;
  return {
    version: args.agentContentHash.slice(0, 8),
    lines,
    changedSince:
      now && now !== args.agentContentHash
        ? i18n.t("agents:agentsView.extraCopy327", { value1: args.agentName })
        : null,
  };
}
