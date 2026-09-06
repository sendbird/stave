import * as stylex from "@stylexjs/stylex";
import { CheckCircle2 } from "lucide-react";
import { useId } from "react";
import type * as React from "react";

import { vars } from "../tokens/tokens.stylex";
import { sx } from "../utils/stylex";
import { VisuallyHidden } from "./VisuallyHidden";

/**
 * ## The one field anatomy (canonical statement)
 *
 * Every control that can carry a label, a description, and a validation
 * message renders that stack from here. It exists because the family had grown
 * two anatomies and then disagreed about which states each one could express:
 *
 *  - `TextField`, `Textarea`, `NumberField` and `OTPField` each emitted their
 *    own `<label className={styles.label}>` with a local copy of the same three
 *    style rules, while `Label` — the component that already implements the
 *    required marker and the description line — was consumed by `NativeSelect`
 *    alone. A required marker was therefore unreachable from most of the field
 *    family, and a fix to label typography had to be made five times.
 *  - The selection controls (`Checkbox`, `CheckboxGroup`, `RadioGroup`,
 *    `Switch`, `Slider`) had no validation channel at all: no `error`, no
 *    `aria-invalid`, no message row. A required "accept the terms" checkbox or
 *    an unanswered radio group could not say so, in a system where every text
 *    input could. That is the gap this module closes; it is not cosmetic.
 *
 * The contract, in full:
 *
 * 1. **One message stack, one order** — description, then error, then the
 *    success row. All three are wired into a single `aria-describedby`, so a
 *    screen reader receives them in the order they are painted.
 * 2. **`error` is the invalid channel.** Presence of an error message sets
 *    `aria-invalid` and forces `tone="danger"`; there is no separate boolean to
 *    fall out of sync with the message. A control that is invalid without
 *    anything to say is a control whose author has not finished the copy.
 * 3. **The error row is `role="alert"`.** It is announced when it appears,
 *    because it appears in response to the user's own input.
 * 4. **The required marker is derived, never declared.** It reads the control's
 *    own `required`, so the asterisk cannot claim a requirement the form does
 *    not enforce. (`Label` still accepts a visual-only `required` for callers
 *    composing their own control; the field components do not use it.)
 * 5. **Success is never colour alone** (WCAG 1.4.1). The check glyph is
 *    unconditional for `tone="success"` and a visually hidden "Valid" carries
 *    the meaning when the caller supplies no message.
 *
 * Group-shaped controls (`CheckboxGroup`, `RadioGroup`) cannot use a
 * `<label for>` — there is no single control to point at — so they take
 * `FieldGroupLabelRow`, which emits an id-bearing `<span>` for `aria-labelledby`.
 * The rendered result is identical; only the association mechanism differs.
 */

export type FieldTone = "default" | "success" | "danger";

export type FieldAnatomyInput = {
  description?: React.ReactNode;
  error?: React.ReactNode;
  /** Caller-supplied DOM id. Omit it and one is generated. */
  id?: string;
  tone?: FieldTone;
};

export type FieldAnatomy = {
  /** `aria-describedby` value, or `undefined` when there is nothing to describe. */
  describedBy: string | undefined;
  descriptionId: string | undefined;
  errorId: string | undefined;
  /** The control's DOM id — `htmlFor` target and `aria-labelledby` anchor. */
  fieldId: string;
  /** `aria-invalid` value: `true` while an error message is present. */
  invalid: true | undefined;
  labelId: string;
  /** `error` wins over the caller's `tone` — see rule 2. */
  tone: FieldTone;
  successId: string | undefined;
};

/**
 * Resolve the ids, the described-by string, and the effective tone for one
 * field. Call it once per control and pass the result to `FieldMessages`.
 */
export function useFieldAnatomy({
  description,
  error,
  id,
  tone = "default",
}: FieldAnatomyInput): FieldAnatomy {
  // Don't fall back to `name`: two controls sharing a name (radios, repeated
  // form rows) would collide on the same DOM id.
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const resolvedTone: FieldTone = error ? "danger" : tone;
  const descriptionId = description ? `${fieldId}-description` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const successId =
    resolvedTone === "success" ? `${fieldId}-success` : undefined;
  const describedBy = [descriptionId, errorId, successId]
    .filter(Boolean)
    .join(" ");

  return {
    describedBy: describedBy || undefined,
    descriptionId,
    errorId,
    fieldId,
    invalid: error ? true : undefined,
    labelId: `${fieldId}-label`,
    successId,
    tone: resolvedTone,
  };
}

export type FieldLabelRowProps = {
  children: React.ReactNode;
  /** Cosmetic only — the control owns the real disabled state. */
  disabled?: boolean;
  htmlFor: string;
  id?: string;
  /** Derived from the control's own `required`; never a standalone claim. */
  required?: boolean;
};

