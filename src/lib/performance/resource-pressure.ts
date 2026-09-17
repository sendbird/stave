/**
 * Severity for every colored signal in the Resource Manager.
 *
 * Color in this surface is *status*, never identity or magnitude: a level is
 * only ever derived from a measurement that has a real denominator (a heap
 * limit, a configured budget, device RAM) or a threshold that means something
 * on its own (summed CPU, renderer stalls). Anything without one — total RSS,
 * a workspace's share of it — is drawn in a single neutral hue and reads its
 * meaning from length and text instead.
 */
export type ResourcePressureLevel = "healthy" | "elevated" | "high";

/** Shared ramp for every gauge that divides a usage by a real limit. */
export const PRESSURE_ELEVATED_RATIO = 0.6;
export const PRESSURE_HIGH_RATIO = 0.85;

/**
 * Summed across processes, so 100% is one saturated core rather than the whole
 * machine. A multi-core desktop tolerates a sustained core; two is the point at
 * which the app is plausibly the reason the fans are audible.
 */
export const CPU_ELEVATED_PERCENT = 60;
export const CPU_HIGH_PERCENT = 120;

/**
 * Share of device RAM the app may hold before it is worth surfacing. Reported
 * against total memory, not free memory: on macOS "free" excludes reclaimable
 * cache, so a free-memory gauge would read critical on an idle machine and the
 * warning would stop meaning anything.
 */
export const MEMORY_SHARE_ELEVATED_RATIO = 0.25;
export const MEMORY_SHARE_HIGH_RATIO = 0.4;

/** Fallback thresholds when device memory is unavailable (browser dev mode). */
export const MEMORY_ABSOLUTE_ELEVATED_BYTES = 4 * 1024 ** 3;
export const MEMORY_ABSOLUTE_HIGH_BYTES = 8 * 1024 ** 3;

const LEVEL_RANK: Record<ResourcePressureLevel, number> = {
  healthy: 0,
  elevated: 1,
  high: 2,
};

export function ratioPressureLevel(ratio: number): ResourcePressureLevel {
  if (!Number.isFinite(ratio) || ratio < PRESSURE_ELEVATED_RATIO)
    return "healthy";
  return ratio < PRESSURE_HIGH_RATIO ? "elevated" : "high";
}

export function cpuPressureLevel(percent: number): ResourcePressureLevel {
  if (!Number.isFinite(percent) || percent < CPU_ELEVATED_PERCENT)
    return "healthy";
  return percent < CPU_HIGH_PERCENT ? "elevated" : "high";
}

export function memoryPressureLevel(
  footprintBytes: number,
  deviceTotalBytes: number | null,
): ResourcePressureLevel {
  if (deviceTotalBytes !== null && deviceTotalBytes > 0) {
    const share = footprintBytes / deviceTotalBytes;
    if (share < MEMORY_SHARE_ELEVATED_RATIO) return "healthy";
    return share < MEMORY_SHARE_HIGH_RATIO ? "elevated" : "high";
  }
  if (footprintBytes < MEMORY_ABSOLUTE_ELEVATED_BYTES) return "healthy";
  return footprintBytes < MEMORY_ABSOLUTE_HIGH_BYTES ? "elevated" : "high";
}

export function worstPressureLevel(
  levels: readonly ResourcePressureLevel[],
): ResourcePressureLevel {
  return levels.reduce<ResourcePressureLevel>(
    (worst, level) => (LEVEL_RANK[level] > LEVEL_RANK[worst] ? level : worst),
    "healthy",
  );
}

/** A usage that can honestly be divided by a limit. */
export interface ResourceGauge {
  id: string;
  label: string;
  used: number;
  limit: number;
  ratio: number;
  percent: number;
  level: ResourcePressureLevel;
  detail: string;
}

/** `null` when the limit is unknown — a gauge without a denominator is a lie. */
export function buildResourceGauge(args: {
  id: string;
  label: string;
  used: number | null | undefined;
  limit: number | null | undefined;
  detail: string;
}): ResourceGauge | null {
  const { used, limit } = args;
  if (typeof used !== "number" || typeof limit !== "number") return null;
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) {
    return null;
  }
  const ratio = Math.max(0, used) / limit;
  return {
    id: args.id,
    label: args.label,
    used,
    limit,
    ratio,
    percent: Math.round(ratio * 100),
    level: ratioPressureLevel(ratio),
    detail: args.detail,
  };
}

export interface ResourceHealth {
  level: ResourcePressureLevel;
  title: string;
  /** Names the single worst contributor, so the color is always explained. */
  reason: string;
}

const HEALTH_TITLE: Record<ResourcePressureLevel, string> = {
  healthy: "Healthy",
  elevated: "Elevated",
  high: "High pressure",
};

/**
 * One headline for the whole dialog. Ordered so an unresponsive renderer — the
 * only signal the user can already feel — always wins over a merely full gauge.
 */
export function summarizeResourceHealth(args: {
  gauges: readonly ResourceGauge[];
  memoryLevel: ResourcePressureLevel;
  memoryDetail: string;
  cpuPercent: number;
  currentlyUnresponsive: boolean;
}): ResourceHealth {
  if (args.currentlyUnresponsive) {
    return {
      level: "high",
      title: HEALTH_TITLE.high,
      reason: "The app renderer is not responding to input",
    };
  }
  const cpuLevel = cpuPressureLevel(args.cpuPercent);
  const candidates: Array<{ level: ResourcePressureLevel; reason: string }> = [
    { level: args.memoryLevel, reason: args.memoryDetail },
    {
      level: cpuLevel,
      reason: `Electron CPU at ${args.cpuPercent.toFixed(1)}%`,
    },
    ...args.gauges.map((gauge) => ({
      level: gauge.level,
      reason: `${gauge.label}: ${gauge.percent}% of the limit`,
    })),
  ];
  const level = worstPressureLevel(candidates.map((entry) => entry.level));
  if (level === "healthy") {
    return {
      level,
      title: HEALTH_TITLE.healthy,
      reason: "Every measured limit is within range",
    };
  }
  const worst = candidates.find((entry) => entry.level === level)!;
  return { level, title: HEALTH_TITLE[level], reason: worst.reason };
}
