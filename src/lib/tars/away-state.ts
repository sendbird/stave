import { z } from "zod";

/**
 * "While you were away": one summary of what Tars's work came to while the
 * user was not looking at the conversation, in place of reading every record
 * row. Nothing here calls a model: the summary is read from the conversation
 * the window already holds.
 *
 * The user has "seen" the conversation while its window is visible and
 * focused, the Tars view is open and the transcript is scrolled to its end.
 * `lastSeenAt` is the last such moment. Coming back at least
 * `TARS_AWAY_MIN_GAP_MS` later opens a summary of the span since then; it
 * stays until it is dismissed or a later absence replaces it.
 *
 * This module is imported by the main process and preload, so it imports
 * nothing from the renderer; what the summary says is built in `away-summary`.
 */

/** A shorter absence is a glance elsewhere, not being away. */
export const TARS_AWAY_MIN_GAP_MS = 10 * 60_000;

const TimestampSchema = z.iso.datetime();
const time = (at: string) => Date.parse(at);

/** The span one summary covers: after `since` (the last time the end was seen) up to `until` (the return). */
export const TarsAwaySpanSchema = z.object({ since: TimestampSchema, until: TimestampSchema }).strict()
  // i18n-ignore: schema diagnostic, not user-facing copy
  .refine((span) => time(span.since) < time(span.until), "A summary's span ends after it starts.");
export type TarsAwaySpan = z.infer<typeof TarsAwaySpanSchema>;

/**
 * What is saved about the user's absence. `lastSeenAt` is null on a profile
 * that never showed the conversation; `summary` is the span on screen, null
 * when there is none or it was dismissed.
 */
export const TarsAwayStateSchema = z.object({
  lastSeenAt: TimestampSchema.nullable(),
  summary: TarsAwaySpanSchema.nullable(),
}).strict();
export type TarsAwayState = z.infer<typeof TarsAwayStateSchema>;
export const TARS_AWAY_INITIAL_STATE: TarsAwayState = Object.freeze({ lastSeenAt: null, summary: null });

const later = (a: string | null, b: string) => (a !== null && time(a) >= time(b) ? a : b);

export function isSameTarsAwayState(a: TarsAwayState, b: TarsAwayState) {
  return a.lastSeenAt === b.lastSeenAt && a.summary?.since === b.summary?.since && a.summary?.until === b.summary?.until;
}

/** The end of the conversation was seen at `at`. Never moves backward, so a late or repeated write changes nothing. */
export function markTarsAwaySeen(state: TarsAwayState, at: string): TarsAwayState {
  const lastSeenAt = later(state.lastSeenAt, at);
  return lastSeenAt === state.lastSeenAt ? state : { ...state, lastSeenAt };
}

/**
 * The user came back at `now`. After a long enough absence the summary covers
 * what happened since the end was last seen, replacing an earlier summary. A
 * short absence, or a profile that never saw the conversation, changes nothing.
 */
export function returnToTarsAway(state: TarsAwayState, now: string): TarsAwayState {
  if (state.lastSeenAt === null || time(now) - time(state.lastSeenAt) < TARS_AWAY_MIN_GAP_MS) return state;
  if (state.summary?.since === state.lastSeenAt && state.summary.until === now) return state;
  return { ...state, summary: { since: state.lastSeenAt, until: now } };
}

/**
 * Dismisses the summary. What it covered counts as seen, so the same summary
 * cannot open again, in this window or after a restart.
 */
export function dismissTarsAway(state: TarsAwayState): TarsAwayState {
  if (!state.summary) return state;
  return { lastSeenAt: later(state.lastSeenAt, state.summary.until), summary: null };
}

/**
 * What a saved state becomes when another is written over it: the later of
 * the two seen times and the incoming summary. A summary that ends at or
 * before what was already seen, when none is saved, was dismissed: a late
 * write cannot bring it back. Applying the same state twice is the same as once.
 */
export function mergeTarsAwayState(saved: TarsAwayState, incoming: TarsAwayState): TarsAwayState {
  const lastSeenAt = incoming.lastSeenAt === null ? saved.lastSeenAt : later(saved.lastSeenAt, incoming.lastSeenAt);
  const dismissed = incoming.summary !== null && saved.summary === null && saved.lastSeenAt !== null && time(incoming.summary.until) <= time(saved.lastSeenAt);
  const next = { lastSeenAt, summary: dismissed ? null : incoming.summary };
  return isSameTarsAwayState(saved, next) ? saved : next;
}
