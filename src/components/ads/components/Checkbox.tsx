import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import {
  CheckboxIndicator,
  CheckboxRoot,
  type CheckboxRootProps,
} from "../headless/checkbox";
import { controlHeights } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { touchTarget } from "../recipes/touch-target";
import { transition } from "../recipes/transition";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { FieldMessages, fieldAnatomy, useFieldAnatomy } from "./field-anatomy";

// Hover and pressed washes for this file's OPAQUE resting fills. A translucent
// overlay cannot be painted onto one without dropping the fill itself, so the
// same operand is applied the other way, at the same 6/12 weights. sRGB, not
// oklab: an oklab mix is nearly invisible over a near-black fill.
const raisedWashHover = `color-mix(in srgb, ${vars["--ads-color-surface-raised"]}, ${vars["--ads-color-mix-ink"]} 6%)`;
const raisedWashPressed = `color-mix(in srgb, ${vars["--ads-color-surface-raised"]}, ${vars["--ads-color-mix-ink"]} 12%)`;

export type CheckboxProps = Omit<CheckboxRootProps, "className"> & {
  className?: string;
  /** Render only the checkbox control, for composition inside an existing label. */
  controlOnly?: boolean;
  /** Helper copy under the label row, wired into `aria-describedby`. */
  description?: React.ReactNode;
  /**
   * Validation message. Sets `aria-invalid`, renders a `role="alert"` row wired
   * via `aria-describedby`, and moves the unchecked box to the danger border —
   * the one invalid channel the whole field family shares. There is no boolean
   * `invalid` to fall out of sync with it (see `field-anatomy.tsx`).
   */
  error?: React.ReactNode;
  label?: React.ReactNode;
} & XstyleProp;

