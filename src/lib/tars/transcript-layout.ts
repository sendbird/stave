/**
 * How the Tars transcript breaks into days: a thin rule names each local day
 * before its first entry, so a time beside a message never has to say which
 * day it was.
 */

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
  entries: T[];
}

/** Entries (already in time order) split into local days. */
export function splitTarsTranscriptDays<T extends TarsTimedEntry>(entries: readonly T[]): TarsTranscriptDay<T>[] {
  const days: TarsTranscriptDay<T>[] = [];
  for (const entry of entries) {
    const key = tarsLocalDayKey(entry.at);
    const day = days[days.length - 1];
    if (day && day.key === key) day.entries.push(entry);
    else days.push({ key, at: entry.at, entries: [entry] });
  }
  return days;
}
