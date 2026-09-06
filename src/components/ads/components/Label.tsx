import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";

export type LabelProps = React.ComponentProps<"label"> & {
  /** Helper text under the label text. */
  description?: React.ReactNode;
  /** Dims the label to mirror a disabled control (the control owns the real state). */
  disabled?: boolean;
  /** Show the required asterisk (visual only — set `required` on the control itself). */
  required?: boolean;
};

/**
 * Form field label (baseline `Label` anatomy) with optional description and
 * required marker. Associate with the control via `htmlFor` (or by nesting
 * it); disabled styling here is cosmetic and must mirror the control's own
 * `disabled`.
 */
export function Label({
  children,
  className,
  description,
  disabled = false,
  required = false,
  ...props
}: LabelProps) {
  return (
    <label
      {...props}
      aria-disabled={disabled || undefined}
      className={cx(sx(styles.root, disabled && styles.disabled), className)}
    >
      <span className={sx(styles.row)}>
        <span className={sx(styles.text)}>{children}</span>
        {required ? (
          <span aria-hidden className={sx(styles.required)}>
            *
          </span>
        ) : null}
      </span>
      {description ? (
        <span className={sx(styles.description)}>{description}</span>
      ) : null}
    </label>
  );
}

const styles = stylex.create({
  root: {
    color: vars.colorText,
    display: "grid",
    gap: vars.space4,
    minInlineSize: 0,
  },
  row: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars.space4,
    minInlineSize: 0,
  },
  text: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightNormal,
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  required: {
    color: vars.colorDangerText,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
  },
  description: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    overflowWrap: "anywhere",
  },
  disabled: {
    cursor: "not-allowed",
    opacity: vars.opacityDisabled,
  },
});
