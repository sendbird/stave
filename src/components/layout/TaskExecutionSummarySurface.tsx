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
import { Badge } from "@/components/ads/components/Badge";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { cx, sx, type StyleXValue } from "@/components/ads/utils/stylex";
import { summaryStyles as styles } from "./task-execution-summary.styles";

type MetricTone = "default" | "info" | "success" | "warning" | "danger";
type StatAccent = "info" | "success" | "warning" | "danger" | "muted";
type PartTone = MetricTone | "added" | "removed";

/**
 * One tile of the summary grid.
 *
 * The tiles are described as data rather than written out as JSX so the grid
 * stays a fixed, evenly divisible count: six tiles land flush on the 2 / 3 / 6
 * column breakpoints instead of leaving a widowed cell on the last row.
 */
interface StatPart {
  text: string;
  tone: PartTone;
}

interface StatMeter {
  usedPercent: number;
  label: string;
  tone: Exclude<MetricTone, "default">;
}

/**
 * One tile of the summary grid.
 *
 * `figure` is the hero readout ("4 files", "41% left"). `parts` are the
 * colored facts under it (a diff, a cache rate, how much of the limit is
 * used). An empty tile has neither: it keeps the honest fallback sentence
 * at caption size so it does not pretend to be a measurement.
 */
