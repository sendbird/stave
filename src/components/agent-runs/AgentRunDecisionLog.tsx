import { i18n, useTranslation } from "@/i18n";
import { useMemo, useState } from "react";
import { BellRing, History, RotateCcw, Route, SlidersHorizontal, UserRoundCog, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { formatTime } from "@/i18n/format";
import type { AgentRun, AgentRunEvent } from "@/lib/agent-runs/domain";
import { projectAgentRunDecisionLog, type AgentRunDecisionKind } from "@/lib/agent-runs/decision-log";
import { agentRunStyles as styles } from "./agent-runs.styles";

/** Entries drawn before "Show all"; the newest are the ones a reader checks first. */
export const DECISION_LOG_VISIBLE = 6;

const KIND_ICONS: Record<AgentRunDecisionKind, LucideIcon> = {
  route: Route,
  resource: SlidersHorizontal,
  account: UserRoundCog,
  wait: BellRing,
  retry: RotateCcw,
};

const formatClock = (iso: string) => formatTime(new Date(iso), { hour: "2-digit", minute: "2-digit" });

/**
 * What the run decided by itself, oldest first: each turn's route, adaptive
 * model or effort changes, account switches, waits and stage retries. Drawn
 * for a one-stage run too, which has no stage list or dividers to carry them.
 */
export function AgentRunDecisionLog(props: { detail: { agentRun: AgentRun; events: readonly AgentRunEvent[] } }) {
  useTranslation();
  const entries = useMemo(() => projectAgentRunDecisionLog(props.detail), [props.detail, i18n.language]);
  const [showAll, setShowAll] = useState(false);
  if (entries.length === 0) return null;
  const hidden = showAll ? 0 : Math.max(0, entries.length - DECISION_LOG_VISIBLE);
  const visible = hidden > 0 ? entries.slice(hidden) : entries;
  return (
    <section className={sx(styles.section, styles.sectionRule)} aria-label={i18n.t("agentRuns:decisionLog.ariaLabel")} data-testid="agent-run-decision-log">
      <div className={sx(styles.sectionHeader)}>
        <History aria-hidden className={sx(styles.sectionIcon)} />
        <h3 className={sx(styles.sectionTitle)}>{i18n.t("agentRuns:decisionLog.title")}</h3>
        <span className={sx(styles.sectionAside)}>{i18n.t("agentRuns:decisionLog.count", { count: entries.length })}</span>
      </div>
      <ol className={sx(styles.checkList)}>
        {visible.map((entry) => {
          const Icon = KIND_ICONS[entry.kind];
          return (
            <li key={entry.id} className={sx(styles.check)} data-decision-kind={entry.kind} data-attention={entry.attention ? "true" : undefined}>
              <span className={sx(styles.checkMark)} aria-hidden>
                <Icon className={sx(styles.iconSm, entry.attention ? styles.toneWaiting : styles.muted)} />
              </span>
              <span className={sx(styles.checkText)} title={entry.note ?? undefined}>
                {entry.text}
                {entry.detail ? <span className={sx(styles.checkNote, styles.decisionDetail)}>{entry.detail}</span> : null}
              </span>
              <time className={sx(styles.checkState, styles.tabular)} dateTime={entry.at}>{formatClock(entry.at)}</time>
            </li>
          );
        })}
      </ol>
      {entries.length > DECISION_LOG_VISIBLE ? (
        <div className={sx(styles.actions)}>
          <Button variant="quiet" size="xs" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)}>
            {showAll
              ? i18n.t("agentRuns:decisionLog.showLatest")
              : i18n.t("agentRuns:decisionLog.showAll", { count: entries.length })}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
