import type { LucideIcon } from "lucide-react";
import type * as React from "react";

import type { XstyleProp } from "../utils/stylex";
import type {
  StatTileDeltaTone,
  StatTileGoodDirection,
} from "./StatTile.delta";

export type { StatTileDeltaTone, StatTileGoodDirection };

/*
 * StatTile's public types, in their own module so the row variant can name
 * them without an import cycle back through StatTile.tsx.
 */

/** `tile` is the headline metric; `row` is one line of a change summary. */
export type StatTileVariant = "row" | "tile";

/** Start and end of the period the trend covers, printed under it. */
export type StatTileTrendRange = {
  end: React.ReactNode;
  start: React.ReactNode;
};

export type StatTileProps = Omit<React.ComponentProps<"div">, "children"> & {
  /**
   * Internal air and readout scale. `regular` is the dashboard header metric;
   * `compact` is the same anatomy in a sidebar summary or an inspector column,
   * where the heading-sized value overpowered a 240px rail and the tile's gaps
   * cost more vertical space than the numbers did.
   *
   * A surface axis, not `size`: what changes is the tile's own air and the
   * readout's type role, not a step on the shared control ramp.
   * @default "regular"
   */
  density?: "compact" | "regular";
  /**
   * Named period the change is read against ("vs last week"), printed in
   * quiet ink after the delta tag — the derived one or an explicit `delta`.
   */
  comparisonLabel?: React.ReactNode;
  /**
   * Signed change against a named period, e.g. "+12% vs last week". Given, it
   * is printed as-is and wins over the delta `previous` would derive.
   */
  delta?: React.ReactNode;
  /**
   * How the delta derived from `previous` reads: the relative change
   * (`+12.4%`) or the difference in the value's own unit (`+0.4s`, through
   * `format`). A zero `previous` has no relative change, so it reads absolute.
   * @default "percent"
   */
  deltaFormat?: "absolute" | "percent";
  /**
   * Direction the delta means, not the direction it points: fewer incidents is
   * `success` even though the number fell. Given, it wins over the tone
   * `goodDirection` derives. @default "neutral" (or derived from `previous`)
   */
  deltaTone?: StatTileDeltaTone;
  /**
   * The value failed to load. The label stays; the readout holds its line box
   * with a muted em dash, the delta, trend and progress are not drawn, and one
   * line under it states the failure — this node, or `errorLabel` for `true` —
   * in danger text after a small glyph, with a `Retry` link when `onRetry` is
   * given. Only that message is `role="alert"`. `loading` wins: a retry in
   * flight shows the skeleton. On a row the line takes the delta and trend
   * columns. @default false
   */
  error?: React.ReactNode | boolean;
  /** The failure message for `error={true}`. @default "Couldn't load" */
  errorLabel?: React.ReactNode;
  /** Re-run the failed load; adds a `Retry` link to the error line. */
  onRetry?: () => void;
  /** Label of the error line's recovery action. @default "Retry" */
  retryLabel?: React.ReactNode;
  /**
   * Formats a numeric `value` and the absolute delta derived from `previous`
   * (`(v) => \`${v.toFixed(1)}s\``). Defaults to the compact chart format.
   */
  format?: (value: number) => string;
  /**
   * Which way a change is good news, so the derived delta is toned by meaning:
   * `up` (conversations) reads a rise as success, `down` (latency, cost) reads
   * a rise as danger, `none` keeps every change neutral. @default "up"
   */
  goodDirection?: StatTileGoodDirection;
  /** Optional leading glyph, matching chart-card anatomy. */
  icon?: LucideIcon;
  /**
   * A hint after the label, inside the label row — an `InfoHint` or a
   * `Tooltip` trigger saying how the metric is counted. A slot rather than
   * part of `label`, which also names the trend for assistive tech.
   */
  info?: React.ReactNode;
  /** Sentence case, no trailing colon. */
  label: React.ReactNode;
  /**
   * The value is in flight. The readout and the trend hold their box as
   * skeletons and the tile is `aria-busy`, so a row of tiles does not jump
   * when the numbers land. The label stays: it says what is loading.
   * @default false
   */
  loading?: boolean;
  /**
   * A value that updates in place (a websocket count, active sessions). A
   * pulsing "Live" mark sits by the label, and the readout is a polite live
   * region so a screen reader hears the new value. @default false
   */
  live?: boolean;
  /**
   * Progress toward a goal under the readout — quota, plan usage, a launch
   * target. `max` is the goal; the caption states value of goal as text.
   */
  progress?: {
    /** Label beside the ratio. @default `of ${format(max)}` */
    label?: string;
    max: number;
    tone?: "danger" | "neutral" | "success" | "warning";
    value?: number;
  };
  /** Small print under the readout (sample size, caveat, as-of time). */
  note?: React.ReactNode;
  /**
   * The same measure in the period compared against. With a numeric `value`
   * and no `delta`, the tile derives the signed change and its tone, so the
   * arithmetic and the good/bad reading are not re-done at every call site.
   */
  previous?: number;
  /** Trend series behind the readout; omitted when there is no history. */
  trend?: number[];
  /**
   * The period the trend covers, printed at its two ends ("Oct 30" · "Today")
   * over a hairline baseline, so the line reads against a span of time. Also
   * named in the trend's accessible label. Tile variant only.
   */
  trendRange?: StatTileTrendRange;
  /**
   * Names for the trend's points (oldest → newest), shown as the hover
   * readout's heading — "Sep 3" beside the value it had. Implies
   * `trendTooltip`.
   */
  trendLabels?: string[];
  /**
   * A hover readout on the trend: the point's label (from `trendLabels`) and
   * its value through `format`. Off by default — a tile's trend is read at a
   * glance, and the headline number is already stated. @default false
   */
  trendTooltip?: boolean;
  /**
   * A number is compacted for display (1,284 · 12.9K); a string is printed
   * as-is, so pre-formatted values (currency, durations) stay untouched.
   */
  value: number | string;
  /**
   * `tile` (default): label · value · delta · trend, stacked. `row`: one line
   * of a change summary — label, value, delta tag, a 64px trend — for a side
   * panel or report summary where a tile grid would stack tall. Consecutive
   * rows share hairlines. Rows drop `note`, `progress` and `live`.
   * @default "tile"
   */
  variant?: StatTileVariant;
} & XstyleProp;
