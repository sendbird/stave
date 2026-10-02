import { formatCostUsd } from "@/lib/missions/usage";
import type { ProviderTurnSpend } from "@/lib/providers/turn-spend";
import type {
  StatusBarAccountView,
  StatusBarUsageProvider,
  UsageHeadlineWindow,
} from "@/components/layout/status-bar-usage.utils";

/**
 * Pure parts of the status bar usage strip: ring and clock geometry, the
 * words the strip and its hints use, and the width rule that decides between
 * the full strip and the compact meter.
 */

export type UsageTone = "ok" | "warn" | "danger";

export function clampUsagePercent(usedPercent: number): number {
  if (!Number.isFinite(usedPercent)) {
    return 0;
  }
  return Math.min(100, Math.max(0, usedPercent));
}

/** The meters' shared thresholds: under 60% is fine, under 85% is worth watching. */
export function usageTone(usedPercent: number): UsageTone {
  const percent = clampUsagePercent(usedPercent);
  if (percent < 60) return "ok";
  if (percent < 85) return "warn";
  return "danger";
}

export function formatUsagePercent(usedPercent: number): string {
  return `${Math.round(usedPercent)}%`;
}

/**
 * Stroke-dash lengths for a ring whose arc is the used share. The arc starts
 * at 12 o'clock and runs clockwise, the same way the clock hand inside it does.
 */
export function resolveQuotaRingArc(args: {
  usedPercent: number;
  radius: number;
}): { circumference: number; filled: number } {
  const circumference = 2 * Math.PI * args.radius;
  return {
    circumference,
    filled: (clampUsagePercent(args.usedPercent) / 100) * circumference,
  };
}

export type TimeLeftWedge =
  | { kind: "full" }
  | { kind: "none" }
  | { kind: "path"; d: string };

/**
 * Clock-face geometry for the share of a window still left. The hand sits at
 * the elapsed position (12 o'clock = window start) and the wedge sweeps from
 * the hand back to 12, so a shrinking wedge reads as time running out.
 */
export function resolveTimeLeftHand(args: {
  timeLeftRatio: number;
  center: number;
  radius: number;
}): { handX: number; handY: number; wedge: TimeLeftWedge } {
  const ratio = Math.min(1, Math.max(0, args.timeLeftRatio));
  const { center: c, radius: r } = args;
  const angle = (1 - ratio) * 2 * Math.PI;
  const handX = c + r * Math.sin(angle);
  const handY = c - r * Math.cos(angle);
  if (ratio >= 1) return { handX, handY, wedge: { kind: "full" } };
  if (ratio <= 0) return { handX, handY, wedge: { kind: "none" } };
  const largeArc = ratio > 0.5 ? 1 : 0;
  return {
    handX,
    handY,
    wedge: {
      kind: "path",
      d: `M ${c} ${c} L ${handX} ${handY} A ${r} ${r} 0 ${largeArc} 1 ${c} ${c - r} Z`,
    },
  };
}

/**
 * Time until a reset, largest two units: `42m`, `1h 7m`, `3d 4h`. Null when no
 * reset time was reported; `now` once the reported time has passed.
 */
