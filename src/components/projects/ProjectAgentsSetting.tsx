import { useMemo } from "react";
import * as stylex from "@stylexjs/stylex";
import { Checkbox } from "@/components/ads/components/Checkbox";
import { Switch } from "@/components/ads/components/Switch";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { listAgents } from "@/lib/agents/library";
import { useAppStore } from "@/store/app.store";

/**
 * A project's Agents: which agents its missions may run as and its tasks may
 * delegate to. Off means any agent; on, only the ticked ones, and the
 * coordinator is told which.
 */
export function ProjectAgentsSetting(props: {
  agents: readonly string[] | null;
  onChange: (agents: string[] | null) => void;
}) {
  const custom = useAppStore((state) => state.settings.customAgents);
  const available = useMemo(() => listAgents({ custom, activeOnly: true }), [custom]);
  const limited = props.agents !== null;
  const chosen = new Set(props.agents ?? []);
  return (
    <div className={sx(styles.stack)}>
      <Switch
        aria-label="Only these agents"
        checked={limited}
        // Turning the limit on starts from every agent, so nothing stops working until one is unticked.
        onCheckedChange={(checked) => props.onChange(checked ? available.map((agent) => agent.id).slice(0, 20) : null)}
      />
      {limited ? (
        <div role="group" aria-label="Project agents" className={sx(styles.list)}>
          {available.map((agent) => (
            <Checkbox
              key={agent.id}
              label={agent.name}
              checked={chosen.has(agent.id)}
              onCheckedChange={(value) =>
                props.onChange(
                  value === true
                    ? [...chosen, agent.id].slice(0, 20)
                    : [...chosen].filter((id) => id !== agent.id),
                )
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  stack: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: vars["--ads-space-8"] },
  list: { display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: vars["--ads-space-8"], maxWidth: "24rem" },
});
