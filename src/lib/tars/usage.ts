import { z } from "zod";
import { TarsStateSchema } from "./types";

/**
 * What Tars's work spent, from what the providers reported on the turns of
 * each work's own task. Nothing here is estimated: a turn whose provider
 * reported no usage counts as a turn with no tokens, and a cost exists only
 * when a provider reported one.
 *
 * Not recorded anywhere, so not in a report: the tokens and cost of Tars's own
 * replies (its planner turns keep no usage), and the turns of helper tasks a
 * work's run started (a turn is saved under its own task, not under the work).
 */
export const TARS_USAGE_WINDOWS = ["today", "sevenDays", "thirtyDays"] as const;
export type TarsUsageWindow = (typeof TARS_USAGE_WINDOWS)[number];

/** Work read per report, most recently changed first; the rest is counted in `omittedWorks`. */
export const TARS_USAGE_MAX_WORKS = 200;
/** Turns read per report, newest first within each work; past it the report says `truncated`. */
export const TARS_USAGE_MAX_TURNS = 20_000;
/** Tars's own replies counted per report. */
export const TARS_USAGE_MAX_REPLIES = 5_000;
/** Models listed per report, largest first. */
export const TARS_USAGE_MAX_MODELS = 50;
const MAX_RANGE_MS = 32 * 86_400_000;

const IdSchema = z.string().trim().min(1).max(256);
const TimestampSchema = z.iso.datetime();

/**
 * The period a report covers, as the window computes it in its own local
 * time: where today, the last 7 days and the last 30 days start, and the
 * moment it was asked (`until`, exclusive). Main only compares them.
 */
export const TarsUsageInputSchema = z.object({
  todayStart: TimestampSchema, sevenDaysStart: TimestampSchema, thirtyDaysStart: TimestampSchema, until: TimestampSchema,
}).strict().refine((input) => {
  const [thirty, seven, today, until] = [input.thirtyDaysStart, input.sevenDaysStart, input.todayStart, input.until].map((value) => Date.parse(value));
  return thirty! <= seven! && seven! <= today! && today! <= until! && until! - thirty! <= MAX_RANGE_MS;
  // i18n-ignore: schema diagnostic, not user-facing copy
}, "The usage period must be ordered and at most 32 days long.");
export type TarsUsageInput = z.infer<typeof TarsUsageInputSchema>;

/**
 * The three periods ending at `now`, in the local time of the process that
 * calls it: today from local midnight, 7 days as today and the six days
 * before it, 30 days as today and the 29 before it. Calendar days, so a day
 * a clock change made 23 or 25 hours long is still one day.
 */
export function tarsUsageWindows(now: Date): TarsUsageInput {
  const dayStart = (daysBack: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack).toISOString();
  return { todayStart: dayStart(0), sevenDaysStart: dayStart(6), thirtyDaysStart: dayStart(29), until: now.toISOString() };
}

const CountSchema = z.number().int().min(0);
export const TarsUsageMetricsSchema = z.object({
  /** Completed turns that started in the period. */
  turns: CountSchema,
  /** Of those, the turns whose provider reported tokens. */
  measuredTurns: CountSchema,
  /** New prompt and output tokens of the measured turns; prompt read back from a cache is not counted. */
  tokens: z.number().min(0),
  /** The summed cost providers reported; null when no turn reported one. Never estimated. */
  costUsd: z.number().min(0).nullable(),
  costReportedTurns: CountSchema,
  /** How long the turns ran, from each turn's start to its end. */
  durationMs: z.number().min(0),
}).strict();
export type TarsUsageMetrics = z.infer<typeof TarsUsageMetricsSchema>;

const WindowMetricsSchema = z.object({ today: TarsUsageMetricsSchema, sevenDays: TarsUsageMetricsSchema, thirtyDays: TarsUsageMetricsSchema }).strict();
export type TarsUsageWindowMetrics = z.infer<typeof WindowMetricsSchema>;

const ModelIdsSchema = z.array(z.string().max(200)).max(8);
export const TarsUsageWorkSchema = z.object({
  responsibilityId: IdSchema,
  title: z.string().max(200),
  state: TarsStateSchema,
  repositoryPath: z.string().max(4096),
  usage: WindowMetricsSchema,
  /** The models its turns in each period ran on, as recorded on the turns. */
  modelIds: z.object({ today: ModelIdsSchema, sevenDays: ModelIdsSchema, thirtyDays: ModelIdsSchema }).strict(),
}).strict();
export type TarsUsageWork = z.infer<typeof TarsUsageWorkSchema>;

