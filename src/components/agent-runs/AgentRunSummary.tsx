import { i18n, useTranslation } from "@/i18n";
import { formatDuration, formatCost, formatTokenCount } from "@/i18n/format";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { Info, ShieldCheck, SlidersHorizontal, Zap, type LucideIcon } from "lucide-react";
import { Meter } from "@/components/aui/components/Meter";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { thresholdTone, type Tone } from "@/components/aui/utils/tone";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import type { AgentRun } from "@/lib/agent-runs/domain";
import { describeAgentRunPermissions, explainAgentRunPermissions } from "@/lib/agent-runs/agent-run-view";
import type { AgentRunUsage } from "@/lib/agent-runs/usage";
import { activeMsAt, type AgentRunActiveTime } from "@/lib/agent-runs/active-time";
import { getProviderLabel, toHumanModelName } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { ElapsedClock } from "./ElapsedClock";

/** The share of its turn budget from which a run reads as near its limit. */
const TURN_BUDGET_WARNING_SHARE = 0.8;

const PERMISSION_ICONS: Record<AgentRun["consent"]["permissionMode"], LucideIcon> = {
  auto: Zap,
  guided: ShieldCheck,
  manual: SlidersHorizontal,
};

export interface AgentRunSummaryProps {
  agentRun: Pick<AgentRun, "fingerprint" | "consent" | "turnCount" | "maxTurns" | "createdAt" | "updatedAt">;
  usage: AgentRunUsage | null;
  /** Running agent runs count their time up to now; ended ones up to their end. */
  active: boolean;
  /**
   * The run's active time from the host: shown as the run's time, its pauses
   * and waits left out. Without it (an older host) the time since the start.
   */
  activeTime?: AgentRunActiveTime | null;
  now: number;
  formatClock: (iso: string) => string;
}

interface Metric {
  label: string;
  value: ReactNode;
  unit?: string;
  detail: string | null;
  /** Said on hover: how the figure is counted. */
  title?: string;
  tone?: Extract<Tone, "warning">;
  /** 0..1, drawn as a thin budget bar under the value. */
  meter?: number;
}

/** What the agent run spent: the cost when the provider reports one, tokens otherwise. */
function spendMetric(usage: AgentRunUsage | null): Metric {
  if (!usage || usage.measuredTurns === 0) return { label: i18n.t("agentRuns:agentRunSummary.label"), value: "—", detail: i18n.t("agentRuns:agentRunSummary.detail") };
  const tokens = i18n.t("agentRuns:remaining.presentationCopy0", { v1: formatTokenCount(usage.inputTokens + usage.outputTokens) });
  return usage.costUsd !== null
    ? { label: i18n.t("agentRuns:agentRunSummary.label2"), value: formatCost(usage.costUsd), detail: tokens }
    : { label: i18n.t("agentRuns:agentRunSummary.label3"), value: formatTokenCount(usage.inputTokens + usage.outputTokens), detail: i18n.t("agentRuns:agentRunSummary.detail2") };
}

/**
 * The model as people say it: "Claude Opus 5.5 (1M)", and "Claude Sonnet" for
 * an alias such as `sonnet`, which names the model but not whose it is.
 */
export function describeRunModel(providerId: ProviderId, model: string): { name: string; namesProvider: boolean } {
  const provider = getProviderLabel({ providerId });
  const human = toHumanModelName({ model });
  if (human.toLowerCase().startsWith(provider.toLowerCase())) return { name: human, namesProvider: true };
  // Claude's aliases (opus, sonnet, haiku) read as its models; other providers' names stand alone.
  return provider === "Claude" && /^(opus|sonnet|haiku)/i.test(human)
    ? { name: `${provider} ${human}`, namesProvider: true }
    : { name: human, namesProvider: false };
}

/**
 * How an agent run runs, read at a glance: who runs it (the provider's mark, the
 * model's name, its permissions), then what it has used as figures — turns
 * against its budget, what it spent, and how long it has been going.
 */
