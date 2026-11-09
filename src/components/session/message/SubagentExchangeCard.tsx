import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Clock3, FileText, GitBranch, MessageSquare } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { formatCost, formatDuration } from "@/i18n/format";
import { Button } from "@/components/aui/components/Button";
import { Badge } from "@/components/aui/components/Badge";
import { StateMark } from "@/components/aui/components/StateMark";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { surfaceChrome } from "@/components/aui/recipes/surface-chrome";
import { sx } from "@/components/aui/utils/stylex";
import { AgentIdentity } from "@/components/delegation/AgentIdentity";
import { DelegateRoute } from "@/components/delegation/DelegateRoute";
import { ExchangeDetail } from "@/components/delegation/ExchangeDetail";
import { isDelegationExchangeLive, resolveExchangeElapsedMs, type DelegationExchange } from "@/lib/delegation/exchange";
import { describeExchangeStatus, exchangeStatusToWorkState } from "@/lib/delegation/format";
import { subagentCardStyles as styles } from "./subagent-card.styles";

/** Same exchange and full answer as the inspector, presented in the reading column. */
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
  const [folded, setFolded] = useState(false);
  const detailId = useId();
  const liveId = useId();
  const elapsed = resolveExchangeElapsedMs(exchange, props.nowMs);
  const progress = exchange.outcome.progress ?? [];
  const cost = exchange.outcome.spend?.totalCostUsd;
  const tone = describeExchangeStatus(exchange.outcome.status).tone;
  const state = exchangeStatusToWorkState(exchange.outcome.status);
  const Icon = live ? GitBranch : FileText;
  const disclosure = expanded ? i18n.t("session:subagentCard.collapseResult") : i18n.t("session:subagentCard.viewResult");
  const duration = elapsed === null ? null : <span className={sx(styles.duration)}><Clock3 className={sx(styles.icon)} aria-hidden="true" />{formatDuration(elapsed)}</span>;
  return <article className={sx(styles.tray)} data-testid="exchange-row" data-exchange-id={exchange.id} data-exchange-kind={exchange.kind} data-exchange-status={exchange.outcome.status}>
    <div className={sx(styles.face)}>
      <Button layout="host" type="button" xstyle={[surfaceChrome.quietIconButton, focusRing.ring, styles.trigger]}
        aria-expanded={live ? !folded : expanded} aria-controls={live ? liveId : detailId}
        onClick={() => live ? setFolded(!folded) : setExpanded(!expanded)}>
        <span className={sx(styles.head)}>
          <span className={sx(styles.iconSlot)}><Icon className={sx(styles.icon)} aria-hidden="true" /></span>
          <span className={sx(styles.identity)}><span className={sx(styles.title)}>{exchange.title}</span>
            <span className={sx(styles.meta)}><AgentIdentity compact {...exchange.identity} role={undefined} /><DelegateRoute exchange={exchange} /></span>
          </span>
          <Badge size="sm" variant="soft" tone={tone}>{props.status}</Badge>
          {live ? (folded ? <ChevronRight className={sx(styles.icon)} aria-hidden="true" /> : <ChevronDown className={sx(styles.icon)} aria-hidden="true" />) : null}
        </span>
        {!live ? <><span className={sx(styles.preview)}>{props.preview}</span><span className={sx(styles.foot)}>{duration}{cost !== undefined ? formatCost(cost, "USD") : null}
          <span className={sx(styles.disclosure)}>{disclosure}{expanded ? <ChevronDown className={sx(styles.icon)} aria-hidden="true" /> : <ChevronRight className={sx(styles.icon)} aria-hidden="true" />}</span>
        </span></> : null}
      </Button>
      {live && !folded ? <div id={liveId} className={sx(styles.liveBody)}>
        <div className={sx(styles.well)}><StateMark state={state} size="sm" /><span className={sx(styles.current)} title={props.preview}>{props.preview}</span>{duration}</div>
        {progress.length > 1 ? <ul className={sx(styles.history)} aria-label={i18n.t("session:subagentCard.reportedHistory")}>
          {progress.slice(0, -1).slice(-2).map((text, index) => <li key={index} className={sx(styles.historyItem)}><MessageSquare className={sx(styles.icon)} aria-hidden="true" /><span className={sx(styles.historyText)}>{text}</span></li>)}
        </ul> : null}
      </div> : null}
      {expanded ? <div id={detailId} className={sx(styles.detail)}><ExchangeDetail exchange={{ ...exchange, actions: [] }} nowMs={props.nowMs} resultFirst statusNote={props.statusNote} /></div> : null}
    </div>
    {live || props.extraActions ? <div className={sx(styles.actions)}>{props.extraActions}{live ? <Button size="sm" variant="quiet" aria-expanded={expanded} aria-controls={detailId} onClick={() => setExpanded(!expanded)}>{disclosure}</Button> : null}{live && cost !== undefined ? <span className={sx(styles.meta)}>{formatCost(cost, "USD")}</span> : null}</div> : null}
    {!live && !props.extraActions ? <p className={sx(styles.note)}>{exchange.outcome.status === "returned" ? i18n.t("session:subagentCard.returnedNote") : props.status}</p> : null}
    {props.statusNote && !expanded ? <p role="status" className={sx(styles.note)}>{props.statusNote}</p> : null}
  </article>;
}
