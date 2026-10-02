import { Fragment, type ReactNode } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { Button } from "@/components/ui/button";
import { CollapsibleResponse } from "@/components/ai-elements/collapsible-response";
import {
  resolveExchangeElapsedMs,
  type DelegationActionId,
  type DelegationExchange,
} from "@/lib/delegation/exchange";
import {
  describeAgentIdentity,
  describeDeadline,
  formatExchangeDuration,
} from "@/lib/delegation/format";
import { AgentIdentity } from "./AgentIdentity";
import { ExchangeStatusBadge } from "./ExchangeStatusBadge";
import { KeyValueGrid, type KeyValueItem } from "./KeyValueGrid";
import { StageTimeline } from "./StageTimeline";
import { delegationStyles as styles } from "./delegation.styles";

const SOURCE_COPY: Record<
  NonNullable<DelegationExchange["identity"]["source"]>,
  string
> = {
  auto: "Automatic routing",
  preset: "Preset",
  explicit: "Explicit model",
  "provider-default": "Provider default",
};

const ASK_LABEL: Record<DelegationExchange["kind"], string> = {
  "delegated-task": "Assignment",
  subagent: "Assignment",
};

const RESULT_LABEL: Record<DelegationExchange["kind"], string> = {
  "delegated-task": "Answer",
  subagent: "Outcome",
};

/** `120 in · 40 out · 10 cache read · $0.0123`. */
function formatSpend(spend: NonNullable<DelegationExchange["outcome"]["spend"]>): string {
  const cache = [
    spend.cacheReadTokens ? `${spend.cacheReadTokens} cache read` : null,
    spend.cacheCreationTokens ? `${spend.cacheCreationTokens} cache write` : null,
  ].filter(Boolean).join(" · ");
  const cost = spend.totalCostUsd === undefined ? "" : ` · $${spend.totalCostUsd.toFixed(4)}`;
  return `${spend.inputTokens ?? 0} in · ${spend.outputTokens ?? 0} out${cache ? ` · ${cache}` : ""}${cost}`;
}

export interface ExchangeDetailProps {
  exchange: DelegationExchange;
  nowMs: number;
  /** Finished execution views lead with the return and fold execution metadata. */
  resultFirst?: boolean;
  onAction?: (action: DelegationActionId, exchange: DelegationExchange) => void;
  /** Extra sections rendered after Spend and before Actions. */
  children?: ReactNode;
  /** Extra controls rendered in the Actions row. */
  extraActions?: ReactNode;
  /** Note under the status, e.g. why an action was refused. */
  statusNote?: string;
  /** Footnote under the spend grid. */
  spendFootnote?: string;
  /** Disables the action buttons while one is in flight. */
  busy?: boolean;
  "data-testid"?: string;
}

function Section(props: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className={sx(styles.section)} data-testid={props.testId}>
      <p className={sx(styles.label)}>{props.label}</p>
      {props.children}
    </div>
  );
}

/**
 * One detail body for every exchange. Finished inspectors lead with the return
 * and keep assignment, timeline, setup and spend under execution details. The
 * assignment and the answer render with the conversation's Markdown renderer.
 * Every subagent surface renders this, so a fact shown in one is shown — in
 * the same place — in the others.
 */