export function Checkbox({
  className,
  controlOnly = false,
  description,
  error,
  indeterminate,
  label,
  xstyle,
  ...props
}: CheckboxProps) {
  /*
   * Resolved unconditionally — hooks cannot be conditional and this is pure id
   * arithmetic. Note what it is *not* used for: the control never takes the
   * anatomy's `fieldId`. This checkbox is wrapped by its own `<label>`, so
   * nothing needs an id to point at, and minting one would put an attribute on
   * an element that DataTable headers and dense rows do not have today. Only
   * the message ids are read off it.
   */
  const anatomy = useFieldAnatomy({ description, error, id: props.id });
  const hasMessages = Boolean(description || error);

  const control = (
    <CheckboxRoot
      {...props}
      /*
       * `controlOnly` paints no message stack, so the ids `describedBy` names
       * would not exist in the document — a dangling `aria-describedby` is read
       * as nothing at all, which is worse than the attribute being absent.
       * `aria-invalid` is kept either way: it is a property of the control, not
       * of the row of copy the caller chose not to let this component render.
       */
      aria-describedby={controlOnly ? undefined : anatomy.describedBy}
      aria-invalid={anatomy.invalid}
      indeterminate={indeterminate}
      className={(state) =>
        cx(
          sx(
            styles.root,
            transition.control,
            touchTarget.coarse,
            focusRing.ring,
            (state.checked || state.indeterminate) && styles.checked,
            anatomy.invalid &&
              !(state.checked || state.indeterminate) &&
              styles.invalid,
            state.disabled && styles.disabled,
            // `xstyle` follows `className`'s routing exactly. In `controlOnly`
            // mode the control IS the outer box the host sees, so host layout
            // styles have to land here; otherwise the label row below is that
            // box and takes them. Applying it to both would paint the same
            // override twice on two nested boxes.
            controlOnly ? xstyle : null,
          ),
          // In `controlOnly` mode there is no label wrapper to take the
          // caller's class, so the control is what it must land on.
          controlOnly ? className : undefined,
        )
      }
    >
      {/*
       * The indicator mounts on check, so it pops in and the mark draws on —
       * both on the CSS motion layer, deliberately.
       *
       * This used to be a Motion `m.span` (`initial={{opacity: 0, scale: .4}}`)
       * wrapping an `m.path` (`initial={{pathLength: 0}}`), which made the tick
       * *exist* only as the end state of a JS animation. Motion applies
       * `initial` during render but runs `animate` only once a feature bundle is
       * loaded, so any consumer without `AtelierMotionProvider` painted a filled
       * accent square with no mark at all — indistinguishable from a decorative
       * block, and a straight violation of the motion ADR §5 ("components must
       * remain correct without the provider; the provider only adds the
       * animation"). CSS keyframes invert that: the *rest* state is the drawn
       * mark, the animation only replays the reveal, and reduced motion drops
       * the duration to 0ms and lands on the same drawn mark.
       */}
      <CheckboxIndicator className={sx(styles.indicator)}>
        <svg aria-hidden fill="none" height={14} viewBox="0 0 24 24" width={14}>
          {/*
           * "Some but not all" is a dash, not a check. Base UI already
           * reported `aria-checked="mixed"`, but the visual fell through to
           * the checkmark path on an *unfilled* box — so a partially
           * selected DataTable header read as a near-invisible white tick
           * on white. The dash shares the check's stroke weight, cap, and
           * draw-on animation, so the two states are obviously the same
           * control in two moods.
           *
           * `key` forces a remount when the shape changes, which restarts the
           * draw: without it the new geometry would swap in mid-dash.
           */}
          <path
            className={sx(styles.mark)}
            d={indeterminate ? "M6 12h12" : "M5 13l4 4L19 7"}
            key={indeterminate ? "mixed" : "checked"}
            pathLength="1"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
          />
        </svg>
      </CheckboxIndicator>
    </CheckboxRoot>
  );

  /*
   * Composition escape hatch: the caller already owns the label row, so emit
   * the bare control (no label wrapper, no label text). `description` and
   * `error` are dropped with it, deliberately — the message stack belongs to
   * whatever anatomy the caller is composing into, and painting a second copy
   * here would read the same sentence twice through `aria-describedby`. The
   * control still carries `aria-invalid` and the danger border — see the
   * `aria-describedby` note above.
   */
  if (controlOnly) return control;

  const row = (
    <label
      className={cx(
        sx(
          styles.label,
          controlHeights.md,
          props.disabled && styles.labelDisabled,
          xstyle,
        ),
        className,
      )}
    >
      {control}
      {label ? (
        <span className={sx(styles.labelText)}>
          {label}
          {/*
           * Derived, never declared: the asterisk reads the control's own
           * `required`, so it cannot claim a requirement the form does not
           * enforce. `aria-hidden` because the hidden input already reports
           * the requirement, and "star" after every label name is noise.
           */}
          {props.required ? (
            <span aria-hidden className={sx(styles.required)}>
              *
            </span>
          ) : null}
        </span>
      ) : null}
    </label>
  );

  /*
   * Nothing to say ⇒ no wrapper, byte for byte the row this component has
   * always rendered. It ships inline in DataTable header cells and dense list
   * rows, where an unconditional field grid would blockify the label and take
   * the full row width; the anatomy only materializes when there is a message
   * to hang off it.
   */
  if (!hasMessages) return row;

  return (
    <div className={sx(fieldAnatomy.field, styles.stack)}>
      {row}
      <div className={sx(styles.messages)}>
        <FieldMessages
          anatomy={anatomy}
          description={description}
          error={error}
        />
      </div>
    </div>
  );
}

/** Indicator pop-in. The element's own (unanimated) state is fully visible. */
const markPop = stylex.keyframes({
  from: { opacity: 0, transform: "scale(0.4)" },
  to: { opacity: 1, transform: "scale(1)" },
});

/**
 * Stroke draw-on. `pathLength="1"` normalizes the path, so one dash of length
 * `1` covers it whatever the geometry (check or dash) — the offset animates from
 * fully hidden (`1`) to the resting, fully drawn `0`.
 */
const markDraw = stylex.keyframes({
  from: { strokeDashoffset: "1" },
  to: { strokeDashoffset: "0" },
});

