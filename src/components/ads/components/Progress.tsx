import { i18n } from "@/i18n";
import * as stylex from "@stylexjs/stylex";

import {
  ProgressIndicator,
  ProgressLabel,
  ProgressRoot,
  ProgressTrack,
  ProgressValue,
  type ProgressRootProps,
} from "../headless/progress";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";

/**
 * Semantic tone of the fill. Spelled exactly like `ProgressCircle` and `Gauge`
 * (`default` rather than `accent`) so the four progress surfaces take the same
 * value from one product state — a rollout at 80% and its ring must not need
 * two vocabularies to say "this is failing".
 */
export type ProgressTone =
  | "default"
  | "info"
  | "success"
  | "warning"
  | "danger"
  /** Host extension: the muted ink, for work that stopped without failing (cancelled, not started). */
  | "neutral";

/** Track height: `md` is the bundle's 8px bar, `sm` the 6px bar a one-line row carries. */
export type ProgressSize = "sm" | "md";

export type ProgressProps = Omit<ProgressRootProps, "className"> & {
  className?: string;
  /**
   * Keep the label for assistive tech but drop it from the visual row, for a
   * bar whose caller already prints what it measures beside it.
   */
  hideLabel?: boolean;
  /**
   * Keep the value for assistive tech (`aria-valuetext`) but drop the visible
   * figure. With `hideLabel` the bar is the whole surface: no header row.
   */
  hideValue?: boolean;
  /** Accessible name. Required: the host supplies it from its translations. */
  label: string;
  /** Track height. @default "md" */
  size?: ProgressSize;
  /**
   * Semantic tone of the fill. `default` is the accent bar; the three semantic
   * tones are for a bar whose value IS the state (quota exceeded, a failing
   * batch, a completed migration) — not for decorating an ordinary metric.
   * @default "default"
   */
  tone?: ProgressTone;
} & XstyleProp;

export function Progress({
  className,
  format,
  hideLabel = false,
  hideValue = false,
  label,
  locale,
  max = 100,
  min = 0,
  size = "md",
  tone = "default",
  value,
  xstyle,
  ...props
}: ProgressProps) {
  const boundedValue =
    value == null ? null : Math.min(max, Math.max(min, value));
  const span = max - min || 1;
  const percent =
    boundedValue == null ? 100 : ((boundedValue - min) / span) * 100;
  /*
   * Base UI's default value text is `formatNumber(value / 100, …, "percent")` —
   * the raw value read as a percentage, with `max` ignored. So a `3 / 3` bar
   * rendered full and captioned itself "3%". Every caller that measures in
   * real units rather than percent hit it (Tern's answered-question rail,
   * Jive's bulk-generation counter). `Meter` never had the bug because Base
   * UI's meter derives its own `percentageValue` from `min`/`max` first, which
   * is what this does. A caller-supplied `format` still wins: passing one is
   * an explicit request to label the raw value (`"12 of 60 seats"`), not the
   * ratio.
   */
  const ratioLabel =
    boundedValue == null
      ? null
      : new Intl.NumberFormat(locale, { style: "percent" }).format(
          percent / 100,
        );
  const theme = themeProps("progress", { tone });

  return (
    <ProgressRoot
      {...props}
      {...theme}
      className={cx(sx(styles.root, xstyle), theme.className, className)}
      format={format}
      getAriaValueText={
        props.getAriaValueText ??
        (format
          ? undefined
          : (formattedValue) =>
              boundedValue == null
                ? i18n.t("ui:progress.indeterminate")
                : (ratioLabel ?? formattedValue ?? ""))
      }
      locale={locale}
      max={max}
      min={min}
      value={boundedValue}
    >
      {hideLabel && hideValue ? (
        <ProgressLabel
          className={sx(styles.labelHidden)}
          {...themeSlotProps("progress", "label")}
        >
          {label}
        </ProgressLabel>
      ) : (
        <div className={sx(styles.header)}>
          <ProgressLabel
            className={sx(hideLabel ? styles.labelHidden : styles.label)}
            {...themeSlotProps("progress", "label")}
          >
            {label}
          </ProgressLabel>
          {hideValue ? null : (
            <ProgressValue
              className={sx(styles.value)}
              {...themeSlotProps("progress", "value")}
            >
              {(formattedValue) =>
                // Indeterminate keeps Base UI's own text verbatim; only the
                // determinate caption was wrong.
                boundedValue == null
                  ? (formattedValue ?? i18n.t("ui:progress.syncing"))
                  : ((format ? formattedValue : ratioLabel) ??
                    i18n.t("ui:progress.syncing"))
              }
            </ProgressValue>
          )}
        </div>
      )}
      <ProgressTrack
        className={sx(styles.track, size === "sm" && styles.trackSm)}
        {...themeSlotProps("progress", "track")}
      >
        <ProgressIndicator
          className={sx(
            styles.indicator,
            value == null && styles.indeterminate,
            toneStyles[tone],
          )}
          style={value == null ? undefined : { inlineSize: `${percent}%` }}
          {...themeSlotProps("progress", "indicator")}
        />
      </ProgressTrack>
    </ProgressRoot>
  );
}

