import * as stylex from "@stylexjs/stylex";
import { m } from "motion/react";
import type * as React from "react";

import {
  SliderControl,
  SliderIndicator,
  SliderLabel,
  SliderRoot,
  SliderThumb,
  SliderTrack,
  SliderValue,
  type SliderRootProps,
} from "../headless/slider";
import { controlHeights } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { springSnappy, vars } from "../tokens/tokens.stylex";
import { sx } from "../utils/stylex";
// No `fieldAnatomy.field` here: `Slider.Root` is already the field grid (label
// row, control, messages), so wrapping it in a second one would only add a box.
import { FieldMessages, useFieldAnatomy } from "./field-anatomy";

export type SliderProps = Omit<SliderRootProps, "className"> & {
  ariaLabel?: string;
  density?: "compact" | "regular";
  /** Helper copy under the control, wired into `aria-describedby`. */
  description?: React.ReactNode;
  /**
   * Validation message. Sets `aria-invalid`, renders a `role="alert"` row wired
   * into `aria-describedby`, and moves the filled indicator to the danger ramp
   * — the single invalid channel from `field-anatomy.tsx`.
   */
  error?: React.ReactNode;
  /**
   * Render the value row yourself, one call per thumb.
   *
   * There is no `format` prop declared here on purpose: `format`
   * (`Intl.NumberFormatOptions`) is already Base UI's own `Slider.Root` prop
   * and reaches it through the spread below, so re-declaring it would be a
   * second name for a thing that works. `Slider.Value` has no `format` of its
   * own — it takes a children-as-function — so this is the escape hatch for
   * the formatting `Intl` cannot express: "Free", "12 seats", a unit the locale
   * does not carry.
   */
  formatValue?: (value: number) => string;
  label?: string;
};

export function Slider({
  ariaLabel,
  density = "regular",
  description,
  error,
  formatValue,
  label,
  ...props
}: SliderProps) {
  const anatomy = useFieldAnatomy({ description, error, id: props.id });
  /*
   * Range support. Base UI's root has always accepted an array value and one
   * `Slider.Thumb` per entry, but this component hardcoded exactly one thumb —
   * so `value={[20, 80]}` rendered a range slider with a single draggable
   * handle and the second value was simply unreachable. The count is read off
   * whichever value prop the caller supplied (controlled first, as Base UI
   * does), and floored at one so an empty array cannot render a slider with no
   * handle at all.
   */
  const values = props.value ?? props.defaultValue;
  const thumbCount = Array.isArray(values) ? Math.max(values.length, 1) : 1;
  const hasMessages = Boolean(description || error);

  return (
    <SliderRoot
      {...props}
      /*
       * The root already renders `role="group"`, so a description hung here is
       * announced on entry. It is deliberately not repeated onto each thumb's
       * input: on a range slider that would read the same sentence once per
       * handle.
       */
      aria-describedby={anatomy.describedBy}
      aria-invalid={anatomy.invalid}
      className={sx(styles.root, props.disabled && styles.disabled)}
    >
      {label ? (
        <div className={sx(styles.header)}>
          <SliderLabel className={sx(styles.label)}>{label}</SliderLabel>
          <SliderValue className={sx(styles.value)}>
            {/*
             * Base UI joins a range with " – " when it formats the values
             * itself; matching that separator keeps a caller-formatted range
             * reading like an unformatted one.
             */}
            {formatValue
              ? (_formatted, sliderValues) =>
                  sliderValues.map((value) => formatValue(value)).join(" – ")
              : undefined}
          </SliderValue>
        </div>
      ) : null}
      <SliderControl
        className={sx(
          styles.control,
          density === "compact" ? controlHeights.sm : controlHeights.md,
        )}
      >
        <SliderTrack className={sx(styles.track)}>
          <SliderIndicator
            className={sx(
              styles.indicator,
              anatomy.invalid && styles.indicatorInvalid,
            )}
          />
          {/*
           * Base UI centers the thumb via the CSS `translate` property, so a
           * Motion `scale` (which sets `transform`) is conflict-free: Motion
           * owns the bounded hover/press feedback, Base UI keeps positioning it.
           * Reduced motion / no provider → no scale (still fully functional).
           */}
          {Array.from({ length: thumbCount }, (_entry, index) => (
            <SliderThumb
              aria-label={thumbAriaLabel(
                ariaLabel ?? label ?? "Value",
                index,
                thumbCount,
              )}
              className={(state) =>
                sx(
                  styles.thumb,
                  focusRing.ring,
                  anatomy.invalid && styles.thumbInvalid,
                  state.disabled && styles.thumbDisabled,
                )
              }
              /*
               * Base UI needs the explicit index to server-render a multi-thumb
               * range. A lone thumb infers its own, and passing one would put an
               * attribute on the ordinary slider that it does not carry today —
               * the single-thumb path stays exactly what it was.
               */
              index={thumbCount > 1 ? index : undefined}
              key={index}
              render={
                <m.div
                  transition={springSnappy}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.96 }}
                />
              }
            />
          ))}
        </SliderTrack>
      </SliderControl>
      {/*
       * Gated, not always-on: the root is a grid with a `space3` gap, so an
       * empty message row would still cost 12px of dead space under every
       * slider that has nothing to say.
       */}
      {hasMessages ? (
        <div className={sx(styles.messages)}>
          <FieldMessages
            anatomy={anatomy}
            description={description}
            error={error}
          />
        </div>
      ) : null}
    </SliderRoot>
  );
}

