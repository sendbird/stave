import type { ProviderId } from "@/lib/providers/provider.types";

/**
 * Prompt-cache accounting.
 *
 * The two managed providers report cached input differently, and getting the
 * relationship wrong makes the numbers lie in opposite directions:
 *
 * - Claude's `input_tokens` counts only the *uncached* prompt.
 *   `cache_read_input_tokens` and `cache_creation_input_tokens` are separate
 *   additions, so the prompt is the sum of all three.
 * - Codex's `inputTokens` counts the *whole* prompt, with `cachedInputTokens`
 *   as a subset of it (the schema's sibling `netNewInputTokens` is exactly
 *   `inputTokens - cachedInputTokens`). Adding them double-counts the cache.
 *
 * Reporting `input + output` as "tokens used", as the execution summary did,
 * hides cache reads entirely on Claude — which is precisely the number that
 * shows whether prompt caching is working.
 *
 * Only those two conventions are verified against their providers, so only they
 * get a derived cache-hit percentage. Every ACP agent reports through
 * `normalizeAcpPromptUsage`, whose wire shape keeps `cached_read_tokens`
 * separate from `input_tokens` — which *reads* additive, but is not something
 * this repository can confirm per agent. Rather than publish a percentage that
 * could be wrong by a factor of two, those providers keep their raw counters
 * and no derived rate.
 */

export interface PromptCacheUsageInput {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheCreationTokens?: number | null;
}

export interface PromptCacheStats {
  /**
   * Whether a cache-hit rate can be stated for this turn: the provider both
   * reported cache accounting and uses a prompt convention this repository has
   * verified. Distinguishes a genuine cold prompt (0% cached) from "no number
   * we are willing to publish".
   */
  cacheReported: boolean;
  /** Every token the model read as prompt this turn, cached or not. */
  promptTokens: number;
  /** Prompt tokens served from cache. */
  cachedTokens: number;
  /** Prompt tokens billed at the full uncached rate. */
  uncachedTokens: number;
  /** Prompt tokens written into the cache this turn (Claude/Codex writes). */
  cacheCreationTokens: number;
  /** 0-100, or `null` when there was no prompt to measure. */
  cacheHitPercent: number | null;
}

function toCount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

export function computePromptCacheStats(args: {
  providerId?: ProviderId | null;
  usage?: PromptCacheUsageInput | null;
}): PromptCacheStats {
  const usage = args.usage ?? {};
  const conventionVerified =
    args.providerId === "claude-code" || args.providerId === "codex";
  const cacheReported =
    conventionVerified &&
    (typeof usage.cacheReadTokens === "number" ||
      typeof usage.cacheCreationTokens === "number");
  const inputTokens = toCount(usage.inputTokens);
  const cachedTokens = toCount(usage.cacheReadTokens);
  const cacheCreationTokens = toCount(usage.cacheCreationTokens);

  // Claude's `input_tokens` is the uncached remainder, so its cache counters
  // are additive. Codex's `inputTokens` already covers the whole prompt. For an
  // unverified provider the inclusive reading is used because it can only
  // under-report, never inflate the prompt beyond what the provider itself
  // claimed to have read.
  const promptTokens =
    args.providerId === "claude-code"
      ? inputTokens + cachedTokens + cacheCreationTokens
      : Math.max(inputTokens, cachedTokens);
  const uncachedTokens = Math.max(0, promptTokens - cachedTokens);

  return {
    cacheReported,
    promptTokens,
    cachedTokens,
    uncachedTokens,
    cacheCreationTokens,
    cacheHitPercent:
      promptTokens > 0
        ? Math.round((cachedTokens / promptTokens) * 100)
        : null,
  };
}

/** `"72% cached"`, or `null` when there is nothing meaningful to show. */
export function formatCacheHitLabel(stats: PromptCacheStats) {
  return stats.cacheHitPercent === null || !stats.cacheReported
    ? null
    : `${stats.cacheHitPercent}% cached`;
}

/**
 * Below this many re-cached tokens a rebuild is noise (the turn's own new
 * content is always written to cache), not a miss worth naming.
 */
export const PROMPT_CACHE_MISS_MIN_TOKENS = 2_000;