/**
 * The `<label for>` half of the anatomy, for a control with one focusable
 * element. Named `…Row`, not `FieldLabel`, on purpose: the ADS-first guard
 * derives the shared-primitive namespace from every exported `[A-Z]` symbol in
 * this package, and `apps/canvas` already owns a domain-specific `FieldLabel`
 * for its 10px props-panel rows. Taking the bare name here would have turned a
 * legitimate app-local component into a guard violation for a part that is not
 * even public — `Label` is the public label component.
 */
export function FieldLabelRow({
  children,
  disabled = false,
  htmlFor,
  id,
  required = false,
}: FieldLabelRowProps) {
  return (
    /*
     * A sibling `<label htmlFor>`, never a `<label>` wrapping the whole
     * anatomy: a `<label>`'s ENTIRE subtree computes the control's accessible
     * name, so wrapping the description and the error once named an input
     * "Email We'll never share this Enter a valid email address" — the same
     * strings `aria-describedby` then announced a second time — and broke voice
     * control (WCAG 2.5.3 Label in Name).
     */
    <label
      aria-disabled={disabled || undefined}
      className={sx(styles.label, disabled && styles.labelDisabled)}
      htmlFor={htmlFor}
      id={id}
    >
      {children}
      {required ? <RequiredMarker /> : null}
    </label>
  );
}

export type FieldGroupLabelRowProps = {
  children: React.ReactNode;
  disabled?: boolean;
  id: string;
  required?: boolean;
};

/**
 * The group half of the anatomy. A fieldset-shaped control has no single
 * element to point `htmlFor` at, so it emits an id and the group references it
 * with `aria-labelledby`.
 */
export function FieldGroupLabelRow({
  children,
  disabled = false,
  id,
  required = false,
}: FieldGroupLabelRowProps) {
  return (
    <span
      aria-disabled={disabled || undefined}
      className={sx(styles.label, disabled && styles.labelDisabled)}
      id={id}
    >
      {children}
      {required ? <RequiredMarker /> : null}
    </span>
  );
}

/**
 * The asterisk is `aria-hidden` on purpose: the control's own `required`
 * attribute is what assistive technology reports, and announcing "star" after
 * every label name is noise. Colour is not the signal either — the glyph is.
 */
function RequiredMarker() {
  return (
    <span aria-hidden className={sx(styles.required)}>
      *
    </span>
  );
}

export type FieldMessagesProps = {
  anatomy: FieldAnatomy;
  description?: React.ReactNode;
  error?: React.ReactNode;
  successMessage?: React.ReactNode;
};

/**
 * Description → error → success, in painting order, each carrying the id
 * `useFieldAnatomy` already wired into `aria-describedby`.
 */
export function FieldMessages({
  anatomy,
  description,
  error,
  successMessage,
}: FieldMessagesProps) {
  return (
    <>
      {description ? (
        <span className={sx(styles.description)} id={anatomy.descriptionId}>
          {description}
        </span>
      ) : null}
      {error ? (
        <span className={sx(styles.error)} id={anatomy.errorId} role="alert">
          {error}
        </span>
      ) : null}
      {anatomy.tone === "success" ? (
        <span className={sx(styles.successMessage)} id={anatomy.successId}>
          <CheckCircle2
            aria-hidden
            className={sx(styles.successIcon)}
            size={14}
          />
          {successMessage ?? <VisuallyHidden>Valid</VisuallyHidden>}
        </span>
      ) : null}
    </>
  );
}

export const fieldAnatomy = stylex.create({
  /** The wrapper grid every field shares: label, control, messages. */
  field: {
    alignContent: "start",
    display: "grid",
    gap: vars.space8,
    inlineSize: "100%",
    minInlineSize: 0,
  },
});

const styles = stylex.create({
  // §5 weight roles: a field label is a label, not a title — medium.
  label: {
    alignItems: "center",
    color: vars.colorText,
    display: "inline-flex",
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    gap: vars.space4,
    lineHeight: vars.lineHeightNormal,
    minInlineSize: 0,
  },
  labelDisabled: {
    cursor: "not-allowed",
    opacity: vars.opacityDisabled,
  },
  required: {
    color: vars.colorDangerText,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
  },
  // Ragged-right prose under a full-width control: `pretty` keeps the last
  // line from collapsing to a single orphaned word.
  description: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    textWrap: "pretty",
  },
  error: {
    // The border's red, not the quieter `colorDangerText`. A field states one
    // error in one colour: the control's boundary and the line under it match.
    // `colorDangerText` stays where it must — badge and callout ink ON a danger
    // tint, where this value measures 3.99:1 against a 4.5 floor. On the form
    // surface it is 4.86:1.
    color: vars.colorDanger,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    textWrap: "pretty",
  },
  successMessage: {
    alignItems: "center",
    color: vars.colorSuccessText,
    display: "flex",
    fontSize: vars.fontSizeCaption,
    gap: vars.space4,
    lineHeight: vars.lineHeightNormal,
    textWrap: "pretty",
  },
  successIcon: {
    flexShrink: 0,
  },
});
