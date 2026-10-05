import { formatTime } from "@/i18n/format";
import { i18n, useTranslation } from "@/i18n";
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
  get auto() { return i18n.t("agentRuns:exchangeDetail.auto"); },
  get preset() { return i18n.t("agentRuns:exchangeDetail.preset"); },
  get explicit() { return i18n.t("agentRuns:exchangeDetail.explicit"); },
  get "provider-default"() { return i18n.t("agentRuns:exchangeDetail.providerDefault"); },
};

const ASK_LABEL: Record<DelegationExchange["kind"], string> = {
  get "delegated-task"() { return i18n.t("agentRuns:exchangeDetail.delegatedTask"); },
  get subagent() { return i18n.t("agentRuns:exchangeDetail.subagent"); },
};

const RESULT_LABEL: Record<DelegationExchange["kind"], string> = {
  get "delegated-task"() { return i18n.t("agentRuns:exchangeDetail.delegatedTask2"); },
  get subagent() { return i18n.t("agentRuns:exchangeDetail.subagent2"); },
};

/** `120 in · 40 out · 10 cache read · $0.0123`. */
function formatSpend(spend: NonNullable<DelegationExchange["outcome"]["spend"]>): string {
  const cache = [
    spend.cacheReadTokens ? i18n.t("agentRuns:exchangeDetail.extraCopy75", { value1: spend.cacheReadTokens }) : null,
    spend.cacheCreationTokens ? i18n.t("agentRuns:exchangeDetail.extraCopy76", { value1: spend.cacheCreationTokens }) : null,
  ].filter(Boolean).join(" · ");
  const cost = spend.totalCostUsd === undefined ? "" : ` · $${spend.totalCostUsd.toFixed(4)}`;
  return i18n.t("agentRuns:exchangeDetail.formatSpend", { value1: spend.inputTokens ?? 0, value2: spend.outputTokens ?? 0, value3: cache ? ` · ${cache}` : "", value4: cost });
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
  useTranslation();
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
  useTranslation();
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
  if (exchange.identity.modelEvidence) setupItems.push({ key: "modelEvidence", label: i18n.t("agentRuns:exchangeDetail.label"), value: exchange.identity.modelEvidence });
  setupItems.push({ key: "effortEvidence", label: i18n.t("agentRuns:exchangeDetail.label2"), value: exchange.identity.effort ? i18n.t("agentRuns:exchangeDetail.extraCopy77") : i18n.t("agentRuns:exchangeDetail.extraCopy81") });
  if (exchange.setup.isolation) {
    setupItems.push({
      key: "isolation",
      label: i18n.t("agentRuns:exchangeDetail.label3"),
      value: exchange.setup.isolation ?? i18n.t("agentRuns:exchangeDetail.extraCopy81"),
    });
  }
  setupItems.push({
    key: "effort",
    label: i18n.t("agentRuns:exchangeDetail.label4"),
    value: exchange.identity.effort
      ? describeAgentIdentity({ effort: exchange.identity.effort }).effortLabel
      : i18n.t("agentRuns:exchangeDetail.extraCopy81"),
  });
  if (exchange.setup.deadlineMs !== undefined) {
    setupItems.push({
      key: "deadline",
      label: i18n.t("agentRuns:exchangeDetail.label5"),
      value:
        exchange.setup.deadlineMs === undefined
          ? i18n.t("agentRuns:exchangeDetail.extraCopy81")
          : formatExchangeDuration(exchange.setup.deadlineMs),
    });
  }
  if (exchange.identity.source) {
    setupItems.push({
      key: "selection",
      label: i18n.t("agentRuns:exchangeDetail.label6"),
      value: SOURCE_COPY[exchange.identity.source],
    });
  }
  if (exchange.setup.attempt !== undefined) {
    setupItems.push({
      key: "attempt",
      label: i18n.t("agentRuns:exchangeDetail.label7"),
      value: String(exchange.setup.attempt + 1),
    });
  }
  if (exchange.setup.lifecycle) {
    setupItems.push({
      key: "lifecycle",
      label: i18n.t("agentRuns:exchangeDetail.label8"),
      value: exchange.setup.lifecycle,
    });
  }
  if (exchange.identity.rationale) {
    setupItems.push({
      key: "reason",
      label: i18n.t("agentRuns:exchangeDetail.label9"),
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
        <Section label={i18n.t("agentRuns:exchangeDetail.label10")}>
          {exchange.timing.stages.length > 0 ? (
            <StageTimeline
              stages={exchange.timing.stages}
              startedAt={exchange.timing.startedAt}
            />
          ) : (
            <p className={sx(styles.meta)}>{i18n.t("agentRuns:exchangeDetail.sentence33", { value1: formatTime(new Date(exchange.timing.startedAt)), value2: exchange.timing.endedAt !== undefined
                ? i18n.t("agentRuns:remaining.presentationCopy266", { v1: formatTime(new Date(exchange.timing.endedAt)) })
                : live
                  ? " · still running"
                  : "" })}</p>
          )}
        </Section>
      ) : null}

      {setupItems.length > 0 ? (
        <Section label={i18n.t("agentRuns:exchangeDetail.label11")}>
          <KeyValueGrid items={setupItems} />
        </Section>
      ) : null}

      {hasSpend && spend ? (
        <Section label={i18n.t("agentRuns:exchangeDetail.label12")}>
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
            <span className={sx(styles.meta)}>{i18n.t("agentRuns:exchangeDetail.sentence34", { value1: " ", value2: describeAgentIdentity({
                providerId: primary.providerId,
                model: primary.model,
              }).text })}</span>
          ) : null}
        </div>
      </div>

      {!props.resultFirst || live ? <Section label={ASK_LABEL[exchange.kind]}>
        <CollapsibleResponse text={exchange.ask} label={i18n.t("agentRuns:exchangeDetail.label13")} />
      </Section> : null}

      <div className={sx(styles.section)}>
        <div className={sx(styles.sectionRow)}>
          <p className={sx(styles.label)}>{i18n.t("agentRuns:exchangeDetail.exchangeDetail2")}</p>
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
                ? i18n.t("agentRuns:exchangeDetail.exchangeDetail3")
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
              label={i18n.t("agentRuns:exchangeDetail.label14", { value1: RESULT_LABEL[exchange.kind].toLowerCase() })}
            />
          </>
        ) : null}
        {!props.resultFirst || live ? progress : null}
      </div>

      {props.resultFirst && !live ? <details>
        <summary className={sx(styles.diagnosticToggle)}>{i18n.t("agentRuns:exchangeDetail.exchangeDetail4")}</summary>
        <Section label={ASK_LABEL[exchange.kind]}><CollapsibleResponse text={exchange.ask} label={i18n.t("agentRuns:exchangeDetail.label15")} /></Section>
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
