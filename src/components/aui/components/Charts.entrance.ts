import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type * as React from "react";

import { useAtelierMotion } from "../motion/useAtelierMotion";

/**
 * A chart's first entrance (2026-11-15, the maintainer's decision to allow
 * one; on by default since the same day's follow-up). Rules: `docs/design-system/decisions/progress-grammar.md` → "Charts";
 * the moving half is `chart-entrance-motion.css`.
 *
 * One rule decides every form: **the frame is already there, and the marks
 * are uncovered once across their values, never along them.** A mark sits at
 * its final geometry from the first frame and only a clip moves, in the
 * direction that carries no value. All four moves run 340ms (`panel`) on the
 * ease-out:
 *
 * | Move | Forms | What plays |
 * | --- | --- | --- |
 * | `inline` | line, area, columns, histogram, waterfall, box plot, candlestick, bump, Sankey | uncovered from the start of the category axis to its end |
 * | `block` | rows of bars | uncovered from the first row to the last |
 * | `radial` | pie, donut, radial bars | uncovered from the centre outwards (an arc's value is its angle) |
 * | `appear` | scatter, radar, funnel, treemap | the marks fade in: every direction is a value |
 *
 * What makes it AUI's:
 *
 * - **Uncovered, never grown.** Bars do not rise and slices do not sweep: a
 *   rising bar passes through every lower height and a sweeping slice through
 *   every smaller share. Here a bar is its full height the moment the edge
 *   reaches it. This is the progress grammar's "no values nobody measured"
 *   kept through an entrance.
 * - **The frame does not move.** Axes, grid, reference rules, the legend,
 *   the headline, the summary line and the table twin are present from the
 *   first frame.
 * - **Once.** It plays when the plot first has data to draw (first paint, or
 *   data arriving after `loading`), and never again for that chart: not on a
 *   data update, a legend toggle, a resize, the table switch, a re-render or
 *   scrolling back into view. A chart that has already shown its data
 *   settled does not perform later. A remount is a new chart.
 * - **One move per chart, no stagger.** Every series shares the one edge.
 *   The libraries read do not agree on a stagger between series, and a
 *   stagger would make later series wait to be read.
 * - **Interruptible.** A state that replaces the plot, the table view, or
 *   `entrance` turning off ends it at the settled chart. Hover, the tooltip
 *   and keyboard exploration work throughout.
 * - **A budget.** At most `CHART_ENTRANCE_LIMIT` charts play at the same
 *   time, in mount order; the rest paint settled. A dashboard of twelve
 *   charts that all ask does not turn into a light show.
 * - **Reduce Motion** is the settled chart on the plot's existing 220ms
 *   opacity fade, with no clip.
 *
 * Kept: a one-time entrance that is longer than an update and settles at
 * once under Reduce Motion, and a line revealed from left to right. Left
 * out: bars growing from the baseline and arcs sweeping, 900 to 1500ms
 * durations, a stagger between bars, and playing when scrolled into view.
 */
export type ChartEntranceOptions = {
  /**
   * Play the chart's entrance once, when the plot first has data to draw:
   * the marks are uncovered across their values (a line or a row of columns
   * from the start of the category axis, a pie from its centre outwards)
   * over 340ms, each at its final value throughout, with axes, labels and
   * the legend in place from the first frame. Every later change is
   * immediate, as without it.
   *
   * On by default since 2026-11-15 (the maintainer: "looks better as
   * default true"). It stays quiet on a busy page by itself: at most three
   * charts play together and the others paint settled, a streaming (`live`)
   * chart never plays, `SmallMultiples` panels never play, and `Sparkline`
   * keeps it off unless asked. Pass `entrance={false}` for a chart that
   * should simply be there. Under Reduce Motion the chart fades in settled.
   * @default true
   */
  entrance?: boolean;
};

/** The direction a form's marks are uncovered in. */
export type ChartEntranceMove = "appear" | "block" | "inline" | "radial";

/**
 * - `waiting`: nothing drawn yet (loading, error, empty).
 * - `playing`: the entrance is on screen.
 * - `played`: it ran, or was cut short; the chart is settled for good.
 * - `skipped`: the chart showed its data without an entrance; it stays that way.
 */
export type ChartEntrancePhase = "playing" | "played" | "skipped" | "waiting";

/** How many charts may play their entrance at the same time. */
export const CHART_ENTRANCE_LIMIT = 3;

