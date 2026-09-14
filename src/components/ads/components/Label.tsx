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
    color: vars["--ads-color-text"],
    display: "grid",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  row: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  text: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-normal"],
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  required: {
    color: vars["--ads-color-danger-text"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  description: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    overflowWrap: "anywhere",
  },
  disabled: {
    cursor: "not-allowed",
    opacity: vars["--ads-opacity-disabled"],
  },
});
