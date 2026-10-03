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

/** Maps one Codex `TokenUsageBreakdown`; `null` when there is none to read. */
export function mapCodexTokenUsageBreakdown(
  breakdown: CodexTokenUsageBreakdown | null | undefined,
): CodexNormalizedTokenUsage | null {
  if (!breakdown) {
    return null;
  }
  const cacheReadTokens = positive(breakdown.cachedInputTokens);
  const cacheCreationTokens = positive(breakdown.cacheWriteInputTokens);
  const thoughtTokens = positive(breakdown.reasoningOutputTokens);
  return {
    inputTokens: breakdown.inputTokens ?? 0,
    outputTokens: breakdown.outputTokens ?? 0,
    ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
    ...(cacheCreationTokens !== undefined ? { cacheCreationTokens } : {}),
    ...(thoughtTokens !== undefined ? { thoughtTokens } : {}),
  };
}

/*
 * Per-turn usage from `thread/tokenUsage/updated` (codex-cli 0.159.3,
 * `TokenUsageInfo` in codex-rs/protocol):
 *
 * - `total` is cumulative for the thread: each model request adds its usage
 *   to it, and it is restored from the rollout on resume.
 * - `last` is the most recent model request only, so a turn with tool calls
 *   makes several requests and `last` covers just the final one. The same
 *   `last` is also re-sent when only rate limits change, and a token
 *   re-estimate replaces it with zeros.
 *
 * A turn's usage is therefore how far the thread total moved while the
 * turn's notifications arrived. A total that drops (Codex fills the window
 * after a context overflow, with zero counters) adds nothing and becomes the
 * new baseline.
 */
const COUNTERS = [
  "inputTokens",
  "outputTokens",
  "cachedInputTokens",
  "cacheWriteInputTokens",
  "reasoningOutputTokens",
] as const;
type Counters = Record<(typeof COUNTERS)[number], number>;
const MAX_TRACKED_THREADS = 256;
const MAX_TRACKED_TURNS_PER_THREAD = 8;

function readCounters(value: unknown): Counters | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(COUNTERS.map((key) => [key, positive(record[key]) ?? 0])) as Counters;
}
function combine(a: Counters, b: Counters, sign: 1 | -1): Counters {
  return Object.fromEntries(COUNTERS.map((key) => [key, a[key] + sign * b[key]])) as Counters;
}
const ZERO = readCounters({})!;

/** Per App Server process: thread totals as last reported, and each recent turn's share. */
export class CodexThreadTokenUsage {
  private readonly threads = new Map<string, { total: Counters; turns: Map<string, Counters> }>();

  /**
   * Records one notification. The client calls this once per notification,
   * before any listener, so it also sees the usage replay after `thread/resume`.
   */
  observe(message: { method?: string; params?: unknown }) {
    if (message.method !== "thread/tokenUsage/updated") return;
    const params = message.params as { threadId?: unknown; turnId?: unknown; tokenUsage?: { total?: unknown; last?: unknown } } | null;
    const { threadId, turnId } = params ?? {};
    if (typeof threadId !== "string" || typeof turnId !== "string") return;
    const last = readCounters(params?.tokenUsage?.last);
    const known = this.threads.get(threadId);
    // A payload without `total` (not sent by current Codex) counts its `last` once.
    const total = readCounters(params?.tokenUsage?.total) ?? (last ? combine(known?.total ?? ZERO, last, 1) : null);
    if (!total) return;
    // First sight of a thread: the total before this request is `total - last`.
    const before = known?.total ?? (last ? readCounters(combine(total, last, -1))! : total);
    const delta = combine(total, before, -1);
    const thread = known ?? { total, turns: new Map<string, Counters>() };
    thread.total = total;
    const turn = thread.turns.get(turnId) ?? ZERO;
    thread.turns.delete(turnId);
    thread.turns.set(turnId, COUNTERS.some((key) => delta[key] < 0) ? turn : combine(turn, delta, 1));
    if (thread.turns.size > MAX_TRACKED_TURNS_PER_THREAD) thread.turns.delete(thread.turns.keys().next().value!);
    this.threads.delete(threadId);
    this.threads.set(threadId, thread);
    if (this.threads.size > MAX_TRACKED_THREADS) this.threads.delete(this.threads.keys().next().value!);
  }

  /** The usage a turn has reported so far, across all of its model requests. */
  read(threadId: string, turnId: string): CodexNormalizedTokenUsage | null {
    return mapCodexTokenUsageBreakdown(this.threads.get(threadId)?.turns.get(turnId));
  }
}
