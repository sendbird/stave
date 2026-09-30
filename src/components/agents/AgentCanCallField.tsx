import { useMemo } from "react";
import { Checkbox } from "@/components/ads/components/Checkbox";
import { Select } from "@/components/ads/components/Select";
import { sx } from "@/components/ads/utils/stylex";
import { listAgents } from "@/lib/agents/library";
import { isUsableAs, type AgentConfig } from "@/lib/agents/schema";
import { useAppStore } from "@/store/app.store";
import { agentStyles } from "./agents.styles";

/**
 * The agents a task running as this agent may delegate to. Absent (`undefined`)
 * is "Any agent"; a list, including an empty one, is "Only these". Offers the
 * active agents usable as a delegated task, other than this one, plus any
 * listed id that is no longer offered so it can still be unchecked.
 */
export function AgentCanCallField(props: {
  agent: AgentConfig;
  onChange: (canCall: string[] | undefined) => void;
}) {
  const customAgents = useAppStore((state) => state.settings.customAgents);
  const candidates = useMemo(
    () =>
      listAgents({ custom: customAgents, activeOnly: true }).filter(
        (agent) => agent.id !== props.agent.id && isUsableAs(agent, "delegate"),
      ),
    [customAgents, props.agent.id],
  );
  const canCall = props.agent.canCall;
  const missing = (canCall ?? []).filter((id) => !candidates.some((agent) => agent.id === id));

  return (
    <div className={sx(agentStyles.canCall)}>
      <Select
        size="sm"
        aria-label="Can call"
        value={canCall ? "only" : "any"}
        options={[
          { value: "any", label: "Any agent" },
          { value: "only", label: "Only these agents" },
        ]}
        onValueChange={(value) => props.onChange(value === "only" ? (canCall ?? []) : undefined)}
      />
      {canCall ? (
        <div role="group" aria-label="Agents it can call" className={sx(agentStyles.roles)}>
          {[...candidates.map((agent) => ({ id: agent.id, name: agent.name })), ...missing.map((id) => ({ id, name: id }))].map(
            (option) => (
              <Checkbox
                key={option.id}
                label={option.name}
                checked={canCall.includes(option.id)}
                onCheckedChange={(value) =>
                  props.onChange(value === true ? [...canCall, option.id] : canCall.filter((id) => id !== option.id))
                }
              />
            ),
          )}
          {candidates.length === 0 && missing.length === 0 ? (
            <span className={sx(agentStyles.noteText)}>No other agent can take delegated tasks.</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
