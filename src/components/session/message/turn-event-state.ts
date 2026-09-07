import type { AgentRunState } from "@/components/ads/components/agent-state";
import type { ToolUsePart } from "@/types/chat";

/**
 * The one place a Stave tool-part state becomes an ADS `AgentRunState`.
 *
 * ADS shares one lifecycle union across every agent surface precisely so that
 * two components cannot name the same state differently, and that guarantee
 * only holds if the host maps into it once. `ToolRun`, `Thinking` and
 * `FileChangeSummary` all read this union, so this function is what keeps a
 * row's status word, its open-while-live disclosure, its retry affordance and
 * its rail marker agreeing about what the run is doing.
 *
 * `input-streaming` and `input-available` are both `running`: the distinction
 * between "the arguments are still arriving" and "the call is out" is not
 * something a reader can act on, and ADS's `running` already carries the live
 * clock and the open payload that both need.
 */
export function toAgentRunState(state?: ToolUsePart["state"]): AgentRunState {
  switch (state) {
    case "input-streaming":
    case "input-available":
      return "running";
    case "output-available":
      return "done";
    case "output-error":
      return "failed";
    default:
      return "pending";
  }
}

/**
 * A measured duration in milliseconds, or `undefined`.
 *
 * §6 of the agent-surface grammar: progress must not invent precision. The
 * provider reports `elapsedSeconds` only for turns it actually timed, so an
 * absent value stays absent all the way to the component — `ToolRun` and
 * `Thinking` both render *no* duration rather than a plausible one, and that
 * is the correct output here, not a fallback to be filled in.
 *
 * Sub-second values are kept: `formatElapsed` renders them, and rounding a
 * 400ms read up to "1s" would be the same invention in the other direction.
 */
export function toMeasuredDurationMs(seconds?: number): number | undefined {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return undefined;
  }
  return Math.round(seconds * 1000);
}

/** `https?` URLs in provider output, in first-seen order and de-duplicated. */
export function extractOutputUrls(output?: string): string[] {
  if (!output) return [];
  const seen = new Set<string>();
  for (const match of output.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
    // Trailing sentence punctuation is not part of the URL; a model writes
    // "see https://stave.dev/install." far more often than it links a path
    // that genuinely ends in a period.
    const url = match[0].replace(/[.,;:!?]+$/, "");
    if (url.length > 0) seen.add(url);
  }
  return [...seen];
}

/** The host label for a URL's provenance: its domain, in the machine register. */
export function toUrlSource(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
