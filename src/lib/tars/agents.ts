import { compileAgent, snapshotAgent } from "../agents/compile";
import { exceedsDelegateCeiling } from "../agents/delegate";
import type { AgentConfig, AgentPermission } from "../agents/schema";
import { currentAgentId } from "../agents/starters";
import { stageHasExternalEffect } from "../agent-runs/domain";
import { TARS_AGENT_CATALOG_PENDING_MESSAGE, TARS_EXECUTION_PROVIDERS, type TarsDelegateReason } from "./conversation";

/** The built-in agent Tars's execution lead is a run snapshot of. */
export const TARS_EXECUTION_AGENT_ID = "supervisor";
/** Agents offered to the planner per message; the rest are counted as omitted. */
export const TARS_PLANNER_MAX_AGENTS = 24;

type ExecutionProvider = (typeof TARS_EXECUTION_PROVIDERS)[number];

/** A refused delegate agent. The interface translates `reason`; the message is a diagnostic. */
export class TarsDelegateRejection extends Error {
  constructor(readonly reason: TarsDelegateReason, message: string) {
    super(message);
    this.name = "TarsDelegateRejection";
  }
}

/**
 * The saved agent catalog has not been synced from the renderer yet, so an id
 * that is not a built-in cannot be judged. Retryable: never a rejection.
 */
export class TarsAgentCatalogPendingError extends Error {
  constructor() {
    super(TARS_AGENT_CATALOG_PENDING_MESSAGE);
    this.name = "TarsAgentCatalogPendingError";
  }
}

/** Recognizes the pending catalog across the host boundary, where only the message survives. */
export function isTarsAgentCatalogPending(error: unknown): boolean {
  return error instanceof Error && error.message.includes(TARS_AGENT_CATALOG_PENDING_MESSAGE);
}

/**
 * Fails closed until the catalog is known: an unsynced catalog still has every
 * built-in, so only an id it cannot find waits for the saved agents.
 */
export function assertTarsAgentCatalog(args: { agentId: string; agents: readonly AgentConfig[]; ready: boolean }) {
  const id = currentAgentId(args.agentId);
  if (!args.ready && !args.agents.some((agent) => agent.id === id)) throw new TarsAgentCatalogPendingError();
}

/**
 * An agent whose workflow publishes or runs a Stave action writes outside the
 * workspace (a commit push, a pull request). Tars never delegates it: that
 * needs a separate request from the user.
 */
export function tarsAgentPublishes(agent: Pick<AgentConfig, "workflow">): boolean {
  return (agent.workflow ?? []).some((stage) => stageHasExternalEffect(stage));
}

/** Built-in agents are always allowed; a saved agent only when the user allowed it. */
export function isTarsAgentAllowed(agent: Pick<AgentConfig, "id" | "source">, allowedAgentIds: readonly string[]) {
  return agent.source === "builtin" || allowedAgentIds.includes(agent.id);
}

/**
 * The widest delegated permission Tars's work may hand out: the execution
 * agent's own, as for any task running as an agent. An unknown execution
 * agent fails closed to read only.
 */
export function tarsDelegationCeiling(agents: readonly AgentConfig[]): AgentPermission {
  return agents.find((agent) => agent.id === TARS_EXECUTION_AGENT_ID)?.permission ?? "read-only";
}

/**
 * Deterministic admission of a delegate action's agent. The agent must be
 * active, allowed, free of publishing stages, usable as a delegated task on
 * Claude or Codex (its fixed provider, else the execution provider), able to
 * run on a pinned execution model, and within the delegation ceiling.
 * Returns the resolved agent; throws {@link TarsDelegateRejection} otherwise.
 */
export function admitTarsAgent(args: {
  agentId: string;
  agents: readonly AgentConfig[];
  allowedAgentIds: readonly string[];
  executionProviderId: ExecutionProvider;
  /** The pinned execution model; null when execution routes automatically. */
  executionModel: string | null;
  ceiling: AgentPermission;
}): AgentConfig {
  const id = currentAgentId(args.agentId);
  const agent = args.agents.find((entry) => entry.id === id && !entry.archived);
  if (!agent) throw new TarsDelegateRejection("agentUnknown", `No active agent "${args.agentId}".`);
  if (!isTarsAgentAllowed(agent, args.allowedAgentIds))
    throw new TarsDelegateRejection("agentNotAllowed", `The saved agent "${agent.id}" is not allowed for Tars.`);
  if (tarsAgentPublishes(agent))
    throw new TarsDelegateRejection("agentPublishes", `The agent "${agent.id}" publishes outside the workspace, which needs a separate request.`);
  const fixed = agent.model.mode === "fixed" ? agent.model : null;
  const providerId = fixed?.providerId ?? args.executionProviderId;
  const supported = (TARS_EXECUTION_PROVIDERS as readonly string[]).includes(providerId);
  const compiled = supported ? compileAgent({ snapshot: snapshotAgent(agent), role: "delegate", providerId }) : null;
  if (!compiled?.ok || compiled.compiled.role !== "delegate")
    throw new TarsDelegateRejection("agentNotDelegable", `The agent "${agent.id}" cannot take delegated work on Claude or Codex.`);
  // A pin locks the whole team to its provider and model (`helperKeepsParentProvider`).
  if (args.executionModel && (providerId !== args.executionProviderId || (fixed?.model && fixed.model !== args.executionModel)))
    throw new TarsDelegateRejection("agentModelConflict", `The agent "${agent.id}" cannot run on the pinned execution model.`);
  const profile = compiled.compiled.delegate.permissionProfile;
  if (exceedsDelegateCeiling(profile === "manual" || profile === "guided" ? profile : "auto", args.ceiling))
    throw new TarsDelegateRejection("agentOverCap", `The agent "${agent.id}" would run with more permission than Tars's delegated work allows.`);
  return agent;
}

export interface TarsPlannerAgent {
  id: string;
  name: string;
  source: "built-in" | "saved";
  /** The agent's kind of work, from its task class. */
  role: string;
  access: AgentPermission;
  useWhen: string;
  avoidWhen: string | null;
}

/**
 * The agents a planner may name: only those the host would admit, built-ins
 * first, then saved agents in allowlist order. Bounded in count and text so a
 * large library cannot crowd out the user's mandate.
 */
export function tarsPlannerAgents(args: {
  agents: readonly AgentConfig[];
  allowedAgentIds: readonly string[];
  executionProviderId: ExecutionProvider;
  executionModel: string | null;
}): { agents: TarsPlannerAgent[]; omittedAgents: number } {
  const ceiling = tarsDelegationCeiling(args.agents);
  const saved = (agent: AgentConfig) => agent.source !== "builtin";
  const ordered = [
    ...args.agents.filter((agent) => !saved(agent)),
    ...args.allowedAgentIds.flatMap((id) => args.agents.filter((agent) => saved(agent) && agent.id === id)),
  ];
  const admitted = ordered.filter((agent) => {
    try { admitTarsAgent({ ...args, agentId: agent.id, ceiling }); return true; }
    catch { return false; }
  });
  return {
    agents: admitted.slice(0, TARS_PLANNER_MAX_AGENTS).map((agent) => ({
      id: agent.id, name: agent.name.slice(0, 80), source: saved(agent) ? "saved" : "built-in",
      role: (agent.model.mode === "auto" ? agent.model.taskClass : undefined) ?? "general", access: agent.permission,
      useWhen: agent.description.slice(0, 300), avoidWhen: agent.avoidWhen?.slice(0, 200) || null,
    })),
    omittedAgents: Math.max(0, admitted.length - TARS_PLANNER_MAX_AGENTS),
  };
}
