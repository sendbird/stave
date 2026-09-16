import { useEffect, useState, type ReactNode } from "react";
import { sx } from "@/components/ads/utils/stylex";
import {
  countDelegationExchanges,
  formatDelegationCounts,
  isDelegationExchangeLive,
  type DelegationActionId,
  type DelegationExchange,
} from "@/lib/delegation/exchange";
import { formatExchangeDuration } from "@/lib/delegation/format";
import { ExchangeRow } from "./ExchangeRow";
import { delegationStyles as styles } from "./delegation.styles";

/**
 * Ticks once a second while something is live; an idle list pays nothing for
 * being mounted. Shared by the shelf block and the panel.
 */
export function useDelegationClock(active: boolean) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    setNowMs(Date.now());
    const handle = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);
    return () => {
      window.clearInterval(handle);
    };
  }, [active]);
  return nowMs;
}

/** Span from the earliest start to now (live) or the latest end (settled). */
export function resolveDelegationSpanMs(
  exchanges: readonly DelegationExchange[],
  nowMs: number,
): number | null {
  let start: number | null = null;
  let end: number | null = null;
  let live = false;
  for (const exchange of exchanges) {
    const startedAt = exchange.timing.startedAt;
    if (startedAt === null) {
      continue;
    }
    start = start === null ? startedAt : Math.min(start, startedAt);
    if (isDelegationExchangeLive(exchange)) {
      live = true;
    } else {
      const endedAt = exchange.timing.endedAt ?? startedAt;
      end = end === null ? endedAt : Math.max(end, endedAt);
    }
  }
  if (start === null) {
    return null;
  }
  const until = live ? Math.max(nowMs, start) : (end ?? start);
  return Math.max(0, until - start);
}

export interface DelegationsBlockProps {
  exchanges: readonly DelegationExchange[];
  nowMs: number;
  onAction?: (action: DelegationActionId, exchange: DelegationExchange) => void;
  /** Header title; counts and elapsed are appended. */
  title?: string;
  /** Hide the header (the panel draws its own). */
  showHeader?: boolean;
  /** Draw the tree rail under a primary row. */
  nested?: boolean;
  renderExtraActions?: (exchange: DelegationExchange) => ReactNode;
  statusNoteFor?: (exchange: DelegationExchange) => string | undefined;
  busyExchangeId?: string | null;
  /** Rows that open expanded on first render. */
  defaultExpandedIds?: ReadonlySet<string>;
  /**
   * Let title and ask wrap. The right-rail panel has height for this; the
   * docked shelf keeps each field to one ellipsized line.
   */
  expandCopy?: boolean;
  className?: string;
  /** Rendered after the rows, e.g. the agent tree. */
  children?: ReactNode;
  "data-testid"?: string;
}

/**
 * `Agents · 1 running · 2 done` and the rows under it. The one list every
 * surface renders for "what did this turn delegate": the shelf hosts it live,
 * the Delegations panel hosts it as history.
 */
export function DelegationsBlock(props: DelegationsBlockProps) {
  const { exchanges, nowMs } = props;
  if (exchanges.length === 0 && !props.children) {
    return null;
  }
  const counts = countDelegationExchanges(exchanges);
  const countsLabel = formatDelegationCounts(counts);
  const spanMs = resolveDelegationSpanMs(exchanges, nowMs);
  return (
    <section
      className={props.className}
      aria-label={props.title ?? "Agents"}
      data-testid={props["data-testid"] ?? "delegations-block"}
    >
      {props.showHeader !== false ? (
        <div className={sx(styles.blockHeader)}>
          <h3 className={sx(styles.blockTitle)}>
            {props.title ?? "Agents"}
            {countsLabel ? (
              <span className={sx(styles.blockCounts)}> · {countsLabel}</span>
            ) : null}
          </h3>
          {spanMs !== null ? (
            <span
              className={sx(styles.blockElapsed)}
              title="Elapsed across delegations"
            >
              {formatExchangeDuration(spanMs)}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className={sx(styles.blockList)}>
        {exchanges.map((exchange) => (
          <ExchangeRow
            key={exchange.id}
            exchange={exchange}
            nowMs={nowMs}
            nested={props.nested}
            expandCopy={props.expandCopy}
            onAction={props.onAction}
            defaultExpanded={props.defaultExpandedIds?.has(exchange.id)}
            extraActions={props.renderExtraActions?.(exchange)}
            statusNote={props.statusNoteFor?.(exchange)}
            busy={props.busyExchangeId === exchange.id}
          />
        ))}
      </div>
      {props.children}
    </section>
  );
}
