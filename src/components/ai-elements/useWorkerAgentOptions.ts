import { useCallback, useMemo } from "react";
import { agentWorkerConfig } from "@/lib/agents/runtime-options";
import type { ProviderId } from "@/lib/providers/provider.types";
import { useAppStore } from "@/store/app.store";

/**
 * Custom agents the composer's Worker picker offers for one provider, and the
 * worker copy of the one picked. Archived agents and agents that are not
 * usable as a Worker there are left out.
 */
export function useWorkerAgentOptions(providerId: ProviderId) {
  const customAgents = useAppStore((state) => state.settings.customAgents);
  const options = useMemo(
    () =>
      customAgents
        .filter((agent) => !agent.archived && agentWorkerConfig(agent, providerId))
        .map((agent) => ({ id: agent.id, name: agent.name, summary: agent.description })),
    [customAgents, providerId],
  );
  const configFor = useCallback(
    (agentConfigId: string) => {
      const agent = customAgents.find((candidate) => candidate.id === agentConfigId);
      return agent ? agentWorkerConfig(agent, providerId) : null;
    },
    [customAgents, providerId],
  );
  return { options, configFor };
}
