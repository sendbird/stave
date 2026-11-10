/**
 * How the Tars transcript lays out records, times and day breaks. The default
 * of each axis is what the conversation shows today; the other values are
 * design options the development gallery switches between
 * (`?stavePreview=tars&gallery=true&recordStyle=…&timeStyle=…&daySeparator=…`)
 * until one is chosen.
 */

/**
 * - `current`: tint rows on one shared wash.
 * - `quiet`: inline rows with no surface, the mark on the prose's edge.
 * - `card`: each run of records on one bordered card, the work's title on its own line.
 * - `rail`: a vertical rail with a dot per record and each record's own time.
 */
export type TarsRecordStyle = "current" | "quiet" | "card" | "rail";

/**
 * - `hover`: the short relative time above a message, on hover or focus.
 * - `edge`: the clock time beside the user's bubble (or on a follow-up's line), on hover or focus.
 * - `run`: the clock time, always shown, under the last exchange of a run of close exchanges.
 * - `grouped`: a centred clock time, always shown, above the first exchange of each run.
 */
export type TarsTimeStyle = "hover" | "edge" | "run" | "grouped";

/** - `none`: no day breaks. - `rule`: a centred day label in a hairline rule. - `pill`: a day pill that stays at the top while its day scrolls. */
export type TarsDaySeparator = "none" | "rule" | "pill";

export interface TarsTranscriptLayout {
  recordStyle: TarsRecordStyle;
  timeStyle: TarsTimeStyle;
  daySeparator: TarsDaySeparator;
}

export const DEFAULT_TARS_TRANSCRIPT_LAYOUT: TarsTranscriptLayout = { recordStyle: "current", timeStyle: "hover", daySeparator: "none" };

const RECORD_STYLES: Record<string, TarsRecordStyle> = { current: "current", a: "quiet", quiet: "quiet", b: "card", card: "card", c: "rail", rail: "rail" };
const TIME_STYLES: Record<string, TarsTimeStyle> = { hover: "hover", current: "hover", edge: "edge", run: "run", grouped: "grouped" };
const DAY_SEPARATORS: Record<string, TarsDaySeparator> = { none: "none", rule: "rule", pill: "pill" };

/** The layout a query string asks for; an unknown or missing value keeps that axis's default. */
export function parseTarsTranscriptLayout(params: URLSearchParams): TarsTranscriptLayout {
  const pick = <T>(table: Record<string, T>, key: string, fallback: T) => table[params.get(key)?.toLowerCase() ?? ""] ?? fallback;
  return {
    recordStyle: pick(RECORD_STYLES, "recordStyle", DEFAULT_TARS_TRANSCRIPT_LAYOUT.recordStyle),
    timeStyle: pick(TIME_STYLES, "timeStyle", DEFAULT_TARS_TRANSCRIPT_LAYOUT.timeStyle),
    daySeparator: pick(DAY_SEPARATORS, "daySeparator", DEFAULT_TARS_TRANSCRIPT_LAYOUT.daySeparator),
  };
}

/** Exchanges this close together read as one run, which shows one time. */
export const TARS_RUN_GAP_MS = 15 * 60_000;

/** The local calendar day of an instant, as `YYYY-MM-DD`; days break on the reader's own midnight. */
export function tarsLocalDayKey(at: string | number | Date): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whole calendar days from `at`'s local day to `now`'s: 0 today, 1 yesterday. */
export function tarsDaysAgo(at: string | number | Date, now: string | number | Date): number {
  const start = (value: string | number | Date) => { const date = new Date(value); return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(); };
  return Math.round((start(now) - start(at)) / 86_400_000);
}

export interface TarsTimedEntry { at: string }

export interface TarsTranscriptDay<T extends TarsTimedEntry> {
  key: string;
  /** The first entry's time, which names the day. */
  at: string;
  /** The day's entries split into runs: each starts more than `gapMs` after the one before it. */
  runs: T[][];
}

/**
 * Entries (already in time order) split into local days, and each day into
 * runs of entries no more than `gapMs` apart. A run never crosses midnight.
 */
export function splitTarsTranscript<T extends TarsTimedEntry>(entries: readonly T[], gapMs = TARS_RUN_GAP_MS): TarsTranscriptDay<T>[] {
  const days: TarsTranscriptDay<T>[] = [];
  let previous: number | null = null;
  for (const entry of entries) {
    const key = tarsLocalDayKey(entry.at);
    const time = Date.parse(entry.at);
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      day = { key, at: entry.at, runs: [] };
      days.push(day);
      previous = null;
    }
    if (previous === null || time - previous > gapMs) day.runs.push([entry]);
    else day.runs[day.runs.length - 1]!.push(entry);
    previous = time;
  }
  return days;
}
