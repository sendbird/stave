import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Layers,
  MemoryStick,
  Minus,
  OctagonAlert,
  TimerReset,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { ReactNode } from "react";

import { Badge, type BadgeTone } from "@/components/ads/components/Badge";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import {
  formatKB,
  formatSignedKB,
  formatUptime,
} from "@/lib/performance/resource-format";
import type { ResourceMetricSummary } from "@/lib/performance/resource-metric-history";
import {
  buildResourceGauge,
  cpuPressureLevel,
  memoryPressureLevel,
  summarizeResourceHealth,
  type ResourceGauge,
  type ResourcePressureLevel,
} from "@/lib/performance/resource-pressure";
import { sparklineGeometry } from "@/lib/performance/sparkline";
import type { AppMetrics } from "./ResourcesPopover";
import {
  dashboardStyles as styles,
  levelFillStyles,
  levelTextStyles,
} from "./resource-dashboard.styles";

/** Drawn in a fixed 100×26 user space and stretched; strokes stay 1.5px. */
const SPARK_WIDTH = 100;
const SPARK_HEIGHT = 26;

const LEVEL_TONE: Record<ResourcePressureLevel, BadgeTone> = {
  healthy: "success",
  elevated: "warning",
  high: "danger",
};

const LEVEL_ICON: Record<
  ResourcePressureLevel,
  typeof CheckCircle2 | typeof AlertTriangle
> = {
  healthy: CheckCircle2,
  elevated: AlertTriangle,
  high: OctagonAlert,
};

const LEVEL_WORD: Record<ResourcePressureLevel, string> = {
  healthy: "Normal",
  elevated: "Elevated",
  high: "High",
};

/**
 * Status readout. A level never travels as color alone: the icon distinguishes
 * the three states in grayscale, and the word distinguishes them for a screen
 * reader and under forced colors, where the fill is replaced by the OS.
 */
function LevelChip({ level }: { level: ResourcePressureLevel }) {
  const Icon = LEVEL_ICON[level];
  return (
    <Badge tone={LEVEL_TONE[level]} variant="soft" size="sm">
      <Icon className={sx(styles.badgeIcon)} aria-hidden />
      {LEVEL_WORD[level]}
    </Badge>
  );
}

/**
 * Below this a "trend" is a straight segment between two readings, which
 * implies a slope the data does not support; the tile shows nothing until the
 * window has filled enough to have a shape.
 */
const SPARK_MIN_POINTS = 4;

function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < SPARK_MIN_POINTS) {
    // Holds the strip's height, so the tile does not resize under the pointer
    // the moment the window has collected enough readings to draw.
    return <div className={sx(styles.spark)} aria-hidden />;
  }
  const geometry = sparklineGeometry(values, {
    width: SPARK_WIDTH,
    height: SPARK_HEIGHT,
  });
  if (!geometry) return null;
  return (
    <svg
      className={sx(styles.spark)}
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <path className={sx(styles.sparkArea)} d={geometry.area} />
      <path
        className={sx(styles.sparkLine)}
        d={geometry.line}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  level,
  children,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  /** Omitted when the reading has no honest limit to be measured against. */
  level?: ResourcePressureLevel;
  children?: ReactNode;
}) {
  return (
    <div className={sx(styles.tile)}>
      <div className={sx(styles.tileHead)}>
        <Icon className={sx(styles.tileIcon)} aria-hidden />
        <span className={sx(styles.tileLabel)}>{label}</span>
        {level && level !== "healthy" ? (
          <span className={sx(styles.statusSpacer)}>
            <LevelChip level={level} />
          </span>
        ) : null}
      </div>
      <div className={sx(styles.tileValue)}>{value}</div>
      {children}
    </div>
  );
}

