import { getAgentDisplayName, getAgentDisplayDescription } from "@/lib/agents/display";
import { i18n } from "@/i18n";
import { useTranslation } from "@/i18n";
import { sx } from "@/components/ads/utils/stylex";
import {
  AGENT_PERMISSION_LABELS,
  AGENT_SOURCE_LABELS,
  type AgentConfig,
} from "@/lib/agents/schema";
import { workflowStyles as styles } from "../workflows/workflows.styles";
import { AgentAvatar, type AgentAvatarStatus } from "./AgentAvatar";
import { agentStyles } from "./agents.styles";

/**
 * The profile head of an agent's detail: avatar, name, "Use when", and chips
 * for source, the model choice (once: "Auto" or the pinned model) and, when it
 * applies, "Read only". Permission and where it works are in Settings. Pure
 * presentation of one agent; the surrounding detail owns the actions.
 */
export function AgentProfileHeader(props: { agent: AgentConfig; status?: AgentAvatarStatus }) {
  useTranslation();
  const { agent } = props;
  const model =
    agent.model.mode === "fixed" ? (agent.model.model ?? agent.model.providerId) : i18n.t("agents:agentProfileHeader.extraCopy24");
  const chips = [
    AGENT_SOURCE_LABELS[agent.source],
    model,
    ...(agent.permission === "read-only" ? [AGENT_PERMISSION_LABELS["read-only"]] : []),
  ];
  return (
    <div className={sx(agentStyles.profile)}>
      <AgentAvatar agent={agent} size="lg" status={props.status} aria-label={null} />
      <div className={sx(agentStyles.profileText)}>
        <h2 className={sx(agentStyles.profileName)}>{getAgentDisplayName(agent)}</h2>
        <p className={sx(styles.hint)}>{getAgentDisplayDescription(agent)}</p>
        <div className={sx(agentStyles.chipRow)}>
          {chips.map((chip) => (
            <span key={chip} className={sx(styles.chip)}>
              {chip}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