export const TarsUsageModelSchema = z.object({
  providerId: z.string().max(80),
  /** Null when the turn's model was not recorded. */
  modelId: z.string().max(200).nullable(),
  usage: WindowMetricsSchema,
}).strict();
export type TarsUsageModel = z.infer<typeof TarsUsageModelSchema>;

export const TarsUsageReportSchema = z.object({
  generatedAt: TimestampSchema,
  period: TarsUsageInputSchema,
  totals: WindowMetricsSchema,
  /** Work with at least one turn in the last 30 days, largest first. */
  works: z.array(TarsUsageWorkSchema).max(TARS_USAGE_MAX_WORKS),
  models: z.array(TarsUsageModelSchema).max(TARS_USAGE_MAX_MODELS),
  /** Tars's own answered messages per period; null when they could not be read. Only counted: their tokens and cost are not recorded. */
  replies: z.object({ today: CountSchema, sevenDays: CountSchema, thirtyDays: CountSchema }).strict().nullable(),
  /** More turns existed than one report reads; the totals are then a lower bound. */
  truncated: z.boolean(),
  /** Work with a task that was not read because more than `TARS_USAGE_MAX_WORKS` exist. */
  omittedWorks: CountSchema,
}).strict();
export type TarsUsageReport = z.infer<typeof TarsUsageReportSchema>;

/** One turn's usage as the turn row stores it; counters a provider did not send are absent. */
export interface TarsUsageTurnCounters {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  totalCostUsd?: number;
}

/** One completed turn of a work's task. */
export interface TarsUsageTurn {
  responsibilityId: string;
  providerId: string;
  modelId: string | null;
  createdAt: string;
  completedAt: string;
  /** Null when the provider reported nothing for the turn. */
  usage: TarsUsageTurnCounters | null;
}

export interface TarsUsageWorkSource {
  id: string;
  title: string;
  state: z.infer<typeof TarsStateSchema>;
  repositoryPath: string;
}