function Meter({ gauge }: { gauge: ResourceGauge }) {
  const Icon = LEVEL_ICON[gauge.level];
  return (
    <div className={sx(styles.meterRow)}>
      <span className={sx(styles.meterLabel)}>
        {gauge.level === "healthy" ? null : (
          <Icon
            className={sx(styles.meterIcon, levelTextStyles[gauge.level])}
            aria-hidden
          />
        )}
        <span className={sx(styles.meterLabelText)}>{gauge.label}</span>
      </span>
      <span className={sx(styles.meterDetail, levelTextStyles[gauge.level])}>
        {gauge.detail} · {gauge.percent}%
      </span>
      <div
        className={sx(styles.track)}
        role="meter"
        aria-label={`${gauge.label}: ${LEVEL_WORD[gauge.level]}`}
        aria-valuenow={Math.min(100, Math.max(0, gauge.percent))}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${gauge.detail}, ${gauge.percent} percent, ${LEVEL_WORD[gauge.level]}`}
      >
        <div
          className={sx(
            styles.fill,
            levelFillStyles[gauge.level],
            transition.bar,
            transition.motionDurationEmphasis,
          )}
          style={{ width: `${Math.min(gauge.ratio * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * The breakdown is words and counts, not a color key.
 *
 * Five categorical swatches here would be decoration for a tile whose story is
 * a single number, and the design system's chart ramp does not clear the
 * colorblind separation floor on its orange/green adjacency — a pair this
 * legend would have put side by side. The labels already carry the identity.
 */
const ROLE_LEGEND = [
  { key: "main", label: "Main", roles: ["main"] },
  { key: "renderer", label: "Renderer", roles: ["host-renderer"] },
  { key: "lens", label: "Lens", roles: ["lens-guest"] },
  { key: "helper", label: "Helper", roles: ["gpu", "utility", "other"] },
] as const;

function trendIconFor(deltaKB: number | null) {
  if (deltaKB === null || Math.abs(deltaKB) < 1024) return Minus;
  return deltaKB > 0 ? TrendingUp : TrendingDown;
}

export function ResourceDashboard({
  metrics,
  rendererMemory,
  recent,
  totalFootprintKB,
  totalWorkingSetKB,
  totalCpuPercent,
  hiddenLensWorkingSetKB,
  hostProcessCount,
}: {
  metrics: AppMetrics;
  rendererMemory: {
    heap: { usedHeapSize: number; heapSizeLimit: number };
  } | null;
  recent: ResourceMetricSummary | null;
  totalFootprintKB: number;
  totalWorkingSetKB: number;
  totalCpuPercent: number;
  hiddenLensWorkingSetKB: number;
  hostProcessCount: number;
}) {
  const deviceTotalBytes = metrics.systemMemory
    ? metrics.systemMemory.totalKB * 1024
    : null;
  const footprintBytes = totalFootprintKB * 1024;
  const memoryLevel = memoryPressureLevel(footprintBytes, deviceTotalBytes);
  const deviceShare = deviceTotalBytes
    ? Math.round((footprintBytes / deviceTotalBytes) * 100)
    : null;
  const memoryDetail =
    deviceShare === null
      ? `App footprint at ${formatKB(totalFootprintKB)}`
      : `App footprint at ${deviceShare}% of ${formatKB(metrics.systemMemory!.totalKB)} device memory`;

  const gauges = [
    buildResourceGauge({
      id: "renderer-heap",
      label: "App renderer JS heap",
      used: rendererMemory?.heap.usedHeapSize,
      limit: rendererMemory?.heap.heapSizeLimit,
      detail: rendererMemory
        ? `${formatKB(rendererMemory.heap.usedHeapSize)} / ${formatKB(rendererMemory.heap.heapSizeLimit)}`
        : "",
    }),
    buildResourceGauge({
      id: "main-heap",
      label: "Main process JS heap",
      used: metrics.mainProcess.heapUsed / 1024,
      limit: metrics.mainProcess.heapSizeLimit / 1024,
      detail: `${formatKB(metrics.mainProcess.heapUsed / 1024)} / ${formatKB(metrics.mainProcess.heapSizeLimit / 1024)}`,
    }),
    buildResourceGauge({
      id: "lens-budget",
      label: "Hidden Lens pages",
      used: hiddenLensWorkingSetKB,
      limit: metrics.lens.memoryBudgetKB,
      detail: `${formatKB(hiddenLensWorkingSetKB)} / ${formatKB(metrics.lens.memoryBudgetKB ?? 0)}`,
    }),
  ].filter((gauge): gauge is ResourceGauge => gauge !== null);

  const health = summarizeResourceHealth({
    gauges,
    memoryLevel,
    memoryDetail,
    cpuPercent: totalCpuPercent,
    currentlyUnresponsive: metrics.renderer.currentlyUnresponsive,
  });
  const HealthIcon = LEVEL_ICON[health.level];

  const stabilityLevel: ResourcePressureLevel = metrics.renderer
    .currentlyUnresponsive
    ? "high"
    : metrics.renderer.unresponsiveEvents > 0 ||
        metrics.renderer.renderProcessGoneEvents > 0
      ? "elevated"
      : "healthy";
  const plural = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? "" : "s"}`;
  const stabilityCaption = metrics.renderer.currentlyUnresponsive
    ? "Renderer not responding"
    : stabilityLevel === "elevated"
      ? `${plural(metrics.renderer.unresponsiveEvents, "stall")} · ${plural(metrics.renderer.renderProcessGoneEvents, "renderer exit")}`
      : "No stalls or renderer exits";
  const StabilityIcon = LEVEL_ICON[stabilityLevel];

  const footprintSeries = recent?.footprintSeriesKB ?? [];
  const cpuSeries = recent?.cpuSeriesPercent ?? [];
  const windowSeconds = recent
    ? Math.max(1, Math.round(recent.durationMs / 1_000))
    : 0;
  const TrendIcon = trendIconFor(recent?.footprintDeltaKB ?? null);

  const roleCounts = [
    ...ROLE_LEGEND.map((entry) => ({
      key: entry.key,
      label: entry.label,
      count: metrics.processes.filter((process) =>
        (entry.roles as readonly string[]).includes(process.role),
      ).length,
    })),
    { key: "host" as const, label: "Host", count: hostProcessCount },
    // Without a color key there is nothing for a zero to hold a slot for, and
    // "0 Helper" is a line of text that says nothing.
  ].filter((entry) => entry.count > 0);

  return (
    <section className={sx(styles.root)} aria-label="Resource summary">
      <div className={sx(styles.statusBand)}>
        <Badge tone={LEVEL_TONE[health.level]} variant="soft" size="sm">
          <HealthIcon className={sx(styles.badgeIcon)} aria-hidden />
          {health.title}
        </Badge>
        <span className={sx(styles.statusReason)} title={health.reason}>
          {health.reason}
        </span>
        {windowSeconds > 0 ? (
          <span className={sx(styles.statusReason, styles.statusSpacer)}>
            Last {windowSeconds}s · {recent?.sampleCount ?? 0} samples
          </span>
        ) : null}
      </div>

      <div className={sx(styles.tiles)}>
        <Tile
          icon={MemoryStick}
          label="Memory footprint"
          value={formatKB(totalFootprintKB)}
          level={memoryLevel}
        >
          <Sparkline
            values={footprintSeries}
            label={`Memory footprint over the last ${windowSeconds} seconds`}
          />
          <span className={sx(styles.tileCaptionRow)}>
            <TrendIcon className={sx(styles.trendIcon)} aria-hidden />
            <span className={sx(styles.tileCaption)}>
              {recent?.footprintDeltaKB != null
                ? `${formatSignedKB(recent.footprintDeltaKB)} · `
                : ""}
              {deviceShare === null
                ? `RSS ${formatKB(totalWorkingSetKB)}`
                : `${deviceShare}% of ${formatKB(metrics.systemMemory!.totalKB)}`}
            </span>
          </span>
        </Tile>

        <Tile
          icon={Cpu}
          label="Electron CPU"
          value={`${totalCpuPercent.toFixed(1)}%`}
          level={cpuPressureLevel(totalCpuPercent)}
        >
          <Sparkline
            values={cpuSeries}
            label={`Electron CPU over the last ${windowSeconds} seconds`}
          />
          <span className={sx(styles.tileCaption)}>
            {recent?.cpuPeakPercent != null
              ? `Peak ${recent.cpuPeakPercent.toFixed(1)}% · Electron processes`
              : "Electron processes"}
          </span>
        </Tile>

        <Tile
          icon={Layers}
          label="Processes"
          value={String(metrics.processes.length + hostProcessCount)}
        >
          <div className={sx(styles.legend)}>
            {roleCounts.map((entry) => (
              <span key={entry.key} className={sx(styles.legendItem)}>
                <span className={sx(styles.legendCount)}>{entry.count}</span>
                {entry.label}
              </span>
            ))}
          </div>
          <span className={sx(styles.tileCaption)}>
            {metrics.lens.sessions} Lens · {metrics.lens.visibleSessions}{" "}
            visible
          </span>
        </Tile>

        <Tile
          icon={TimerReset}
          label="Uptime"
          value={formatUptime(metrics.uptimeSeconds)}
        >
          <span className={sx(styles.tileCaptionRow)}>
            {stabilityLevel === "healthy" ? null : (
              <StabilityIcon
                className={sx(
                  styles.trendIcon,
                  levelTextStyles[stabilityLevel],
                )}
                aria-hidden
              />
            )}
            <span
              className={sx(
                styles.tileCaption,
                levelTextStyles[stabilityLevel],
              )}
            >
              {stabilityCaption}
            </span>
          </span>
        </Tile>
      </div>

      {gauges.length > 0 ? (
        <div className={sx(styles.meters)}>
          <span className={sx(styles.sectionLabel, styles.metersLabel)}>
            Usage against a known limit
          </span>
          {gauges.map((gauge) => (
            <Meter key={gauge.id} gauge={gauge} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
