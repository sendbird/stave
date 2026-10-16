import { i18n, useTranslation } from "@/i18n";
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@/components/ads/components/Button";
import { TextField } from "@/components/ads/components/TextField";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui";
import { agentInitials } from "@/lib/agents/agent-appearance";
import { agentIconLabel, getAgentIcon, matchAgentIcons } from "@/lib/agents/agent-icons";
import { getAgentDisplayName } from "@/lib/agents/display";
import type { AgentConfig } from "@/lib/agents/schema";
import { AgentAvatar } from "./AgentAvatar";

/**
 * The avatar icon field of the agent editor: a trigger showing the avatar as it
 * will look, opening a searchable grid of the catalog icons with "Initials" as
 * the first cell. Initials stays in the grid whatever the search, so the way
 * back to no icon is always one click. `onChange(undefined)` means initials.
 */
export function AgentIconChooser(props: {
  agent: Pick<AgentConfig, "id" | "name" | "appearance">;
  value: string | undefined;
  onChange: (icon: string | undefined) => void;
}) {
  useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = getAgentIcon(props.value);
  const matches = useMemo(() => matchAgentIcons(query), [query, i18n.language]);
  const initialsLabel = i18n.t("agents:agentIconChooser.initials");
  const currentLabel = current ? agentIconLabel(current) : initialsLabel;
  const title = i18n.t("agents:agentIconChooser.title");
  const searchLabel = i18n.t("agents:agentIconChooser.search");
  const setOpenAndReset = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  };
  const choose = (icon: string | undefined) => {
    props.onChange(icon);
    setOpenAndReset(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpenAndReset}>
      <PopoverTrigger
        render={
          <Button
            variant="secondary"
            size="sm"
            aria-label={i18n.t("agents:agentIconChooser.trigger", { value1: currentLabel })}
            xstyle={styles.trigger}
          />
        }
      >
        <AgentAvatar agent={props.agent} size="xs" aria-label={null} />
        <span>{currentLabel}</span>
        <ChevronDown aria-hidden className={sx(styles.chevron)} />
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={title} xstyle={styles.popup}>
        <TextField
          size="sm"
          controlOnly
          autoFocus
          aria-label={searchLabel}
          placeholder={searchLabel}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Enter takes the first match, so a search can be finished from the keyboard.
            if (event.key === "Enter" && !event.nativeEvent.isComposing && matches[0]) {
              event.preventDefault();
              choose(matches[0].id);
            }
          }}
        />
        <div role="group" aria-label={i18n.t("agents:agentIconChooser.group")} className={sx(styles.grid)}>
          <Tooltip content={initialsLabel}>
            <Button
              variant="quiet"
              size="sm"
              iconOnly
              aria-label={initialsLabel}
              aria-pressed={!current}
              xstyle={[styles.cell, styles.initialsCell, !current && styles.cellSelected]}
              onClick={() => choose(undefined)}
            >
              {agentInitials(getAgentDisplayName(props.agent))}
            </Button>
          </Tooltip>
          {matches.map((entry) => {
            const label = agentIconLabel(entry);
            const selected = current?.id === entry.id;
            return (
              <Tooltip key={entry.id} content={label}>
                <Button
                  variant="quiet"
                  size="sm"
                  iconOnly
                  aria-label={label}
                  aria-pressed={selected}
                  xstyle={[styles.cell, selected && styles.cellSelected]}
                  onClick={() => choose(entry.id)}
                >
                  <entry.icon aria-hidden />
                </Button>
              </Tooltip>
            );
          })}
        </div>
        {matches.length === 0 ? (
          <p role="status" className={sx(styles.empty)}>
            {i18n.t("agents:agentIconChooser.empty")}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

const CELL = 32;
const COLUMNS = 8;
const GAP = 4;

const styles = stylex.create({
  trigger: { gap: vars["--ads-space-8"], paddingInlineStart: vars["--ads-space-4"] },
  chevron: { width: 16, height: 16, flexShrink: 0, color: vars["--ads-color-text-muted"] },
  // Sized by the grid: eight cells across, and the search field takes that width.
  popup: { inlineSize: "max-content", maxInlineSize: "var(--available-width)", gap: vars["--ads-space-12"] },
  grid: {
    display: "grid",
    gridTemplateColumns: `repeat(${COLUMNS}, ${CELL}px)`,
    gap: GAP,
  },
  cell: { width: CELL, height: CELL, color: vars["--ads-color-text"] },
  initialsCell: {
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    textTransform: "uppercase",
  },
  /**
   * Selection is the soft wash plus an inset ring; the glyph and the initials
   * keep the body ink. The theme accent is not used here: on the soft wash it
   * measured 2.15:1 in Ayu Light, while body ink stays above 4.5:1 and the
   * `--muted-foreground` ring above 3:1 against both the wash and the popover
   * in every built-in theme (`tests/agent-appearance.test.tsx`).
   */
  cellSelected: {
    backgroundColor: vars["--ads-color-accent-soft"],
    boxShadow: `inset 0 0 0 ${vars["--ads-ring-width-sm"]} ${vars["--ads-color-border-strong"]}`,
  },
  empty: {
    margin: 0,
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
});