function counter(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * A turn's tokens as input plus output without prompt read from the cache,
 * on the same per-provider rule the app's other usage figures use: Claude's
 * input is only the uncached remainder, so tokens written to the cache are
 * added; Codex's input is the whole prompt, so cache reads are taken out;
 * any other provider's counts are used as reported.
 */
export function tarsUsageTokens(providerId: string, usage: TarsUsageTurnCounters) {
  const input = counter(usage.inputTokens);
  const output = counter(usage.outputTokens);
  if (providerId === "claude-code" || providerId === "stave") return output + input + counter(usage.cacheCreationTokens);
  if (providerId === "codex") return output + Math.max(input - counter(usage.cacheReadTokens), 0);
  return output + input;
}

export function emptyTarsUsageMetrics(): TarsUsageMetrics {
  return { turns: 0, measuredTurns: 0, tokens: 0, costUsd: null, costReportedTurns: 0, durationMs: 0 };
}

function emptyWindows(): TarsUsageWindowMetrics {
  return { today: emptyTarsUsageMetrics(), sevenDays: emptyTarsUsageMetrics(), thirtyDays: emptyTarsUsageMetrics() };
}

/** The periods a moment falls in: 30 days contains 7 days, which contains today. */
function windowsOf(at: string, period: TarsUsageInput): TarsUsageWindow[] {
  const time = Date.parse(at);
  if (!Number.isFinite(time) || time >= Date.parse(period.until) || time < Date.parse(period.thirtyDaysStart)) return [];
  if (time < Date.parse(period.sevenDaysStart)) return ["thirtyDays"];
  return time < Date.parse(period.todayStart) ? ["sevenDays", "thirtyDays"] : ["today", "sevenDays", "thirtyDays"];
}

function addTurn(target: TarsUsageMetrics, turn: TarsUsageTurn) {
  target.turns += 1;
  const ran = Date.parse(turn.completedAt) - Date.parse(turn.createdAt);
  if (Number.isFinite(ran) && ran > 0) target.durationMs += ran;
  if (!turn.usage || typeof turn.usage.inputTokens !== "number" || typeof turn.usage.outputTokens !== "number") return;
  target.measuredTurns += 1;
  target.tokens += tarsUsageTokens(turn.providerId, turn.usage);
  const cost = turn.usage.totalCostUsd;
  if (typeof cost === "number" && Number.isFinite(cost) && cost >= 0) {
    target.costUsd = (target.costUsd ?? 0) + cost;
    target.costReportedTurns += 1;
  }
}

/** Largest first: by 30-day tokens, then turns, then a stable name so equal rows never swap. */
function bySize<T extends { usage: TarsUsageWindowMetrics }>(name: (row: T) => string) {
  return (a: T, b: T) => b.usage.thirtyDays.tokens - a.usage.thirtyDays.tokens || b.usage.thirtyDays.turns - a.usage.thirtyDays.turns || name(a).localeCompare(name(b));
}

/**
 * Sums turns into the report's three periods, by work and by model. A turn
 * belongs to the period its start falls in; turns outside the period, or of
 * work not in `works`, are ignored. Work with no turn in the last 30 days is
 * left out, so "no usage" reads as an empty list rather than rows of zeros.
 */
export function aggregateTarsUsage(args: {
  period: TarsUsageInput;
  works: readonly TarsUsageWorkSource[];
  turns: readonly TarsUsageTurn[];
  /** When each of Tars's own answered messages was sent; null when they could not be read. */
  replies: readonly string[] | null;
  truncated?: boolean;
  omittedWorks?: number;
  generatedAt: string;
}): TarsUsageReport {
  const totals = emptyWindows();
  const byWork = new Map<string, { usage: TarsUsageWindowMetrics; modelIds: Record<TarsUsageWindow, Set<string>> }>();
  const byModel = new Map<string, TarsUsageModel>();
  const known = new Set(args.works.map((work) => work.id));
  for (const turn of args.turns) {
    if (!known.has(turn.responsibilityId)) continue;
    const windows = windowsOf(turn.createdAt, args.period);
    if (!windows.length) continue;
    let work = byWork.get(turn.responsibilityId);
    if (!work) byWork.set(turn.responsibilityId, work = { usage: emptyWindows(), modelIds: { today: new Set(), sevenDays: new Set(), thirtyDays: new Set() } });
    const modelKey = `${turn.providerId}\u0000${turn.modelId ?? ""}`;
    let model = byModel.get(modelKey);
    if (!model) byModel.set(modelKey, model = { providerId: turn.providerId, modelId: turn.modelId, usage: emptyWindows() });
    for (const window of windows) {
      addTurn(totals[window], turn);
      addTurn(work.usage[window], turn);
      if (turn.modelId) work.modelIds[window].add(turn.modelId);
      addTurn(model.usage[window], turn);
    }
  }
  const replies = args.replies ? { today: 0, sevenDays: 0, thirtyDays: 0 } : null;
  if (replies) for (const sentAt of args.replies!) for (const window of windowsOf(sentAt, args.period)) replies[window] += 1;
  const modelList = (ids: Set<string>) => [...ids].sort().slice(0, 8);
  const works = args.works.flatMap((source): TarsUsageWork[] => {
    const work = byWork.get(source.id);
    return work ? [{ responsibilityId: source.id, title: source.title.slice(0, 200), state: source.state, repositoryPath: source.repositoryPath,
      usage: work.usage, modelIds: { today: modelList(work.modelIds.today), sevenDays: modelList(work.modelIds.sevenDays), thirtyDays: modelList(work.modelIds.thirtyDays) } }] : [];
  }).sort(bySize((row) => row.responsibilityId)).slice(0, TARS_USAGE_MAX_WORKS);
  const models = [...byModel.values()].sort(bySize((row) => `${row.providerId} ${row.modelId ?? ""}`)).slice(0, TARS_USAGE_MAX_MODELS);
  return { generatedAt: args.generatedAt, period: args.period, totals, works, models, replies,
    truncated: args.truncated ?? false, omittedWorks: args.omittedWorks ?? 0 };
}

/** What a period's bar measures: tokens when any turn reported them, otherwise turns. */
export function tarsUsageBarMeasure(total: TarsUsageMetrics): "tokens" | "turns" {
  return total.tokens > 0 ? "tokens" : "turns";
}

/** A row's share of the period's total on the bar's measure, 0–100. */
export function tarsUsageShare(row: TarsUsageMetrics, total: TarsUsageMetrics) {
  const measure = tarsUsageBarMeasure(total);
  return total[measure] > 0 ? Math.min(100, Math.max(0, (row[measure] / total[measure]) * 100)) : 0;
}