const styles = stylex.create({
  label: {
    alignItems: "center",
    color: vars["--ads-color-text"],
    cursor: "pointer",
    display: "inline-flex",
    gap: vars["--ads-space-8"],
  },
  labelText: {
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  labelDisabled: {
    cursor: "not-allowed",
  },
  /*
   * Same ink as the marker in `field-anatomy.tsx`, declared locally because the
   * inline label keeps its own regular-weight typography and cannot borrow
   * `FieldLabelRow` wholesale. The margin restates the `space1` that `FieldLabelRow`
   * gets for free from its flex row.
   */
  required: {
    color: vars["--ads-color-danger-text"],
    marginInlineStart: vars["--ads-space-4"],
  },
  /*
   * The row keeps its intrinsic width. A grid blockifies its `inline-flex` to
   * `flex`, which would otherwise stretch the label — and therefore the click
   * target — across the whole field the moment a description appeared.
   */
  stack: {
    justifyItems: "start",
  },
  /*
   * Messages line up under the label text rather than under the box: the 20px
   * box plus the row's `space2` gap is the indent, so the description reads as
   * a continuation of the label instead of a caption of the control. `space1`
   * keeps description and error tighter to each other than to the row above.
   */
  messages: {
    display: "grid",
    gap: vars["--ads-space-4"],
    paddingInlineStart: `calc(20px + ${vars["--ads-space-8"]})`,
  },
  /*
   * Resting/hover/press language. It is deliberately NOT
   * `controlChrome.trigger`: that recipe is for *bordered secondary-weight*
   * controls and would pull the box down to `colorBorder` and repaint its ink
   * `colorText`, both of which this control needs to own (a toggle's outline is
   * held to `colorBorderStrong`, and its ink is the accent-on-fill
   * `colorAccentText`). What is borrowed is the state *matrix* — surface washes
   * to `colorCanvasSubtle`, outline strengthens — so an unchecked checkbox
   * reacts under the pointer exactly like the trigger next to it. It shipped
   * with `transition.control` composed and no `:hover`/`:active` step at all,
   * i.e. it paid for a color transition nothing could ever trigger.
   */
  root: {
    alignItems: "center",
    backgroundColor: {
      default: vars["--ads-color-surface-raised"],
      ":hover": raisedWashHover,
      ":active": raisedWashPressed,
    },
    borderColor: {
      default: vars["--ads-color-border-strong"],
      ":hover": vars["--ads-color-border-focus"],
      ":active": vars["--ads-color-border-focus"],
    },
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-accent-text"],
    display: "inline-flex",
    flexShrink: 0,
    // 20px painted box, unchanged. The WCAG 2.5.8 touch minimum is served by
    // `touchTarget.coarse` (an out-of-flow 44px pseudo-element) rather than by
    // inflating the box: the tick mark is drawn to this size, and the label row
    // already owns the 44px line under `(pointer: coarse)`.
    inlineSize: 20,
    justifyContent: "center",
    minBlockSize: 20,
  },
  // Checked/indeterminate rides the same `colorAccent` → `colorAccentHover`
  // pair `Button variant="primary"` uses, so a filled checkbox and a primary
  // button darken by the same step. The border follows the fill; leaving it on
  // the resting accent would paint a rim of the wrong shade around the hovered
  // box (the reason `Button`'s `danger` moves both).
  checked: {
    backgroundColor: {
      default: vars["--ads-color-accent"],
      ":hover": vars["--ads-color-accent-hover"],
      ":active": `color-mix(in srgb, ${vars["--ads-color-accent-hover"]}, ${vars["--ads-color-mix-ink"]} 12%)`,
    },
    borderColor: {
      default: vars["--ads-color-accent"],
      ":hover": vars["--ads-color-accent-hover"],
      ":active": `color-mix(in srgb, ${vars["--ads-color-accent-hover"]}, ${vars["--ads-color-mix-ink"]} 12%)`,
    },
  },
  /*
   * Invalid *and* unchecked. A checked-but-invalid box keeps its accent fill:
   * the mark is the answer the user actually gave, and repainting it red says
   * "this tick is wrong" rather than "this field is" — the message under the
   * row is what carries the error. Hover and press move with the resting color
   * for the same reason `checked` moves its border with its fill: left on
   * `colorBorderFocus` they would wash the error away under the pointer.
   */
  invalid: {
    borderColor: {
      default: vars["--ads-color-danger-border"],
      ":hover": vars["--ads-color-danger-hover"],
      ":active": vars["--ads-color-danger-hover"],
    },
  },
  disabled: {
    cursor: "not-allowed",
    opacity: vars["--ads-opacity-disabled"],
  },
  indicator: {
    alignItems: "center",
    animationDuration: {
      default: vars["--ads-motion-duration-fast"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    animationName: markPop,
    animationTimingFunction: vars["--ads-motion-ease-expressive"],
    display: "inline-flex",
    justifyContent: "center",
  },
  mark: {
    animationDuration: {
      default: vars["--ads-motion-duration-quick"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    animationName: markDraw,
    animationTimingFunction: vars["--ads-motion-ease-standard"],
    strokeDasharray: "1",
    strokeDashoffset: "0",
  },
});
