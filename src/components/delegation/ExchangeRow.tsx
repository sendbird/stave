import { i18n, useTranslation } from "@/i18n";
import { formatDuration } from "@/i18n/format";
import { memo, useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button as AuiButton } from "@/components/aui/components/Button";
import { VisuallyHidden } from "@/components/aui/components/VisuallyHidden";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { StateMark } from "@/components/aui/components/StateMark";
import { surfaceChrome } from "@/components/aui/recipes/surface-chrome";
import { transition } from "@/components/aui/recipes/transition";
import { sx } from "@/components/aui/utils/stylex";
import {
  resolveExchangeElapsedMs,
  type DelegationActionId,
  type DelegationExchange,
} from "@/lib/delegation/exchange";
import {
  describeDeadline,
  describeExchangeStatus,
  exchangeStatusToWorkState,
} from "@/lib/delegation/format";
import { ExchangeIdentity } from "./ExchangeIdentity";
import { ExchangeDetail } from "./ExchangeDetail";
import { delegationStyles as styles } from "./delegation.styles";

export interface ExchangeRowProps {
  exchange: DelegationExchange;
  nowMs: number;
  onInspect?: (exchange: DelegationExchange) => void;
  onAction?: (action: DelegationActionId, exchange: DelegationExchange) => void;
  /** Controlled expansion; omit to let the row own it. */
  expanded?: boolean;
  defaultExpanded?: boolean;
  onToggle?: (expanded: boolean) => void;
  /** Wrap title and ask instead of clipping them to one line. */
  expandCopy?: boolean;
  /** Transcript rows preview the return and lead with it in details. */
  resultFirst?: boolean;
  preview?: string;
  /** Extra detail sections, forwarded to `ExchangeDetail`. */
  detailChildren?: ReactNode;
  extraActions?: ReactNode;
  statusNote?: string;
  busy?: boolean;
  "data-testid"?: string;
}

/**
 * One line per delegation: status glyph · role/identity · one-line ask ·
 * elapsed or deadline · chevron. The glyph is the shared work state
 * (`exchangeStatusToWorkState`), so a delegate waiting on the user wears the
 * same mark here as in the Subagents list and the tab. Expands inline into
 * `ExchangeDetail`, so the live shelf, the panel and the log all open the
 * same body.
 */
export const ExchangeRow = memo(function ExchangeRow(props: ExchangeRowProps) {
  useTranslation();
  const { exchange, nowMs } = props;
  const [ownExpanded, setOwnExpanded] = useState(props.defaultExpanded ?? false);
  const expanded = !props.onInspect && (props.expanded ?? ownExpanded);
  const detailId = useId();
  const status = describeExchangeStatus(exchange.outcome.status);
  const live = !status.settled;
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
      className={sx(styles.row, expanded && styles.rowExpanded)}
      data-testid={props["data-testid"] ?? "exchange-row"}
      data-copy={props.expandCopy ? "expanded" : undefined}
      data-exchange-id={exchange.id}
      data-exchange-kind={exchange.kind}
      data-exchange-status={exchange.outcome.status}
    >
      <AuiButton
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
        onClick={() => props.onInspect ? props.onInspect(exchange) : toggle()}
      >
        <span className={sx(styles.rowStatusSlot)}>
          <StateMark
            state={exchangeStatusToWorkState(exchange.outcome.status)}
            size="md"
            label={status.label}
          />
        </span>
        <span className={sx(styles.rowBody)}>
          <span className={sx(styles.rowTitleLine)}>
            <span
              className={sx(
                styles.rowTitle,
                props.expandCopy && styles.rowTitleExpanded,
                !props.resultFirst && exchange.outcome.status === "returned" && styles.rowTitleDone,
              )}
            >
              {exchange.title}
            </span>
            <ExchangeIdentity compact={!props.resultFirst} exchange={exchange} />
          </span>
          <span
            className={sx(
              styles.rowAsk,
              props.expandCopy && styles.rowAskExpanded,
            )}
          >
            {props.preview ?? exchange.ask}
          </span>
        </span>
        <span className={sx(styles.rowAside)}>
          {elapsedMs !== null ? (
            <span className={sx(styles.rowElapsed)}>
              <VisuallyHidden>
                {status.label}, {formatDuration(elapsedMs, { tenths: true })} {i18n.t("agentRuns:exchangeRow.exchangeRow")}</VisuallyHidden>
              <span aria-hidden="true">{formatDuration(elapsedMs, { tenths: true })}</span>
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
      </AuiButton>
      {expanded ? (
        <div id={detailId} className={sx(styles.rowDetailHost)}>
          <ExchangeDetail
            exchange={exchange}
            nowMs={nowMs}
            resultFirst={props.resultFirst}
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
