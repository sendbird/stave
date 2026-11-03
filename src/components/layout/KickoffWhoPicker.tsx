import { useMemo } from "react";
import { useTranslation } from "@/i18n";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import type { AgentConfig } from "@/lib/agents/schema";
import { getAgentDisplayName, getAgentDisplayDescription } from "@/lib/agents/display";
import { SearchablePicker, type SearchablePickerOption } from "./settings-searchable-picker";

const ME = "__stave_me__";

/**
 * Shared by the source and review steps so agent search works in both: "Me"
 * first, then every agent with its avatar and description, searched by name
 * and description, with the current choice checked.
 */
export function KickoffWhoPicker(props: {
  agents: readonly AgentConfig[];
  who: "me" | "agent";
  agentId: string | null;
  onWhoChange: (who: "me" | "agent") => void;
  onAgentChange: (agentId: string) => void;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  const { t } = useTranslation(["kickoff"]);
  const meLabel = t("kickoff:kickoffSourceWho.me");
  const options = useMemo<SearchablePickerOption[]>(
    () => [
      { value: ME, label: meLabel },
      ...props.agents.map((agent) => ({
        value: agent.id,
        label: getAgentDisplayName(agent),
        detail: getAgentDisplayDescription(agent) || undefined,
        icon: <AgentAvatar agent={agent} size="xs" aria-label={null} />,
        keywords: [agent.name, agent.description ?? ""],
      })),
    ],
    [meLabel, props.agents],
  );
  const current = props.who === "agent" && props.agents.some((agent) => agent.id === props.agentId)
    ? (props.agentId ?? ME)
    : ME;
  return (
    <SearchablePicker
      labelledBy={props["aria-labelledby"]}
      aria-label={props["aria-label"]}
      size="md"
      value={current}
      placeholder={meLabel}
      options={options}
      disabled={props.disabled}
      searchPlaceholder={t("kickoff:whoPicker.searchAgents")}
      emptyText={t("kickoff:whoPicker.noAgentsFound")}
      onSelect={(value) => {
        if (value === ME) {
          props.onWhoChange("me");
          return;
        }
        props.onWhoChange("agent");
        props.onAgentChange(value);
      }}
    />
  );
}