export function AgentRunSummary(props: AgentRunSummaryProps) {
  useTranslation();
  const { agentRun, usage } = props;
  const providerId = agentRun.fingerprint.providerId as ProviderId;
  const permissionMode = agentRun.consent.permissionMode;
  const PermissionIcon = PERMISSION_ICONS[permissionMode];
  // From 80% of the turn budget the run is near its limit.
  const turnTone = thresholdTone(
    agentRun.turnCount,
    [{ from: Math.ceil(agentRun.maxTurns * TURN_BUDGET_WARNING_SHARE), tone: "warning" }],
    "neutral",
  );
  const nearLimit = turnTone === "warning";
  const startedAt = Date.parse(agentRun.createdAt);
  const endedAt = Date.parse(agentRun.updatedAt);
  const { activeTime } = props;
  const unmeasured = usage ? usage.turns - usage.measuredTurns : 0;
  const model = describeRunModel(providerId, agentRun.fingerprint.model);

  const metrics: Metric[] = [
    {
      label: i18n.t("agentRuns:agentRunSummary.label4"),
      value: String(agentRun.turnCount),
      unit: `/ ${agentRun.maxTurns}`,
      detail: null,
      meter: agentRun.maxTurns > 0 ? Math.min(1, agentRun.turnCount / agentRun.maxTurns) : 0,
      ...(turnTone === "warning" ? { tone: turnTone } : {}),
    },
    spendMetric(usage),
    activeTime
      ? {
          label: props.active ? i18n.t("agentRuns:activeTime.activeFor") : i18n.t("agentRuns:activeTime.wasActive"),
          // A counting span ticks on the shared clock, so only the figure re-renders; a pause or a wait holds it still.
          value: (
            <ElapsedClock live={activeTime.activeSince !== null} now={props.now}>
              {(clock) => formatDuration(activeMsAt(activeTime, clock))}
            </ElapsedClock>
          ),
          detail: i18n.t(props.active ? "agentRuns:activeTime.since" : "agentRuns:activeTime.from", { time: props.formatClock(agentRun.createdAt) }),
          // The wall-clock span stays one hover away.
          title: props.active
            ? i18n.t("agentRuns:activeTime.wallClockSince", { explain: i18n.t("agentRuns:activeTime.explain"), duration: formatDuration(Math.max(0, props.now - startedAt)) })
            : i18n.t("agentRuns:activeTime.wallClockTook", { explain: i18n.t("agentRuns:activeTime.explain"), duration: formatDuration(Math.max(0, endedAt - startedAt)) }),
        }
      : {
          label: props.active ? i18n.t("agentRuns:agentRunSummary.label5") : i18n.t("agentRuns:agentRunSummary.label6"),
          // A running run's time counts on its own clock, so only the figure re-renders.
          value: props.active ? (
            <ElapsedClock live now={props.now}>{(clock) => formatDuration(clock - startedAt)}</ElapsedClock>
          ) : formatDuration(endedAt - startedAt),
          detail: i18n.t(props.active ? "agentRuns:agentRunSummary.startedAt" : "agentRuns:agentRunSummary.fromStartedAt", { time: props.formatClock(agentRun.createdAt) }),
        },
  ];

  const notes = [
    nearLimit && props.active ? i18n.t("agentRuns:agentRunSummary.extraCopy9", { value1: agentRun.maxTurns }) : null,
    unmeasured > 0
      ? i18n.t("agentRuns:agentRunSummary.extraCopy10", { value1: unmeasured, count: unmeasured })
      : null,
  ].filter((note): note is string => Boolean(note));

  return (
    <div className={sx(styles.card)}>
      <div className={sx(styles.identity)}>
        <span className={sx(styles.logo)}>
          <ModelIcon providerId={providerId} model={agentRun.fingerprint.model} className={sx(styles.logoImage)} />
        </span>
        <span className={sx(styles.identityText)}>
          <span className={sx(styles.model)} title={agentRun.fingerprint.model}>
            {model.name}
          </span>
          <span className={sx(styles.context)} title={explainAgentRunPermissions(permissionMode, providerId)}>
            {model.namesProvider ? null : (
              <>
                {getProviderLabel({ providerId })}
                <span aria-hidden className={sx(styles.separator)}>
                  ·
                </span>
              </>
            )}
            <PermissionIcon aria-hidden className={sx(styles.contextIcon)} />
            {describeAgentRunPermissions(permissionMode)}
          </span>
        </span>
      </div>
      <dl className={sx(styles.metrics)} aria-label={i18n.t("agentRuns:agentRunSummary.ariaLabel")}>
        {metrics.map((metric) => (
          <div key={metric.label} className={sx(styles.metric)} title={metric.title}>
            <dt className={sx(styles.metricLabel)}>{metric.label}</dt>
            <dd className={sx(styles.metricBody)}>
              <span className={sx(styles.metricValue, metric.tone === "warning" && styles.warning)}>
                {metric.value}
                {metric.unit ? <span className={sx(styles.metricUnit)}> {metric.unit}</span> : null}
              </span>
              {metric.meter !== undefined ? (
                <Meter
                  label={metric.label}
                  hideLabel
                  hideValue
                  size="sm"
                  tone={metric.tone === "warning" ? "warning" : "neutral"}
                  value={Math.round(metric.meter * 100)}
                  getAriaValueText={() => [metric.value, metric.unit].filter(Boolean).join(" ")}
                />
              ) : null}
              {metric.detail ? <span className={sx(styles.metricDetail)}>{metric.detail}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      {notes.length > 0 ? (
        <ul className={sx(styles.notes)}>
          {notes.map((note) => (
            <li key={note} className={sx(styles.note)}>
              <Info aria-hidden className={sx(styles.noteIcon)} />
              {note}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  card: {
    display: "flex",
    flexDirection: "column",
    borderRadius: vars["--aui-radius-panel"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface"],
    overflow: "hidden",
    minWidth: 0,
  },
  identity: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
    minWidth: 0,
  },
  logo: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
    width: 32,
    height: 32,
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border-subtle"],
    backgroundColor: vars["--aui-color-canvas"],
  },
  logoImage: { width: 18, height: 18 },
  identityText: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  model: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
    color: vars["--aui-color-text"],
  },
  context: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  separator: { color: vars["--aui-color-text-subtle"], paddingInline: 2 },
  contextIcon: { width: 12, height: 12, flex: "0 0 auto", color: vars["--aui-color-text-subtle"] },
  metrics: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    margin: 0,
    borderTopWidth: vars["--aui-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--aui-color-border-subtle"],
    backgroundColor: vars["--aui-color-canvas-subtle"],
  },
  metric: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
    borderInlineStartWidth: { default: vars["--aui-border-width-hairline"], ":first-child": 0 },
    borderInlineStartStyle: "solid",
    borderInlineStartColor: vars["--aui-color-border-subtle"],
  },
  metricLabel: {
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: vars["--aui-color-text-muted"],
  },
  metricBody: { display: "flex", flexDirection: "column", gap: 4, margin: 0, minWidth: 0 },
  metricValue: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-lead"],
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: 1.2,
    color: vars["--aui-color-text"],
    fontVariantNumeric: "tabular-nums",
  },
  metricUnit: {
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-regular"],
    color: vars["--aui-color-text-muted"],
  },
  // A detail wraps rather than cut its qualifier ("pauses not counted") in a narrow panel.
  metricDetail: {
    overflowWrap: "anywhere",
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
    fontVariantNumeric: "tabular-nums",
  },
  warning: { color: vars["--aui-color-warning-text"] },
  notes: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    margin: 0,
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
    listStyle: "none",
    borderTopWidth: vars["--aui-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--aui-color-border-subtle"],
  },
  note: {
    display: "flex",
    alignItems: "flex-start",
    gap: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-text-muted"],
  },
  noteIcon: { width: 12, height: 12, flex: "0 0 auto", marginTop: 3, color: vars["--aui-color-text-subtle"] },
});
