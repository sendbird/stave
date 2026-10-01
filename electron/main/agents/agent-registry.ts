/**
 * Main's read-only copy of the agents a delegation may name: the built-ins and
 * the custom agents the renderer last synced. The host gets the same copy for
 * projects and missions, and gets it again when it restarts.
 *
 * Used by: `electron/main/ipc/agents.ts` (sync) and
 * `electron/main/runs/delegated-task-coordinator-instance.ts` (delegation).
 */
import { normalizeCustomAgents, listAgents } from "../../../src/lib/agents/library";
import type { AgentConfig } from "../../../src/lib/agents/schema";
import { DEFAULT_MY_STANDARDS, normalizeMyStandards, type MyStandards } from "../../../src/lib/agents/standards";

let customAgents: AgentConfig[] = [];
let myStandards: MyStandards = DEFAULT_MY_STANDARDS;
/** The renderer's Stave Auto settings for agent runs; the host validates them. */
let routeSettings: unknown;

export function setRouteSettings(input: unknown) {
  if (input !== undefined) routeSettings = input;
}

export function getRouteSettings(): unknown {
  return routeSettings;
}

export function setMyStandards(input: unknown) {
  myStandards = normalizeMyStandards(input);
}

export function getMyStandards(): MyStandards {
  return myStandards;
}

/** Keeps the readable custom agents; unreadable ones are left out, never guessed. */
export function setCustomAgents(input: unknown): AgentConfig[] {
  customAgents = normalizeCustomAgents(input).agents;
  return customAgents;
}

export function getCustomAgents(): readonly AgentConfig[] {
  return customAgents;
}

/** An active agent by id, custom first, then built-in; null when none or archived. */
export function findAgent(agentConfigId: string): AgentConfig | null {
  return listAgents({ custom: customAgents, activeOnly: true }).find((agent) => agent.id === agentConfigId) ?? null;
}
