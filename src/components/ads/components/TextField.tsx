import type { StyleXValue } from "../utils/stylex";
import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { InputRoot, type InputRootProps } from "../headless/input";
import { controlChrome } from "../recipes/control-chrome";
import { controlHeightBySize } from "../recipes/control-metrics";
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

/**
 * ## Focus contract for the text-entry family (canonical statement)
 *
 * Applies to TextField, Textarea, Field, InputGroup, NumberField,
 * NativeSelect, SearchField, OTPField, and DatePicker. It used to be split
 * three ways — `:focus` here, `:focus-visible` on Select, `:focus-within` on
 * InputGroup — so a mouse click recolored some fields and not others.
 *
 * 1. **Border color** changes on `:focus-within`, declared on whichever
 *    element owns the border: the bare control itself (TextField, Textarea,
 *    Field, NativeSelect, DatePicker, OTP cell) or the bordered wrapper
 *    (InputGroup, NumberField group). `:focus-within` matches the element
 *    itself as well as any descendant, so one pseudo-class covers both shapes,
 *    and it fires for pointer focus as well as keyboard focus.
 * 2. **No ring on a field.** The family composes `focusRing.borderOnly`, which
 *    suppresses the UA outline and restores a real one under forced colors, and
 *    paints nothing itself. `focusRing.ring` cannot do this job here:
 *    Chromium matches `:focus-visible` on a plain CLICK for text inputs, so the
 *    ring fired on every tap. Measured across the family before this changed:
 *    eight of nine fields rang on click. `focusRing.ring` is still right on the
 *    buttons INSIDE a field — a clear ✕, a stepper, an action — which are
 *    button-shaped and do not match `:focus-visible` on click.
 *
 * Net result: click and Tab do the same single thing — the border recolors —
 * identically in every component of the family. Two indicators for one state
 * read as a validation highlight rather than a caret landing, and the pair was
 * not even consistent: by the `:focus-visible` heuristic a text input matches
 * on a mouse click while a button-shaped trigger does not.
 *
 * ## Label, description, and messages
 *
 * The whole stack around the control comes from `field-anatomy.tsx` — ids,
 * `aria-describedby`, the effective tone, the `<label htmlFor>`, and the
 * description/error/success rows. This file used to own a private copy of all
 * of it, which is how the family ended up with two label anatomies and no
 * reachable required marker. Read that module's header for the contract.
 */

export type TextFieldSize = "xs" | "sm" | "md" | "lg";

export type TextFieldProps = Omit<InputRootProps, "className" | "size"> & {
  className?: string;
  /** Host composition resolved before class names are emitted. */
  xstyle?: StyleXValue;
  /** Render only the input control, for composition inside an existing field label. */
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
   * Trailing `n/maxLength` counter on the message row. Ignored when the field
   * has no `maxLength`: a count with no limit is a fact about nothing.
   */
  showCount?: boolean;
  /** Control height: xs 28px / sm 32px / md 36px (default) / lg 40px. */
  size?: TextFieldSize;
  /**
   * Optional confirmation message shown next to the success check glyph while
   * `tone="success"`. Omit it and the glyph still renders (with a visually
   * hidden "Valid") — see the WCAG 1.4.1 note in `field-anatomy.tsx`.
   */
  successMessage?: React.ReactNode;
  tone?: FieldTone;
};

export function TextField({
  className,
  xstyle,
  controlOnly = false,
  description,
  disabled,
  error,
  id,
  label,
  maxLength,
  onChange,
  readOnly,
  showCount = false,
  size = "md",
  successMessage,
  tone = "default",
  ...props
}: TextFieldProps) {
  const anatomy = useFieldAnatomy({ description, error, id, tone });
  // A count with no limit is a fact about nothing, so the counter resolves to
  // the limit itself: present ⇒ count, absent ⇒ no row and no value mirror.
  const countLimit = showCount ? maxLength : undefined;
  const { length, track } = useMirroredFieldValue({
    defaultValue: props.defaultValue,
    enabled: countLimit != null,
    value: props.value,
  });

  const control = (
    <InputRoot
      {...props}
      aria-describedby={[props["aria-describedby"], anatomy.describedBy].filter(Boolean).join(" ") || undefined}
      aria-invalid={anatomy.invalid || props["aria-invalid"]}
      className={cx(
        sx(
          styles.input,
          transition.colors,
          focusRing.borderOnly,
          controlHeightBySize[size],
          sizeStyles[size],
          toneStyles[anatomy.tone],
          xstyle,
          // One state per element (design-direction §2): the input owns the
          // border, so it owns the disabled/read-only treatment too.
          readOnly && !disabled && controlChrome.readOnlyField,
          disabled && controlChrome.disabledField,
        ),
        className,
      )}
      disabled={disabled}
      id={anatomy.fieldId}
      maxLength={maxLength}
      // The counter's only source of truth for an uncontrolled field. The
      // caller's handler is passed through UNWRAPPED when nothing is counting,
      // so a controlled field with no `onChange` still gets React's warning
      // instead of a silent no-op handler this file supplied for it.
      onChange={
        countLimit == null
          ? onChange
          : (event) => {
              track(event.currentTarget.value);
              onChange?.(event);
            }
      }
      readOnly={readOnly}
    />
  );

  // Composition escape hatch: the caller already owns a label/description
  // wrapper, so emit the bare control (no field grid, no label, no messages).
  if (controlOnly) return control;

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
  // (which still reaches the input through the spread above), so the asterisk
  // cannot claim a requirement the form does not enforce.
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
      {control}
      {countLimit != null ? (
        <FieldCountRow length={length} maxLength={countLimit}>
          {messages}
        </FieldCountRow>
      ) : (
        messages
      )}
    </div>
  );
}

const styles = stylex.create({
  input: {
    appearance: "none",
    backgroundColor: vars.colorSurfaceRaised,
    // Focus contract: border on `:focus-within` (see the file header).
    borderColor: {
      default: vars.colorBorder,
      // The pointer strengthens the boundary; it does not wash the fill —
      // hovering a field must not imply a press. Before `:focus-within` so
      // focus wins when both match.
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
    minInlineSize: 0,
    paddingBlock: 0,
    "::placeholder": {
      color: vars.colorTextPlaceholder,
    },
  },
  // Size ramp mirrors Button (xs/sm `space2` / md `space3` / lg `space4` +
  // `fontSizeMd`) so a field and a button in one row read as one scale.
  // Heights always come from `controlHeightBySize`; these entries only carry
  // the inline gutter and type step.
  xs: {
    fontSize: vars.fontSizeCaption,
    paddingInline: vars.space8,
  },
  sm: {
    fontSize: vars.fontSizeBody,
    paddingInline: vars.space8,
  },
  md: {
    fontSize: vars.fontSizeBody,
    paddingInline: vars.space12,
  },
  lg: {
    fontSize: vars.fontSizeLead,
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
  xs: styles.xs,
} as const;

const toneStyles = {
  danger: styles.danger,
  default: null,
  success: styles.success,
} as const;
