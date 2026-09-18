import type { ReactNode } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { Button } from "@/components/ui/button";
import { formatAdvisorSpend } from "@/components/session/advisor-consult-log.utils";
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
import { CheckList } from "./CheckList";
import { ExchangeStatusBadge } from "./ExchangeStatusBadge";
import { KeyValueGrid, type KeyValueItem } from "./KeyValueGrid";
import { StageTimeline } from "./StageTimeline";
import { delegationStyles as styles } from "./delegation.styles";

const SOURCE_COPY: Record<
  NonNullable<DelegationExchange["identity"]["source"]>,
  string
> = {
  auto: "Automatic routing",
  preset: "Worker preset",
  explicit: "Explicit model",
  "provider-default": "Provider default",
};

const ASK_LABEL: Record<DelegationExchange["kind"], string> = {
  advisor: "Question asked",
  worker: "Assignment",
  "child-task": "Delegation",
  subagent: "Assignment",
};

const RESULT_LABEL: Record<DelegationExchange["kind"], string> = {
  advisor: "Advice returned",
  worker: "Returned result",
  "child-task": "Outcome",
  subagent: "Outcome",
};

export interface ExchangeDetailProps {
  exchange: DelegationExchange;
  nowMs: number;
  onAction?: (action: DelegationActionId, exchange: DelegationExchange) => void;
  /** Extra sections rendered after Spend and before Actions. */
  children?: ReactNode;
  /** Extra controls rendered in the Actions row. */
  extraActions?: ReactNode;
  /** Note under the status, e.g. why an unresolved consult has no result. */
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
 * One detail body for every exchange, in one fixed order: Identity → Ask →
 * Outcome → Timeline → Setup → Spend → Actions. The advisor card, the consult
 * log and the Delegations panel all render this, so a fact shown in one is
 * shown — in the same place — in the others.
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
  if (exchange.kind !== "advisor") setupItems.push({ key: "effortEvidence", label: "Effort source", value: exchange.identity.effort ? "Requested or configured; runtime execution not reported" : "Not reported" });
  if (exchange.kind === "advisor" || exchange.setup.isolation) {
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
    "data-testid":
      exchange.kind === "advisor" ? "advisor-exchange-effort" : undefined,
  });
  if (exchange.kind === "advisor" || exchange.setup.deadlineMs !== undefined) {
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
  if (exchange.setup.presetLabel) {
    setupItems.push({
      key: "preset",
      label: "Preset",
      value: exchange.setup.presetLabel,
    });
  }
  if (
    exchange.setup.consultIndex !== undefined &&
    exchange.setup.consultLimit !== undefined
  ) {
    setupItems.push({
      key: "budget",
      label: "Consult budget",
      value: `${exchange.setup.consultIndex} of ${exchange.setup.consultLimit}`,
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

      <Section label={ASK_LABEL[exchange.kind]}>
        <p className={sx(styles.prose)}>{exchange.ask}</p>
      </Section>

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
            <p className={sx(styles.prose)}>{resultText}</p>
          </>
        ) : null}
        {exchange.outcome.progress && exchange.outcome.progress.length > 0 ? (
          <ul className={sx(styles.progressList)}>
            {exchange.outcome.progress.map((line, index) => (
              <li key={`${index}:${line}`} className={sx(styles.meta)}>
                {line}
              </li>
            ))}
          </ul>
        ) : null}
        {exchange.outcome.checks && exchange.outcome.checks.length > 0 ? (
          <>
            <p className={sx(styles.label)}>Did the advisor system work?</p>
            <CheckList checks={exchange.outcome.checks} />
          </>
        ) : null}
      </div>

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
            {formatAdvisorSpend({
              inputTokens: spend.inputTokens ?? 0,
              outputTokens: spend.outputTokens ?? 0,
              cacheReadTokens: spend.cacheReadTokens,
              cacheCreationTokens: spend.cacheCreationTokens,
              totalCostUsd: spend.totalCostUsd ?? null,
            })}
          </p>
          {props.spendFootnote ? (
            <p className={sx(styles.meta)}>{props.spendFootnote}</p>
          ) : null}
        </Section>
      ) : null}

      {props.children}

      {exchange.actions.length > 0 || props.extraActions ? (
        <div className={sx(styles.actions)} data-testid="exchange-detail-actions">
          {exchange.actions.map((action) => (
            <Button
              key={action.id}
              type="button"
              size="xs"
              variant={action.id === "cancel" || action.id === "stop" ? "outline" : "ghost"}
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
