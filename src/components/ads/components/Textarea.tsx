import type { StyleXValue } from "../utils/stylex";
import * as stylex from "@stylexjs/stylex";
import { forwardRef } from "react";
import type * as React from "react";

import type { TextareaRootProps } from "../headless/textarea";
import { controlChrome } from "../recipes/control-chrome";
import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import { FieldCountRow, useMirroredFieldValue } from "./TextField.count";
import {
  fieldAnatomy,
  FieldLabelRow,
  FieldMessages,
  type FieldTone,
  useFieldAnatomy,
} from "./field-anatomy";

export type TextareaSize = "sm" | "md" | "lg";

export type TextareaProps = Omit<TextareaRootProps, "className" | "ref"> & {
  /**
   * Grow the box with its content, from the size ramp's minimum rows up to
   * `maxRows`, then scroll. Off by default, so a plain Textarea keeps its
   * fixed row count and its `resize: vertical` grip untouched.
   */
  autoResize?: boolean;
  className?: string;
  /** Host composition resolved before class names are emitted. */
  xstyle?: StyleXValue;
  /** Render only the textarea control, for composition inside an existing field. */
  controlOnly?: boolean;
  description?: string;
  /**
   * Error message. Sets `aria-invalid`, renders a `role="alert"` message
   * wired via `aria-describedby`, and forces the danger tone — same
   * contract as Select/NativeSelect (shared Field/FieldError anatomy).
   */
  error?: React.ReactNode;
  label?: string;
  /**
   * Ceiling for `autoResize`, in text rows. Past it the box stops growing and
   * scrolls, so a pasted essay cannot push the submit button off-screen.
   * Ignored while `autoResize` is off. @default 8
   */
  maxRows?: number;
  /**
   * Who paints the keyboard ring.
   *
   * `"self"` (default) keeps `focusRing.ring` on the control — the shape every
   * standalone field uses. `"wrapper"` drops it, for the one composition where
   * a ring on the control is wrong: a bordered surface whose entire body IS
   * this textarea. There the control's box is flush with the surface's inner
   * edge, so a ring that paints `outline-offset + outline-width` OUTSIDE that
   * box lands outside the surface itself — measured on Canvas's annotation
   * card, 4px past the left edge and 2px past the right of a 240px card.
   *
   * This is the same split ADS already makes internally: `InputGroup` and
   * `NumberField` wrap their own `<input>` and set `outlineStyle: "none"` on it
   * because the group owns the ring. `"wrapper"` is that arrangement made
   * available to callers who own the border themselves.
   *
   * Passing it takes on the other half of the contract: the wrapper MUST wear
   * `focusRing.ringWithin` (and recolor its border on `:focus-within`), or the
   * field ends up with no keyboard focus indicator at all.
   */
  ringOwner?: "self" | "wrapper";
  /**
   * Trailing `n/maxLength` counter on the message row. Ignored when the field
   * has no `maxLength`: a count with no limit is a fact about nothing.
   */
  showCount?: boolean;
  /**
   * Size ramp shared with TextField/Button: scales type, padding, and the
   * minimum visible row count (sm 3 rows / md 4 rows / lg 5 rows).
   * A Textarea has no single-line control height, so `size` never resolves
   * through `controlHeightBySize`.
   */
  size?: TextareaSize;
  /**
   * Optional confirmation message shown next to the success check glyph while
   * `tone="success"`. Omit it and the glyph still renders (with a visually
   * hidden "Valid") — see the WCAG 1.4.1 note in `field-anatomy.tsx`.
   */
  successMessage?: React.ReactNode;
  tone?: FieldTone;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      autoResize = false,
      className,
      xstyle,
      controlOnly = false,
      description,
      disabled,
      error,
      id,
      label,
      maxLength,
      maxRows = 8,
      onChange,
      readOnly,
      ringOwner = "self",
      rows,
      showCount = false,
      size = "md",
      style,
      successMessage,
      tone = "default",
      ...props
    },
    ref,
  ) {
    const anatomy = useFieldAnatomy({ description, error, id, tone });
    // A count with no limit is a fact about nothing, so the counter resolves
    // to the limit itself: present ⇒ count, absent ⇒ no row.
    const countLimit = showCount ? maxLength : undefined;
    const tracking = autoResize || countLimit != null;
    const { length, track, value } = useMirroredFieldValue({
      defaultValue: props.defaultValue,
      enabled: tracking,
      value: props.value,
    });
    /*
     * The auto-grow ceiling, written in the same terms as the `minBlockSize`
     * floor below: N text rows plus the box's own padding and hairlines. It
     * has to be computed here rather than declared in `stylex.create` because
     * `maxRows` is a runtime number, so the cap is resolved from JS.
     */
    const maxBlockSize = autoResize
      ? `calc(${maxRows} * ${vars.lineHeightNormal} * 1em + 2 * ${paddingBySize[size]} + 2 * ${vars.borderWidthHairline})`
      : undefined;

    const control = (
      <textarea
        {...props}
        ref={ref}
        aria-describedby={[props["aria-describedby"], anatomy.describedBy].filter(Boolean).join(" ") || undefined}
        aria-invalid={anatomy.invalid || props["aria-invalid"]}
        className={cx(
          sx(
            styles.input,
            transition.colors,
            // Dropping `focusRing.ring` is not enough to stop painting: the
            // recipe's `outlineStyle: "none"` default is also what suppresses
            // the UA's own `outline: auto 1px` on a focused textarea. Measured
            // on Canvas's annotation card — omitting the recipe traded the
            // 2px ADS ring for a 1px browser one. So the wrapper case states
            // `none` outright, exactly as `InputGroup`/`NumberField` do on the
            // `<input>` they wrap.
            ringOwner === "self" ? focusRing.borderOnly : styles.ringDelegated,
            sizeStyles[size],
            autoResize && styles.inputAutoResize,
            toneStyles[anatomy.tone],
            xstyle,
            // One state per element (design-direction §2).
            readOnly && !disabled && controlChrome.readOnlyField,
            disabled && controlChrome.disabledField,
          ),
          className,
        )}
        disabled={disabled}
        id={anatomy.fieldId}
        maxLength={maxLength}
        // The sizer's and the counter's only source of truth for an
        // uncontrolled field. The caller's handler is passed through UNWRAPPED
        // when neither is on, so a controlled textarea with no `onChange`
        // still gets React's warning rather than a handler this file supplied.
        onChange={
          tracking
            ? (event) => {
                track(event.currentTarget.value);
                onChange?.(event);
              }
            : onChange
        }
        readOnly={readOnly}
        // `rows` would otherwise contribute the UA's 2-row intrinsic height to
        // the shared grid cell and stop the box shrinking back to one line.
        // The visible floor still comes from the size ramp's `minBlockSize`.
        rows={autoResize ? (rows ?? 1) : rows}
        style={autoResize ? { maxBlockSize, ...style } : style}
      />
    );

    /*
     * Auto-grow with no measurement: an invisible sizer replicates the value
     * in the SAME grid cell as the textarea, so the cell's height is the
     * text's natural height and the control simply fills it. The technique is
     * This avoids a `scrollHeight`/ResizeObserver loop and the layout-thrash
     * frame it buys on every keystroke. The sizer wears the control's own size
     * ramp (type step, padding, minimum rows) plus a transparent hairline,
     * because this box has a border and a gutter to reproduce.
     */
    const sizedControl = autoResize ? (
      <div className={sx(styles.autoResize)}>
        <span
          aria-hidden
          className={sx(styles.sizer, sizeStyles[size])}
          style={{ maxBlockSize }}
        >
          {value}{" "}
        </span>
        {control}
      </div>
    ) : (
      control
    );

    // Composition escape hatch: the caller already owns a label/description
    // wrapper, so emit the bare control (no field grid, no label, no messages).
    if (controlOnly) return sizedControl;

    const messages = (
      <FieldMessages
        anatomy={anatomy}
        description={description}
        error={error}
        successMessage={successMessage}
      />
    );

    // A `<div>` grid with a SIBLING label, never a `<label>` wrapping the whole
    // anatomy — see `FieldLabelRow`'s comment in `field-anatomy.tsx` for the
    // accessible-name reason. `required` is read off the control's own prop
    // (which still reaches the textarea through the spread above).
    return (
      <div className={sx(fieldAnatomy.field)}>
        {label ? (
          <FieldLabelRow
            disabled={disabled}
            htmlFor={anatomy.fieldId}
            required={props.required}
          >
            {label}
          </FieldLabelRow>
        ) : null}
        {sizedControl}
        {countLimit != null ? (
          <FieldCountRow length={length} maxLength={countLimit}>
            {messages}
          </FieldCountRow>
        ) : (
          messages
        )}
      </div>
    );
  },
);

