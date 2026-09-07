import * as React from "react";

import { useSharedNow } from "./DurationTimer";

/**
 * Honest elapsed time, and the disclosure that settles — the two behaviours
 * `decisions/agent-surface-grammar.md` §6 and §5.2 ask every process surface
 * for.
 *
 * **Why this is a shared module and not two private helpers.** §6 is a rule
 * about truth ("if the wait is unknown, show elapsed time and the current
 * phase — never a fabricated percentage"), and a rule about truth needs one
 * implementation or it is a rule about two truths. `Thinking`, `ToolRun` and
 * `ToolRun.Group` all display a duration and all collapse when the work they
 * describe stops; the arithmetic and the latch live here so the three cannot
 * disagree about what "14.2s" means or about who wins when the reader has
 * already taken control of the disclosure.
 *
 * It lives beside `Thinking` because §6 is written under `Thinking`'s bullet in
 * §7.C. `ToolRun` imports it; nothing here imports `ToolRun`.
 */

// ---------------------------------------------------------------------------
// Measured elapsed time
// ---------------------------------------------------------------------------

export type ElapsedSource = {
  /**
   * A duration you already measured, in milliseconds — for a replayed or
   * server-recorded run where the start instant is no longer meaningful.
   * Wins over the timestamps below.
   */
  durationMs?: number;
  /**
   * Reference "current time" for deterministic rendering (docs previews,
   * visual tests, SSR). Supplying it also stops the tick.
   */
  now?: Date | number;
  /** The instant the work stopped. */
  settledAt?: Date | number;
  /** The instant the work started. */
  startedAt?: Date | number;
};

