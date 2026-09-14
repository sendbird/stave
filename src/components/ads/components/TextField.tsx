import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { InputRoot, type InputRootProps } from "../headless/input";
import { controlChrome } from "../recipes/control-chrome";
import { controlHeightBySize } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { vars } from "../tokens/tokens.stylex";
import { themeProps } from "../theming/theme-props";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { FieldCountRow, useMirroredFieldValue } from "./TextField.count";
import {
  fieldAnatomy,
  FieldLabelRow,
  FieldMessages,
  type FieldTone,
  useFieldAnatomy,
} from "./field-anatomy";
import { Loader } from "./Loader";

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
  /**
   * An async check on the value is in flight (uniqueness, availability, a
   * server-side format rule). Sets `aria-busy` and shows a small spinner in
   * the trailing slot; the input stays editable.
   *
   * Pass a boolean for the field's whole lifetime — `loading={isChecking}`,
   * not `loading={isChecking || undefined}`. The trailing slot exists only
   * while the prop is a boolean, so a field that never validates keeps its
   * bare `<input>` and a field that does keeps one DOM shape across the
   * toggle (no remount, no lost caret).
   */
  loading?: boolean;
  /** Status text announced while `loading`. @default "Validating" */
  loadingLabel?: string;
  /** Control height: xs 28px / sm 32px / md 36px (default) / lg 40px. */
  size?: TextFieldSize;
  /**
   * Optional confirmation message shown next to the success check glyph while
   * `tone="success"`. Omit it and the glyph still renders (with a visually
   * hidden "Valid") — see the WCAG 1.4.1 note in `field-anatomy.tsx`.
   */
  successMessage?: React.ReactNode;
  tone?: FieldTone;
} & XstyleProp;

export function TextField({
  className,
  controlOnly = false,
  description,
  disabled,
  error,
  id,
  label,
  loading,
  loadingLabel = "Validating",
  maxLength,
  onChange,
  readOnly,
  showCount = false,
  size = "md",
  successMessage,
  tone = "default",
  xstyle,
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

  // The trailing slot is opt-in by shape, not by state: a field that never
  // validates renders the bare input it always did, and one that does keeps
  // the wrapper across every `loading` toggle. See the prop's doc.
  const hasLoadingSlot = loading !== undefined;
  // `anatomy.tone` and not `tone`: `error` forces `danger`, and the attribute a
  // brand selects on has to agree with the border it is painting over.
  const theme = themeProps("text-field", { size, tone: anatomy.tone });

  const input = (
    <InputRoot
      {...props}
      {...theme}
      aria-busy={loading || undefined}
      // Host adaptation: merge the caller's ARIA rather than replacing it,
      // so a product wrapper that already describes or invalidates this
      // control keeps its wiring alongside the field anatomy's.
      aria-describedby={
        [props["aria-describedby"], anatomy.describedBy]
          .filter(Boolean)
          .join(" ") || undefined
      }
      aria-invalid={anatomy.invalid || props["aria-invalid"]}
      className={cx(
        sx(
          styles.input,
          transition.colors,
          focusRing.borderOnly,
          controlHeightBySize[size],
          sizeStyles[size],
          hasLoadingSlot && styles.inputWithLoadingSlot,
          toneStyles[anatomy.tone],
          // One state per element (design-direction §2): the input owns the
          // border, so it owns the disabled/read-only treatment too.
          readOnly && !disabled && controlChrome.readOnlyField,
          disabled && controlChrome.disabledField,
          xstyle,
        ),
        theme.className,
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

  const control = hasLoadingSlot ? (
    <span className={sx(styles.loadingSlot)}>
      {input}
      {loading ? (
        <Loader
          className={sx(styles.loadingMark)}
          label={loadingLabel}
          size="xs"
          tone="neutral"
        />
      ) : null}
    </span>
  ) : (
    input
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
    backgroundColor: vars["--ads-color-surface-raised"],
    // Focus contract: border on `:focus-within` (see the file header).
    borderColor: {
      default: vars["--ads-color-border"],
      // The pointer strengthens the boundary; it does not wash the fill —
      // hovering a field must not imply a press. Before `:focus-within` so
      // focus wins when both match.
      ":hover": vars["--ads-color-border-strong"],
      ":focus-within": vars["--ads-color-border-focus"],
    },
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text"],
    fontFamily: vars["--ads-font-sans"],
    inlineSize: "100%",
    lineHeight: vars["--ads-line-height-normal"],
    minInlineSize: 0,
    paddingBlock: 0,
    "::placeholder": {
      color: vars["--ads-color-text-placeholder"],
    },
  },
  // Size ramp mirrors Button (xs/sm `space2` / md `space3` / lg `space4` +
  // `fontSizeMd`) so a field and a button in one row read as one scale.
  // Heights always come from `controlHeightBySize`; these entries only carry
  // the inline gutter and type step.
  xs: {
    fontSize: vars["--ads-font-size-caption"],
    paddingInline: vars["--ads-space-8"],
  },
  sm: {
    fontSize: vars["--ads-font-size-body"],
    paddingInline: vars["--ads-space-8"],
  },
  md: {
    fontSize: vars["--ads-font-size-body"],
    paddingInline: vars["--ads-space-12"],
  },
  lg: {
    fontSize: vars["--ads-font-size-lead"],
    paddingInline: vars["--ads-space-16"],
  },
  // The slot is a grid so the input keeps the field's full width and the mark
  // floats over its trailing gutter without adding a second bordered box.
  loadingSlot: {
    display: "grid",
    minInlineSize: 0,
    position: "relative",
  },
  // Reserve the mark's lane while the slot exists, so the caret never sits
  // under the spinner and the text does not jump when it appears.
  inputWithLoadingSlot: {
    paddingInlineEnd: vars["--ads-space-32"],
  },
  loadingMark: {
    alignItems: "center",
    display: "inline-flex",
    insetBlock: 0,
    insetInlineEnd: vars["--ads-space-8"],
    pointerEvents: "none",
    position: "absolute",
  },
  success: {
    borderColor: vars["--ads-color-success-border"],
  },
  danger: {
    borderColor: vars["--ads-color-danger-border"],
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