interface SummaryMetricDescriptor {
  key: string;
  icon: LucideIcon;
  label: string;
  /** Full phrase for the tooltip. The visible readout is figure plus parts. */
  value: string;
  accent: StatAccent;
  figureTone: MetricTone;
  provenance: TaskExecutionMetricProvenance;
  detail?: string;
  figure?: string;
  parts: StatPart[];
  badge?: { label: string; tone: "success" | "warning" | "danger" };
  meter?: StatMeter;
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

const FIGURE_TONE: Record<MetricTone, StyleXValue> = {
  default: styles.figureDefault,
  info: styles.toneInfo,
  success: styles.toneSuccess,
  warning: styles.toneWarning,
  danger: styles.toneDanger,
};

const PART_TONE: Record<PartTone, StyleXValue> = {
  default: styles.toneDefault,
  info: styles.toneInfo,
  success: styles.toneSuccess,
  warning: styles.toneWarning,
  danger: styles.toneDanger,
  added: styles.toneAdded,
  removed: styles.toneRemoved,
};

const ACCENT_BAR: Record<Exclude<StatAccent, "muted">, StyleXValue> = {
  info: styles.accentInfo,
  success: styles.accentSuccess,
  warning: styles.accentWarning,
  danger: styles.accentDanger,
};

const ICON_WELL: Record<StatAccent, StyleXValue> = {
  muted: styles.wellMuted,
  info: styles.wellInfo,
  success: styles.wellSuccess,
  warning: styles.wellWarning,
  danger: styles.wellDanger,
};

const ICON_TONE: Record<StatAccent, StyleXValue> = {
  muted: styles.iconMuted,
  info: styles.iconInfo,
  success: styles.iconSuccess,
  warning: styles.iconWarning,
  danger: styles.iconDanger,
};

const METER_FILL: Record<StatMeter["tone"], StyleXValue> = {
  info: styles.meterInfo,
  success: styles.meterSuccess,
  warning: styles.meterWarning,
  danger: styles.meterDanger,
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

function StatMeterBar(args: { meter: StatMeter }) {
  const clamped = Math.min(100, Math.max(0, args.meter.usedPercent));
  return (
    <div
      className={sx(styles.meterTrack)}
      role="meter"
      aria-label={args.meter.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-valuetext={args.meter.label}
    >
      <div
        className={sx(styles.meterFill, METER_FILL[args.meter.tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function SummaryMetricTile(args: {
  descriptor: SummaryMetricDescriptor;
  compact?: boolean;
}) {
  const { descriptor } = args;
  const Icon = descriptor.icon;
  return (
    <div
      className={sx(styles.tile, args.compact && styles.tileCompact)}
      data-metric={descriptor.key}
      title={joinDetails([
        descriptor.label,
        descriptor.value,
        descriptor.detail,
      ])}
    >
      {descriptor.accent !== "muted" ? (
        <span
          className={sx(styles.accentBar, ACCENT_BAR[descriptor.accent])}
          aria-hidden="true"
        />
      ) : null}
      <div className={sx(styles.tileHead)}>
        <span className={sx(styles.iconWell, ICON_WELL[descriptor.accent])}>
          <Icon
            className={sx(styles.tileIcon, ICON_TONE[descriptor.accent])}
            aria-hidden="true"
          />
        </span>
        <dt className={sx(styles.tileLabel)}>{descriptor.label}</dt>
        {descriptor.badge ? (
          <span className={sx(styles.headAside)}>
            <Badge size="sm" tone={descriptor.badge.tone} variant="soft">
              {descriptor.badge.label}
            </Badge>
          </span>
        ) : descriptor.provenance === "derived" ? (
          <span className={sx(styles.headAside)}>
            <ProvenanceDot provenance={descriptor.provenance} />
          </span>
        ) : null}
      </div>
      {descriptor.figure ? (
        <dd className={sx(styles.readout)}>
          <span
            className={sx(
              styles.figure,
              args.compact ? styles.figureCompact : styles.figureRoomy,
              FIGURE_TONE[descriptor.figureTone],
            )}
          >
            {descriptor.figure}
          </span>
          {descriptor.parts.length > 0 ? (
            <span className={sx(styles.partRow)}>
              {descriptor.parts.map((part, index) => (
                <span
                  className={sx(styles.part, PART_TONE[part.tone])}
                  key={`${part.tone}-${index}`}
                >
                  {part.text}
                </span>
              ))}
            </span>
          ) : null}
          {descriptor.meter ? <StatMeterBar meter={descriptor.meter} /> : null}
        </dd>
      ) : (
        <dd className={sx(styles.emptyValue)}>{descriptor.value}</dd>
      )}
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

interface HeadroomFact {
  /** 0–1. Lower means less room, so the tighter fact becomes the hero. */
  remainingRatio: number | null;
  usedPercent: number | null;
  figure: string;
  /** Names the meter, e.g. "59% used". */
  usedLabel: string | null;
}

/**
 * One scale for both constraints: the bar and the number change together.
 * 75% used is the warning, 90% is the point where the run is about to stop.
 */
function pressureTone(usedPercent: number): StatMeter["tone"] {
  if (usedPercent >= 90) return "danger";
  if (usedPercent >= 75) return "warning";
  return "info";
}

function contextHeadroomFact(
  headroom: NonNullable<TaskExecutionSummary["contextHeadroom"]["value"]>,
): HeadroomFact | null {
  if (headroom.remainingTokens !== undefined && headroom.totalTokens) {
    const remainingRatio = headroom.remainingTokens / headroom.totalTokens;
    const usedPercent = (1 - remainingRatio) * 100;
    return {
      remainingRatio,
      usedPercent,
      figure: `${formatCount(headroom.remainingTokens)} ctx left`,
      usedLabel: `${formatContextPercent(usedPercent)} used`,
    };
  }
  if (headroom.remainingTokens !== undefined) {
    return {
      remainingRatio: null,
      usedPercent: headroom.usedPercent ?? null,
      figure: `${formatCount(headroom.remainingTokens)} ctx left`,
      usedLabel:
        headroom.usedPercent !== undefined
          ? `${formatContextPercent(headroom.usedPercent)} used`
          : null,
    };
  }
  if (headroom.usedPercent !== undefined) {
    return {
      remainingRatio: (100 - headroom.usedPercent) / 100,
      usedPercent: headroom.usedPercent,
      figure: `${formatContextPercent(100 - headroom.usedPercent)} ctx left`,
      usedLabel: `${formatContextPercent(headroom.usedPercent)} used`,
    };
  }
  return null;
}

function accountHeadroomFact(
  limit: NonNullable<TaskExecutionSummary["accountLimit"]["value"]>,
): HeadroomFact {
  const used = Math.round(limit.usedPercent);
  const left = Math.max(0, 100 - used);
  return {
    remainingRatio: left / 100,
    usedPercent: used,
    figure: `${left}% left`,
    usedLabel: `${used}% used`,
  };
}

function buildHeadroomDescriptor(
  summary: TaskExecutionSummary,
): SummaryMetricDescriptor {
  const accountLimit = summary.accountLimit.value;
  const contextHeadroom = summary.contextHeadroom.value;
  const facts = [
    contextHeadroom ? contextHeadroomFact(contextHeadroom) : null,
    accountLimit ? accountHeadroomFact(accountLimit) : null,
  ].filter((fact): fact is HeadroomFact => fact != null);
  facts.sort((left, right) => {
    if (left.remainingRatio == null) return 1;
    if (right.remainingRatio == null) return -1;
    return left.remainingRatio - right.remainingRatio;
  });
  const primary = facts[0];
  const secondary = facts[1];
  const provenance: TaskExecutionMetricProvenance =
    primary ? "reported" : "unavailable";
  const tone: StatMeter["tone"] | "info" =
    primary?.usedPercent != null ? pressureTone(primary.usedPercent) : "info";
  const parts: StatPart[] = [];
  if (primary?.usedLabel) {
    parts.push({ text: primary.usedLabel, tone: "default" });
  }
  if (secondary) {
    parts.push({ text: secondary.figure, tone: "default" });
  }
  if (accountLimit?.label) {
    parts.push({ text: accountLimit.label, tone: "default" });
  }
  const value = primary
    ? [
        primary.figure,
        primary.usedLabel,
        secondary?.figure,
        accountLimit?.label,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Not reported";
  return {
    key: "headroom",
    icon: Gauge,
    label: "Headroom",
    accent: primary ? tone : "muted",
    figureTone: primary ? tone : "default",
    provenance,
    value,
    figure: primary?.figure,
    parts,
    meter:
      primary?.usedPercent != null
        ? {
            usedPercent: primary.usedPercent,
            tone: pressureTone(primary.usedPercent),
            label:
              joinDetails([primary.usedLabel ?? undefined, primary.figure]) ??
              primary.figure,
          }
        : undefined,
    detail: primary
      ? joinDetails([
          accountLimit ? summary.accountLimit.detail : undefined,
          contextHeadroom ? summary.contextHeadroom.detail : undefined,
        ])
      : joinDetails([
          summary.accountLimit.detail,
          summary.contextHeadroom.detail,
        ]),
  };
}

function verificationBadge(
  status: "pass" | "warn" | "fail",
): NonNullable<SummaryMetricDescriptor["badge"]> {
  switch (status) {
    case "pass":
      return { label: "Passed", tone: "success" };
    case "fail":
      return { label: "Failed", tone: "danger" };
    case "warn":
      return { label: "Warnings", tone: "warning" };
  }
}

function buildUsageReadout(
  usage: NonNullable<TaskExecutionSummary["usage"]["value"]>,
): { figure?: string; parts: StatPart[]; value: string } {
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
  const parts: StatPart[] = [];
  if (cacheLabel) {
    parts.push({ text: cacheLabel, tone: "info" });
  }
  if (tokenLabel && costLabel) {
    parts.push({ text: costLabel, tone: "default" });
  }
  const figure = tokenLabel ?? costLabel ?? undefined;
  return {
    figure,
    parts,
    value:
      [tokenLabel, cacheLabel, costLabel].filter(Boolean).join(" · ") ||
      "Not reported",
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
  const usageReadout = usage ? buildUsageReadout(usage) : null;
  const fileLabel = changes
    ? `${changes.files.length} file${changes.files.length === 1 ? "" : "s"}`
    : null;
  const diffParts: StatPart[] = [];
  if (changes && changes.additions != null && changes.deletions != null) {
    diffParts.push(
      { text: `+${formatCount(changes.additions)}`, tone: "added" },
      { text: `−${formatCount(changes.deletions)}`, tone: "removed" },
    );
  } else if (changes?.partial) {
    diffParts.push({ text: "Partial", tone: "warning" });
  }
  const verificationStatus = verification
    ? verificationBadge(verification.status)
    : null;
  const agentParts: StatPart[] = [];
  if (agents && agents.blockedCount > 0) {
    agentParts.push({
      text: `${agents.blockedCount} blocked`,
      tone: "warning",
    });
  }
  if (agents && agents.failedCount > 0) {
    agentParts.push({ text: `${agents.failedCount} failed`, tone: "danger" });
  }
  if (
    agents &&
    agents.runningCount > 0 &&
    agents.runningCount < agents.totalCount
  ) {
    agentParts.push({ text: `${agents.runningCount} running`, tone: "info" });
  }
  const agentAccent: StatAccent = !agents
    ? "muted"
    : agents.blockedCount > 0
      ? "warning"
      : agents.failedCount > 0
        ? "danger"
        : "info";
  return [
    {
      key: "elapsed",
      icon: Clock3,
      label: "Elapsed",
      accent: elapsed ? "info" : "muted",
      figureTone: "default",
      provenance: summary.elapsed.provenance,
      detail: summary.elapsed.detail,
      figure: elapsed ? formatDuration(elapsed.milliseconds) : undefined,
      parts: elapsed?.running ? [{ text: "Running", tone: "info" }] : [],
      value: elapsed
        ? `${formatDuration(elapsed.milliseconds)}${elapsed.running ? " · running" : ""}`
        : "Not reported",
    },
    {
      key: "changes",
      icon: FileDiff,
      label: "Changes",
      accent: changes ? "info" : "muted",
      figureTone: "default",
      provenance: summary.changes.provenance,
      detail: summary.changes.detail,
      figure: fileLabel ?? undefined,
      parts: diffParts,
      value: fileLabel
        ? `${fileLabel}${
            changes && changes.additions != null && changes.deletions != null
              ? ` · +${formatCount(changes.additions)}/−${formatCount(changes.deletions)}`
              : ""
          }`
        : "No diff reported",
    },
    {
      key: "verification",
      icon: BadgeCheck,
      label: "Verification",
      accent: verificationStatus?.tone ?? "muted",
      figureTone: verificationStatus?.tone ?? "default",
      provenance: summary.verification.provenance,
      detail: summary.verification.detail,
      figure: verification
        ? `${verification.executedEntries}/${verification.totalEntries}`
        : undefined,
      parts: [],
      badge: verificationStatus ?? undefined,
      value: verification
        ? `${verification.status} · ${verification.executedEntries}/${verification.totalEntries}`
        : "Not reported",
    },
    {
      key: "usage",
      icon: Coins,
      label: "Usage",
      accent: usageReadout?.figure ? "info" : "muted",
      figureTone: "default",
      provenance: summary.usage.provenance,
      detail: summary.usage.detail,
      figure: usageReadout?.figure,
      parts: usageReadout?.parts ?? [],
      value: usageReadout?.value ?? "Not reported",
    },
    {
      key: "agents",
      icon: Network,
      label: "Agents",
      // A blocked agent outranks a failed one here: the failure is already
      // history, while the block is the thing this reader can still clear.
      accent: agentAccent,
      figureTone: "default",
      provenance: summary.agents.provenance,
      detail: summary.agents.detail,
      figure: agents
        ? `${agents.totalCount} ${agents.totalCount === 1 ? "agent" : "agents"}`
        : undefined,
      parts: agentParts,
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
  /**
   * Compact grids only. `shelf` is two-up until the host is wide; `panel`
   * stacks one tile per row until the rail is wide enough for two-up tiles.
   */
  layout?: "shelf" | "panel";
  /** Kept for callers that still hand this surface a global/utility class. */
  className?: string;
  xstyle?: StyleXValue;
  /** Tiles another part of the host already states (e.g. elapsed in a header). */
  omitKeys?: readonly SummaryMetricDescriptor["key"][];
}) {
  const showLatestActivity = args.showLatestActivity ?? true;
  const layout = args.layout ?? "shelf";
  const omit = new Set(args.omitKeys ?? []);
  const descriptors = buildMetricDescriptors(args.summary).filter(
    (descriptor) => !omit.has(descriptor.key),
  );
  // A grid that only says "Not reported" four times carries no information;
  // the tiles appear once the first fact lands.
  if (
    !showLatestActivity &&
    descriptors.every((descriptor) => descriptor.provenance === "unavailable")
  ) {
    return null;
  }

  return (
    <section
      className={cx(sx(styles.root, args.xstyle), args.className)}
      aria-label="Task execution summary"
      data-summary-layout={layout}
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
          args.compact
            ? layout === "panel"
              ? styles.gridPanel
              : styles.gridCompact
            : styles.gridMedium,
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
