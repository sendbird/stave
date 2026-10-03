/**
 * Agent run grants: which stage attempt an agent run turn may report for.
 *
 * `runtime.ts` registers a grant when it starts a turn that carries a
 * `agentRunStage`, and revokes it when the turn ends. The stage-reporting tools
 * reach the host with the grant's key, and the agent run runtime resolves the
 * agent run, stage and attempt from it here. The model never passes them, so it
 * cannot report for another stage, and a key whose turn ended resolves to
 * nothing.
 *
 * Lives in the host service process, beside the advisor and worker grant
 * registries, because that is where turns start.
 */
import type { AgentRunStageIdentity } from "../../src/lib/agent-runs/domain";

export interface AgentRunStageGrant extends AgentRunStageIdentity {
  turnId: string;
  taskId: string;
}

const grantsByKey = new Map<string, AgentRunStageGrant>();

export function registerAgentRunGrant(
  args: AgentRunStageGrant & { agentRunKey: string },
) {
  const { agentRunKey, ...grant } = args;
  grantsByKey.set(agentRunKey, grant);
  return {
    revoke() {
      // A reused channel key may already carry a newer turn's grant.
      if (grantsByKey.get(agentRunKey) === grant) grantsByKey.delete(agentRunKey);
    },
  };
}

/** The active grant for a key, or null once its turn has ended. */
export function resolveAgentRunGrant(agentRunKey: string): AgentRunStageGrant | null {
  const key = agentRunKey.trim();
  return key ? (grantsByKey.get(key) ?? null) : null;
}

export function clearAgentRunGrantsForTest() {
  grantsByKey.clear();
}