export function formatResetCountdown(
  resetsAt: number | null,
  now: number,
): string | null {
  if (resetsAt === null || !Number.isFinite(resetsAt)) {
    return null;
  }
  const deltaMs = resetsAt * 1000 - now;
  if (deltaMs <= 0) return "now";
  const totalMinutes = Math.floor(deltaMs / 60_000);
  if (totalMinutes < 1) return "<1m";
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

/** The reset as a wall-clock time: `3:42 PM` today, `Mon 9:00 AM` this week, the date and time later. */
export function formatResetClock(
  resetsAt: number,
  now: number,
  locale?: string,
): string {
  const at = new Date(resetsAt * 1000);
  const today = new Date(now);
  const sameDay =
    at.getFullYear() === today.getFullYear() &&
    at.getMonth() === today.getMonth() &&
    at.getDate() === today.getDate();
  const time = { hour: "numeric", minute: "2-digit" } as const;
  if (sameDay) {
    return new Intl.DateTimeFormat(locale, time).format(at);
  }
  const withinWeek = at.getTime() - now < 6 * 24 * 3_600_000;
  return new Intl.DateTimeFormat(
    locale,
    withinWeek
      ? { ...time, weekday: "short" }
      : { ...time, month: "short", day: "numeric" },
  ).format(at);
}

/** Muted context after the percent: `5h · resets 1h 7m`. */
export function formatWindowContext(window: UsageHeadlineWindow, now: number): string {
  const countdown = formatResetCountdown(window.resetsAt, now);
  const reset = countdown === null ? null : `resets ${countdown}`;
  return [window.label || null, reset].filter(Boolean).join(" · ");
}

export interface UsageHint {
  title: string;
  lines: string[];
}

/** What a window is, when it resets, and what Stave does when it is used up. */
export function describeUsageWindow(args: {
  window: UsageHeadlineWindow;
  providerName: string;
  blockAtLimit: boolean;
  now: number;
  locale?: string;
}): UsageHint {
  const { window, providerName, now } = args;
  const countdown = formatResetCountdown(window.resetsAt, now);
  const reset =
    countdown === null || window.resetsAt === null
      ? `${providerName} did not report when this resets.`
      : countdown === "now"
        ? "Resets now. Stave reads the new numbers shortly."
        : `Resets in ${countdown} (${formatResetClock(window.resetsAt, now, args.locale)}).`;
  const atLimit = args.blockAtLimit
    ? `At 100%, Stave holds new ${providerName} turns until it resets. Running turns finish.`
    : `At 100%, Stave keeps sending ${providerName} turns, because Stop turns at 100% usage is off.`;
  return {
    title: `${window.title} · ${formatUsagePercent(window.usedPercent)} used`,
    lines: [...(window.note ? [window.note] : []), reset, atLimit],
  };
}

export type TurnSpendMeaning = "api-value" | "spend";

export interface UsageStripCost {
  todayUsd: number;
  monthUsd: number;
  monthTurns: number;
  /** A subscription account's cost is a value, not a charge; a gateway's is spend. */
  meaning: TurnSpendMeaning;
}

/** Bold amount and muted context for the strip: `$0.10` + `today · $4.20 this month`. */
export function formatStripCost(cost: UsageStripCost): { amount: string; context: string } {
  return {
    amount: formatCostUsd(cost.todayUsd),
    context: `today · ${formatCostUsd(cost.monthUsd)} this month`,
  };
}

export function describeTurnSpend(args: {
  cost: UsageStripCost;
  providerName: string;
  multipleAccounts: boolean;
}): UsageHint {
  const { cost, providerName } = args;
  const turns = cost.monthTurns === 1 ? "1 turn" : `${cost.monthTurns} turns`;
  const totals = `${formatCostUsd(cost.todayUsd)} today, ${formatCostUsd(cost.monthUsd)} this month, from ${turns}.`;
  const meaning =
    cost.meaning === "spend"
      ? `${providerName}'s estimate of what these turns cost. Your gateway bills them, and its invoice is final.`
      : `Not billed to your subscription. ${providerName} estimates it from token use at API prices.`;
  return {
    title:
      cost.meaning === "spend"
        ? "Spend on turns run in Stave"
        : "API value of turns run in Stave",
    lines: [
      totals,
      meaning,
      ...(args.multipleAccounts
        ? [`Includes turns from every ${providerName} account.`]
        : []),
    ],
  };
}

export interface UsageStripSegmentModel {
  provider: StatusBarUsageProvider;
  providerName: string;
  /** Provider plus the account when the meter names it: `Claude · Work`. */
  name: string;
  /** Empty for an API-billing gateway, which has no subscription quota. */
  windows: UsageHeadlineWindow[];
  cost: UsageStripCost | null;
  gateway: boolean;
  stale: boolean;
  /** Nothing to show yet: the first reading for the current account is on its way. */
  pending: boolean;
}

export function buildUsageStripSegment(args: {
  provider: StatusBarUsageProvider;
  providerName: string;
  windows: UsageHeadlineWindow[];
  account: StatusBarAccountView | null;
  spend: ProviderTurnSpend | undefined;
  stale: boolean;
  pending: boolean;
}): UsageStripSegmentModel {
  const gateway = args.account?.gateway === true;
  const label = args.account?.triggerLabel;
  return {
    provider: args.provider,
    providerName: args.providerName,
    name: label ? `${args.providerName} · ${label}` : args.providerName,
    windows: gateway ? [] : args.windows,
    // Only a provider that reported a cost gets the item; never a made-up $0.00.
    cost:
      args.spend && args.spend.monthUsd > 0
        ? {
            todayUsd: args.spend.todayUsd,
            monthUsd: args.spend.monthUsd,
            monthTurns: args.spend.monthTurns,
            meaning: gateway ? "spend" : "api-value",
          }
        : null,
    gateway,
    stale: args.stale,
    // Only when there is nothing to show yet; a gateway is never read at all.
    pending: !gateway && args.pending && args.windows.length === 0,
  };
}

/**
 * Container widths (rem) at which the full strip switches on. Container query
 * conditions cannot read a variable, so the styles carry one rule per step and
 * the estimate below picks the step.
 */
export const USAGE_STRIP_BREAKPOINTS_REM = [
  24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80, 84, 88, 92, 96,
  100, 104, 108, 112, 116, 120, 136, 152,
] as const;

export type UsageStripBreakpoint =
  | (typeof USAGE_STRIP_BREAKPOINTS_REM)[number]
  | "never";

// Measured in the interface font at caption size (12px): regular text runs
// 0.34-0.36rem a character and the semibold figures about 0.52rem. Both are
// rounded up so the estimate errs wide and the full strip never has to clip.
const CHAR_REM = 0.36;
const FIGURE_CHAR_REM = 0.55;
const SEGMENT_INSET_REM = 1;
const PART_GAP_REM = 0.625;
const GLYPH_REM = 1;
const GLYPH_GAP_REM = 0.25;
const SEGMENT_GAP_REM = 0.125;
const SAFETY_REM = 0.5;

function textRem(text: string): number {
  return text.length * CHAR_REM;
}

function figureRem(text: string): number {
  return text.length * FIGURE_CHAR_REM;
}

/**
 * The longest countdown a window can show: a 5-hour window never reads more
 * than `4h 59m`, a week never more than `6d 23h`.
 */
function widestCountdown(windowMs: number | null): string {
  if (windowMs === null || !Number.isFinite(windowMs) || windowMs <= 0) {
    return "29d 23h";
  }
  const hours = Math.floor(windowMs / 3_600_000);
  return hours < 24 ? `${Math.max(0, hours - 1)}h 59m` : `${Math.floor(hours / 24) - 1}d 23h`;
}

/**
 * Width the full strip needs for one segment. Percent and countdown use their
 * widest forms (`100%`, the window's longest countdown) so the choice does not
 * flip as a countdown ticks or a percent gains a digit.
 */
export function estimateUsageStripSegmentRem(segment: UsageStripSegmentModel): number {
  let rem = SEGMENT_INSET_REM + textRem(segment.name);
  if (segment.stale) rem += textRem(" (unverified)");
  if (segment.windows.length === 0 && !segment.gateway) {
    // A dash, or a spinner while the first reading is on its way.
    rem += PART_GAP_REM + GLYPH_REM;
  }
  for (const window of segment.windows) {
    const context = [window.label || null, `resets ${widestCountdown(window.windowMs)}`]
      .filter(Boolean)
      .join(" · ");
    rem += PART_GAP_REM + GLYPH_REM + GLYPH_GAP_REM + figureRem("100%") + GLYPH_GAP_REM + textRem(context);
  }
  if (segment.cost) {
    const { amount, context } = formatStripCost(segment.cost);
    rem += PART_GAP_REM + GLYPH_REM + GLYPH_GAP_REM + figureRem(amount) + GLYPH_GAP_REM + textRem(context);
  }
  return rem;
}

export function estimateUsageStripRem(segments: readonly UsageStripSegmentModel[]): number {
  if (segments.length === 0) return 0;
  return (
    segments.reduce((total, segment) => total + estimateUsageStripSegmentRem(segment), 0) +
    SEGMENT_GAP_REM * (segments.length - 1) +
    SAFETY_REM
  );
}

/**
 * The narrowest step that fits every connected provider in full. Below it
 * the strip falls back to the compact meter; past the widest step it stays
 * compact rather than risk pushing the right-hand segments off.
 */
export function resolveUsageStripBreakpoint(
  segments: readonly UsageStripSegmentModel[],
): UsageStripBreakpoint {
  const needed = estimateUsageStripRem(segments);
  return USAGE_STRIP_BREAKPOINTS_REM.find((step) => step >= needed) ?? "never";
}

/** Screen-reader name for a segment trigger, since its children are glyphs and fragments. */
export function describeUsageSegmentForAssistiveTech(
  segment: UsageStripSegmentModel,
  now: number,
): string {
  const parts = segment.windows.map((window) => {
    const countdown = formatResetCountdown(window.resetsAt, now);
    return `${window.title} ${formatUsagePercent(window.usedPercent)} used${countdown && countdown !== "now" ? `, resets in ${countdown}` : ""}`;
  });
  if (segment.cost) {
    const { amount } = formatStripCost(segment.cost);
    parts.push(`${amount} today`);
  }
  if (segment.pending) parts.unshift("reading usage");
  return `${segment.name} usage${parts.length ? `: ${parts.join("; ")}` : ""}`;
}
