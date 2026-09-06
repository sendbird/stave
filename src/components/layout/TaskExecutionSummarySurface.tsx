import {
  Activity,
  BadgeCheck,
  Clock3,
  Coins,
  FileDiff,
  Gauge,
  Network,
  type LucideIcon,
} from "lucide-react";
import type {
  TaskExecutionMetric,
  TaskExecutionMetricProvenance,
  TaskExecutionSummary,
} from "@/lib/fleet/task-execution-summary";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { cx, sx, type StyleXValue } from "@/components/ads/utils/stylex";
import { summaryStyles as styles } from "./task-execution-summary.styles";

type MetricTone = "default" | "success" | "warning" | "danger";

/**
 * One tile of the summary grid.
 *
 * The tiles are described as data rather than written out as JSX so the grid
 * stays a fixed, evenly divisible count: six tiles land flush on the 2 / 3 / 6
 * column breakpoints instead of leaving a widowed cell on the last row.
 */
interface SummaryMetricDescriptor {
  key: string;
  icon: LucideIcon;
  label: string;
  value: string;
  tone: MetricTone;
  provenance: TaskExecutionMetricProvenance;
  detail?: string;
}

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function provenanceLabel(provenance: TaskExecutionMetricProvenance) {
  switch (provenance) {
    case "reported":
      return "Reported";
    case "derived":
      return "Derived";
    case "unavailable":
      return "Unavailable";
  }
}

const TONE_TEXT_STYLE: Record<MetricTone, StyleXValue> = {
  default: styles.toneDefault,
  success: styles.toneSuccess,
  warning: styles.toneWarning,
  danger: styles.toneDanger,
};

/** A neutral tile keeps its icon quiet; a toned one carries the tone color. */
const TONE_ICON_STYLE: Record<MetricTone, StyleXValue> = {
  ...TONE_TEXT_STYLE,
  default: styles.toneIconDefault,
};

/**
 * Provenance moved from a third text line to a dot on the label row.
 *
 * The old caption doubled every tile's height to repeat "Reported" on tiles
 * that were reported by definition, and it only rendered in the roomy variant,
 * so the two variants disagreed about how tall a tile is. A dot keeps the fact
 * available (title plus screen-reader text) at a constant tile height.
 */
function ProvenanceDot(args: { provenance: TaskExecutionMetricProvenance }) {
  const label = provenanceLabel(args.provenance);
  return (
    <span
      className={sx(
        styles.provenanceDot,
        args.provenance === "reported"
          ? styles.provenanceReported
          : args.provenance === "derived"
            ? styles.provenanceDerived
            : styles.provenanceUnavailable,
      )}
      title={label}
    >
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  );
}

function SummaryMetricTile(args: {
  descriptor: SummaryMetricDescriptor;
  compact?: boolean;
}) {
  const { descriptor } = args;
  const Icon = descriptor.icon;
  const unavailable = descriptor.provenance === "unavailable";
  return (
    <div
      className={sx(styles.tile, args.compact && styles.tileCompact)}
      data-metric={descriptor.key}
      title={descriptor.detail}
    >
      <div className={sx(styles.tileHead)}>
        <Icon
          className={sx(styles.tileIcon, TONE_ICON_STYLE[descriptor.tone])}
          aria-hidden="true"
        />
        <dt className={sx(styles.tileLabel)}>{descriptor.label}</dt>
        <ProvenanceDot provenance={descriptor.provenance} />
      </div>
      <dd
        className={sx(
          styles.tileValue,
          args.compact ? styles.tileValueCompact : styles.tileValueRoomy,
          unavailable
            ? styles.tileValueUnavailable
            : TONE_TEXT_STYLE[descriptor.tone],
        )}
      >
        {descriptor.value}
      </dd>
    </div>
  );
}

function joinDetails(parts: Array<string | undefined>) {
  const joined = parts.filter(Boolean).join(" · ");
  return joined || undefined;
}

/**
 * Account limit and context headroom are one tile because they answer one
 * question: how much room is left before this run has to stop. Split across two
 * tiles they read as unrelated gauges, and they were the pair that pushed the
 * grid to an awkward seven.
 */
