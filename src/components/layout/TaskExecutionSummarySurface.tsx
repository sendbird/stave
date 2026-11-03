import { formatDuration, formatNumber, formatPercent, formatCost } from "@/i18n/format";
import { i18n, useTranslation } from "@/i18n";
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
import { Meter } from "@/components/ads/components/Meter";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { cx, sx, type StyleXValue } from "@/components/ads/utils/stylex";
import type { Tone } from "@/components/ads/utils/tone";
import { usageThresholdTone, type UsageThresholdKind } from "@/lib/usage/usage-thresholds";
import { summaryStyles as styles } from "./task-execution-summary.styles";

type MetricTone = Extract<Tone, "neutral" | "success" | "warning" | "danger">;
/** The two sides of a diff: a category, drawn in the diff tokens, not a tone. */
type DiffHue = "added" | "removed";
type PartInk = MetricTone | DiffHue;
/** The meter stays neutral until the reading itself is a concern. */
type MeterTone = Extract<Tone, "neutral" | "warning" | "danger">;

/**
 * One tile of the summary grid.
 *
 * The tiles are described as data rather than written out as JSX so the grid
 * stays a fixed, evenly divisible count: six tiles land flush on the 2 / 3 / 6
 * column breakpoints instead of leaving a widowed cell on the last row.
 */
interface StatPart {
  text: string;
  tone: PartInk;
}

interface StatMeter {
  usedPercent: number;
  label: string;
  tone: MeterTone;
}

/**
 * One tile of the summary grid.
 *
 * `figure` is the readout ("4 files", "41% left"). `parts` are the small
 * facts under it (a diff, a cache rate, how much of the limit is used).
 * Color is reserved for state: the figure only leaves the text color when
 * the reading is a pass, a warning, or a failure, so a grid of healthy
 * numbers stays monochrome. An empty tile has neither: it keeps the honest
 * fallback sentence at caption size so it does not pretend to be a
 * measurement.
 */
interface SummaryMetricDescriptor {
  key: string;
  icon: LucideIcon;
  label: string;
  /** Full phrase for the tooltip. The visible readout is figure plus parts. */
  value: string;
  figureTone: MetricTone;
  provenance: TaskExecutionMetricProvenance;
  detail?: string;
  figure?: string;
  parts: StatPart[];
  meter?: StatMeter;
}

function formatCount(value: number) {
  return formatNumber(value, {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  });
}

function provenanceLabel(provenance: TaskExecutionMetricProvenance) {
  switch (provenance) {
    case "reported":
      return i18n.t("workspace:taskExecutionSummarySurface.reported");
    case "derived":
      return i18n.t("workspace:taskExecutionSummarySurface.derived");
    case "unavailable":
      return i18n.t("workspace:taskExecutionSummarySurface.unavailable");
  }
}

const FIGURE_TONE: Record<MetricTone, StyleXValue> = {
  neutral: styles.figureDefault,
  success: styles.toneSuccess,
  warning: styles.toneWarning,
  danger: styles.toneDanger,
};

