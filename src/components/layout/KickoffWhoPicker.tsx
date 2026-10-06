import { useState } from "react";
import { ChevronDown } from "lucide-react";
import * as stylex from "@stylexjs/stylex";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ads/components/Button";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import {
  Command, CommandEmpty, CommandInput, CommandItem, CommandList,
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui";
import type { AgentConfig } from "@/lib/agents/schema";
import { getAgentDisplayName, getAgentDisplayDescription } from "@/lib/agents/display";

/** Shared by the source and review steps so agent search works in both. */
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
  const [open, setOpen] = useState(false);
  const agent = props.who === "agent"
    ? props.agents.find((candidate) => candidate.id === props.agentId)
    : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={
        <Button
          variant="outline" fullWidth disabled={props.disabled}
          aria-label={props["aria-label"]} aria-labelledby={props["aria-labelledby"]}
          xstyle={styles.trigger}
        />
      }>
        <span className={sx(styles.label)}>
          {agent ? <AgentAvatar agent={agent} size="xs" aria-label={null} /> : null}
          <span className={sx(styles.name)}>{agent ? getAgentDisplayName(agent) : t("kickoff:kickoffSourceWho.me")}</span>
        </span>
        <ChevronDown aria-hidden="true" className={sx(styles.chevron)} />
      </PopoverTrigger>
      <PopoverContent align="start" density="flush" xstyle={styles.popup}>
        {open ? <Command>
          <CommandInput autoFocus aria-label={t("kickoff:whoPicker.searchAgents")} placeholder={t("kickoff:whoPicker.searchAgents")} />
          <CommandList className={sx(styles.list)}>
            <CommandEmpty>{t("kickoff:whoPicker.noAgentsFound")}</CommandEmpty>
            <CommandItem value="me" keywords={[t("kickoff:kickoffSourceWho.me")]} onSelect={() => {
              props.onWhoChange("me");
              setOpen(false);
            }}>{t("kickoff:kickoffSourceWho.me")}</CommandItem>
            {props.agents.map((candidate) => <CommandItem
              key={candidate.id} value={candidate.id}
              keywords={[candidate.name, candidate.description ?? "", getAgentDisplayName(candidate), getAgentDisplayDescription(candidate)]}
              onSelect={() => {
                props.onWhoChange("agent");
                props.onAgentChange(candidate.id);
                setOpen(false);
              }}
            >
              <span className={sx(styles.label)}>
                <AgentAvatar agent={candidate} size="xs" aria-label={null} />
                <span className={sx(styles.optionCopy)}>
                  <span>{getAgentDisplayName(candidate)}</span>
                  {getAgentDisplayDescription(candidate) ? <span className={sx(styles.description)}>{getAgentDisplayDescription(candidate)}</span> : null}
                </span>
              </span>
            </CommandItem>)}
          </CommandList>
        </Command> : null}
      </PopoverContent>
    </Popover>
  );
}

const styles = stylex.create({
  trigger: { justifyContent: "space-between", minWidth: 0 },
  label: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"], minWidth: 0 },
  name: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  chevron: { width: 16, height: 16, flexShrink: 0, color: vars["--ads-color-text-muted"] },
  popup: { width: "var(--anchor-width)", maxWidth: "var(--available-width)", overflow: "hidden" },
  list: { maxHeight: "min(17.5rem, calc(var(--available-height) - 4rem))" },
  optionCopy: { display: "grid", gap: vars["--ads-space-4"], minWidth: 0, overflowWrap: "anywhere" },
  description: { color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"] },
});
