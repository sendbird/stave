import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { themeProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { Loader } from "./Loader";

export type LoadingSurfaceProps = Omit<
  React.ComponentProps<"section">,
  "children"
> & {
  /** Status text announced to assistive tech, in the host's words. */
  label: string;
  /** Render a visible label next to the spinner. @default false */
  showLabel?: boolean;
  /** Custom activity indicator for a task-specific wait. Defaults to `Loader`. */
  indicator?: React.ReactNode;
  /**
   * Minimum block size for a standalone loading region: `sm` 160px, `md`
   * 240px, `fill` stretches to the parent with a 240px floor.
   *
   * The values are the `size` vocabulary rather than `compact`/`regular`
   * because this is a `size` prop. Density words in a size union is the same
   * axis confusion the field controls carried, one direction reversed.
   * `fill` earns its place beside them for the reason `DataTableColumnSize`
   * admits `"fill"`: it is a layout mode, not another step on the ramp.
   *
   * @default "md"
   */
  size?: "sm" | "md" | "fill";
} & XstyleProp;

/**
 * Honest loading state for a whole surface when the eventual layout is not yet
 * available. Use this instead of drawing fake skeleton rows that do not match
 * the rendered component. Use `Skeleton` only inside a component that owns the
 * final layout and can place placeholders in the exact content slots.
 */
export function LoadingSurface({
  className,
  indicator,
  label,
  showLabel = false,
  size = "md",
  xstyle,
  ...props
}: LoadingSurfaceProps) {
  const theme = themeProps("loading-surface", { size });

  return (
    <section
      {...props}
      {...theme}
      aria-busy={props["aria-busy"] ?? true}
      className={cx(
        sx(styles.root, sizeStyles[size], xstyle),
        theme.className,
        className,
      )}
    >
      {indicator ?? (
        <Loader label={label} showLabel={showLabel} size="md" tone="neutral" />
      )}
    </section>
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    color: vars["--ads-color-text"],
    display: "grid",
    inlineSize: "100%",
    justifyItems: "center",
    minInlineSize: 0,
    padding: vars["--ads-space-24"],
  },
  sm: {
    minBlockSize: 160,
  },
  fill: {
    blockSize: "100%",
    minBlockSize: 240,
  },
  md: {
    minBlockSize: 240,
  },
});

const sizeStyles = {
  fill: styles.fill,
  md: styles.md,
  sm: styles.sm,
} as const;
