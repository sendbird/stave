/**
 * Codex `TokenUsageBreakdown` mapping (App Server v2 schema).
 *
 * Two properties of the wire shape matter and are easy to get wrong:
 *
 * - `cachedInputTokens` is a *subset* of `inputTokens`. The schema's sibling
 *   `netNewInputTokens` is exactly `inputTokens - cachedInputTokens`, so the
 *   two must never be added together when reporting a prompt size. This is the
 *   opposite of Anthropic's convention; see `src/lib/providers/usage-cache.ts`.
 * - `reasoningOutputTokens` is billed output the user never sees, reported
 *   separately from `outputTokens`.
 */
import type { BridgeEvent } from "./types";

/** Last context snapshot, never the cumulative billing total or cached tokens twice. */
export function normalizeCodexContextUsage(value: unknown): BridgeEvent | null {
  const usage = value as {
    last?: { totalTokens?: number };
    modelContextWindow?: number;
  } | null;
  const usedTokens = usage?.last?.totalTokens;
  const sizeTokens = usage?.modelContextWindow;
  if (
    typeof usedTokens !== "number" ||
    !Number.isFinite(usedTokens) ||
    usedTokens < 0 ||
    typeof sizeTokens !== "number" ||
    !Number.isFinite(sizeTokens) ||
    sizeTokens <= 0
  )
    return null;
  return { type: "context_usage", usedTokens, sizeTokens };
}

/** Fields Stave reads from a Codex `TokenUsageBreakdown`. */
export interface CodexTokenUsageBreakdown {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
  reasoningOutputTokens?: number;
}

export interface CodexNormalizedTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  thoughtTokens?: number;
}

function positive(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

/**
 * Map the `last` breakdown of a `thread/tokenUsage/updated` notification.
 * Returns `null` when the payload carries no breakdown to read.
 */
export function normalizeCodexTokenUsage(
  tokenUsage: { last?: CodexTokenUsageBreakdown | null } | null | undefined,
): CodexNormalizedTokenUsage | null {
  const last = tokenUsage?.last;
  if (!last) {
    return null;
  }
  const cacheReadTokens = positive(last.cachedInputTokens);
  const cacheCreationTokens = positive(last.cacheWriteInputTokens);
  const thoughtTokens = positive(last.reasoningOutputTokens);
  return {
    inputTokens: last.inputTokens ?? 0,
    outputTokens: last.outputTokens ?? 0,
    ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
    ...(cacheCreationTokens !== undefined ? { cacheCreationTokens } : {}),
    ...(thoughtTokens !== undefined ? { thoughtTokens } : {}),
  };
}
