import * as stylex from "@stylexjs/stylex";
import { m } from "motion/react";
import type * as React from "react";

import {
  SwitchRoot,
  SwitchThumb,
  type SwitchRootProps,
} from "../headless/switch";
import { controlHeights } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { touchTarget } from "../recipes/touch-target";
import { transition } from "../recipes/transition";
import { springSnappy, vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import { FieldMessages, fieldAnatomy, useFieldAnatomy } from "./field-anatomy";

export type SwitchProps = Omit<SwitchRootProps, "className"> & {
  className?: string;
  /** Track/label metric: `compact` 28×16 for dense inspector rows. */
  density?: "compact" | "regular";
  /**
   * Helper copy. In `variant="row"` it sits under the label *inside* the row —
   * that is the settings-list shape, where the sentence explaining a setting
   * belongs to the setting, not to the space below it. In `variant="inline"`
   * it drops below the row with the error.
   */
  description?: React.ReactNode;
  /**
   * Validation message. Sets `aria-invalid`, renders a `role="alert"` row wired
   * into `aria-describedby`, and tints the OFF track toward danger — the single
   * invalid channel from `field-anatomy.tsx`. Always below the row, in both
   * variants: an error is about the answer, not about the setting.
   */
  error?: React.ReactNode;
  label?: React.ReactNode;
  /**
   * `inline` (default) sits the control before its label; `row` makes the whole
   * thing a full-width row with the label first and the control on the trailing
   * edge — the settings-list shape.
   */
  variant?: "inline" | "row";
};

export function Switch({
  className,
  density = "regular",
  description,
  error,
  label,
  variant = "inline",
  ...props
}: SwitchProps) {
  /*
   * Resolved unconditionally (hooks cannot be conditional); it is pure id
   * arithmetic. The control takes no `id` from it — the wrapping `<label>`
   * already associates the two, and minting one would add an attribute every
   * inspector row currently renders without.
   */
  const anatomy = useFieldAnatomy({ description, error, id: props.id });
  /*
   * The in-row description needs a label to sit under, so a `row` with a
   * description and no label falls back to the stacked placement rather than
   * rendering an orphan line where the copy block would have been.
   */
  const rowDescription = variant === "row" && label ? description : undefined;
  const stackDescription = rowDescription ? undefined : description;
  const hasStack = Boolean(stackDescription || error);

  const row = (
    <label
      className={cx(
        sx(
          styles.label,
          labelHeightStyles[density],
          variant === "row" && styles.row,
          variant === "row" && transition.colors,
          props.disabled && styles.labelDisabled,
        ),
        className,
      )}
    >
      <SwitchRoot
        {...props}
        aria-describedby={[props["aria-describedby"], anatomy.describedBy].filter(Boolean).join(" ") || undefined}
        aria-invalid={anatomy.invalid || props["aria-invalid"]}
        className={(state) =>
          sx(
            styles.root,
            density === "compact" && styles.rootCompact,
            transition.control,
            touchTarget.coarse,
            focusRing.ring,
            state.checked && styles.checked,
            anatomy.invalid && !state.checked && styles.invalid,
            state.disabled && styles.disabled,
          )
        }
      >
        <SwitchThumb
          className={sx(
            styles.thumb,
            density === "compact" && styles.thumbCompact,
          )}
          /*
           * The travel is never written down. The track flips
           * `justify-content` from start to end (see `styles.checked`), so
           * flexbox derives the distance from the geometry that is already
           * declared — and Motion's `layout` springs the resulting delta.
           *
           * This is the Tabs-indicator pattern, and it settles three problems
           * at once: the 18px offset used to be hard-coded twice (a Motion `x`
           * and a CSS `translate`) and could silently disagree; the CSS layer
           * and Motion both declared `transform` on this element, which the
           * motion ADR forbids; and `translateX` moved the thumb rightward even
           * under `dir="rtl"`, where `flex-end` is correct by construction.
           *
           * Without an AtelierMotionProvider the `m.span` renders statically
           * and the thumb still lands in the right place — flexbox put it
           * there. It simply does not spring, which is the reduced-motion
           * fallback.
           *
           * `density="compact"` therefore needs no travel of its own: shrinking
           * the track and the thumb re-derives the shorter distance for free.
           */
          render={(thumbProps) => (
            <m.span
              // Base UI's HTML props type `onDrag`/animation handlers the React
              // DOM way; Motion redefines them. The Thumb never sets these, so
              // narrowing the spread type (runtime still passes everything) is
              // the clean way to reconcile Base UI render props with Motion.
              {...(thumbProps as Omit<
                typeof thumbProps,
                "onAnimationStart" | "onDrag" | "onDragEnd" | "onDragStart"
              >)}
              layout
              transition={springSnappy}
            />
          )}
        />
      </SwitchRoot>
      {label ? (
        rowDescription ? (
          /*
           * Two lines of copy where there was one span. The row is
           * `row-reverse` + `space-between`, so this block is simply the
           * leading flex item and the track stays on the trailing edge; the
           * label keeps its own type step and the description takes the
           * anatomy's. `minInlineSize: 0` lets it wrap instead of shoving the
           * track off the row.
           */
          <span className={sx(styles.rowCopy)}>
            <span className={sx(styles.labelText)}>{label}</span>
            <span
              className={sx(styles.rowDescription)}
              id={anatomy.descriptionId}
            >
              {rowDescription}
            </span>
          </span>
        ) : (
          <span className={sx(styles.labelText)}>{label}</span>
        )
      ) : null}
    </label>
  );

  /*
   * Nothing to say ⇒ no wrapper, byte for byte the row this component has
   * always rendered. A Switch is repeated down inspector panels and toolbars
   * where an unconditional field grid would blockify the label and take the
   * full row width; the anatomy only materializes when there is a message.
   */
  if (!hasStack) return row;

  return (
    <div
      className={sx(
        fieldAnatomy.field,
        variant === "inline" && styles.stackInline,
      )}
    >
      {row}
      <div
        className={sx(styles.messages, variant === "row" && styles.messagesRow)}
      >
        <FieldMessages
          anatomy={anatomy}
          description={stackDescription}
          error={error}
        />
      </div>
    </div>
  );
}

const styles = stylex.create({
  label: {
    alignItems: "center",
    color: vars.colorText,
    cursor: "pointer",
    display: "inline-flex",
    gap: vars.space8,
  },
  labelText: {
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
  },
  labelDisabled: {
    cursor: "not-allowed",
  },
  rowCopy: {
    display: "grid",
    gap: vars.space4,
    minInlineSize: 0,
  },
  // Same type step as the anatomy's own description, restated because this one
  // is painted inside the row rather than by `FieldMessages`.
  rowDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    textWrap: "pretty",
  },
  /*
   * The inline row keeps its intrinsic width: a grid blockifies its
   * `inline-flex` to `flex` and would stretch the label — and the click target
   * — across the whole field the moment a message appeared. `variant="row"` is
   * full-width by construction and wants none of this.
   */
  stackInline: {
    justifyItems: "start",
  },
  /*
   * Flush left, unlike Checkbox, which indents its messages under the label
   * text. A checkbox box is 20px; a switch track is `space10` (40px), so the
   * same rule would strand the sentence a third of the way across the field.
   */
  messages: {
    display: "grid",
    gap: vars.space4,
  },
  // ...except under `variant="row"`, where the row's own inline padding is what
  // the message has to line up with.
  messagesRow: {
    paddingInline: vars.space8,
  },
  /*
   * `variant="row"`: the settings-list shape. `row-reverse` puts the label
   * first and the control on the trailing edge without reordering the DOM (so
   * the label still labels the control), and `space-between` pushes them apart
   * across the full row. The hover wash is the row's own affordance — it is the
   * whole row that is clickable, not just the track.
   */
  row: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
    },
    borderRadius: vars.radiusControl,
    flexDirection: "row-reverse",
    inlineSize: "100%",
    justifyContent: "space-between",
    paddingBlock: vars.space4,
    paddingInline: vars.space8,
  },
  /*
   * Track geometry is on the 4px grid and written in grid tokens so it cannot
   * drift off it: 40 × 24 (`space40` × `space24`) with a `space4` (4px) inset,
   * which leaves a 16px (`space16`) square thumb. `padding: 3` was the one
   * off-grid value and forced an 18px thumb and an 18px travel that had to be
   * restated by hand in two places.
   *
   * The remaining 16px of free inline space IS the travel — flexbox computes
   * it, nothing declares it.
   */
  root: {
    alignItems: "center",
    // The off track had no `:hover` and no `:active` at all while composing
    // `transition.control` — a color transition nothing could trigger, on one
    // of the two most-repeated interactive primitives in the system. Off
    // darkens `colorBorderStrong` → `colorBorderFocus`, the same "the outline
    // strengthens under the pointer" step `controlChrome.field` uses; that
    // recipe itself is not composed here because a track is a *filled* shape,
    // so the step has to land on `background-color`, not `border-color`.
    backgroundColor: {
      default: vars.colorBorderStrong,
      ":hover": vars.colorBorderFocus,
      ":active": `color-mix(in srgb, ${vars.colorBorderFocus}, ${vars.colorMixInk} 12%)`,
    },
    borderRadius: vars.radiusFull,
    display: "inline-flex",
    flexShrink: 0,
    inlineSize: vars.space40,
    justifyContent: "flex-start",
    minBlockSize: vars.space24,
    padding: vars.space4,
  },
  checked: {
    // On uses the `colorAccent` → `colorAccentHover` pair, the same step
    // `Button variant="primary"` and the checked Checkbox take.
    backgroundColor: {
      default: vars.colorAccent,
      ":hover": vars.colorAccentHover,
      ":active": `color-mix(in srgb, ${vars.colorAccentHover}, ${vars.colorMixInk} 12%)`,
    },
    // The whole "animation" of the thumb, in one declaration. Direction-aware:
    // `flex-end` is the trailing edge in RTL too.
    justifyContent: "flex-end",
  },
  // Compact track: 28 × 16 with a 2px inset, which is deliberately off the 4px
  // grid — this metric exists to sit inside a dense inspector row, not in a
  // form. Only the geometry is restated; the travel stays derived.
  rootCompact: {
    inlineSize: 28,
    minBlockSize: 16,
    padding: vars.space2,
  },
  /*
   * Invalid *and* off. The track is a filled shape, so the danger signal has to
   * land on `background-color` — the same reason the resting hover step above
   * is a fill step and not a border step. The ON track is deliberately left
   * alone: a switch that is on and invalid is still on, and a red track would
   * read as "off and broken". Hover and press move with the resting color so
   * the pointer cannot wash the error back to `colorBorderFocus`.
   */
  invalid: {
    backgroundColor: {
      default: vars.colorDangerBorder,
      ":hover": vars.colorDangerHover,
      ":active": vars.colorDangerHover,
    },
  },
  disabled: {
    cursor: "not-allowed",
    opacity: vars.opacityDisabled,
  },
  thumb: {
    // No `transform` in this layer: Motion owns transform on this element
    // (`layout`), per the motion ADR's interop rule.
    backgroundColor: vars.colorSurfaceRaised,
    borderRadius: vars.radiusFull,
    boxShadow: vars.elevationRaised,
    display: "block",
    flexShrink: 0,
    inlineSize: vars.space16,
    minBlockSize: vars.space16,
  },
  thumbCompact: {
    inlineSize: 10,
    minBlockSize: 10,
  },
});

// The label row still takes a real control height so a Switch lines up with the
// other controls in its row; only the track shrinks with `density`.
const labelHeightStyles = {
  compact: controlHeights.xs,
  regular: controlHeights.md,
} as const;