function formatContextPercent(usedPercent: number): string {
  return `${usedPercent < 10 ? usedPercent.toFixed(1) : Math.round(usedPercent)}%`;
}

function formatReportedCost(amount: number, currency: string): string {
  const trimmed = currency.trim();
  if (trimmed.toUpperCase() === "USD") {
    return `$${amount.toFixed(4)}`;
  }
  const digits = amount >= 1 ? 2 : 4;
  return `${amount.toFixed(digits)} ${trimmed}`;
}

function buildHeadroomDescriptor(
  summary: TaskExecutionSummary,
): SummaryMetricDescriptor {
  const accountLimit = summary.accountLimit.value;
  const contextHeadroom = summary.contextHeadroom.value;
  const remainingRatio =
    contextHeadroom?.remainingTokens !== undefined &&
    contextHeadroom.totalTokens
      ? contextHeadroom.remainingTokens / contextHeadroom.totalTokens
      : contextHeadroom?.usedPercent !== undefined
        ? (100 - contextHeadroom.usedPercent) / 100
        : null;
  const tone: MetricTone =
    (accountLimit && accountLimit.usedPercent >= 90) ||
    (remainingRatio != null && remainingRatio <= 0.1)
      ? "danger"
      : (accountLimit && accountLimit.usedPercent >= 75) ||
          (remainingRatio != null && remainingRatio <= 0.2)
        ? "warning"
        : "default";
  const contextLabel =
    contextHeadroom?.remainingTokens !== undefined
      ? `${formatCount(contextHeadroom.remainingTokens)} ctx left`
      : contextHeadroom?.usedPercent !== undefined
        ? `${formatContextPercent(100 - contextHeadroom.usedPercent)} ctx left`
        : null;
  const segments = [
    contextLabel,
    accountLimit ? `${Math.round(accountLimit.usedPercent)}% limit` : null,
  ].filter(Boolean) as string[];
  const provenance: TaskExecutionMetricProvenance =
    contextHeadroom || accountLimit ? "reported" : "unavailable";
  return {
    key: "headroom",
    icon: Gauge,
    label: "Headroom",
    tone,
    provenance,
    value: segments.length ? segments.join(" · ") : "Not reported",
    detail: joinDetails([
      accountLimit?.label,
      summary.accountLimit.detail,
      summary.contextHeadroom.detail,
    ]),
  };
}