export function ExchangeDetail(props: ExchangeDetailProps) {
  const { exchange, nowMs } = props;
  const live =
    exchange.outcome.status === "running" ||
    exchange.outcome.status === "queued";
  const elapsedMs = resolveExchangeElapsedMs(exchange, nowMs);
  const deadline =
    live && exchange.timing.deadlineAt !== undefined
      ? describeDeadline({ deadlineAtMs: exchange.timing.deadlineAt, nowMs })
      : null;
  const primary = exchange.setup.primary;
  const errorText = exchange.outcome.error;
  const resultText = exchange.outcome.result;

  const setupItems: KeyValueItem[] = [];
  if (exchange.identity.modelEvidence) setupItems.push({ key: "modelEvidence", label: "Model source", value: exchange.identity.modelEvidence });
  setupItems.push({ key: "effortEvidence", label: "Effort source", value: exchange.identity.effort ? "Requested or configured; runtime execution not reported" : "Not reported" });
  if (exchange.setup.isolation) {
    setupItems.push({
      key: "isolation",
      label: "Isolation",
      value: exchange.setup.isolation ?? "Not reported",
    });
  }
  setupItems.push({
    key: "effort",
    label: "Effort",
    value: exchange.identity.effort
      ? describeAgentIdentity({ effort: exchange.identity.effort }).effortLabel
      : "Not reported",
  });
  if (exchange.setup.deadlineMs !== undefined) {
    setupItems.push({
      key: "deadline",
      label: "Deadline",
      value:
        exchange.setup.deadlineMs === undefined
          ? "Not reported"
          : formatExchangeDuration(exchange.setup.deadlineMs),
    });
  }
  if (exchange.identity.source) {
    setupItems.push({
      key: "selection",
      label: "Selection",
      value: SOURCE_COPY[exchange.identity.source],
    });
  }
  if (exchange.setup.attempt !== undefined) {
    setupItems.push({
      key: "attempt",
      label: "Attempt",
      value: String(exchange.setup.attempt + 1),
    });
  }
  if (exchange.setup.lifecycle) {
    setupItems.push({
      key: "lifecycle",
      label: "Lifecycle",
      value: exchange.setup.lifecycle,
    });
  }
  if (exchange.identity.rationale) {
    setupItems.push({
      key: "reason",
      label: "Reason",
      value: exchange.identity.rationale,
    });
  }

  const spend = exchange.outcome.spend;
  const hasSpend =
    spend !== undefined &&
    (spend.inputTokens !== undefined ||
      spend.outputTokens !== undefined ||
      spend.totalCostUsd !== undefined);

  const progress = (
    <Fragment>
      {exchange.outcome.progress && exchange.outcome.progress.length > 0 ? (
        <ul className={sx(styles.progressList)}>
          {exchange.outcome.progress.map((line, index) => (
            <li key={`${index}:${line}`} className={sx(styles.meta)}>
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </Fragment>
  );

  const diagnostics = (
    <Fragment>
      {exchange.timing.startedAt !== null ? (
        <Section label="Timeline">
          {exchange.timing.stages.length > 0 ? (
            <StageTimeline
              stages={exchange.timing.stages}
              startedAt={exchange.timing.startedAt}
            />
          ) : (
            <p className={sx(styles.meta)}>
              Started {new Date(exchange.timing.startedAt).toLocaleTimeString()}
              {exchange.timing.endedAt !== undefined
                ? ` · ended ${new Date(exchange.timing.endedAt).toLocaleTimeString()}`
                : live
                  ? " · still running"
                  : ""}
            </p>
          )}
        </Section>
      ) : null}

      {setupItems.length > 0 ? (
        <Section label="Setup">
          <KeyValueGrid items={setupItems} />
        </Section>
      ) : null}

      {hasSpend && spend ? (
        <Section label="Spend">
          <p className={sx(styles.gridValue)}>
            {formatSpend(spend)}
          </p>
          {props.spendFootnote ? (
            <p className={sx(styles.meta)}>{props.spendFootnote}</p>
          ) : null}
        </Section>
      ) : null}
    </Fragment>
  );

  return (
    <div
      className={sx(styles.detail)}
      data-testid={props["data-testid"] ?? "exchange-detail"}
      data-exchange-kind={exchange.kind}
    >
      <div className={sx(styles.section)}>
        <div className={sx(styles.sectionRow)}>
          <AgentIdentity
            role={exchange.identity.role}
            providerId={exchange.identity.providerId}
            model={exchange.identity.model}
            effort={exchange.identity.effort}
            source={exchange.identity.source}
            showSource
          />
          {primary ? (
            <span className={sx(styles.meta)}>
              asked by{" "}
              {describeAgentIdentity({
                providerId: primary.providerId,
                model: primary.model,
              }).text}
            </span>
          ) : null}
        </div>
      </div>

      {!props.resultFirst || live ? <Section label={ASK_LABEL[exchange.kind]}>
        <CollapsibleResponse text={exchange.ask} label="the assignment" />
      </Section> : null}

      <div className={sx(styles.section)}>
        <div className={sx(styles.sectionRow)}>
          <p className={sx(styles.label)}>Outcome</p>
          <ExchangeStatusBadge
            status={exchange.outcome.status}
            data-testid="exchange-detail-status"
            suffix={elapsedMs !== null ? formatExchangeDuration(elapsedMs) : undefined}
          />
          {deadline ? (
            <span
              className={sx(
                styles.meta,
                deadline.passed && styles.rowDeadlinePassed,
              )}
            >
              {deadline.passed
                ? "Deadline passed · waiting on runtime"
                : deadline.label}
            </span>
          ) : null}
        </div>
        {props.statusNote ? (
          <p className={sx(styles.meta)}>{props.statusNote}</p>
        ) : null}
        {errorText ? (
          <p className={sx(styles.prose, styles.proseDanger)}>{errorText}</p>
        ) : null}
        {resultText ? (
          <>
            <p className={sx(styles.label)}>{RESULT_LABEL[exchange.kind]}</p>
            <CollapsibleResponse
              text={resultText}
              label={`the ${RESULT_LABEL[exchange.kind].toLowerCase()}`}
            />
          </>
        ) : null}
        {!props.resultFirst || live ? progress : null}
      </div>

      {props.resultFirst && !live ? <details>
        <summary className={sx(styles.diagnosticToggle)}>Assignment and execution details</summary>
        <Section label={ASK_LABEL[exchange.kind]}><CollapsibleResponse text={exchange.ask} label="the assignment" /></Section>
        {progress}
        {diagnostics}
      </details> : diagnostics}

      {props.children}

      {exchange.actions.length > 0 || props.extraActions ? (
        <div className={sx(styles.actions)} data-testid="exchange-detail-actions">
          {exchange.actions.map((action) => (
            <Button
              key={action.id}
              type="button"
              size="xs"
              variant={action.id === "stop" ? "outline" : "ghost"}
              disabled={props.busy}
              data-exchange-action={action.id}
              onClick={() => props.onAction?.(action.id, exchange)}
            >
              {action.label}
            </Button>
          ))}
          {props.extraActions}
        </div>
      ) : null}
    </div>
  );
}