/**
 * Longer than the 340ms move: ends an entrance whose `animationend` never
 * arrives (no marks to animate, a browser without the clip's reference box).
 */
export const CHART_ENTRANCE_TIMEOUT_MS = 600;

export type ChartEntranceBudget = {
  /** Take a slot; `false` when `limit` entrances are already playing. */
  claim: () => boolean;
  release: () => void;
};

export function createChartEntranceBudget(limit: number): ChartEntranceBudget {
  let playing = 0;
  return {
    claim() {
      if (playing >= limit) return false;
      playing += 1;
      return true;
    },
    release() {
      playing = Math.max(0, playing - 1);
    },
  };
}

/** The page's budget: every chart on screen draws from the same three slots. */
export const chartEntranceBudget =
  createChartEntranceBudget(CHART_ENTRANCE_LIMIT);

/**
 * The entrance's whole decision, as a pure step. `claim` is only called when
 * the chart is about to play, so a skipped chart never takes a slot.
 */
export function nextChartEntrancePhase(
  phase: ChartEntrancePhase,
  input: {
    /** Takes a budget slot; `false` when none is free. */
    claim: () => boolean;
    /** `entrance` is on and the form has a move. */
    enabled: boolean;
    /** The plot has data on screen (no state, not the table view). */
    ready: boolean;
    reduceMotion: boolean;
  },
): ChartEntrancePhase {
  if (phase === "waiting") {
    if (!input.ready) return "waiting";
    if (!input.enabled || input.reduceMotion) return "skipped";
    return input.claim() ? "playing" : "skipped";
  }
  if (phase === "playing") {
    return input.enabled && input.ready ? "playing" : "played";
  }
  return phase;
}

/**
 * Whether a chart asks for its entrance: on unless the caller passed
 * `entrance={false}`, and only for a form that has a move. A gauge and the
 * forms drawn outside the shared plot pass no move, so they never play.
 */
export function wantsChartEntrance(
  entrance: boolean | undefined,
  move: ChartEntranceMove | undefined,
): boolean {
  return entrance !== false && move != null;
}

/** `true` for the animations `chart-entrance-motion.css` runs. */
export function isChartEntranceAnimation(name: string): boolean {
  return name.startsWith("aui-chart-entrance-");
}

/**
 * Runs the entrance for one chart: `playing` is true while the plot carries
 * the entrance class, and `settled` once it has played (the plot then keeps
 * its own fade off, so ending the entrance does not start a second one).
 */
export function useChartEntrance({
  budget = chartEntranceBudget,
  enabled,
  ready,
}: {
  budget?: ChartEntranceBudget;
  enabled: boolean;
  ready: boolean;
}): {
  onAnimationEnd: (event: React.AnimationEvent) => void;
  playing: boolean;
  settled: boolean;
} {
  const { reduceMotion } = useAtelierMotion();
  const [phase, setPhase] = useState<ChartEntrancePhase>("waiting");
  const holdsSlot = useRef(false);

  // Before paint, so a chart that mounts with its data never shows one
  // settled frame ahead of the entrance.
  useLayoutEffect(() => {
    const next = nextChartEntrancePhase(phase, {
      claim: () => {
        holdsSlot.current = budget.claim();
        return holdsSlot.current;
      },
      enabled,
      ready,
      reduceMotion,
    });
    if (next !== phase) setPhase(next);
  }, [budget, enabled, phase, ready, reduceMotion]);

  const finish = useCallback(() => {
    setPhase((current) => (current === "playing" ? "played" : current));
  }, []);

  useEffect(() => {
    if (phase !== "playing") {
      if (holdsSlot.current) {
        holdsSlot.current = false;
        budget.release();
      }
      return;
    }
    const timer = setTimeout(finish, CHART_ENTRANCE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [budget, finish, phase]);

  // A chart removed mid-entrance hands its slot back.
  useEffect(
    () => () => {
      if (holdsSlot.current) {
        holdsSlot.current = false;
        budget.release();
      }
    },
    [budget],
  );

  const onAnimationEnd = useCallback(
    (event: React.AnimationEvent) => {
      if (isChartEntranceAnimation(event.animationName)) finish();
    },
    [finish],
  );

  return {
    onAnimationEnd,
    playing: phase === "playing",
    settled: phase === "playing" || phase === "played",
  };
}

/** The class the entrance stylesheet selects on, beside `data-chart-entrance`. */
export const CHART_ENTRANCE_CLASS = "aui-chart-entrance";
