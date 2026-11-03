import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/* ------------------------------------------------------------------------ *
 * TraceWaterfall — styles.
 *
 * Split from `TraceWaterfall.tsx` so the root has room for the disclosure
 * group under the 500-line source ceiling. Moved verbatim.
 * ------------------------------------------------------------------------ */

// "Running" state signal: gentle opacity pulse on the bar. State signal, not
// decoration (design-direction §3); reduced motion renders it static.
const pulse = stylex.keyframes({
  "0%": { opacity: 1 },
  "50%": { opacity: 0.45 },
  "100%": { opacity: 1 },
});

export const styles = stylex.create({
  root: {
    backgroundColor: vars["--ads-color-surface-raised"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "grid",
    fontFamily: vars["--ads-font-sans"],
    fontSize: vars["--ads-font-size-caption"],
    // Host: the root owns the three columns and every row is a subgrid of
    // them, so the trailing column takes its widest cell's width on EVERY row
    // and the tracks between share one axis. Per-row grids sized that column
    // per row, which moved each track — and its bar — by its own text width.
    gridTemplateColumns: "minmax(96px, 34%) minmax(0, 1fr) max-content",
    inlineSize: "100%",
    minInlineSize: 0,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    // Alpha hairline row dividers (house rule): quiet on any surface.
    borderBlockEndColor: vars["--ads-color-border-subtle"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--ads-border-width-hairline"],
    columnGap: vars["--ads-space-12"],
    display: "grid",
    gridColumn: "1 / -1",
    gridTemplateColumns: "subgrid",
    minInlineSize: 0,
    paddingInlineEnd: vars["--ads-space-12"],
    ":last-child": {
      borderBlockEndWidth: 0,
    },
  },
  // The summary + expand/collapse-all line, on the row rhythm (28px, the same
  // hairline) so it reads as the table's first row rather than a toolbar.
  // Inline-start 8px lands the count on the chevron glyphs below it; the end
  // gutter matches the rows' so the toggle lines up with the durations.
  head: {
    alignItems: "center",
    borderBlockEndColor: vars["--ads-color-border-subtle"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-8"],
    gridColumn: "1 / -1",
    justifyContent: "space-between",
    minBlockSize: vars["--ads-control-height-xs"],
    minInlineSize: 0,
    paddingInlineEnd: vars["--ads-space-12"],
    paddingInlineStart: vars["--ads-space-8"],
  },
  summary: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    minInlineSize: 0,
  },
  summaryStrong: {
    color: vars["--ads-color-text"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  dot: {
    color: vars["--ads-color-text-subtle"],
    marginInline: vars["--ads-space-4"],
  },
  nameCell: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  chevron: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":active": vars["--ads-color-overlay-pressed"],
      "@media (hover: hover)": {
        default: "transparent",
        ":hover": vars["--ads-color-overlay-hover"],
        ":active": vars["--ads-color-overlay-pressed"],
      },
    },
    blockSize: 20,
    borderRadius: vars["--ads-radius-control"],
    borderWidth: 0,
    color: vars["--ads-color-text-muted"],
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    inlineSize: 20,
    justifyContent: "center",
    padding: 0,
  },
  chevronSpacer: {
    display: "inline-block",
    flexShrink: 0,
    inlineSize: 20,
  },
  selectButton: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":active": vars["--ads-color-overlay-pressed"],
      "@media (hover: hover)": {
        default: "transparent",
        ":hover": vars["--ads-color-overlay-hover"],
        ":active": vars["--ads-color-overlay-pressed"],
      },
    },
    borderRadius: vars["--ads-radius-control"],
    borderWidth: 0,
    color: vars["--ads-color-text"],
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: vars["--ads-font-sans"],
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-8"],
    lineHeight: vars["--ads-line-height-tight"],
    minBlockSize: vars["--ads-control-height-xs"],
    minInlineSize: 0,
    overflow: "hidden",
    paddingBlock: 0,
    paddingInline: vars["--ads-space-4"],
    textAlign: "start",
  },
  selectButtonSelected: {
    // `aria-pressed` control, so this follows the pressed grammar of §1.7 — but
    // not Toolbar's version of it. Toolbar can announce "pressed" by moving its
    // label from `colorTextMuted` to `colorAccent`; this button's label is
    // already `colorText`, and `colorAccent` (L 0.216) is *lighter* than
    // `colorText` (L 0.16), so the same move would make the selected span read
    // fainter than its neighbours. The soft fill can't carry it either — 1.11:1
    // against the row in light. So the signal is an inset accent ring, the same
    // idiom `tree-styles.rowDropInside` uses, which costs no layout shift on a
    // `borderWidth: 0` control.
    //
    // The weight jump this rule used to carry is gone on purpose: §5 says a
    // selected row relies on its check, color, or surface state "instead of
    // stacking a second jump in weight", and the weight was only load-bearing
    // while the fill was the sole other signal.
    backgroundColor: vars["--ads-color-selection-fill"],
    boxShadow: `inset 0 0 0 ${vars["--ads-ring-width-sm"]} ${vars["--ads-color-accent"]}`,
  },
  // Host: the name keeps its room and the muted meta gives way first. Upstream
  // held the meta at full width, so a long meta (a file path, a command)
  // squeezed the span's own name to a letter.
  name: {
    flexShrink: 0,
    maxInlineSize: "100%",
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  meta: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 1,
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  track: {
    blockSize: 8,
    minInlineSize: 0,
    position: "relative",
  },
  bar: {
    blockSize: 8,
    borderRadius: vars["--ads-radius-full"],
    display: "block",
    insetBlockStart: 0,
    minInlineSize: 2,
    position: "absolute",
  },
  // Bars are data ink: chart1 by default (never colorAccent / status-as-series);
  // error/running are *state* colors, which is exactly what status tokens are for.
  barOk: {
    backgroundColor: vars["--ads-chart-1"],
  },
  barError: {
    backgroundColor: vars["--ads-color-danger"],
  },
  barRunning: {
    // Slow loop step: an in-flight span breathes ambiently. The old
    // `calc(durationPanel * 4)` derived a loop cadence from a *transition*
    // duration, so retuning panel motion would have retimed this pulse. The
    // reduced-motion `0s` duration went with it — `animationName: none` below
    // already stops the loop.
    animationDuration: vars["--ads-motion-duration-loop-slow"],
    animationIterationCount: "infinite",
    animationName: {
      default: pulse,
      // Reduced motion: no pulse — the bar renders its final state instantly.
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationTimingFunction: vars["--ads-motion-ease-in-out"],
    backgroundColor: vars["--ads-chart-1"],
  },
  duration: {
    // Host: an inline row so a span's trailing tag sits before its figure.
    alignItems: "baseline",
    color: vars["--ads-color-text-muted"],
    display: "inline-flex",
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-8"],
    justifyContent: "flex-end",
    lineHeight: vars["--ads-line-height-tight"],
    minInlineSize: "3.5rem",
    textAlign: "end",
    whiteSpace: "nowrap",
  },
  // Host: the `markerMs` line. It runs the full row height, so the lines on
  // stacked rows read as one rule across the axis.
  marker: {
    backgroundColor: vars["--ads-color-info"],
    insetBlock: `calc((8px - ${vars["--ads-control-height-xs"]}) / 2)`,
    inlineSize: vars["--ads-border-width-hairline"],
    pointerEvents: "none",
    position: "absolute",
  },
  // Host: bar series other than the upstream `chart1`.
  barChart2: {
    backgroundColor: vars["--ads-chart-2"],
  },
  barChart4: {
    backgroundColor: vars["--ads-chart-4"],
  },
  barNeutral: {
    backgroundColor: vars["--ads-color-text-subtle"],
  },
});

export const barStatusStyles = {
  error: styles.barError,
  ok: styles.barOk,
  running: styles.barRunning,
} as const;

/** Host: the bar series a span may ask for; `error` is never overridden. */
export const barToneStyles = {
  chart1: styles.barOk,
  chart2: styles.barChart2,
  chart4: styles.barChart4,
  neutral: styles.barNeutral,
} as const;
