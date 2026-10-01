import type {
  ClaudeUsageSnapshot,
  CodexUsageSnapshot,
  CursorUsageSnapshot,
  KiroUsageSnapshot,
} from "@/lib/providers/provider.types";

export const FIVE_HOURS_MS = 5 * 3_600_000;
export const SEVEN_DAYS_MS = 7 * 24 * 3_600_000;

export interface UsageHeadlineWindow {
  /** Short window tag rendered before the percentage; empty when unambiguous. */
  short: string;
  usedPercent: number;
  /** Reset time in epoch seconds, when reported. */
  resetsAt: number | null;
  /** Full window length in ms, when known; enables the time-left pie. */
  windowMs: number | null;
}

/**
 * Windows shown inline on the status-bar trigger, before the popover is
 * opened. Claude lists every window it reports rather than only the 5h one:
 * the session window paces the current sitting, but the weekly window is the
 * one that actually ends a day's work, so hiding it behind a click hides the
 * limit that binds first. Codex buckets stay collapsed to a single headline
 * because their names only make sense next to the full breakdown.
 */
export function buildUsageHeadlineWindows(args: {
  provider: "claude" | "codex" | "cursor" | "kiro";
  claude?: ClaudeUsageSnapshot | null;
  codex?: CodexUsageSnapshot | null;
  cursor?: CursorUsageSnapshot | null;
  kiro?: KiroUsageSnapshot | null;
}): UsageHeadlineWindow[] {
  if (args.provider === "claude") {
    const claude = args.claude;
    if (!claude || claude.source === "unavailable") {
      return [];
    }
    return [
      ...(claude.session
        ? [
            {
              short: "5h",
              usedPercent: claude.session.usedPercent,
              resetsAt: claude.session.resetsAt,
              windowMs: FIVE_HOURS_MS,
            },
          ]
        : []),
      ...(claude.weekly
        ? [
            {
              short: "7d",
              usedPercent: claude.weekly.usedPercent,
              resetsAt: claude.weekly.resetsAt,
              windowMs: SEVEN_DAYS_MS,
            },
          ]
        : []),
      ...(claude.fableWeekly
        ? [
            {
              short: "7d·F",
              usedPercent: claude.fableWeekly.usedPercent,
              resetsAt: claude.fableWeekly.resetsAt,
              windowMs: SEVEN_DAYS_MS,
            },
          ]
        : []),
    ];
  }
  if (args.provider === "cursor" || args.provider === "kiro") {
    const provider = args[args.provider];
    return provider?.source !== "unavailable" && provider?.monthly
      ? [
          {
            short: "",
            usedPercent: provider.monthly.usedPercent,
            resetsAt: provider.monthly.resetsAt,
            windowMs: null,
          },
        ]
      : [];
  }
  const bucket = args.codex?.buckets[0] ?? null;
  if (bucket?.primary) {
    const minutes = bucket.primary.windowDurationMins;
    return [
      {
        short: "",
        usedPercent: bucket.primary.usedPercent,
        resetsAt: bucket.primary.resetsAt,
        windowMs: minutes === null ? null : minutes * 60_000,
      },
    ];
  }
  if (bucket?.individualLimit) {
    return [
      {
        short: "",
        usedPercent: bucket.individualLimit.usedPercent,
        resetsAt: bucket.individualLimit.resetsAt,
        windowMs: null,
      },
    ];
  }
  return [];
}

/** The dot tracks the window closest to its limit, not the first one listed. */
export function headlineUsagePercent(
  windows: readonly UsageHeadlineWindow[],
): number | null {
  return windows.length
    ? Math.max(...windows.map((window) => window.usedPercent))
    : null;
}

export type StatusBarUsageProvider = "claude" | "codex" | "cursor" | "kiro";

const STATUS_BAR_USAGE_PROVIDERS: ReadonlyArray<{
  provider: StatusBarUsageProvider;
  providerId: "claude-code" | "codex" | "cursor" | "kiro";
}> = [
  { provider: "claude", providerId: "claude-code" },
  { provider: "codex", providerId: "codex" },
  { provider: "cursor", providerId: "cursor" },
  { provider: "kiro", providerId: "kiro" },
];

/**
 * Only engines whose CLI is connected get a usage meter. Availability starts
 * optimistic (`true`) and is lowered once discovery reports a missing CLI, so
 * an unknown provider stays visible rather than flickering in after boot.
 */
export function listCliConnectedUsageProviders(
  availability: Partial<Record<string, boolean>>,
): StatusBarUsageProvider[] {
  return STATUS_BAR_USAGE_PROVIDERS.filter(
    ({ providerId }) => availability[providerId] !== false,
  ).map(({ provider }) => provider);
}


/**
 * Fraction (0–1) of a quota window's duration still left before it resets.
 * Returns null when the reset time or the window length is unknown, because
 * a ratio without a known denominator would be a guess.
 */
export function resolveWindowTimeLeftRatio(args: {
  resetsAt: number | null;
  windowMs: number | null;
  now?: number;
}): number | null {
  const { resetsAt, windowMs } = args;
  if (
    resetsAt === null ||
    !Number.isFinite(resetsAt) ||
    windowMs === null ||
    !Number.isFinite(windowMs) ||
    windowMs <= 0
  ) {
    return null;
  }
  const leftMs = resetsAt * 1000 - (args.now ?? Date.now());
  return Math.min(1, Math.max(0, leftMs / windowMs));
}
