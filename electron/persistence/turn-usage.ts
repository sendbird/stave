import type { BridgeEvent } from "../providers/types";
import type { PersistenceTurnUsage } from "./types";

function positive(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

/**
 * Narrow a `usage` bridge event to the fields worth keeping on the turn row.
 *
 * Only the counters and the reported cost are stored: `ttftMs` is a latency
 * measure that already lives in the turn's own timestamps, and zero-valued
 * optional counters are dropped so an absent cache read is distinguishable
 * from a measured zero.
 */
export function toPersistenceTurnUsage(
  event: Extract<BridgeEvent, { type: "usage" }>,
): PersistenceTurnUsage {
  const cacheReadTokens = positive(event.cacheReadTokens);
  const cacheCreationTokens = positive(event.cacheCreationTokens);
  const thoughtTokens = positive(event.thoughtTokens);
  const totalCostUsd = positive(event.totalCostUsd);
  return {
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
    ...(cacheCreationTokens !== undefined ? { cacheCreationTokens } : {}),
    ...(thoughtTokens !== undefined ? { thoughtTokens } : {}),
    ...(totalCostUsd !== undefined ? { totalCostUsd } : {}),
  };
}

/**
 * Read a stored `turns.usage_json` value.
 *
 * Tolerant by design: the column is written by a newer build than the one that
 * may read it, and a malformed row must degrade to "no usage recorded" rather
 * than fail the whole turn listing.
 */
export function parsePersistedTurnUsage(
  value: string | null | undefined,
): PersistenceTurnUsage | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as Partial<PersistenceTurnUsage> | null;
    if (
      typeof parsed?.inputTokens !== "number" ||
      typeof parsed?.outputTokens !== "number"
    ) {
      return null;
    }
    return parsed as PersistenceTurnUsage;
  } catch {
    return null;
  }
}
