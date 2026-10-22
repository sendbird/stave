import * as stylex from "@stylexjs/stylex";
import { useId, useState } from "react";
import type * as React from "react";

import { focusRing } from "../recipes/focus-ring";
import { themeSlotProps, themeTargetClassName } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";

export type VersionCompareMode = "side-by-side" | "slider" | "onion" | "diff";

/**
 * How hard `diff` pulls a difference up before it becomes coverage. A 4%
 * colour change — the smallest thing worth catching in a UI frame — has to
 * survive to a visible alpha; above 20 the larger changes lose their shape to
 * saturation instead of gaining anything.
 */
const DIFF_GAIN = 12;

/**
 * The change tint, and the one hardcoded colour in this file.
 *
 * It is magenta for the reason every visual-regression tool picks magenta: it
 * is the hue product UI does not use, so a mark in it cannot be mistaken for
 * part of the design underneath. That makes it a signal rather than a theme
 * value — a host that remapped it to its brand would be painting the alarm in
 * the colour of the thing it is alarming about. Written as 0–1 channels
 * because `feColorMatrix` takes numbers, not tokens.
 */
const DIFF_TINT = { b: 0.62, g: 0, r: 1 } as const;

/**
 * Extra gain applied to the alpha channel alone, after the tint.
 *
 * `DIFF_GAIN` lifts the difference into visible LUMINANCE; this lifts that
 * luminance into visible COVERAGE. A 4% change arrives at roughly 0.19 alpha,
 * which is a stain rather than a mark; 3 brings it to full without pushing a
 * region that barely moved into the same weight as one that was replaced.
 */
const DIFF_ALPHA_GAIN = 3;

/** The component's own words, in the host's language (host modification: no English defaults). */
export type VersionCompareCopy = {
  /** Accessible name of the mode switch. */
  mode: string;
  modes: Record<VersionCompareMode, string>;
  /** Label of the slider's range. */
  revealCurrent: string;
  /** Label of the onion-skin opacity range. */
  overlayCurrent: string;
};

export type VersionCompareProps = Omit<
  React.ComponentProps<"div">,
  "children"
> & {
  /** Intrinsic aspect ratio of the compare stage, e.g. 16 / 9. */
  aspectRatio?: number;
  baseline: React.ReactNode;
  baselineLabel: React.ReactNode;
  copy: VersionCompareCopy;
  current: React.ReactNode;
  currentLabel: React.ReactNode;
  defaultMode?: VersionCompareMode;
  mode?: VersionCompareMode;
  onModeChange?: (mode: VersionCompareMode) => void;
} & XstyleProp;

const modeOptions: VersionCompareMode[] = ["side-by-side", "slider", "onion", "diff"];

/**
 * Compare two versions of an artifact: side-by-side, a swipe
 * slider, an onion-skin opacity blend, or a difference overlay. `baseline` and
 * `current` are arbitrary nodes (images, frames, charts).
 */
