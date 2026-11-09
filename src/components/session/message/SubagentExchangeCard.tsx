import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, FileText, GitBranch, MessageSquare } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { formatCost, formatDuration } from "@/i18n/format";
import { Button } from "@/components/aui/components/Button";
import { RunMonitor, runStyles } from "@/components/aui/components/RunMonitor";
import type { AgentStepState } from "@/components/aui/components/agent-state";
import { sx } from "@/components/aui/utils/stylex";
import { AgentIdentity } from "@/components/delegation/AgentIdentity";
import { DelegateRoute } from "@/components/delegation/DelegateRoute";
import { ExchangeDetail } from "@/components/delegation/ExchangeDetail";
import { isDelegationExchangeLive, resolveExchangeElapsedMs, type DelegationExchange } from "@/lib/delegation/exchange";
import { exchangeStatusToWorkState, type ExchangeStatus } from "@/lib/delegation/format";
import { subagentCardStyles as styles } from "./subagent-card.styles";

/**
 * Each exchange status as the run lifecycle `RunMonitor` draws. Only the
 * running states are live (spinner in the "now" well); a subagent waiting on a
 * person reads as awaiting approval, and `workState` keeps its own mark.
 */
const RUN_STATE_OF: Readonly<Record<ExchangeStatus, AgentStepState>> = {
  queued: "queued", running: "running", waiting: "pending", needs_user: "approval",
  returned: "completed", failed: "failed", timed_out: "failed", cancelled: "canceled", unresolved: "interrupted",
};

/**
 * One subagent as the design system's run object (AUI `RunMonitor`): a live
 * subagent shows what it reported last in the "now" well with its observed
 * clock; a settled one shows what came back. Both use the `card` variant (the
 * chat-result object), so cards side by side share one head, body and footer;
 * `recap` lays its actions beside the text and does not fit a grid column.
 * The full exchange (the same detail the inspector shows) opens under the card.
 */
export function SubagentExchangeCard(props: {
  exchange: DelegationExchange;
  nowMs: number;
  status: string;
  preview: string;
  extraActions?: ReactNode;
  statusNote?: string;
}) {
  useTranslation();
  const { exchange } = props;
  const live = isDelegationExchangeLive(exchange);
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const elapsed = resolveExchangeElapsedMs(exchange, props.nowMs);
  const progress = exchange.outcome.progress ?? [];
  const cost = exchange.outcome.spend?.totalCostUsd;
  const duration = elapsed === null ? null : formatDuration(elapsed);
  // The head names who ran it; measured figures sit in the footer readout, where
  // the monitor puts its own ("3 / 5"), so the meta line stays one line.
  const identity = <span className={sx(styles.meta)}>
    <AgentIdentity compact size="caption" {...exchange.identity} role={undefined} />
    <DelegateRoute exchange={exchange} />
  </span>;
  const figures = [!live ? duration : null, cost !== undefined ? formatCost(cost, "USD") : null].filter((value) => value !== null);
  const disclosure = <Button size="2xs" variant="quiet" aria-expanded={expanded} aria-controls={detailId}
    onClick={() => setExpanded(!expanded)}>
    {expanded ? i18n.t("session:subagentCard.collapseResult") : i18n.t("session:subagentCard.viewResult")}
    {expanded ? <ChevronDown aria-hidden className={sx(styles.chevron)} /> : <ChevronRight aria-hidden className={sx(styles.chevron)} />}
  </Button>;
  // History is the subagent's own narration, not proof of finished steps, so it
  // is not drawn as the monitor's done-marked step list.
  const history = progress.length > 1 ? <ul className={sx(styles.history)} aria-label={i18n.t("session:subagentCard.reportedHistory")}>
    {progress.slice(0, -1).slice(-2).map((text, index) => <li key={index} className={sx(styles.historyItem)}>
      <MessageSquare className={sx(styles.icon)} aria-hidden="true" /><span className={sx(styles.historyText)}>{text}</span>
    </li>)}
  </ul> : null;
  return <article className={sx(styles.item, expanded && styles.itemExpanded)} data-testid="exchange-row" data-exchange-id={exchange.id}
    data-exchange-kind={exchange.kind} data-exchange-status={exchange.outcome.status} data-expanded={expanded || undefined}>
    <RunMonitor title={exchange.title} status={RUN_STATE_OF[exchange.outcome.status]} statusLabel={props.status}
      workState={exchangeStatusToWorkState(exchange.outcome.status)} xstyle={styles.monitor} variant="card"
      icon={live ? <GitBranch aria-hidden className={sx(styles.tileIcon)} /> : <FileText aria-hidden className={sx(styles.tileIcon)} />} meta={identity}
      current={live ? { key: progress.length, label: <span title={props.preview}>{props.preview}</span>, elapsed: duration ?? undefined } : undefined}
      actions={props.extraActions} trailingActions={<span className={sx(styles.trailing)}>{figures.length ? <span className={sx(runStyles.clock)}>{figures.join(" · ")}</span> : null}{disclosure}</span>}>
      {live ? history : <p className={sx(styles.summary)}>{props.preview}</p>}
    </RunMonitor>
    {expanded ? <div id={detailId} className={sx(styles.detail)}>
      <ExchangeDetail exchange={{ ...exchange, actions: [] }} nowMs={props.nowMs} resultFirst statusNote={props.statusNote} />
    </div> : null}
    {props.statusNote && !expanded ? <p role="status" className={sx(styles.note)}>{props.statusNote}</p> : null}
  </article>;
}
