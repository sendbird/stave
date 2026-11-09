import * as stylex from "@stylexjs/stylex";

import {
  MeterIndicator,
  MeterLabel,
  MeterRoot,
  MeterTrack,
  MeterValue,
  type MeterRootProps,
} from "../headless/meter";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";

export type MeterTone =
  | "accent"
  | "danger"
  | "info"
  | "neutral"
  | "success"
  | "warning";

/** Track height: `md` is the bundle's 10px bar, `sm` the 6px bar a dense row or table cell carries. */
export type MeterSize = "sm" | "md";

export type MeterProps = Omit<MeterRootProps, "className"> & {
  className?: string;
  /**
   * Render the label in the visual row. `false` keeps it for assistive tech
   * but drops it from the row. Use that where a heading already names the
   * value — a table cell under a "Rollout" column repeating "Rollout" on every
   * row is noise, and it steals the width the track needs. @default true
   */
  showLabel?: boolean;
  /**
   * Keep the value for assistive tech (the root's `aria-valuetext`) but drop
   * the visible figure. Use it where the caller already prints the reading
   * beside the bar in its own words, so the row does not say it twice.
   */
  hideValue?: boolean;
  /** Accessible name. Required: the host supplies it from its translations. */
  label: string;
  /** Track height. @default "md" */
  size?: MeterSize;
  /** Fill color. `neutral` is a muted ink for a reading that is not yet a concern. @default "accent" */
  tone?: MeterTone;
} & XstyleProp;

export function Meter({
  className,
  hideValue = false,
  label,
  max = 100,
  min = 0,
  showLabel = true,
  size = "md",
  tone = "accent",
  value,
  xstyle,
  ...props
}: MeterProps) {
  const theme = themeProps("meter", { tone });

  return (
    <MeterRoot
      {...props}
      {...theme}
      className={cx(sx(styles.root, xstyle), theme.className, className)}
      max={max}
      min={min}
      value={value}
    >
      <MeterLabel
        className={sx(showLabel ? styles.label : styles.labelHidden)}
        {...themeSlotProps("meter", "label")}
      >
        {label}
      </MeterLabel>
      {hideValue ? null : (
        <MeterValue
          className={sx(styles.value)}
          {...themeSlotProps("meter", "value")}
        />
      )}
      <MeterTrack
        className={sx(styles.track, size === "sm" && styles.trackSm)}
        {...themeSlotProps("meter", "track")}
      >
        <MeterIndicator
          className={sx(styles.indicator, toneStyles[tone])}
          {...themeSlotProps("meter", "indicator")}
        />
      </MeterTrack>
    </MeterRoot>
  );
}

const styles = stylex.create({
  root: {
    /*
     * The label is 14px and the value is 12px mono, so the row only reads as
     * one line when they share a baseline. Grid's default `stretch` gave each
     * cell the full row height and let each text sit at the top of its own
     * box, which put the value 2px above the label it belongs to — visible
     * wherever meters stack, e.g. an answer distribution. The track is in its
     * own row (`gridColumn: 1 / -1`) at a fixed height, so it is unaffected.
     */
    alignItems: "baseline",
    display: "grid",
    gap: vars["--aui-space-8"],
    gridTemplateColumns: "minmax(0, 1fr) auto",
    inlineSize: "100%",
  },
  label: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-normal"],
  },
  // Same clip as `VisuallyHidden`, inlined because the label is a grid child:
  // wrapping it in another element would break `root`'s two-column template.
  // The track spans `1 / -1`, so the collapsed column costs no width.
  // The explicit inset is load-bearing: with auto insets the box sits at its
  // static position and still contributes to the page's scrollable overflow —
  // three hidden meter labels added ~1.1k px of phantom scroll below the
  // Agent workbench template. Pinned to the containing block's start corner
  // it can never extend the page.
  labelHidden: {
    blockSize: 1,
    clipPath: "inset(50%)",
    inlineSize: 1,
    insetBlockStart: 0,
    insetInlineStart: 0,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    whiteSpace: "nowrap",
  },
  value: {
    color: vars["--aui-color-text-muted"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    textAlign: "end",
  },
  track: {
    // An overlay, not a surface: it has to read on every surface a meter sits
    // on, including one painted `colorCanvasSubtle`.
    backgroundColor: vars["--aui-color-track"],
    borderRadius: vars["--aui-radius-full"],
    blockSize: 10,
    gridColumn: "1 / -1",
    overflow: "hidden",
  },
  trackSm: {
    blockSize: 6,
  },
  indicator: {
    blockSize: "100%",
    borderRadius: vars["--aui-radius-full"],
    // Kept local: the fill animates its own `width`, which no `transition.*`
    // property key covers. The reduced-motion 0ms override was missing — every
    // recipe key carries one, and a hand-written transition that skips it
    // ignores the user's OS-level motion preference outright.
    transitionDuration: {
      default: vars["--aui-motion-duration-normal"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "width",
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
    // Forced colors replace every author background with Canvas, which would
    // erase the fill and leave an empty track; the fill keeps its own ink.
    forcedColorAdjust: "none",
  },
  accent: {
    backgroundColor: vars["--aui-color-accent"],
  },
  danger: {
    backgroundColor: vars["--aui-color-danger"],
  },
  info: {
    backgroundColor: vars["--aui-color-info"],
  },
  neutral: {
    backgroundColor: vars["--aui-color-text-muted"],
  },
  success: {
    backgroundColor: vars["--aui-color-success"],
  },
  warning: {
    backgroundColor: vars["--aui-color-warning"],
  },
});

const toneStyles = {
  accent: styles.accent,
  danger: styles.danger,
  info: styles.info,
  neutral: styles.neutral,
  success: styles.success,
  warning: styles.warning,
} as const;