export function VersionCompare({
  aspectRatio = 16 / 9,
  baseline,
  baselineLabel,
  className,
  copy,
  current,
  currentLabel,
  defaultMode = "slider",
  mode: modeProp,
  onModeChange,
  xstyle,
  ...props
}: VersionCompareProps) {
  const [internalMode, setInternalMode] = useState(defaultMode);
  const mode = modeProp ?? internalMode;
  const [value, setValue] = useState(50);
  // While the pointer drags the range, the reveal must track it 1:1 — the
  // position transition applies only to keyboard/programmatic moves.
  const [dragging, setDragging] = useState(false);

  const setMode = (next: VersionCompareMode) => {
    if (modeProp === undefined) setInternalMode(next);
    onModeChange?.(next);
  };

  const ratio = String(aspectRatio);
  const showRange = mode === "slider" || mode === "onion";
  /*
   * The amplifier that makes `diff` mean what it says.
   *
   * `mix-blend-mode: difference` alone computes |baseline − current|, which is
   * correct and, on the light UI artifacts this component exists to compare,
   * invisible: white against white is 0, and white against a `#f5f5f5` card
   * lands at 1/255 — the same black as "these are identical". The mode promises
   * the opposite of that ("what is identical goes dark, what changed lights
   * up"), and half of it was not being delivered.
   *
   * A linear component transfer multiplies every channel of the already-
   * composited difference. Zero stays zero, so identical regions stay exactly
   * black; everything else is pulled up to where an eye can find it without
   * being told where to look. Measured at this slope: identical 0, a 4% colour
   * change 48, a button swap 253, moved text 255.
   *
   * `sRGB` interpolation is load-bearing — the filter default is linearRGB,
   * which re-curves the very small values this is trying to rescue.
   */
  const filterId = `${useId()}-diff-amplify`;

  return (
    <div
      {...props}
      className={cx(
        sx(styles.root, xstyle),
        themeTargetClassName("version-compare"),
        className,
      )}
    >
      <div
        aria-label={copy.mode}
        className={sx(styles.toolbar)}
        role="group"
      >
        {modeOptions.map((option) => (
          <button
            aria-pressed={mode === option}
            className={cx(
              sx(
                styles.modeButton,
                mode === option && styles.modeButtonActive,
              ),
              themeTargetClassName("version-compare-mode"),
            )}
            key={option}
            onClick={() => setMode(option)}
            type="button"
          >
            {copy.modes[option]}
          </button>
        ))}
      </div>

      {mode === "side-by-side" ? (
        <div className={sx(styles.sideBySide)}>
          {[
            { label: baselineLabel, node: baseline },
            { label: currentLabel, node: current },
          ].map((pane, index) => (
            <figure className={sx(styles.pane)} key={index}>
              <div
                className={sx(styles.paneBody)}
                style={{ aspectRatio: ratio }}
              >
                {pane.node}
              </div>
              <figcaption
                {...themeSlotProps("version-compare", "label")}
                className={sx(styles.caption)}
              >
                {pane.label}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className={sx(styles.stage)} style={{ aspectRatio: ratio }}>
          {mode === "diff" ? (
            <svg aria-hidden className={sx(styles.filterDef)} focusable="false">
              <filter colorInterpolationFilters="sRGB" id={filterId}>
                {/* 1. Pull the difference up out of the noise floor. */}
                <feComponentTransfer>
                  <feFuncR slope={DIFF_GAIN} type="linear" />
                  <feFuncG slope={DIFF_GAIN} type="linear" />
                  <feFuncB slope={DIFF_GAIN} type="linear" />
                </feComponentTransfer>
                {/*
                 * 2. Throw the colour away and keep the magnitude: every
                 * channel becomes the flat tint, and the difference's own
                 * luminance becomes the ALPHA. Identical regions are luminance
                 * 0, so they come out fully transparent and the version
                 * underneath survives untouched — which is the whole point of
                 * the arrangement. The difference's hue is not information a
                 * reviewer can use; where and how much is.
                 */}
                <feColorMatrix
                  type="matrix"
                  values={[
                    `0 0 0 0 ${DIFF_TINT.r}`,
                    `0 0 0 0 ${DIFF_TINT.g}`,
                    `0 0 0 0 ${DIFF_TINT.b}`,
                    `${0.2126 * DIFF_ALPHA_GAIN} ${0.7152 * DIFF_ALPHA_GAIN} ${0.0722 * DIFF_ALPHA_GAIN} 0 0`,
                  ].join(" ")}
                />
              </filter>
            </svg>
          ) : null}
          {/*
           * The two artifacts, and ONLY the two artifacts.
           *
           * The gain has to reach the difference and nothing else. With the
           * filter on the stage it also reached the version tags in the
           * corners, which are chrome rather than content: they blew to pure
           * white and became the brightest thing on a surface whose whole job
           * is to say which parts are bright. The tags are siblings of this
           * wrapper, so they keep their own colours in every mode.
           */}
          <div className={sx(styles.layers)}>
            {mode === "diff" ? (
              <>
                {/*
                 * The current version, readable. A raw |baseline − current| is
                 * a photo-retouching idiom: correct, and for two versions of
                 * one screen it is 94% black, because that is how much of the
                 * screen did not change. The reviewer learns THAT something
                 * moved and loses what it now looks like — which is the thing
                 * they opened the compare for.
                 */}
                <div className={sx(styles.layer)}>{current}</div>
                {/*
                 * The change signal, laid over it: inside, the difference,
                 * amplified; outside, transparency wherever the two versions
                 * agree, so every pixel they share keeps the design and only
                 * the ones that moved light up.
                 */}
                <div
                  className={sx(styles.layer, styles.signal)}
                  style={{ filter: `url(#${filterId})` }}
                >
                  <div className={sx(styles.layer)}>{baseline}</div>
                  <div className={sx(styles.layer, styles.layerDiff)}>
                    {current}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className={sx(styles.layer)}>{baseline}</div>
                <div
                  className={sx(
                    styles.layer,
                    mode === "slider" && !dragging && styles.layerClipAnimated,
                  )}
                  style={
                    mode === "slider"
                      ? { clipPath: `inset(0 ${100 - value}% 0 0)` }
                      : mode === "onion"
                        ? { opacity: value / 100 }
                        : undefined
                  }
                >
                  {current}
                </div>
              </>
            )}
          </div>
          {mode === "slider" ? (
            <div
              aria-hidden
              className={sx(
                styles.sliderLine,
                !dragging && styles.sliderLineAnimated,
              )}
              style={{ insetInlineStart: `${value}%` }}
            />
          ) : null}
          <span
            {...themeSlotProps("version-compare", "label")}
            className={sx(styles.tag, styles.tagStart)}
          >
            {baselineLabel}
          </span>
          <span
            {...themeSlotProps("version-compare", "label")}
            className={sx(styles.tag, styles.tagEnd)}
          >
            {currentLabel}
          </span>
        </div>
      )}

      {showRange ? (
        <label className={sx(styles.rangeRow)}>
          <span className={sx(styles.rangeLabel)}>
            {mode === "slider" ? copy.revealCurrent : copy.overlayCurrent}
          </span>
          <input
            className={sx(styles.range, focusRing.ring)}
            max={100}
            min={0}
            onChange={(event) => setValue(Number(event.currentTarget.value))}
            onPointerCancel={() => setDragging(false)}
            onPointerDown={() => setDragging(true)}
            onPointerUp={() => setDragging(false)}
            type="range"
            value={value}
          />
        </label>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  root: {
    display: "grid",
    gap: vars["--ads-space-12"],
    inlineSize: "100%",
    minInlineSize: 0,
  },
  toolbar: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars["--ads-space-4"],
  },
  modeButton: {
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
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    cursor: "pointer",
    fontFamily: vars["--ads-font-sans"],
    fontSize: vars["--ads-font-size-caption"],
    minBlockSize: vars["--ads-control-height-sm"],
    paddingBlock: 0,
    paddingInline: vars["--ads-space-8"],
  },
  modeButtonActive: {
    backgroundColor: vars["--ads-color-selection-fill"],
    borderColor: "transparent",
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  sideBySide: {
    display: "grid",
    gap: vars["--ads-space-12"],
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    minInlineSize: 0,
  },
  pane: {
    display: "grid",
    gap: vars["--ads-space-8"],
    margin: 0,
    minInlineSize: 0,
  },
  paneBody: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    inlineSize: "100%",
    overflow: "hidden",
  },
  caption: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-tight"],
  },
  stage: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    inlineSize: "100%",
    overflow: "hidden",
    position: "relative",
  },
  layer: {
    blockSize: "100%",
    inlineSize: "100%",
    inset: 0,
    position: "absolute",
  },
  layerDiff: {
    mixBlendMode: "difference",
  },
  /** The artifact pair's own box, so the gain can be scoped to it. */
  layers: {
    inset: 0,
    position: "absolute",
  },
  /**
   * The signal group: a difference computed against black, turned into a
   * tint-with-alpha, and laid over the current version.
   *
   * `backgroundColor: black` is what the inner difference composites onto — a
   * transparent group would blend with whatever is behind it, which is a third
   * colour in a two-colour operation. It is a filter operand, not a surface,
   * which is why it is a literal rather than a token.
   *
   * It composites normally, NOT with `screen`. Screening was the first attempt
   * and it is exactly wrong on the light artifacts this compares: the gain
   * makes a change bright, screening bright over white is white, and the marks
   * disappeared into the page they were meant to mark — measured 98.6% of the
   * frame above 200 luminance. The filter produces transparency for "identical"
   * instead, so plain alpha does the job the blend could not.
   */
  signal: {
    backgroundColor: "black",
    isolation: "isolate",
  },
  /** The filter lives in the flow but paints nothing. */
  filterDef: {
    blockSize: 0,
    inlineSize: 0,
    position: "absolute",
  },
  // CSS motion layer, keyboard/programmatic slider moves only (pointer drags
  // drop these classes so the reveal tracks 1:1). The clip layer and the
  // handle line share one duration/easing, so they move in lockstep — each
  // element transitions its own property (clip-path vs inset), never both.
  layerClipAnimated: {
    transitionDuration: {
      default: vars["--ads-motion-duration-quick"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "clip-path",
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },
  sliderLine: {
    backgroundColor: vars["--ads-color-accent"],
    blockSize: "100%",
    inlineSize: 2,
    insetBlockStart: 0,
    pointerEvents: "none",
    position: "absolute",
    // Static centering only — the line's position animates via inset, so
    // nothing else ever animates transform on this element.
    transform: "translateX(-50%)",
  },
  sliderLineAnimated: {
    transitionDuration: {
      default: vars["--ads-motion-duration-quick"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "inset-inline-start",
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },
  tag: {
    backgroundColor: vars["--ads-color-surface-raised"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    insetBlockStart: vars["--ads-space-8"],
    paddingBlock: 0,
    paddingInline: vars["--ads-space-8"],
    position: "absolute",
  },
  tagStart: {
    insetInlineStart: vars["--ads-space-8"],
  },
  tagEnd: {
    insetInlineEnd: vars["--ads-space-8"],
  },
  rangeRow: {
    alignItems: "center",
    display: "grid",
    gap: vars["--ads-space-8"],
    gridTemplateColumns: "auto minmax(0, 1fr)",
    minInlineSize: 0,
  },
  rangeLabel: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  range: {
    accentColor: vars["--ads-color-accent"],
    inlineSize: "100%",
    minInlineSize: 0,
  },
});
