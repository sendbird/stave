import { Sparkles } from "lucide-react";
import { ComposerOptionCard, ComposerOptionMenuCallout } from "@/components/ai-elements/composer-option-menu";
import type { AgentModelRoute } from "@/lib/agents/selector-choice";
import { sx } from "../ads/utils/stylex";
import { modelEffortSelectorStyles as styles } from "./model-effort-selector.styles";

/**
 * The first row of an agent's pin picker. Unpinned it names the route the
 * agent follows and is checked; pinned it reads "Back to Auto" and lifts the
 * pin. An agent that declares a model of its own returns to that model.
 */
export function describeAgentRoute(args: { agentName: string; route: AgentModelRoute; fixedModel: boolean }): {
  label: string;
  summary: string;
  active: boolean;
} {
  const { agentName } = args;
  const pinned = args.route === "pinned";
  if (args.fixedModel && args.route !== "auto") {
    return {
      label: pinned ? `Back to ${agentName}'s model` : `${agentName}'s model`,
      summary: "The model this agent declares.",
      active: !pinned,
    };
  }
  return {
    label: pinned ? "Back to Auto" : `Auto — ${agentName} chooses`,
    summary: pinned
      ? `${agentName} chooses the model for each turn again.`
      : "Stave Auto routes every turn, using this agent's kind of work.",
    active: !pinned,
  };
}

export function AgentRouteRow(props: {
  agentName: string;
  route: AgentModelRoute;
  fixedModel: boolean;
  autoAvailable: boolean;
  onSelect: () => void;
}) {
  // With Stave Auto off an agent that leaves its model open runs on the
  // model picked below; there is no Auto to go back to.
  if (!props.fixedModel && !props.autoAvailable) {
    return (
      <div className={sx(styles.routeRow)}>
        <ComposerOptionMenuCallout tone="note" testId="agent-route-auto-off">
          Stave Auto is off, so {props.agentName} runs on the model you pick here. Turn Stave Auto on in Settings
          and it chooses the model for each turn.
        </ComposerOptionMenuCallout>
      </div>
    );
  }
  const row = describeAgentRoute(props);
  return (
    <div className={sx(styles.routeRow)}>
      <ComposerOptionCard
        label={row.label}
        summary={row.summary}
        icon={<Sparkles aria-hidden className={sx(styles.railAutoIcon)} />}
        active={row.active}
        onSelect={props.onSelect}
        testId="agent-route-row"
      />
    </div>
  );
}
