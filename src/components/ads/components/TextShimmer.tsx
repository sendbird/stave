import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { textShimmer } from "../recipes/text-shimmer";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";

export type TextShimmerProps = Omit<
  React.ComponentProps<"span">,
  "children"
> & {
  /**
   * Animate the shimmer. Shimmer is a *state signal* (AI thinking/streaming,
   * indexing, long-running work) — turn it off the moment the state resolves.
   * When false the text renders as plain muted text.
   */
  active?: boolean;
  children: React.ReactNode;
} & XstyleProp;

/**
 * Functional text shimmer for in-progress states (beUI text-animation
 * absorption, scoped by `docs/design-direction.md` §3: shimmer is allowed as a
 * STATE SIGNAL, never as decoration on static copy).
 *
 * CSS-layer motion: `textShimmer.sweep` from `recipes/text-shimmer`, a gradient
 * sweep over `background-clip: text` that animates background-position only (no
 * transform, no layout). The recipe owns the gradient, the cadence, and the
 * reduced-motion arm — `Thinking` imports the same one, so active agent text
 * cannot drift into a second sweep.
 *
 * This is the effect applied to text that already exists. For text that has
 * not arrived yet, use `TextShimmerLines`, which reserves the space instead of
 * decorating it.
 */
export function TextShimmer({
  active = true,
  className,
  xstyle,
  ...props
}: TextShimmerProps) {
  return (
    <span
      {...props}
      className={cx(
        sx(styles.base, active && textShimmer.sweep, xstyle),
        className,
      )}
    />
  );
}

export type TextShimmerLineWidth = "full" | "long" | "medium" | "short";

export type TextShimmerLinesProps = Omit<
  React.ComponentProps<"div">,
  "children"
> & {
  /**
   * Animate the sweep. Same state-signal rule as `TextShimmer`: false leaves
   * the reserved block in place, static — which is also what a reader who
   * asked for reduced motion gets while it is true.
   */
  active?: boolean;
  /**
   * Trailing caption slot for how long the run has been going. Compose
   * `DurationTimer` here (`duration={<DurationTimer startedAt={startedAt} />}`)
   * rather than passing a start time: the elapsed readout, its shared 1s
   * ticker, and its sparse screen-reader phrasing already exist there, and a
   * second implementation inside a placeholder would drift from it.
   */
  duration?: React.ReactNode;
  /** Accessible name announced while the placeholder is up. @default "Loading" */
  label?: string;
  /** How many lines of text to reserve. @default 3 */
  lines?: number;
  /**
   * Relative width per line, cycled when shorter than `lines`. A short scale
   * rather than free CSS lengths: the placeholder has to be declared in the
   * stylesheet to reserve its space without an inline style, and four steps
   * cover every paragraph shape anyone has actually needed.
   * @default ["full", "full", "medium"]
   */
  widths?: TextShimmerLineWidth[];
} & XstyleProp;

const DEFAULT_LINE_WIDTHS: TextShimmerLineWidth[] = ["full", "full", "medium"];

/**
 * Layout-stable streaming placeholder: N lines of shimmering block, each
 * occupying exactly one line box (`1lh`) of the type it stands in, so arriving
 * text lands where the placeholder was instead of shoving the page down under
 * it. This is the shared answer to "the model is writing" — a spinner reserves
 * nothing and reflows the whole surface when the first token lands.
 *
 * Motion is `textShimmer.bar` — the same travel as `textShimmer.sweep`, applied
 * to a solid block instead of clipped to glyphs, and carrying the same
 * reduced-motion contract: the gradient is dropped and the flat
 * `colorCanvasSubtle` fill underneath it remains, so the block still holds its
 * space, just without animation. It is not a `Skeleton` replacement —
 * `Skeleton` reproduces a known component's shape; this reproduces a paragraph
 * that does not exist yet.
 */
export function TextShimmerLines({
  active = true,
  className,
  duration,
  label = "Loading",
  lines = 3,
  widths = DEFAULT_LINE_WIDTHS,
  xstyle,
  ...props
}: TextShimmerLinesProps) {
  const scale = widths.length > 0 ? widths : DEFAULT_LINE_WIDTHS;

  return (
    <div
      {...props}
      aria-busy={active}
      aria-label={label}
      className={cx(sx(styles.lines, xstyle), className)}
      role="status"
    >
      {Array.from({ length: Math.max(0, lines) }, (_, index) => (
        <span
          className={sx(
            styles.line,
            // `scale` is non-empty (the caller's `widths`, or the default), and
            // the modulo keeps the index inside it — but this host compiles with
            // `noUncheckedIndexedAccess`, which types the read as possibly
            // undefined regardless. The fallback states what the modulo already
            // guarantees rather than widening the lookup table.
            lineWidths[scale[index % scale.length] ?? "full"],
            active && textShimmer.bar,
          )}
          key={index}
        />
      ))}
      {duration ? (
        // Explicitly outside the live region's announcements: a timer ticking
        // inside `role="status"` would re-announce the whole placeholder every
        // second, which is the exact failure `DurationTimer` already sets
        // `aria-live="off"` on itself to avoid.
        <span aria-live="off" className={sx(styles.caption)}>
          {duration}
        </span>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  base: {
    color: vars.colorTextMuted,
  },
  /**
   * Zero row gap, deliberately: each line already reserves a full `1lh` line
   * box, so the rhythm between placeholder lines is the type's own leading. A
   * gap on top of that would reserve more space than the text it replaces.
   */
  lines: {
    display: "grid",
    inlineSize: "100%",
    minInlineSize: 0,
    rowGap: 0,
  },
  /**
   * The bar is 0.7em — roughly a lowercase line's ink — centred in its `1lh`
   * slot by symmetric margins rather than padding over a clipped background,
   * so the bar keeps its radius. Grid items never collapse margins, so the
   * slot stays exactly one line tall.
   */
  line: {
    backgroundColor: vars.colorCanvasSubtle,
    blockSize: "0.7em",
    borderRadius: vars.radiusMark,
    marginBlock: "calc((1lh - 0.7em) / 2)",
  },
  caption: {
    alignItems: "center",
    color: vars.colorTextSubtle,
    display: "flex",
    fontSize: vars.fontSizeCaption,
    gap: vars.space8,
    lineHeight: vars.lineHeightTight,
    paddingBlockStart: vars.space4,
  },
});

const lineWidths = stylex.create({
  full: { inlineSize: "100%" },
  long: { inlineSize: "88%" },
  medium: { inlineSize: "68%" },
  short: { inlineSize: "42%" },
});