/*
 * A range slider's thumbs are separate `<input type="range">` elements, so they
 * need separate names — "Price" twice is one ambiguous control repeated, as far
 * as a screen reader is concerned. Two thumbs is the overwhelmingly common case
 * and they have real names; past that there is no natural language for the
 * middle handles, so they are numbered.
 */
function thumbAriaLabel(base: string, index: number, count: number): string {
  if (count < 2) return base;
  if (count === 2) return `${base} ${index === 0 ? "minimum" : "maximum"}`;
  return `${base} ${index + 1}`;
}

const styles = stylex.create({
  root: {
    display: "grid",
    gap: vars.space12,
    inlineSize: "100%",
  },
  disabled: {
    opacity: vars.opacityDisabled,
  },
  header: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
  },
  label: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  value: {
    color: vars.colorTextMuted,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
  },
  control: {
    alignItems: "center",
    display: "flex",
  },
  track: {
    backgroundColor: vars.colorBorder,
    borderRadius: vars.radiusFull,
    blockSize: 6,
    inlineSize: "100%",
  },
  indicator: {
    backgroundColor: vars.colorAccent,
    borderRadius: vars.radiusFull,
  },
  // The filled part of the track is the answer, so it is what moves to the
  // danger ramp. The thumb rim moves with it (below): it sits at the end of the
  // indicator, and an accent ring capping a danger bar reads as a rendering
  // bug rather than as a state.
  indicatorInvalid: {
    backgroundColor: vars.colorDanger,
  },
  // `space1`, not the root's `space3`: description and error belong tighter to
  // each other than the whole stack does to the control above it.
  messages: {
    display: "grid",
    gap: vars.space4,
  },
  thumb: {
    // The thumb is the hit target, and it had no pointer feedback at all — the
    // cursor changed and nothing else. It is an opaque object on a track, so it
    // takes the 6%/12% wash mixed into its own fill, like every other opaque
    // pressable.
    backgroundColor: {
      default: vars.colorSurfaceRaised,
      ":hover": `color-mix(in srgb, ${vars.colorSurfaceRaised}, ${vars.colorMixInk} 6%)`,
      ":active": `color-mix(in srgb, ${vars.colorSurfaceRaised}, ${vars.colorMixInk} 12%)`,
    },
    borderColor: vars.colorAccent,
    borderRadius: vars.radiusFull,
    borderStyle: "solid",
    borderWidth: vars.ringWidthSm,
    boxShadow: vars.elevationRaised,
    cursor: {
      default: "grab",
      ":active": "grabbing",
    },
    inlineSize: 20,
    minBlockSize: 20,
  },
  thumbInvalid: {
    borderColor: vars.colorDangerBorder,
  },
  thumbDisabled: {
    cursor: "not-allowed",
  },
});

export { styles as sliderStyles };
