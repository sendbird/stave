import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import type * as React from "react";

import { vars } from "../tokens/tokens.stylex";
import { sx } from "../utils/stylex";

/**
 * ## The character counter, and the value mirror it needs
 *
 * Shared by `TextField` and `Textarea` — the two controls in the family that
 * accept `maxLength` — so the counter cannot say `12/80` in one and `80 - 12`
 * in the other. It lives beside `TextField` because that file is the canonical
 * member of the text-entry family (its header carries the family's focus
 * contract); `Textarea` imports it rather than growing a second copy.
 *
 * `Textarea` also reads `useMirroredFieldValue` for its auto-grow sizer, which
 * needs the same thing the counter does: the current value, without touching
 * the DOM.
 */

/** The value shapes a native `<input>`/`<textarea>` accepts. */
export type FieldValueLike = string | number | readonly string[] | undefined;

function toValueString(value: FieldValueLike): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.join(",");
  return "";
}

export type MirroredFieldValue = {
  /**
   * Code-unit length, because that is what `maxLength` counts (HTML's
   * "code-unit length"). Counting code points instead would let the counter
   * read `9/10` on a value the browser has already stopped accepting.
   */
  length: number;
  /** Feed the control's next value in from its own `onChange`. */
  track: (next: string) => void;
  /** The current value as a string — the auto-grow sizer's content. */
  value: string;
};

/**
 * The current value, without measuring anything.
 *
 * A controlled field already re-renders on every keystroke, so its `value` is
 * the whole story and nothing is mirrored. An uncontrolled one does not, so
 * the value is mirrored into state — but only while `enabled`, because a
 * plain field with no counter and no auto-grow must not pay a render per
 * keypress for a number nobody reads.
 *
 * The mirror follows the control's `onChange`, so a value written straight to
 * the DOM node (`ref.current.value = ...`) is invisible to it, exactly as it
 * is invisible to React. Reset an uncontrolled field through `key` or go
 * controlled.
 */
export function useMirroredFieldValue({
  defaultValue,
  enabled,
  value,
}: {
  defaultValue?: FieldValueLike;
  enabled: boolean;
  value?: FieldValueLike;
}): MirroredFieldValue {
  const [mirrored, setMirrored] = useState(() => toValueString(defaultValue));
  const controlled = value !== undefined;
  const current = controlled ? toValueString(value) : mirrored;

  return {
    length: current.length,
    track: (next: string) => {
      if (!enabled || controlled) return;
      setMirrored(next);
    },
    value: current,
  };
}

export type FieldCountRowProps = {
  /** The `FieldMessages` stack this counter shares its row with. */
  children: React.ReactNode;
  length: number;
  maxLength: number;
};

/**
 * The message row, when a counter is on it: the description/error/success
 * stack keeps the leading edge and its own `gap`, and the count is pinned to
 * the trailing edge on the first line.
 *
 * The count is `aria-hidden`. The control's own `maxLength` attribute is what
 * assistive technology reports for this field — screen readers announce the
 * limit from the element, not from the text next to it — so announcing a live
 * "63/80" on every keystroke would add a second, noisier channel for a fact
 * already carried by the control. It stays a visual affordance, and the limit
 * itself stays enforceable and announceable via `maxLength`.
 *
 * It has no danger state either: `maxLength` hard-stops typing at the limit,
 * so "over the limit" is a state this counter can never be in.
 */
export function FieldCountRow({
  children,
  length,
  maxLength,
}: FieldCountRowProps) {
  return (
    <div className={sx(styles.row)}>
      <div className={sx(styles.stack)}>{children}</div>
      <span aria-hidden className={sx(styles.count)}>
        {length}/{maxLength}
      </span>
    </div>
  );
}

const styles = stylex.create({
  row: {
    alignItems: "start",
    display: "flex",
    gap: vars.space8,
    justifyContent: "space-between",
    minInlineSize: 0,
  },
  // Re-states the field grid's own `gap` so description → error → success keep
  // the spacing they have when no counter shares their row.
  stack: {
    display: "grid",
    gap: vars.space8,
    minInlineSize: 0,
  },
  // Muted label type, matching the description it sits beside. `tabular-nums`
  // so the row does not twitch as the count crosses a digit width.
  count: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    fontSize: vars.fontSizeCaption,
    fontVariantNumeric: "tabular-nums",
    lineHeight: vars.lineHeightNormal,
    whiteSpace: "nowrap",
  },
});
