import { memo, useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { surfaceChrome } from "@/components/ads/recipes/surface-chrome";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import { TurnActivityStatusIcon } from "@/components/session/turn-activity-status-icon";
import type {
  TurnActivityIconKey,
  TurnActivityRowStatus,
} from "@/components/session/turn-activity.utils";
import {
  resolveExchangeElapsedMs,
  type DelegationActionId,
  type DelegationExchange,
} from "@/lib/delegation/exchange";
import {
  describeDeadline,
  describeExchangeStatus,
  formatExchangeDuration,
  type ExchangeStatus,
} from "@/lib/delegation/format";
import { AgentIdentity } from "./AgentIdentity";
import { ExchangeDetail } from "./ExchangeDetail";
import { delegationStyles as styles } from "./delegation.styles";

/**
 * The exchange vocabulary onto the shelf's status glyphs. `cancelled` and
 * `unresolved` borrow the inert queued circle and rename themselves for
 * screen readers rather than claiming a check or an alert.
 */
const ROW_STATUS: Record<ExchangeStatus, TurnActivityRowStatus> = {
  queued: "pending",
  running: "running",
  returned: "completed",
  failed: "failed",
  timed_out: "failed",
  cancelled: "pending",
  unresolved: "pending",
};

const ROW_ICON: Record<DelegationExchange["kind"], TurnActivityIconKey> = {
  advisor: "advisor",
  worker: "subagent",
  "child-task": "subagent",
  subagent: "subagent",
};

export interface ExchangeRowProps {
  exchange: DelegationExchange;
  nowMs: number;
  onInspect?: (exchange: DelegationExchange) => void;
  onAction?: (action: DelegationActionId, exchange: DelegationExchange) => void;
  /** Controlled expansion; omit to let the row own it. */
  expanded?: boolean;
  defaultExpanded?: boolean;
  onToggle?: (expanded: boolean) => void;
  /** Draws the tree rail for a row nested under the primary. */
  nested?: boolean;
  /** Wrap title and ask instead of clipping them to one line. */
  expandCopy?: boolean;
  /** Extra detail sections, forwarded to `ExchangeDetail`. */
  detailChildren?: ReactNode;
  extraActions?: ReactNode;
  statusNote?: string;
  busy?: boolean;
  "data-testid"?: string;
}

/**
 * One line per delegation: status glyph · role/identity · one-line ask ·
 * elapsed or deadline · chevron. Expands inline into `ExchangeDetail`, so the
 * live shelf, the panel and the log all open the same body.
 */
export const ExchangeRow = memo(function ExchangeRow(props: ExchangeRowProps) {
  const { exchange, nowMs } = props;
  const [ownExpanded, setOwnExpanded] = useState(props.defaultExpanded ?? false);
  const expanded = !props.onInspect && (props.expanded ?? ownExpanded);
  const detailId = useId();
  const status = describeExchangeStatus(exchange.outcome.status);
  const live = !status.settled;
  // The advisor row is the shelf's entry point to the archived consult log.
  const opensConsultLog =
    exchange.kind === "advisor" &&
    exchange.actions.some((action) => action.id === "open-log");
  const elapsedMs = resolveExchangeElapsedMs(exchange, nowMs);
  const deadline =
    live && exchange.timing.deadlineAt !== undefined
      ? describeDeadline({ deadlineAtMs: exchange.timing.deadlineAt, nowMs })
      : null;
  const toggle = () => {
    const next = !expanded;
    if (props.expanded === undefined) {
      setOwnExpanded(next);
    }
    props.onToggle?.(next);
  };

  return (
    <div
      className={sx(
        styles.row,
        expanded && styles.rowExpanded,
        props.nested && styles.rowNested,
      )}
      data-testid={props["data-testid"] ?? "exchange-row"}
      data-copy={props.expandCopy ? "expanded" : undefined}
      data-exchange-id={exchange.id}
      data-exchange-kind={exchange.kind}
      data-exchange-status={exchange.outcome.status}
    >
      <AdsButton
        layout="host"
        type="button"
        aria-expanded={props.onInspect ? undefined : expanded}
        aria-haspopup={props.onInspect ? "dialog" : undefined}
        aria-controls={props.onInspect ? undefined : detailId}
        xstyle={[
          surfaceChrome.quietIconButton,
          focusRing.ring,
          transition.control,
          styles.rowHeader,
        ]}
        title={`${exchange.title} · ${status.label} — ${exchange.ask}`}
        data-turn-activity-opens={opensConsultLog ? "advisor-consult-log" : undefined}
        onClick={() => props.onInspect ? props.onInspect(exchange) : toggle()}
      >
        <span className={sx(styles.rowStatusSlot)}>
          <TurnActivityStatusIcon
            status={ROW_STATUS[exchange.outcome.status]}
            iconKey={ROW_ICON[exchange.kind]}
            label={status.label}
          />
        </span>
        <span className={sx(styles.rowBody)}>
          <span className={sx(styles.rowTitleLine)}>
            <span
              className={sx(
                styles.rowTitle,
                props.expandCopy && styles.rowTitleExpanded,
                exchange.outcome.status === "returned" && styles.rowTitleDone,
              )}
            >
              {exchange.title}
            </span>
            <AgentIdentity
              compact
              providerId={exchange.identity.providerId}
              model={exchange.identity.model}
              effort={exchange.identity.effort}
              modelEvidence={exchange.identity.modelEvidence}
            />
          </span>
          <span
            className={sx(
              styles.rowAsk,
              props.expandCopy && styles.rowAskExpanded,
            )}
          >
            {exchange.ask}
          </span>
        </span>
        <span className={sx(styles.rowAside)}>
          {elapsedMs !== null ? (
            <span className={sx(styles.rowElapsed)}>
              <VisuallyHidden>
                {status.label}, {formatExchangeDuration(elapsedMs)} elapsed
              </VisuallyHidden>
              <span aria-hidden="true">{formatExchangeDuration(elapsedMs)}</span>
            </span>
          ) : null}
          {deadline ? (
            <span
              className={sx(
                styles.rowDeadline,
                deadline.passed && styles.rowDeadlinePassed,
              )}
            >
              {deadline.label}
            </span>
          ) : null}
        </span>
        {expanded ? (
          <ChevronDown className={sx(styles.rowChevron)} aria-hidden="true" />
        ) : (
          <ChevronRight className={sx(styles.rowChevron)} aria-hidden="true" />
        )}
      </AdsButton>
      {expanded ? (
        <div id={detailId} className={sx(styles.rowDetailHost)}>
          <ExchangeDetail
            exchange={exchange}
            nowMs={nowMs}
            onAction={props.onAction}
            extraActions={props.extraActions}
            statusNote={props.statusNote}
            busy={props.busy}
          >
            {props.detailChildren}
          </ExchangeDetail>
        </div>
      ) : null}
    </div>
  );
});
