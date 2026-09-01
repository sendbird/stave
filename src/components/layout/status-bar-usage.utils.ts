import type {
  ClaudeUsageSnapshot,
  CodexUsageSnapshot,
  CursorUsageSnapshot,
  KiroUsageSnapshot,
} from "@/lib/providers/provider.types";

export interface UsageHeadlineWindow {
  /** Short window tag rendered before the percentage; empty when unambiguous. */
  short: string;
  usedPercent: number;
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
        ? [{ short: "5h", usedPercent: claude.session.usedPercent }]
        : []),
      ...(claude.weekly
        ? [{ short: "7d", usedPercent: claude.weekly.usedPercent }]
        : []),
      ...(claude.fableWeekly
        ? [{ short: "7d·F", usedPercent: claude.fableWeekly.usedPercent }]
        : []),
    ];
  }
  if (args.provider === "cursor" || args.provider === "kiro") {
    const provider = args[args.provider];
    return provider?.source !== "unavailable" && provider?.monthly
      ? [{ short: "", usedPercent: provider.monthly.usedPercent }]
      : [];
  }
  const bucket = args.codex?.buckets[0] ?? null;
  const usedPercent =
    bucket?.primary?.usedPercent ??
    bucket?.individualLimit?.usedPercent ??
    null;
  return usedPercent === null ? [] : [{ short: "", usedPercent }];
}

/** The dot tracks the window closest to its limit, not the first one listed. */
export function headlineUsagePercent(
  windows: readonly UsageHeadlineWindow[],
): number | null {
  return windows.length
    ? Math.max(...windows.map((window) => window.usedPercent))
    : null;
}
