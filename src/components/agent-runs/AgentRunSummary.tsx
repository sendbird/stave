import * as stylex from "@stylexjs/stylex";
import { Info, ShieldCheck, SlidersHorizontal, Zap, type LucideIcon } from "lucide-react";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import type { AgentRun } from "@/lib/agent-runs/domain";
import { describeAgentRunPermissions, formatAge } from "@/lib/agent-runs/agent-run-view";
import { formatCostUsd, formatTokenCount, type AgentRunUsage } from "@/lib/agent-runs/usage";
import { getProviderLabel, toHumanModelName } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";

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
  now: number;
  formatClock: (iso: string) => string;
}

interface Metric {
  label: string;
  value: string;
  unit?: string;
  detail: string | null;
  tone?: "warning";
  /** 0..1, drawn as a thin budget bar under the value. */
  meter?: number;
}

/** What the agent run spent: the cost when the provider reports one, tokens otherwise. */
function spendMetric(usage: AgentRunUsage | null): Metric {
  if (!usage || usage.measuredTurns === 0) return { label: "Spent", value: "—", detail: "Not reported yet" };
  const tokens = `${formatTokenCount(usage.inputTokens + usage.outputTokens)} tokens`;
  return usage.costUsd !== null
    ? { label: "Spent", value: formatCostUsd(usage.costUsd), detail: tokens }
    : { label: "Tokens", value: formatTokenCount(usage.inputTokens + usage.outputTokens), detail: "No cost reported" };
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
  const { agentRun, usage } = props;
  const providerId = agentRun.fingerprint.providerId as ProviderId;
  const permissionMode = agentRun.consent.permissionMode;
  const PermissionIcon = PERMISSION_ICONS[permissionMode];
  const nearLimit = agentRun.turnCount >= Math.ceil(agentRun.maxTurns * 0.8);
  const endedAt = props.active ? props.now : Date.parse(agentRun.updatedAt);
  const unmeasured = usage ? usage.turns - usage.measuredTurns : 0;
  const model = describeRunModel(providerId, agentRun.fingerprint.model);

  const metrics: Metric[] = [
    {
      label: "Turns",
      value: String(agentRun.turnCount),
      unit: `/ ${agentRun.maxTurns}`,
      detail: null,
      meter: agentRun.maxTurns > 0 ? Math.min(1, agentRun.turnCount / agentRun.maxTurns) : 0,
      ...(nearLimit ? { tone: "warning" as const } : {}),
    },
    spendMetric(usage),
    {
      label: props.active ? "Running for" : "Ran for",
      value: formatAge(endedAt - Date.parse(agentRun.createdAt)),
      detail: `${props.active ? "since" : "from"} ${props.formatClock(agentRun.createdAt)}`,
    },
  ];

  const notes = [
    nearLimit && props.active ? `Close to its ${agentRun.maxTurns}-turn budget; the run stops there.` : null,
    unmeasured > 0
      ? `${unmeasured} ${unmeasured === 1 ? "turn" : "turns"} reported no usage, so the total may be low.`
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
          <span className={sx(styles.context)}>
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
      <dl className={sx(styles.metrics)} aria-label="Run figures">
        {metrics.map((metric) => (
          <div key={metric.label} className={sx(styles.metric)}>
            <dt className={sx(styles.metricLabel)}>{metric.label}</dt>
            <dd className={sx(styles.metricBody)}>
              <span className={sx(styles.metricValue, metric.tone === "warning" && styles.warning)}>
                {metric.value}
                {metric.unit ? <span className={sx(styles.metricUnit)}> {metric.unit}</span> : null}
              </span>
              {metric.meter !== undefined ? (
                <span className={sx(styles.meter)} aria-hidden>
                  <span
                    className={sx(styles.meterFill, metric.tone === "warning" && styles.meterWarning)}
                    style={{ width: `${Math.round(metric.meter * 100)}%` }}
                  />
                </span>
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
    borderRadius: vars["--ads-radius-panel"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface"],
    overflow: "hidden",
    minWidth: 0,
  },
  identity: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
    minWidth: 0,
  },
  logo: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
    width: 32,
    height: 32,
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border-subtle"],
    backgroundColor: vars["--ads-color-canvas"],
  },
  logoImage: { width: 18, height: 18 },
  identityText: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  model: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    color: vars["--ads-color-text"],
  },
  context: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  separator: { color: vars["--ads-color-text-subtle"], paddingInline: 2 },
  contextIcon: { width: 12, height: 12, flex: "0 0 auto", color: vars["--ads-color-text-subtle"] },
  metrics: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    margin: 0,
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border-subtle"],
    backgroundColor: vars["--ads-color-canvas-subtle"],
  },
  metric: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
    borderInlineStartWidth: { default: vars["--ads-border-width-hairline"], ":first-child": 0 },
    borderInlineStartStyle: "solid",
    borderInlineStartColor: vars["--ads-color-border-subtle"],
  },
  metricLabel: {
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: vars["--ads-color-text-subtle"],
  },
  metricBody: { display: "flex", flexDirection: "column", gap: 4, margin: 0, minWidth: 0 },
  metricValue: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: 1.2,
    color: vars["--ads-color-text"],
    fontVariantNumeric: "tabular-nums",
  },
  metricUnit: {
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-regular"],
    color: vars["--ads-color-text-subtle"],
  },
  metricDetail: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
    fontVariantNumeric: "tabular-nums",
  },
  warning: { color: vars["--ads-color-warning-text"] },
  meter: {
    display: "block",
    height: 4,
    borderRadius: 999,
    backgroundColor: vars["--ads-color-border-subtle"],
    overflow: "hidden",
  },
  meterFill: { display: "block", height: "100%", borderRadius: 999, backgroundColor: vars["--ads-color-text-muted"] },
  meterWarning: { backgroundColor: vars["--ads-color-warning-text"] },
  notes: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    margin: 0,
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    listStyle: "none",
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border-subtle"],
  },
  note: {
    display: "flex",
    alignItems: "flex-start",
    gap: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  noteIcon: { width: 12, height: 12, flex: "0 0 auto", marginTop: 3, color: vars["--ads-color-text-subtle"] },
});
