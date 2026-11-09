/**
 * Hands main's copy of the renderer's agents to the host. Used when the
 * renderer syncs, when a host respawns, and when Tars finds the host still
 * without a catalog main already has, so a transient failure converges.
 *
 * Used by: `electron/main/ipc/agents.ts` and `electron/main/tars-conversation-instance.ts`.
 */
import type { AgentInvokeResult } from "../../../src/lib/agents/api";
import { invokeHostService } from "../host-service-client";
import { getCustomAgents, getMyStandards, getRouteSettings } from "./agent-registry";

/** Rejects when the host did not accept the copy, so a caller can retry. */
export async function syncAgentsToHost(): Promise<void> {
  const result = await invokeHostService("agent.invoke", { action: "sync-agents", args: {
    customAgents: getCustomAgents(), myStandards: getMyStandards(), routeSettings: getRouteSettings(),
  } }) as AgentInvokeResult<unknown>;
  if (!result.ok) throw new Error(result.message);
}