/**
 * Share of the previous context that must have been rewritten before the turn
 * counts as a rebuild rather than ordinary growth.
 */
export const PROMPT_CACHE_MISS_MIN_SHARE = 0.9;

export type PromptCacheMissCause =
  | "provider_changed"
  | "model_changed"
  | "session_changed"
  | "context_rebuilt";

export interface PromptCacheMiss {
  cause: PromptCacheMissCause;
  /** Tokens written back to the cache this turn. */
  rebuiltTokens: number;
  previousModel?: string;
  model?: string;
}

export interface PromptCacheTurnSnapshot {
  providerId?: ProviderId | "user" | null;
  model?: string | null;
  /** Native provider session or thread the turn ran in. */
  nativeSessionId?: string | null;
  usage?:
    | (PromptCacheUsageInput & { contextUsedTokens?: number | null })
    | null;
}

/**
 * Name the likely reason a turn re-read its conversation uncached.
 *
 * Stave sees per-turn totals, not per-request usage, so the rebuild itself is
 * inferred: the turn wrote back at least {@link PROMPT_CACHE_MISS_MIN_SHARE}
 * of the previous turn's context. The *cause* is not inferred — a provider,
 * model or native-session change between two assistant turns is a fact Stave
 * holds, and each of those invalidates the cache by construction. When such a
 * fact exists the miss is reported even without the size signal, because a
 * tool-heavy turn's cumulative cache reads can hide a cold first request.
 */
export function detectPromptCacheMiss(args: {
  previous?: PromptCacheTurnSnapshot | null;
  current: PromptCacheTurnSnapshot;
}): PromptCacheMiss | null {
  const previous = args.previous;
  const current = args.current;
  const currentProvider =
    current.providerId && current.providerId !== "user"
      ? current.providerId
      : null;
  if (!previous || !currentProvider) {
    return null;
  }
  const stats = computePromptCacheStats({
    providerId: currentProvider,
    usage: current.usage,
  });
  if (!stats.cacheReported) {
    return null;
  }
  const previousProvider =
    previous.providerId && previous.providerId !== "user"
      ? previous.providerId
      : null;
  const previousModel = previous.model?.trim() || undefined;
  const model = current.model?.trim() || undefined;
  const rebuiltTokens = stats.cacheCreationTokens;
  const base = {
    rebuiltTokens,
    ...(previousModel ? { previousModel } : {}),
    ...(model ? { model } : {}),
  };

  if (previousProvider && previousProvider !== currentProvider) {
    return { cause: "provider_changed", ...base };
  }
  if (previousModel && model && previousModel !== model) {
    return { cause: "model_changed", ...base };
  }
  const previousSession = previous.nativeSessionId?.trim();
  const session = current.nativeSessionId?.trim();
  if (previousSession && session && previousSession !== session) {
    return { cause: "session_changed", ...base };
  }

  const previousContext = toCount(previous.usage?.contextUsedTokens);
  if (
    previousContext >= PROMPT_CACHE_MISS_MIN_TOKENS &&
    rebuiltTokens >= PROMPT_CACHE_MISS_MIN_TOKENS &&
    rebuiltTokens >= previousContext * PROMPT_CACHE_MISS_MIN_SHARE &&
    stats.cachedTokens < previousContext
  ) {
    return { cause: "context_rebuilt", ...base };
  }
  return null;
}

/** `"likely cause: model changed (claude-opus-5 → claude-sonnet-5)"`. */
export function formatPromptCacheMissLabel(miss: PromptCacheMiss) {
  const tokens = miss.rebuiltTokens > 0
    ? ` · ${miss.rebuiltTokens.toLocaleString()} tokens re-cached`
    : "";
  switch (miss.cause) {
    case "provider_changed":
      return `likely cause: provider changed${tokens}`;
    case "model_changed":
      return `likely cause: model changed${
        miss.previousModel && miss.model
          ? ` (${miss.previousModel} → ${miss.model})`
          : ""
      }${tokens}`;
    case "session_changed":
      return `likely cause: new provider session${tokens}`;
    case "context_rebuilt":
      return `context re-read uncached${tokens}`;
  }
}
