import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import { StateMark } from "@/components/ads/components/StateMark";
import { WORK_STATE } from "@/components/ads/components/state-vocabulary";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { useNow } from "@/components/agent-runs/useAgentRun";
import { CollapsibleResponse } from "@/components/ai-elements/collapsible-response";
import { ExchangeStatusBadge } from "@/components/delegation/ExchangeStatusBadge";
import { ActionButton } from "@/components/system/ActionButton";
import { RelativeTime } from "@/components/system/RelativeTime";
import { formatDuration } from "@/i18n/format";
import {
  isDelegationExchangeLive,
  resolveExchangeElapsedMs,
  type DelegationExchange,
} from "@/lib/delegation/exchange";
import {
  countSubagentList,
  SUBAGENT_LIST_WORK_STATE,
  subagentNeedsUser,
} from "@/lib/delegation/subagent-list";
import { subagentLineState, subagentResultLine } from "@/lib/delegation/subagent-summary";

/** One row of the Subagents list, already resolved by its container. */
export interface SubagentListItem {
  exchange: DelegationExchange;
  /** Who the subagent is: its agent, model or label. */
  who: string;
  /** What it was asked to do. */
  what: string;
  canStop: boolean;
  busy: boolean;
  error?: string;
  onOpen?: () => void;
  onStop?: () => void;
  onView?: () => void;
}

/**
 * The Subagents list, free of the store so a test can render it: a summary
 * that opens the first child waiting on the user in one click, then the rows
 * in the order `orderSubagentList` gives them (children that need the user
 * first). `nowMs` fixes the clock for a deterministic render; live rows
 * otherwise tick their elapsed time each second.
 */
export function SubagentsList(props: { items: readonly SubagentListItem[]; nowMs?: number }) {
  useTranslation();
  return (
    <>
      <SubagentsSummary items={props.items} />
      <ul aria-label={i18n.t("session:subagentsSection.ariaLabel")} className={sx(styles.list)} data-testid="subagents-list">
        {props.items.map((item) => (
          <SubagentRow key={item.exchange.id} item={item} nowMs={props.nowMs} />
        ))}
      </ul>
    </>
  );
}

/**
 * The parent's view of its children in one line, `1 needs you · 3 running ·
 * 2 done`, with the first child that waits on the user one click away.
 */
function SubagentsSummary(props: { items: readonly SubagentListItem[] }) {
  useTranslation();
  const counts = countSubagentList(props.items.map((item) => item.exchange));
  const segments = [
    counts.needsYou > 0 ? i18n.t("session:subagentsSection.countNeedsYou", { count: counts.needsYou }) : null,
    counts.running > 0 ? i18n.t("session:subagentsSection.countRunning", { value: counts.running }) : null,
    counts.done > 0 ? i18n.t("agentRuns:subagentSummary.folded.done", { count: counts.done }) : null,
    counts.failed > 0 ? i18n.t("agentRuns:subagentSummary.folded.failed", { count: counts.failed }) : null,
    counts.stopped > 0 ? i18n.t("agentRuns:subagentSummary.folded.stopped", { count: counts.stopped }) : null,
  ].filter((segment): segment is string => segment !== null);
  if (segments.length === 0) return null;
  const first = props.items.find((item) => item.onOpen && subagentNeedsUser(item.exchange));
  return (
    <div role="group" aria-label={i18n.t("session:subagentsSection.summaryLabel")} className={sx(styles.summary)}>
      <p className={sx(styles.summaryText)}>{segments.join(" · ")}</p>
      {first ? <OpenFirstNeedsYou item={first} /> : null}
    </div>
  );
}

/** One click to the child that waits on the user, named and marked by why. */
function OpenFirstNeedsYou(props: { item: SubagentListItem }) {
  useTranslation();
  const { item } = props;
  const state = SUBAGENT_LIST_WORK_STATE[subagentLineState(item.exchange)];
  const reason = item.exchange.outcome.progress?.at(-1) ?? item.exchange.outcome.error ?? WORK_STATE[state].label;
  return (
    <ActionButton
      size="md"
      weight="secondary"
      xstyle={[styles.target, styles.summaryOpen]}
      title={i18n.t("session:subagentsSection.openFirstNeedsYouTitle", { name: item.who, reason })}
      onClick={item.onOpen}
    >
      <StateMark state={state} size="xs" />
      <span className={sx(styles.summaryOpenLabel)}>
        {i18n.t("session:subagentsSection.openFirstNeedsYou", { name: item.who })}
      </span>
    </ActionButton>
  );
}

