import { useId, useState } from "react";
import { useTranslation } from "@/i18n";
import { Input } from "@/components/ui";
import { Checkbox } from "@/components/aui/components/Checkbox";
import { sx } from "@/components/aui/utils/stylex";
import { getAgentDisplayDescription, getAgentDisplayName } from "@/lib/agents/display";
import { isUsableAs, type AgentConfig } from "@/lib/agents/schema";
import { tarsAgentPublishes } from "@/lib/tars/agents";
import { tarsStyles as styles } from "./tars.styles";

/** Saved agents matching a search by name, id or description. */
export function filterTarsAllowlistAgents(agents: readonly AgentConfig[], query: string): AgentConfig[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...agents];
  return agents.filter((agent) => [agent.name, agent.id, agent.description].some((text) => text.toLocaleLowerCase().includes(needle)));
}

/** Toggles one saved agent in the allowlist, keeping the order it was allowed in. */
export function toggleTarsAllowedAgent(value: readonly string[], id: string, allowed: boolean): string[] {
  return allowed ? (value.includes(id) ? [...value] : [...value, id]) : value.filter((entry) => entry !== id);
}

/**
 * The saved agents Tars may hand work to. Built-in agents are always allowed
 * and are not listed. A saved agent that cannot take delegated work, or that
 * publishes outside the workspace, cannot be allowed; an allowed id that no
 * longer exists stays listed so it can be removed.
 */
export function TarsAgentAllowlist({ agents, value, disabled, onChange }: {
  /** Active saved agents; built-ins are excluded by the caller. */
  agents: readonly AgentConfig[];
  value: readonly string[];
  disabled?: boolean;
  onChange: (allowedAgentIds: string[]) => void;
}) {
  const { t } = useTranslation(["shell"]);
  const labelId = useId();
  const [query, setQuery] = useState("");
  const missing = value.filter((id) => !agents.some((agent) => agent.id === id) && id.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const shown = filterTarsAllowlistAgents(agents, query);
  const hasAny = agents.length > 0 || value.length > 0;
  return <div className={sx(styles.field)} role="group" aria-labelledby={labelId} data-tars-agent-allowlist="">
    <span id={labelId}>{t("shell:tars.agents.title")}</span>
    <p className={sx(styles.text)}>{t("shell:tars.agents.hint")}</p>
    {hasAny ? <Input type="search" value={query} disabled={disabled} placeholder={t("shell:tars.agents.search")} aria-label={t("shell:tars.agents.search")}
      onChange={(event) => setQuery(event.target.value)} /> : null}
    {shown.map((agent) => {
      const checked = value.includes(agent.id);
      const delegable = isUsableAs(agent, "delegate");
      const publishes = tarsAgentPublishes(agent);
      return <Checkbox key={agent.id} label={getAgentDisplayName(agent)} checked={checked}
        description={!delegable ? t("shell:tars.agents.notDelegable") : publishes ? t("shell:tars.agents.publishes") : getAgentDisplayDescription(agent)}
        disabled={disabled || ((!delegable || publishes) && !checked)} data-tars-agent={agent.id}
        onCheckedChange={(next) => onChange(toggleTarsAllowedAgent(value, agent.id, next === true))} />;
    })}
    {missing.map((id) => <Checkbox key={id} label={id} checked description={t("shell:tars.agents.missing")} disabled={disabled} data-tars-agent={id}
      onCheckedChange={(next) => onChange(toggleTarsAllowedAgent(value, id, next === true))} />)}
    {!hasAny ? <p className={sx(styles.text)}>{t("shell:tars.agents.empty")}</p>
      : !shown.length && !missing.length ? <p className={sx(styles.text)} role="status">{t("shell:tars.agents.noMatch")}</p> : null}
  </div>;
}
