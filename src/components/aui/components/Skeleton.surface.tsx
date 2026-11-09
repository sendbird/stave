import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { themeProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { Loader } from "./Loader";

/**
 * How a `Skeleton.Surface` takes its space.
 *
 * - `block` — its own region in the flow, at least `size` tall.
 * - `fill` — stretches to a bounded parent, never shorter than `size`.
 */
export type SkeletonSurfaceLayout = "block" | "fill";

/** The floor a surface keeps: `sm` 160px, `md` 240px. */
export type SkeletonSurfaceSize = "md" | "sm";

export type SkeletonSurfaceProps = Omit<
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
   * How the surface takes its space — its own block, or the bounded parent's
   * full height. See `SkeletonSurfaceLayout`. @default "block"
   */
  layout?: SkeletonSurfaceLayout;
  /**
   * The floor the surface keeps: `sm` 160px, `md` 240px. How the surface sits
   * is `layout`.
   *
   * @default "md"
   */
  size?: SkeletonSurfaceSize;
} & XstyleProp;

/**
 * Honest loading state for a whole surface when the eventual layout is not yet
 * available. Use this instead of drawing fake skeleton rows that do not match
 * the rendered component. Use `Skeleton` only inside a component that owns the
 * final layout and can place placeholders in the exact content slots.
 *
 * Rendered as `Skeleton.Surface`; this module is its implementation.
 */
export function SkeletonSurface({
  className,
  indicator,
  label,
  layout = "block",
  showLabel = false,
  size = "md",
  xstyle,
  ...props
}: SkeletonSurfaceProps) {
  // The theme axis keeps reflecting the layout where it is not the plain
  // block, so a brand rule written against `data-size="fill"` still matches.
  const theme = themeProps("loading-surface", {
    size: layout === "block" ? size : layout,
  });

  return (
    <section
      {...props}
      {...theme}
      aria-busy={props["aria-busy"] ?? true}
      className={cx(
        sx(
          styles.root,
          floorStyles[size],
          layout === "fill" && styles.fill,
          xstyle,
        ),
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
    color: vars["--aui-color-text"],
    display: "grid",
    inlineSize: "100%",
    justifyItems: "center",
    minInlineSize: 0,
    padding: vars["--aui-space-24"],
  },
  sm: {
    minBlockSize: 160,
  },
  fill: {
    blockSize: "100%",
  },
  md: {
    minBlockSize: 240,
  },
});

const floorStyles = {
  md: styles.md,
  sm: styles.sm,
} as const;
