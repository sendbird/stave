import type {
  ClaudeUsageSnapshot,
  ClaudeUsageWindow,
} from "../../../src/lib/providers/provider.types";
import { recordPushedUsageReading } from "./usage-read-policy";

/**
 * Claude usage read from turn traffic instead of from a usage request.
 *
 * The Claude SDK emits `rate_limit_event` during a turn carrying the
 * utilization and reset time of the window that is currently binding — the
 * same numbers Anthropic returns in its `anthropic-ratelimit-unified-*`
 * response headers on every API response. That makes the interesting case free:
 * while the user is working, the meter can stay current with no dedicated
 * request at all, which is exactly the shape the Codex App Server already has
 * with its `account/rateLimits/updated` push.
 *
 * This is deliberately an *overlay*, never a source. One event describes one
 * window, so it is folded into the last successful snapshot and only for
 * windows it can name unambiguously. Model-scoped weekly limits and the
 * extra-usage credit budget are skipped: `ClaudeUsageSnapshot.fableWeekly` is
 * Fable's window specifically, and writing an Opus or Sonnet reading there
 * would mislabel it.
 */

/** Cache key the shared read policy uses for Claude. */
const CLAUDE_USAGE_READ_KEY = "claude-code";

export interface ClaudeRateLimitObservation {
  rateLimitType?: string;
  /** 0..1 fraction, and legitimately >1 once usage runs past the cap. */
  utilization?: number;
  /** Epoch seconds. */
  resetsAt?: number;
}

type ClaudeWindowKey = "session" | "weekly";

/**
 * Which snapshot field an event's `rateLimitType` describes, or `null` when
 * the event is about something the snapshot does not model as a window.
 */
export function resolveClaudeObservedWindow(
  rateLimitType: string | undefined,
): ClaudeWindowKey | null {
  switch (rateLimitType) {
    case "five_hour":
      return "session";
    case "seven_day":
    case "seven_day_overage_included":
      return "weekly";
    default:
      return null;
  }
}

/**
 * Apply an observation to a snapshot, returning `null` when nothing changed so
 * a no-op event never counts as a refresh.
 */
export function applyClaudeRateLimitObservation(args: {
  snapshot: ClaudeUsageSnapshot;
  observation: ClaudeRateLimitObservation;
}): ClaudeUsageSnapshot | null {
  if (args.snapshot.source === "unavailable") {
    return null;
  }
  const key = resolveClaudeObservedWindow(args.observation.rateLimitType);
  if (!key) {
    return null;
  }
  const utilization = args.observation.utilization;
  if (typeof utilization !== "number" || !Number.isFinite(utilization)) {
    return null;
  }
  const resetsAt =
    typeof args.observation.resetsAt === "number" &&
    Number.isFinite(args.observation.resetsAt)
      ? args.observation.resetsAt
      : (args.snapshot[key]?.resetsAt ?? null);
  const window: ClaudeUsageWindow = {
    // The event reports a 0..1 fraction; the snapshot is on the 0..100 scale
    // the OAuth endpoint uses. Mixing the two is what makes a freshly reset
    // window render as a full red meter, so the conversion lives here alone.
    usedPercent: Math.min(100, Math.max(0, utilization * 100)),
    resetsAt,
  };
  const previous = args.snapshot[key];
  if (
    previous &&
    previous.usedPercent === window.usedPercent &&
    previous.resetsAt === window.resetsAt
  ) {
    return null;
  }
  return { ...args.snapshot, [key]: window };
}

/**
 * Fold a turn-time observation into the cached Claude snapshot. No-op until a
 * real usage read has established the snapshot to overlay onto.
 */
export function recordClaudeRateLimitObservation(args: {
  observation: ClaudeRateLimitObservation;
  now?: number;
}): boolean {
  return recordPushedUsageReading<ClaudeUsageSnapshot>({
    key: CLAUDE_USAGE_READ_KEY,
    now: args.now,
    update: (snapshot) =>
      applyClaudeRateLimitObservation({
        snapshot,
        observation: args.observation,
      }),
  });
}