const PART_INK: Record<PartInk, StyleXValue> = {
  neutral: styles.toneDefault,
  success: styles.toneSuccess,
  warning: styles.toneWarning,
  danger: styles.toneDanger,
  added: styles.toneAdded,
  removed: styles.toneRemoved,
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

/**
 * A second reading of the figure above it: the design system's small meter,
 * muted until the headroom is actually tight.
 */
function StatMeterBar(args: { meter: StatMeter }) {
  const clamped = Math.min(100, Math.max(0, args.meter.usedPercent));
  return (
    <Meter
      xstyle={styles.meter}
      label={args.meter.label}
      hideLabel
      hideValue
      size="sm"
      tone={args.meter.tone}
      value={Math.round(clamped)}
      getAriaValueText={() => args.meter.label}
    />
  );
}

function SummaryMetricTile(args: {
  descriptor: SummaryMetricDescriptor;
  compact?: boolean;
  panel?: boolean;
}) {
  const { descriptor } = args;
  const Icon = descriptor.icon;
  return (
    <div
      className={sx(styles.tile, args.compact && styles.tileCompact, args.panel && styles.tilePanel)}
      data-metric={descriptor.key}
      title={joinDetails([
        descriptor.label,
        descriptor.value,
        descriptor.detail,
      ])}
    >
      <div className={sx(styles.tileHead)}>
        <Icon className={sx(styles.tileIcon)} aria-hidden="true" />
        <dt className={sx(styles.tileLabel)}>{descriptor.label}</dt>
        <ProvenanceDot provenance={descriptor.provenance} />
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
                  className={sx(styles.part, PART_INK[part.tone])}
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
/** A whole percent ("37%"), as account limits and cache rates are read. */
function formatWholePercent(percent: number): string {
  return formatPercent(percent / 100, { maximumFractionDigits: 0 });
}

function formatContextPercent(usedPercent: number): string {
  return formatPercent(usedPercent / 100, { minimumFractionDigits: usedPercent < 10 ? 1 : 0, maximumFractionDigits: usedPercent < 10 ? 1 : 0 });
}

interface HeadroomFact {
  /** Which shared scale colours this reading: the context window or an account quota. */
  kind: UsageThresholdKind;
  /** 0–1. Lower means less room, so the tighter fact becomes the hero. */
  remainingRatio: number | null;
  usedPercent: number | null;
  figure: string;
  /** Names the meter, e.g. "59% used". */
  usedLabel: string | null;
}

/**
 * The bar and the number change together, on the same scale the composer
 * context meter or the quota surfaces use for that reading.
 */
function pressureTone(kind: UsageThresholdKind, usedPercent: number): MeterTone {
  return usageThresholdTone(kind, usedPercent, "neutral");
}

function contextHeadroomFact(
  headroom: NonNullable<TaskExecutionSummary["contextHeadroom"]["value"]>,
): HeadroomFact | null {
  if (headroom.remainingTokens !== undefined && headroom.totalTokens) {
    const remainingRatio = headroom.remainingTokens / headroom.totalTokens;
    const usedPercent = (1 - remainingRatio) * 100;
    return {
      kind: "context",
      remainingRatio,
      usedPercent,
      figure: i18n.t("workspace:taskExecutionSummarySurface.contextLeft", { amount: formatCount(headroom.remainingTokens) }),
      usedLabel: i18n.t("workspace:taskExecutionSummarySurface.percentUsed", { percent: formatContextPercent(usedPercent) }),
    };
  }
  if (headroom.remainingTokens !== undefined) {
    return {
      kind: "context",
      remainingRatio: null,
      usedPercent: headroom.usedPercent ?? null,
      figure: i18n.t("workspace:taskExecutionSummarySurface.contextLeft", { amount: formatCount(headroom.remainingTokens) }),
      usedLabel:
        headroom.usedPercent !== undefined
          ? i18n.t("workspace:taskExecutionSummarySurface.percentUsed", { percent: formatContextPercent(headroom.usedPercent) })
          : null,
    };
  }
  if (headroom.usedPercent !== undefined) {
    return {
      kind: "context",
      remainingRatio: (100 - headroom.usedPercent) / 100,
      usedPercent: headroom.usedPercent,
      figure: i18n.t("workspace:taskExecutionSummarySurface.contextLeft", { amount: formatContextPercent(100 - headroom.usedPercent) }),
      usedLabel: i18n.t("workspace:taskExecutionSummarySurface.percentUsed", { percent: formatContextPercent(headroom.usedPercent) }),
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
    kind: "quota",
    remainingRatio: left / 100,
    usedPercent: used,
    figure: i18n.t("workspace:taskExecutionSummarySurface.percentLeft", { percent: formatWholePercent(left) }),
    usedLabel: i18n.t("workspace:taskExecutionSummarySurface.percentUsed", { percent: formatWholePercent(used) }),
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
  const provenance: TaskExecutionMetricProvenance = primary
    ? "reported"
    : "unavailable";
  const tone: MeterTone =
    primary?.usedPercent != null
      ? pressureTone(primary.kind, primary.usedPercent)
      : "neutral";
  const parts: StatPart[] = [];
  if (primary?.usedLabel) {
    parts.push({ text: primary.usedLabel, tone: "neutral" });
  }
  if (secondary) {
    parts.push({ text: secondary.figure, tone: "neutral" });
  }
  if (accountLimit?.label) {
    parts.push({ text: accountLimit.label, tone: "neutral" });
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
    : i18n.t("workspace:taskExecutionSummarySurface.notReported");
  return {
    key: "headroom",
    icon: Gauge,
    label: i18n.t("workspace:taskExecutionSummarySurface.headroom"),
    figureTone: tone,
    provenance,
    value,
    figure: primary?.figure,
    parts,
    meter:
      primary?.usedPercent != null
        ? {
            usedPercent: primary.usedPercent,
            tone,
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

function verificationOutcome(status: "pass" | "warn" | "fail"): {
  label: string;
  tone: Exclude<MetricTone, "neutral">;
} {
  switch (status) {
    case "pass":
      return { label: i18n.t("workspace:taskExecutionSummarySurface.passed"), tone: "success" };
    case "fail":
      return { label: i18n.t("workspace:taskExecutionSummarySurface.failed"), tone: "danger" };
    case "warn":
      return { label: i18n.t("workspace:taskExecutionSummarySurface.warnings"), tone: "warning" };
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
    ? i18n.t("workspace:taskExecutionSummarySurface.tokenCount", { amount: formatCount(usage.promptTokens + usage.outputTokens) })
    : null;
  // Only over providers whose prompt convention is verified; see
  // `TaskExecutionUsage.cacheRatePromptTokens`.
  const cacheLabel =
    usage.cacheRatePromptTokens > 0 && usage.cacheRateCachedTokens > 0
      ? i18n.t("workspace:taskExecutionSummarySurface.percentCached", { percent: formatWholePercent(Math.round((usage.cacheRateCachedTokens / usage.cacheRatePromptTokens) * 100)) })
      : null;
  // A detail tile: spend to the hundredth of a cent.
  const costLabel =
    usage.totalCostUsd != null
      ? formatCost(usage.totalCostUsd, "USD", { fractionDigits: 4 })
      : usage.costAmount !== undefined && usage.costCurrency
        ? formatCost(usage.costAmount, usage.costCurrency, { fractionDigits: 4 })
        : null;
  const parts: StatPart[] = [];
  if (cacheLabel) {
    parts.push({ text: cacheLabel, tone: "neutral" });
  }
  if (tokenLabel && costLabel) {
    parts.push({ text: costLabel, tone: "neutral" });
  }
  const figure = tokenLabel ?? costLabel ?? undefined;
  return {
    figure,
    parts,
    value:
      [tokenLabel, cacheLabel, costLabel].filter(Boolean).join(" · ") ||
      i18n.t("workspace:taskExecutionSummarySurface.notReported"),
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
    ? i18n.t("workspace:taskExecutionSummarySurface.fileCount", { count: changes.files.length })
    : null;
  const diffParts: StatPart[] = [];
  if (changes && changes.additions != null && changes.deletions != null) {
    diffParts.push(
      { text: `+${formatCount(changes.additions)}`, tone: "added" },
      { text: `−${formatCount(changes.deletions)}`, tone: "removed" },
    );
  } else if (changes?.partial) {
    diffParts.push({ text: i18n.t("workspace:taskExecutionSummarySurface.partial"), tone: "warning" });
  }
  const verificationOutcomeLabel = verification
    ? verificationOutcome(verification.status)
    : null;
  const agentParts: StatPart[] = [];
  if (agents && agents.blockedCount > 0) {
    agentParts.push({
      text: i18n.t("workspace:taskExecutionSummarySurface.blockedCount", { count: agents.blockedCount }),
      tone: "warning",
    });
  }
  if (agents && agents.failedCount > 0) {
    agentParts.push({ text: i18n.t("workspace:taskExecutionSummarySurface.failedCount", { count: agents.failedCount }), tone: "danger" });
  }
  if (
    agents &&
    agents.runningCount > 0 &&
    agents.runningCount < agents.totalCount
  ) {
    agentParts.push({
      text: i18n.t("workspace:taskExecutionSummarySurface.runningCount", { count: agents.runningCount }),
      tone: "neutral",
    });
  }
  return [
    {
      key: "elapsed",
      icon: Clock3,
      label: i18n.t("workspace:taskExecutionSummarySurface.elapsed"),
      figureTone: "neutral",
      provenance: summary.elapsed.provenance,
      detail: summary.elapsed.detail,
      figure: elapsed ? formatDuration(elapsed.milliseconds) : undefined,
      parts: elapsed?.running ? [{ text: i18n.t("workspace:taskExecutionSummarySurface.running"), tone: "neutral" }] : [],
      value: elapsed
        ? elapsed.running ? i18n.t("workspace:taskExecutionSummarySurface.runningDuration", { duration: formatDuration(elapsed.milliseconds) }) : formatDuration(elapsed.milliseconds)
        : i18n.t("workspace:taskExecutionSummarySurface.notReported"),
    },
    {
      key: "changes",
      icon: FileDiff,
      label: i18n.t("workspace:taskExecutionSummarySurface.changes"),
      figureTone: "neutral",
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
        : i18n.t("workspace:taskExecutionSummarySurface.noDiffReported"),
    },
    {
      key: "verification",
      icon: BadgeCheck,
      label: i18n.t("workspace:taskExecutionSummarySurface.verification"),
      // The outcome is the figure: it is the one word this reader came for.
      // The count is context under it.
      figureTone: verificationOutcomeLabel?.tone ?? "neutral",
      provenance: summary.verification.provenance,
      detail: summary.verification.detail,
      figure: verificationOutcomeLabel?.label,
      parts: verification
        ? [
            {
              text: i18n.t("workspace:taskExecutionSummarySurface.entriesRan", { executed: verification.executedEntries, total: verification.totalEntries }),
              tone: "neutral",
            },
          ]
        : [],
      value: verification
        ? `${verificationOutcome(verification.status).label} · ${verification.executedEntries}/${verification.totalEntries}`
        : i18n.t("workspace:taskExecutionSummarySurface.notReported"),
    },
    {
      key: "usage",
      icon: Coins,
      label: i18n.t("workspace:taskExecutionSummarySurface.usage"),
      figureTone: "neutral",
      provenance: summary.usage.provenance,
      detail: summary.usage.detail,
      figure: usageReadout?.figure,
      parts: usageReadout?.parts ?? [],
      value: usageReadout?.value ?? i18n.t("workspace:taskExecutionSummarySurface.notReported"),
    },
    {
      key: "agents",
      icon: Network,
      label: i18n.t("workspace:taskExecutionSummarySurface.agents"),
      figureTone: "neutral",
      provenance: summary.agents.provenance,
      detail: summary.agents.detail,
      figure: agents
        ? i18n.t("workspace:taskExecutionSummarySurface.agentCount", { count: agents.totalCount })
        : undefined,
      parts: agentParts,
      value: agents ? agents.label : i18n.t("workspace:taskExecutionSummarySurface.mainLoopOnly"),
    },
    buildHeadroomDescriptor(summary),
  ];
}

function LatestActivityRow(args: {
  metric: TaskExecutionMetric<{ label: string; detail?: string }>;
  compact?: boolean;
}) {
  const { t: tI18n } = useTranslation(["workspace"]);
  const latest = args.metric.value;
  return (
    <div className={sx(styles.activityRow)}>
      <Activity className={sx(styles.activityIcon)} aria-hidden="true" />
      <div className={sx(styles.activityBody)}>
        <h3 className={sx(styles.activityHeading)}>{tI18n("workspace:taskExecutionSummarySurface.latestActivity")}</h3>
        <p
          className={sx(
            styles.activityText,
            args.compact
              ? styles.activityTextClampOne
              : styles.activityTextClampTwo,
          )}
        >
          {latest?.label ?? tI18n("workspace:taskExecutionSummarySurface.noActivityReported")}
          {latest?.detail ? (
            <span className={sx(styles.activityDetail)}>
              {" "}
              · {latest.detail}
            </span>
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
  const { t: tI18n } = useTranslation(["workspace"]);
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
      aria-label={tI18n("workspace:taskExecutionSummarySurface.taskExecutionSummary")}
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
              ? [styles.gridPanel, styles.gridPanelSurface]
              : styles.gridCompact
            : styles.gridMedium,
        )}
      >
        {descriptors.map((descriptor) => (
          <SummaryMetricTile
            compact={args.compact}
            panel={args.compact === true && layout === "panel"}
            descriptor={descriptor}
            key={descriptor.key}
          />
        ))}
      </dl>
    </section>
  );
}
