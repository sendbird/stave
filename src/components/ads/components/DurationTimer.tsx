import * as stylex from "@stylexjs/stylex";
import { useSyncExternalStore } from "react";
import type * as React from "react";

import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";

// ---------------------------------------------------------------------------
// Shared 1s ticker — one interval regardless of how many live timers mount
// (DurationTimer, SlaChip). Subscribing components re-render once per second;
// the interval stops when the last subscriber unmounts.
// ---------------------------------------------------------------------------

type TickListener = () => void;

const tickListeners = new Set<TickListener>();
let tickIntervalId: ReturnType<typeof setInterval> | null = null;
let currentTickSecond = Math.floor(Date.now() / 1000);

function subscribeTick(listener: TickListener) {
  tickListeners.add(listener);

  if (tickIntervalId == null) {
    currentTickSecond = Math.floor(Date.now() / 1000);
    tickIntervalId = setInterval(() => {
      currentTickSecond = Math.floor(Date.now() / 1000);
      for (const notify of tickListeners) {
        notify();
      }
    }, 1000);
  }

  return () => {
    tickListeners.delete(listener);

    if (tickListeners.size === 0 && tickIntervalId != null) {
      clearInterval(tickIntervalId);
      tickIntervalId = null;
    }
  };
}

function subscribeNever() {
  return () => {};
}

function getTickSnapshot() {
  return currentTickSecond;
}

/**
 * Current time (epoch ms, 1s granularity) from the shared module-level
 * interval. Pass `enabled: false` to freeze (deterministic `now` prop, paused
 * timers) — the component then neither ticks nor holds the interval alive.
 *
 * Internal to the DS (used by `DurationTimer` and `SlaChip`); not part of the
 * public API surface.
 */
export function useSharedNow(enabled: boolean): number {
  const second = useSyncExternalStore(
    enabled ? subscribeTick : subscribeNever,
    getTickSnapshot,
    getTickSnapshot,
  );
  return second * 1000;
}

// ---------------------------------------------------------------------------
// DurationTimer
// ---------------------------------------------------------------------------

export type DurationTimerProps = Omit<
  React.ComponentProps<"span">,
  "children"
> & {
  /**
   * Accessible label prefix for the elapsed announcement.
   * @default "elapsed"
   */
  label?: string;
  /**
   * Reference "current time" for deterministic rendering (docs, tests, SSR).
   * When provided the timer does not tick.
   */
  now?: Date | number;
  /**
   * Freeze the display (call hold, recording paused). Elapsed time still
   * derives from `startedAt`, so resuming jumps to the true duration.
   */
  paused?: boolean;
  /** The instant the call/session started. `Date` or epoch milliseconds. */
  startedAt: Date | number;
} & XstyleProp;

function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  const two = (value: number) => String(value).padStart(2, "0");

  return hours > 0
    ? `${hours}:${two(minutes)}:${two(seconds)}`
    : `${minutes}:${two(seconds)}`;
}

/**
 * Sparse accessible phrase — minute granularity so assistive tech isn't
 * re-announcing a label mutation every second (per WAI, `role="timer"` uses
 * `aria-live="off"`; SR users read it on demand).
 */
function formatSpokenElapsed(totalSeconds: number, label: string): string {
  const clamped = Math.max(0, totalSeconds);

  if (clamped < 60) {
    return `${label} less than a minute`;
  }

  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  }

  return `${label} ${parts.join(" ")}`;
}

/**
 * Live call/session duration readout (`0:42` → `12:04` → `1:07:33`; hours
 * appear only when nonzero). Ticks off a shared 1-second interval — many
 * timers, one interval — and stops ticking (and releases the interval) when
 * `paused` or a deterministic `now` is provided.
 *
 * a11y: `role="timer"` with `aria-live="off"` per WAI guidance (a
 * once-per-second live region is spam); the `aria-label` carries a sparse
 * minute-granularity phrase ("elapsed 12 minutes") for on-demand reading.
 * Digits are tabular so the readout doesn't jitter.
 */
export function DurationTimer({
  className,
  label = "elapsed",
  now,
  paused = false,
  startedAt,
  xstyle,
  ...props
}: DurationTimerProps) {
  const live = now === undefined && !paused;
  const tickedNow = useSharedNow(live);
  const reference =
    now === undefined ? tickedNow : now instanceof Date ? now.getTime() : now;
  const startMs = startedAt instanceof Date ? startedAt.getTime() : startedAt;
  const elapsedSeconds = Math.floor((reference - startMs) / 1000);

  return (
    <span
      {...props}
      aria-label={formatSpokenElapsed(elapsedSeconds, label)}
      aria-live="off"
      className={cx(sx(styles.root, xstyle), className)}
      role="timer"
    >
      {formatClock(elapsedSeconds)}
    </span>
  );
}

const styles = stylex.create({
  root: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontVariantNumeric: "tabular-nums",
    lineHeight: vars.lineHeightTight,
    whiteSpace: "nowrap",
  },
});