function SubagentRow(props: { item: SubagentListItem; nowMs?: number }) {
  useTranslation();
  const { item } = props;
  const { exchange } = item;
  const { error, result } = exchange.outcome;
  const live = isDelegationExchangeLive(exchange);
  // Stand-in timestamps (a turn rebuilt from saved messages) give no end time
  // and no ticking clock; the row shows only a duration the provider measured.
  const observed = exchange.timing.observed !== false;
  const endedAt = live || !observed ? undefined : exchange.timing.endedAt;
  // Row-local clock: a live row's elapsed time ticks each second, a settled
  // row only refreshes its "ago"; nothing else in the list re-renders.
  const clock = useNow(
    props.nowMs === undefined && observed && (live || endedAt !== undefined),
    live ? 1_000 : 30_000,
  );
  const now = props.nowMs ?? clock;
  const elapsedMs = resolveExchangeElapsedMs(exchange, now);
  const needsUser = subagentNeedsUser(exchange);
  const workState = SUBAGENT_LIST_WORK_STATE[subagentLineState(exchange)];
  // The answer renders like the conversation, and only once it is opened, so
  // a long list never parses every answer it folds away.
  const [answerOpen, setAnswerOpen] = useState(false);
  return (
    <li className={sx(styles.row)} data-subagent-kind={exchange.kind} data-needs-user={needsUser ? "true" : undefined}>
      <div className={sx(styles.head)}>
        {needsUser ? <StateMark state={workState} size="xs" label={WORK_STATE[workState].label} /> : null}
        <span className={sx(styles.who)}>{item.who}</span>
        <ExchangeStatusBadge
          status={exchange.outcome.status}
          suffix={elapsedMs === null ? undefined : formatDuration(elapsedMs)}
        />
        {endedAt !== undefined ? (
          <span className={sx(styles.when)}>
            <RelativeTime date={endedAt} now={new Date(now)} />
          </span>
        ) : null}
      </div>
      {item.what !== item.who ? <p className={sx(styles.what)}>{item.what}</p> : null}
      {exchange.outcome.progress?.at(-1) ? <p className={sx(styles.what)}>{exchange.outcome.progress.at(-1)}</p> : null}
      {subagentResultLine(exchange) ? <p className={sx(styles.what)} title={error ?? result}>{subagentResultLine(exchange)}</p> : null}
      {(error ?? result) && !live ? (
        <details
          className={sx(styles.answer)}
          onToggle={(event) => setAnswerOpen(event.currentTarget.open)}
        >
          <summary className={sx(styles.answerSummary)}>
            {error ? i18n.t("session:subagentsSection.subagentRow") : i18n.t("session:subagentsSection.subagentRow2")}
          </summary>
          {error ? (
            <p className={sx(styles.answerText)}>{error}</p>
          ) : answerOpen && result ? (
            <div className={sx(styles.answerBody)}>
              <CollapsibleResponse text={result} label={i18n.t("session:remaining.presentationCopy283", { v1: item.who })} />
            </div>
          ) : null}
        </details>
      ) : null}
      {item.error ? <p role="alert" className={sx(styles.error)}>{item.error}</p> : null}
      {item.onOpen || item.canStop || item.onView ? (
        <div className={sx(styles.actions)}>
          {item.onView ? (
            <ActionButton size="md" weight="quiet" xstyle={styles.target} onClick={item.onView}>
              {i18n.t("session:subagentsSection.subagentRow3")}</ActionButton>
          ) : null}
          {item.onOpen ? (
            <ActionButton size="md" weight="quiet" xstyle={styles.target} onClick={item.onOpen}>
              {i18n.t("session:subagentsSection.subagentRow4")}</ActionButton>
          ) : null}
          {item.canStop && item.onStop ? (
            <ActionButton size="md" weight="quiet" tone="danger" xstyle={styles.target} disabled={item.busy} onClick={item.onStop}>
              {i18n.t("session:subagentsSection.subagentRow5")}</ActionButton>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

const styles = stylex.create({
  summary: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    marginBlockEnd: vars["--ads-space-8"],
    minWidth: 0,
  },
  summaryText: {
    color: vars["--ads-color-text-muted"],
    flex: "1 1 auto",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
    minWidth: 0,
  },
  summaryOpen: { gap: vars["--ads-space-4"], maxWidth: "100%" },
  summaryOpenLabel: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  row: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minWidth: 0,
    paddingBlock: vars["--ads-space-8"],
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: vars["--ads-color-border-subtle"],
  },
  head: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  who: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  when: {
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    whiteSpace: "nowrap",
  },
  what: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
    overflowWrap: "anywhere",
  },
  answer: { minWidth: 0 },
  answerSummary: {
    cursor: "pointer",
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  answerBody: { minWidth: 0, marginBlockStart: vars["--ads-space-4"] },
  answerText: {
    margin: 0,
    marginBlockStart: vars["--ads-space-4"],
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text"],
  },
  error: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-danger-text"],
  },
  // Three controls do not fit a narrow rail on one line; they wrap instead of
  // cutting their labels.
  actions: { display: "flex", flexWrap: "wrap", columnGap: vars["--ads-space-8"] },
  // Row controls are used often from a narrow rail: keep a 40px target.
  target: { minBlockSize: 40 },
});