function toMs(value: Date | number): number | null {
  const milliseconds = value instanceof Date ? value.getTime() : value;
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

/**
 * The elapsed time in milliseconds, or `null` when the component genuinely
 * does not know it.
 *
 * `null` is the important return value. A process surface with no start
 * instant and no recorded duration has nothing true to say about how long the
 * work took, and §6's whole point is that it must then say nothing rather than
 * animate a plausible number. The callers render no duration at all in that
 * case — they do not fall back to a spinner-with-a-guess.
 *
 * Resolution order:
 *
 * 1. `durationMs` — a measurement handed in.
 * 2. `settledAt - startedAt` — a measurement the caller can prove.
 * 3. `now - startedAt` while the work is live — ticking off the shared 1s
 *    interval `DurationTimer` already owns (many timers, one interval), or off
 *    a caller-supplied `now`.
 * 4. `stopped - startedAt`, where `stopped` is the instant **this component
 *    observed** the work stop. Real, and labelled as such: it is wall-clock
 *    time from the start instant to the render that reported the end, which is
 *    the best a caller who tells us "done" without telling us "when" can get.
 * 5. `null`. In particular a surface that *mounts* already finished, carrying
 *    only `startedAt`, gets `null` — `Date.now() - startedAt` there would keep
 *    growing across remounts and would be a lie about the run.
 */
export function useMeasuredElapsed(
  { durationMs, now, settledAt, startedAt }: ElapsedSource,
  live: boolean,
): number | null {
  const hasFixedValue = durationMs !== undefined || settledAt !== undefined;
  const ticking = live && !hasFixedValue && now === undefined;
  const tickedNow = useSharedNow(ticking);

  // The instant this component saw `live` go false. Effect, not a
  // render-phase ref write, so a double-invoked render cannot capture two
  // different clock readings.
  const [observedStop, setObservedStop] = React.useState<number | null>(null);
  const previousLive = React.useRef(live);

  React.useEffect(() => {
    if (previousLive.current === live) return;
    previousLive.current = live;
    setObservedStop(live ? null : Date.now());
  }, [live]);

  if (durationMs !== undefined) {
    return Number.isFinite(durationMs) ? Math.max(0, durationMs) : null;
  }
  if (startedAt === undefined) return null;

  const start = toMs(startedAt);
  if (start === null) return null;
  if (settledAt !== undefined) {
    const settled = toMs(settledAt);
    return settled === null ? null : Math.max(0, settled - start);
  }

  const reference = now !== undefined ? toMs(now) : live ? tickedNow : null;
  if (reference !== null) return Math.max(0, reference - start);
  if (observedStop !== null) return Math.max(0, observedStop - start);
  return null;
}

/**
 * The machine-register spelling of an elapsed time: `840ms`, `14s`, `14.2s`,
 * `2m 04s`, `1h 07m`.
 *
 * `precise` is what separates a running readout from a settled one. While the
 * work runs the value updates once a second and a tenths digit would be noise;
 * once it stops, the tenths digit is the measurement, and §7.C asks the settled
 * line to read "Thought for 14.2s". Sub-second runs always keep milliseconds —
 * rounding a 40ms tool call to "0s" would report a duration that did not
 * happen.
 */
export function formatElapsed(ms: number, precise = false): string {
  const clamped = Math.max(0, ms);
  const displayMs = precise
    ? clamped < 1000
      ? Math.round(clamped)
      : Math.round(clamped / 100) * 100
    : clamped;
  if (displayMs < 1000) return `${Math.round(displayMs)}ms`;
  if (displayMs < 60_000) {
    const seconds = displayMs / 1000;
    return precise ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds)}s`;
  }
  if (displayMs < 3_600_000) {
    const minutes = Math.floor(displayMs / 60_000);
    const seconds = Math.floor((displayMs % 60_000) / 1000);
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  const hours = Math.floor(displayMs / 3_600_000);
  const minutes = Math.floor((displayMs % 3_600_000) / 60_000);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

/**
 * The same duration as a phrase, for the one-shot announcement a screen reader
 * gets when the work settles. `14.2s` is a glanceable readout and an unreadable
 * utterance; this is the utterance.
 */
export function formatSpokenElapsed(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 1000) return `${Math.round(clamped)} milliseconds`;
  if (clamped < 60_000) {
    const seconds = clamped / 1000;
    const value =
      seconds < 10 ? seconds.toFixed(1) : String(Math.round(seconds));
    return `${value} seconds`;
  }
  const totalSeconds = Math.round(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const minutePart = `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  return seconds === 0
    ? minutePart
    : `${minutePart} ${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}

// ---------------------------------------------------------------------------
// The disclosure that settles
// ---------------------------------------------------------------------------

export type SettleDisclosureOptions = {
  /** Initial open state. Defaults to "open while the work is live". */
  defaultOpen?: boolean;
  /**
   * Does the work still want the reader's eyes on it?
   *
   * Usually "is it running", but not only: a run that ended in a failure or an
   * approval gate is finished and still unfinished business, and collapsing
   * its output out of sight the moment it fails is the opposite of what the
   * reader needs. Callers widen it accordingly.
   */
  live: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Controlled open state. Supplying it disables every rule below. */
  open?: boolean;
};

/**
 * Open while the work runs; collapse to the one-line summary when it stops —
 * unless the reader took control, in which case their intent wins.
 *
 * §7.C asks for this in three places with the same words ("running expands;
 * completion collapses to a one-line summary"), so it is one hook. The latch
 * is the part that is easy to get wrong: a reader who closes a noisy trace
 * mid-run, or opens one to watch it, has expressed an intention about *this*
 * run, and an automatic close arriving half a second later reads as the UI
 * fighting them. A toggle made while `live` therefore switches the automation
 * off for the remainder of that run and is re-armed when the next run starts.
 */
export function useSettleDisclosure({
  defaultOpen,
  live,
  onOpenChange,
  open: openProp,
}: SettleDisclosureOptions): {
  open: boolean;
  setOpen: (next: boolean) => void;
} {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(
    defaultOpen ?? live,
  );
  const readerTookControl = React.useRef(false);
  const previousLive = React.useRef(live);
  const controlled = openProp !== undefined;

  React.useEffect(() => {
    if (previousLive.current === live) return;
    previousLive.current = live;
    if (controlled) return;

    if (live) {
      readerTookControl.current = false;
      setUncontrolledOpen(true);
      onOpenChange?.(true);
    } else if (!readerTookControl.current) {
      setUncontrolledOpen(false);
      onOpenChange?.(false);
    }
    // `onOpenChange` is deliberately not a dependency: this effect reacts to
    // the live edge, not to a caller re-creating its handler every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled, live]);

  return {
    open: openProp ?? uncontrolledOpen,
    setOpen: (next: boolean) => {
      if (live) readerTookControl.current = true;
      setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
  };
}

/**
 * One polite announcement per real transition, and none for anything else.
 *
 * Every process surface in the family has the same problem: it holds a value
 * that ticks (an elapsed time) inside a region that must speak (a status), and
 * the naive wiring re-announces the state once a second forever. Guarding on
 * the previous *state* rather than on the message means the readout can change
 * as often as it likes and the announcement fires only when the thing being
 * announced actually changed.
 */
export function useTransitionAnnouncement<T>(
  value: T,
  message: string,
  ready = true,
): string | null {
  const [announcement, setAnnouncement] = React.useState<string | null>(null);
  const previous = React.useRef(value);
  // A transition whose message is not final yet. `ready` exists because a
  // measured duration resolves one render AFTER the state it describes: the
  // stop time is captured in an effect, so on the render where `thinking`
  // becomes false the elapsed value is still null. Latching there spoke the
  // duration-less fallback ("Finished thinking") and the state guard below
  // then correctly suppressed the re-render that finally knew the number — so
  // the component announced the one phrasing its own docstring said it would
  // not. Holding the transition until the message is final fixes that without
  // letting a later, unrelated message re-announce the same state.
  const pending = React.useRef(false);

  React.useEffect(() => {
    if (previous.current !== value) {
      previous.current = value;
      pending.current = true;
    }
    if (!pending.current || !ready) return;
    pending.current = false;
    setAnnouncement(message);
  }, [message, ready, value]);

  return announcement;
}

/**
 * The text of a node, when there is any — used to build a spoken announcement
 * out of props that are typed as `ReactNode`.
 *
 * Deliberately shallow: it reads a string or a number and gives up on anything
 * else rather than walking an element tree. A partial announcement assembled
 * from whatever text a walker could scrape is worse than a short one, and the
 * callers all have a labelled fallback.
 */
export function nodeText(node: React.ReactNode): string | null {
  if (typeof node === "string") return node.trim() || null;
  if (typeof node === "number") return String(node);
  return null;
}