function buildMetricDescriptors(
  summary: TaskExecutionSummary,
): SummaryMetricDescriptor[] {
  const elapsed = summary.elapsed.value;
  const changes = summary.changes.value;
  const verification = summary.verification.value;
  const usage = summary.usage.value;
  const agents = summary.agents.value;
  return [
    {
      key: "elapsed",
      icon: Clock3,
      label: "Elapsed",
      tone: "default",
      provenance: summary.elapsed.provenance,
      detail: summary.elapsed.detail,
      value: elapsed
        ? `${formatDuration(elapsed.milliseconds)}${elapsed.running ? " · running" : ""}`
        : "Not reported",
    },
    {
      key: "changes",
      icon: FileDiff,
      label: "Changes",
      tone: "default",
      provenance: summary.changes.provenance,
      detail: summary.changes.detail,
      value: changes
        ? `${changes.files.length} file${changes.files.length === 1 ? "" : "s"}${
            changes.additions == null || changes.deletions == null
              ? ""
              : ` · +${changes.additions}/−${changes.deletions}`
          }`
        : "No diff reported",
    },
    {
      key: "verification",
      icon: BadgeCheck,
      label: "Verification",
      provenance: summary.verification.provenance,
      detail: summary.verification.detail,
      tone:
        verification?.status === "pass"
          ? "success"
          : verification?.status === "fail"
            ? "danger"
            : verification?.status === "warn"
              ? "warning"
              : "default",
      value: verification
        ? `${verification.status} · ${verification.executedEntries}/${verification.totalEntries}`
        : "Not reported",
    },
    {
      key: "usage",
      icon: Coins,
      label: "Usage",
      tone: "default",
      provenance: summary.usage.provenance,
      detail: summary.usage.detail,
      value: (() => {
        if (!usage) {
          return "Not reported";
        }
        const hasTokens = Boolean(
          usage.inputTokens ||
          usage.outputTokens ||
          usage.cacheReadTokens ||
          usage.cacheCreationTokens,
        );
        // Prompt + output, not input + output: on Claude `inputTokens` is only
        // the uncached remainder, so the old sum silently omitted every cached
        // token — the bulk of a long task's prompt.
        const tokenLabel = hasTokens
          ? `${formatCount(usage.promptTokens + usage.outputTokens)} tokens`
          : null;
        // Only over providers whose prompt convention is verified; see
        // `TaskExecutionUsage.cacheRatePromptTokens`.
        const cacheLabel =
          usage.cacheRatePromptTokens > 0 && usage.cacheRateCachedTokens > 0
            ? `${Math.round((usage.cacheRateCachedTokens / usage.cacheRatePromptTokens) * 100)}% cached`
            : null;
        const costLabel =
          usage.totalCostUsd != null
            ? `$${usage.totalCostUsd.toFixed(4)}`
            : usage.costAmount !== undefined && usage.costCurrency
              ? formatReportedCost(usage.costAmount, usage.costCurrency)
              : null;
        return (
          [tokenLabel, cacheLabel, costLabel].filter(Boolean).join(" · ") ||
          "Not reported"
        );
      })(),
    },
    {
      key: "agents",
      icon: Network,
      label: "Agents",
      provenance: summary.agents.provenance,
      detail: summary.agents.detail,
      // A blocked agent outranks a failed one here: the failure is already
      // history, while the block is the thing this reader can still clear.
      tone:
        agents && agents.blockedCount > 0
          ? "warning"
          : agents && agents.failedCount > 0
            ? "danger"
            : "default",
      value: agents ? agents.label : "Main loop only",
    },
    buildHeadroomDescriptor(summary),
  ];
}

function LatestActivityRow(args: {
  metric: TaskExecutionMetric<{ label: string; detail?: string }>;
  compact?: boolean;
}) {
  const latest = args.metric.value;
  return (
    <div className={sx(styles.activityRow)}>
      <Activity className={sx(styles.activityIcon)} aria-hidden="true" />
      <div className={sx(styles.activityBody)}>
        <h3 className={sx(styles.activityHeading)}>Latest activity</h3>
        <p
          className={sx(
            styles.activityText,
            args.compact
              ? styles.activityTextClampOne
              : styles.activityTextClampTwo,
          )}
        >
          {latest?.label ?? "No activity reported"}
          {latest?.detail ? (
            <span className={sx(styles.activityDetail)}> · {latest.detail}</span>
          ) : null}
        </p>
      </div>
      <span className={sx(styles.activityProvenance)}>
        {provenanceLabel(args.metric.provenance)}
      </span>
    </div>
  );
}

export function TaskExecutionSummarySurface(args: {
  summary: TaskExecutionSummary;
  compact?: boolean;
  showLatestActivity?: boolean;
  /** Kept for callers that still hand this surface a global/utility class. */
  className?: string;
  xstyle?: StyleXValue;
}) {
  const showLatestActivity = args.showLatestActivity ?? true;
  const descriptors = buildMetricDescriptors(args.summary);

  return (
    <section
      className={cx(sx(styles.root, args.xstyle), args.className)}
      aria-label="Task execution summary"
    >
      {showLatestActivity ? (
        <LatestActivityRow
          compact={args.compact}
          metric={args.summary.latestActivity}
        />
      ) : null}
      <dl
        className={sx(
          styles.grid,
          showLatestActivity && styles.gridSpaced,
          args.compact ? styles.gridCompact : styles.gridMedium,
        )}
      >
        {descriptors.map((descriptor) => (
          <SummaryMetricTile
            compact={args.compact}
            descriptor={descriptor}
            key={descriptor.key}
          />
        ))}
      </dl>
    </section>
  );
}