const indeterminateSlide = stylex.keyframes({
  "0%": { transform: "translateX(-100%)" },
  "100%": { transform: "translateX(300%)" },
});

const styles = stylex.create({
  root: {
    display: "grid",
    gap: vars["--ads-space-8"],
    inlineSize: "100%",
  },
  header: {
    // Baseline, not center: same label/value pair as `Meter`, same two type
    // sizes, so the two components must align it the same way. Centering two
    // different font sizes leaves their baselines fractionally apart.
    alignItems: "baseline",
    display: "flex",
    justifyContent: "space-between",
  },
  label: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  // Same clip as `Meter`'s hidden label: pinned to the containing block's
  // start corner so it never extends the page's scrollable overflow.
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
    color: vars["--ads-color-text-muted"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
  },
  track: {
    // An overlay, not a surface: see `Meter`'s track.
    backgroundColor: vars["--ads-color-track"],
    borderRadius: vars["--ads-radius-full"],
    blockSize: 8,
    overflow: "hidden",
  },
  trackSm: {
    blockSize: 6,
  },
  indicator: {
    // Fill comes from the tone row below (`default` is the accent bar), so the
    // base style owns geometry and motion only.
    blockSize: "100%",
    borderRadius: vars["--ads-radius-full"],
    // `inline-size` is outside every `recipes/transition` property key, so the
    // triplet stays local — but it must still carry the reduced-motion escape
    // the recipe would have provided (a growing bar IS motion). It was missing.
    transitionDuration: {
      default: vars["--ads-motion-duration-normal"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "inline-size",
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
    // Forced colors would repaint the fill as Canvas and empty the track.
    forcedColorAdjust: "none",
  },
  indeterminate: {
    // Real indeterminate motion (was a static full bar). Partial bar slides; no
    // inline width is set on the indicator in this state.
    //
    // Work-in-progress cadence (same family step as every other indeterminate
    // sweep in ADS) rather than the ad-hoc 1.4s this used to carry.
    animationDuration: vars["--ads-motion-duration-loop"],
    animationIterationCount: "infinite",
    animationName: {
      default: indeterminateSlide,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationTimingFunction: vars["--ads-motion-ease-standard"],
    // No `backgroundColor` here: it used to restate `colorAccent`, which meant
    // an indeterminate bar silently ignored `tone`. The fill belongs to
    // `indicator` + the tone row, and this style now owns only the motion.
    inlineSize: "40%",
  },
  /*
   * Tone rows. `Meter`, `ProgressCircle`, `Gauge` and `SegmentedProgress` all
   * carried a semantic fill and this one did not, so a bar could not say what
   * its four siblings could. The bar IS the whole surface here, so §1.2's
   * "semantic color on a small element" caveat does not apply — a progress
   * fill is the element whose value carries the state.
   */
  default: {
    backgroundColor: vars["--ads-color-accent"],
  },
  info: {
    backgroundColor: vars["--ads-color-info"],
  },
  success: {
    backgroundColor: vars["--ads-color-success"],
  },
  warning: {
    backgroundColor: vars["--ads-color-warning"],
  },
  danger: {
    backgroundColor: vars["--ads-color-danger"],
  },
  neutral: {
    backgroundColor: vars["--ads-color-text-muted"],
  },
});

const toneStyles = {
  danger: styles.danger,
  default: styles.default,
  info: styles.info,
  neutral: styles.neutral,
  success: styles.success,
  warning: styles.warning,
} as const;
