import type {
  ClaudeUsageSnapshot,
  CodexUsageSnapshot,
  CursorUsageSnapshot,
  KiroUsageSnapshot,
} from "@/lib/providers/provider.types";
import {
  SYSTEM_ACCOUNT_PROFILE_ID,
  type ProviderAccountProfile,
} from "@/lib/providers/provider-accounts";
import { canSwitchProviderAccount } from "@/lib/providers/provider-account-selection";

export const FIVE_HOURS_MS = 5 * 3_600_000;
export const SEVEN_DAYS_MS = 7 * 24 * 3_600_000;

export interface UsageHeadlineWindow {
  /** Short window tag rendered before the percentage; empty when unambiguous. */
  short: string;
  /** Tag in the full strip's muted context (`5h · resets 1h 7m`); may be empty. */
  label: string;
  /** What the window is, in words: `5-hour limit`, `Weekly limit`. */
  title: string;
  /** What else the reader needs to know about this window, when anything. */
  note: string | null;
  usedPercent: number;
  /** Reset time in epoch seconds, when reported. */
  resetsAt: number | null;
  /** Full window length in ms, when known; enables the time-left pie. */
  windowMs: number | null;
}

/** `300` → `5h`, `10080` → `7d`; `null` when the length is unknown. */
export function windowDurationTag(windowMs: number | null): string | null {
  if (windowMs === null || !Number.isFinite(windowMs) || windowMs <= 0) {
    return null;
  }
  const hours = windowMs / 3_600_000;
  if (hours < 24) {
    return `${Math.round(hours)}h`;
  }
  return `${Math.round(hours / 24)}d`;
}

/** `5h` → `5-hour limit`, a week → `Weekly limit`. */
export function windowDurationTitle(windowMs: number | null): string {
  if (windowMs === null || !Number.isFinite(windowMs) || windowMs <= 0) {
    return "Usage limit";
  }
  const hours = Math.round(windowMs / 3_600_000);
  if (hours === 7 * 24) {
    return "Weekly limit";
  }
  if (hours < 24) {
    return `${hours}-hour limit`;
  }
  return `${Math.round(hours / 24)}-day limit`;
}

function codexWindow(
  window: { usedPercent: number; resetsAt: number | null; windowDurationMins?: number | null },
  fallbackTitle: string,
): UsageHeadlineWindow {
  const minutes = window.windowDurationMins ?? null;
  const windowMs = minutes === null ? null : minutes * 60_000;
  const tag = windowDurationTag(windowMs) ?? "";
  return {
    short: tag,
    label: tag,
    title: windowMs === null ? fallbackTitle : windowDurationTitle(windowMs),
    note: null,
    usedPercent: window.usedPercent,
    resetsAt: window.resetsAt,
    windowMs,
  };
}

/**
 * Windows shown inline on the status-bar trigger, before the popover is
 * opened. Claude lists every window it reports rather than only the 5h one:
 * the session window paces the current sitting, but the weekly window is the
 * one that actually ends a day's work, so hiding it behind a click hides the
 * limit that binds first. Codex shows its first bucket's windows, named by
 * their length; other buckets' names only make sense next to the full
 * breakdown, so they stay in the popover.
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
              label: "5h",
              title: "5-hour limit",
              note: null,
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
              label: "7d",
              title: "Weekly limit",
              note: null,
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
              label: "7d Fable",
              title: "Weekly Fable limit",
              note: "Counts Fable models only.",
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
            label: "month",
            title: "Monthly included usage",
            note: null,
            usedPercent: provider.monthly.usedPercent,
            resetsAt: provider.monthly.resetsAt,
            windowMs: null,
          },
        ]
      : [];
  }
  const bucket = args.codex?.buckets[0] ?? null;
  if (bucket?.primary) {
    return [
      codexWindow(bucket.primary, "Usage limit"),
      ...(bucket.secondary ? [codexWindow(bucket.secondary, "Second usage limit")] : []),
    ];
  }
  if (bucket?.individualLimit) {
    return [
      {
        short: "",
        label: "credits",
        title: "Credit limit",
        note: null,
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

/** The meter labels its segments by display name; policies key on the provider id. */
export const STATUS_BAR_USAGE_PROVIDER_IDS: Record<
  StatusBarUsageProvider,
  "claude-code" | "codex" | "cursor" | "kiro"
> = { claude: "claude-code", codex: "codex", cursor: "cursor", kiro: "kiro" };

export const STATUS_BAR_USAGE_PROVIDER_NAMES: Record<StatusBarUsageProvider, string> = {
  claude: "Claude",
  codex: "Codex",
  cursor: "Cursor",
  kiro: "Kiro",
};

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

/** Providers whose CLI runs under a switchable Stave account profile. */
export type StatusBarAccountProviderId = "claude-code" | "codex";

export function statusBarAccountProviderId(
  provider: StatusBarUsageProvider,
): StatusBarAccountProviderId | null {
  return provider === "claude" ? "claude-code" : provider === "codex" ? "codex" : null;
}

export interface StatusBarAccountView {
  options: ProviderAccountProfile[];
  selected: ProviderAccountProfile | null;
  /**
   * Named beside the provider on the meter only when it says something: an
   * API-billing gateway, a non-default account, or one that no longer exists.
   */
  triggerLabel: string | null;
  gateway: boolean;
  /** The switch is drawn only when there is another account to pick. */
  canSwitch: boolean;
}

/**
 * The account the next turns use, as the status bar shows it. Usage limits
 * belong to an account, so the meter is where the account is named and
 * switched — not every composer.
 */
export function resolveStatusBarAccountView(args: {
  providerId: StatusBarAccountProviderId;
  profiles: readonly ProviderAccountProfile[];
  selectedId: string;
}): StatusBarAccountView {
  const options = args.profiles.filter(
    (profile) => profile.providerId === args.providerId,
  );
  const selected = options.find((profile) => profile.id === args.selectedId) ?? null;
  const gateway = Boolean(selected?.gateway);
  const triggerLabel = gateway
    ? "API billing"
    : !selected
      ? args.selectedId === SYSTEM_ACCOUNT_PROFILE_ID
        ? null
        : "Account unavailable"
      : selected.id === SYSTEM_ACCOUNT_PROFILE_ID
        ? null
        : selected.label;
  return {
    options,
    selected,
    triggerLabel,
    gateway,
    canSwitch: canSwitchProviderAccount(options),
  };
}
