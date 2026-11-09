import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { themeProps, themeSlotProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";

export type LabelProps = React.ComponentProps<"label"> & {
  /** Helper text under the label text. */
  description?: React.ReactNode;
  /** Dims the label to mirror a disabled control (the control owns the real state). */
  disabled?: boolean;
  /** Show the required asterisk (visual only — set `required` on the control itself). */
  required?: boolean;
} & XstyleProp;

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
  xstyle,
  ...props
}: LabelProps) {
  const theme = themeProps("label");
  return (
    <label
      {...props}
      {...theme}
      aria-disabled={disabled || undefined}
      className={cx(
        sx(styles.root, disabled && styles.disabled, xstyle),
        theme.className,
        className,
      )}
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
        <span
          {...themeSlotProps("label", "description")}
          className={sx(styles.description)}
        >
          {description}
        </span>
      ) : null}
    </label>
  );
}

const styles = stylex.create({
  root: {
    color: vars["--aui-color-text"],
    display: "grid",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
  },
  row: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
  },
  text: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-normal"],
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  required: {
    color: vars["--aui-color-danger-text"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
  },
  description: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    overflowWrap: "anywhere",
  },
  disabled: {
    cursor: "not-allowed",
    opacity: vars["--aui-opacity-disabled"],
  },
});