/**
 * Minimum height = N text rows + the box's own padding and hairlines, instead
 * of a magic pixel value (it used to be a bare `112`, which matched no row
 * count at any type size and stopped scaling the moment padding or font size
 * changed). `1em` resolves against the textarea's own `font-size`, so the
 * `lg` ramp's larger type widens the rows automatically. `box-sizing:
 * border-box` (reset layer) means `min-block-size` covers padding + border.
 */
const styles = stylex.create({
  /**
   * `ringOwner="wrapper"` — the wrapper wears `focusRing.ringWithin`, so this
   * control draws neither the ADS ring nor the UA's default one.
   */
  ringDelegated: {
    outlineStyle: "none",
  },
  input: {
    appearance: "none",
    backgroundColor: vars.colorSurfaceRaised,
    // Focus contract: border on `:focus-within` (see the header of
    // `TextField.tsx` for the family-wide statement).
    borderColor: {
      default: vars.colorBorder,
      ":hover": vars.colorBorderStrong,
      ":focus-within": vars.colorBorderFocus,
    },
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorText,
    fontFamily: vars.fontSans,
    inlineSize: "100%",
    lineHeight: vars.lineHeightNormal,
    resize: "vertical",
    "::placeholder": {
      color: vars.colorTextPlaceholder,
    },
  },
  // The auto-grown control stacks on the sizer and takes the cell's full
  // height. `resize` goes away with it: a manual drag writes an inline height
  // that the sizer would then silently fight.
  inputAutoResize: {
    blockSize: "100%",
    gridArea: "1 / 1 / 2 / 2",
    overflowY: "auto",
    resize: "none",
  },
  // Sizer + control share one grid cell; the sizer's natural height drives the
  // row, the control fills it.
  autoResize: {
    display: "grid",
    inlineSize: "100%",
    minInlineSize: 0,
  },
  // Everything that affects where text wraps and how tall the box gets is
  // reproduced here; everything visible is not. The transparent hairline
  // stands in for the control's border so both boxes measure the same.
  sizer: {
    borderColor: "transparent",
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: "transparent",
    fontFamily: vars.fontSans,
    gridArea: "1 / 1 / 2 / 2",
    inlineSize: "100%",
    lineHeight: vars.lineHeightNormal,
    overflow: "hidden",
    overflowWrap: "anywhere",
    pointerEvents: "none",
    userSelect: "none",
    visibility: "hidden",
    whiteSpace: "pre-wrap",
  },
  // Size ramp mirrors Button/TextField on the inline axis (space2/3/4) and
  // steps `lg` up to `fontSizeMd`.
  sm: {
    fontSize: vars.fontSizeBody,
    minBlockSize: `calc(3 * ${vars.lineHeightNormal} * 1em + 2 * ${vars.space8} + 2 * ${vars.borderWidthHairline})`,
    paddingBlock: vars.space8,
    paddingInline: vars.space8,
  },
  md: {
    fontSize: vars.fontSizeBody,
    minBlockSize: `calc(4 * ${vars.lineHeightNormal} * 1em + 2 * ${vars.space12} + 2 * ${vars.borderWidthHairline})`,
    paddingBlock: vars.space12,
    paddingInline: vars.space12,
  },
  lg: {
    fontSize: vars.fontSizeLead,
    minBlockSize: `calc(5 * ${vars.lineHeightNormal} * 1em + 2 * ${vars.space16} + 2 * ${vars.borderWidthHairline})`,
    paddingBlock: vars.space16,
    paddingInline: vars.space16,
  },
  success: {
    borderColor: vars.colorSuccessBorder,
  },
  danger: {
    borderColor: vars.colorDangerBorder,
  },
});

const sizeStyles = {
  lg: styles.lg,
  md: styles.md,
  sm: styles.sm,
} as const;

// The block gutter each size step declares above, restated so the auto-grow
// ceiling can be written in the same terms as the floor.
const paddingBySize = {
  lg: vars.space16,
  md: vars.space12,
  sm: vars.space8,
} as const;

const toneStyles = {
  danger: styles.danger,
  default: null,
  success: styles.success,
} as const;
