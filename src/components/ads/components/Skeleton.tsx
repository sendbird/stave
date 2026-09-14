import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import type { SkeletonRootProps } from "../headless/skeleton";
import { treeRowHeights } from "../recipes/control-metrics";
import { themeProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";

export type SkeletonProps = Omit<SkeletonRootProps, "className"> & {
  className?: string;
  /** Logical inline size of the placeholder. */
  width?: React.CSSProperties["inlineSize"];
  /** Logical block size of the placeholder. */
  height?: React.CSSProperties["blockSize"];
  /** Optional radius override for component-shaped placeholders. */
  radius?: React.CSSProperties["borderRadius"];
  /** Number of text lines (last line is shortened). Only used by `variant="text"`. */
  lines?: number;
  /**
   * Placeholder shape. `block` (rect), `text` (line stack) and `avatar`
   * (circle) are the originals; `chip`, `control` and `row` are shape-matched to
   * the three things a loading product surface actually reserves space for.
   *
   * They exist because the alternative is what every consumer was writing:
   * `<Skeleton height={24} radius={vars["--ads-radius-full"]} width={72} />` for a badge,
   * repeated at every call site with a different guess at the width. A shape that
   * ADS owns matches the component it stands in for and moves with it.
   * @default "block"
   */
  variant?: "text" | "block" | "avatar" | "chip" | "control" | "row";
} & XstyleProp;

/**
 * Loading placeholder (baseline `Skeleton` anatomy). Use only inside a component
 * that owns the final layout and can place the placeholder in the exact slot
 * where content will render. For unknown/page-level loading, use
 * `LoadingSurface` instead of fake rows. The shimmer sweep is a state signal
 * (content is on its way), implemented in CSS (`.atelier-motion-skeleton` in
 * `styles.css`) and disabled under `prefers-reduced-motion` — the static block
 * remains. `aria-hidden`: announce loading on the region (`aria-busy`), not per
 * placeholder.
 */
export function Skeleton({
  className,
  height,
  lines = 1,
  radius,
  style,
  variant = "block",
  width,
  xstyle,
  ...props
}: SkeletonProps) {
  const placeholderStyle = {
    ...style,
    ...(height === undefined ? {} : { blockSize: height }),
    ...(radius === undefined ? {} : { borderRadius: radius }),
    ...(width === undefined ? {} : { inlineSize: width }),
  } as React.CSSProperties;
  const lineStyle = {
    ...(height === undefined ? {} : { blockSize: height }),
    ...(radius === undefined ? {} : { borderRadius: radius }),
  } as React.CSSProperties;
  // The target lands on the blocks that paint, not on the stack that lays them
  // out: a multi-line text skeleton is N placeholders in a grid, and a brand
  // filling the grid instead would also fill the gaps between the lines.
  const theme = themeProps("skeleton", { variant });

  if (variant === "text" && lines > 1) {
    return (
      <div
        {...props}
        aria-hidden
        className={cx(sx(styles.stack, xstyle), className)}
        style={placeholderStyle}
      >
        {Array.from({ length: lines }).map((_, index) => (
          <span
            {...theme}
            className={cx(
              sx(
                styles.root,
                styles.text,
                index === lines - 1 && styles.lastLine,
              ),
              "atelier-motion-skeleton",
              theme.className,
            )}
            key={index}
            style={lineStyle}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      {...props}
      {...theme}
      aria-hidden
      className={cx(
        sx(styles.root, variantStyles[variant], xstyle),
        "atelier-motion-skeleton",
        theme.className,
        className,
      )}
      style={placeholderStyle}
    />
  );
}

export type TreeSkeletonProps = React.ComponentProps<"div"> & {
  /** Number of rows to reserve. @default 5 */
  rows?: number;
  /** Match the rendered Tree density. @default "regular" */
  density?: "compact" | "regular";
} & XstyleProp;

/** Shape-matched loading rows for a page tree/sidebar navigation surface. */
export function TreeSkeleton({
  className,
  density = "regular",
  rows = 5,
  xstyle,
  ...props
}: TreeSkeletonProps) {
  return (
    <div
      {...props}
      aria-hidden
      className={cx(sx(styles.tree, xstyle), className)}
    >
      {Array.from({ length: rows }).map((_, index) => (
        <div
          className={sx(styles.treeRow, treeRowHeights[density])}
          key={index}
        >
          <Skeleton
            height={14}
            radius={vars["--ads-radius-mark"]}
            variant="block"
            width={14}
          />
          <Skeleton
            height={12}
            variant="block"
            width={index % 3 === 0 ? "62%" : index % 3 === 1 ? "78%" : "48%"}
          />
        </div>
      ))}
    </div>
  );
}

export type PageHeaderSkeletonProps = React.ComponentProps<"div"> & XstyleProp;

/** Shape-matched loading state for the common breadcrumb/title/action header. */
export function PageHeaderSkeleton({
  className,
  xstyle,
  ...props
}: PageHeaderSkeletonProps) {
  return (
    <div
      {...props}
      aria-hidden
      className={cx(sx(styles.header, xstyle), className)}
    >
      <div className={sx(styles.headerCopy)}>
        <Skeleton height={12} variant="block" width="38%" />
        <Skeleton height={28} variant="block" width="54%" />
      </div>
      <Skeleton height={32} radius={vars["--ads-radius-control"]} width={96} />
    </div>
  );
}

export type TextBlockSkeletonProps = Omit<SkeletonProps, "variant"> & {
  /** Number of lines to reserve. @default 4 */
  lines?: number;
};

/** Shape-matched loading state for a prose/text block. */
export function TextBlockSkeleton({
  lines = 4,
  ...props
}: TextBlockSkeletonProps) {
  return <Skeleton {...props} lines={lines} variant="text" />;
}

const styles = stylex.create({
  root: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderRadius: vars["--ads-radius-mark"],
    color: vars["--ads-color-text-muted"],
    overflow: "hidden",
    position: "relative",
  },
  block: {
    blockSize: 96,
    inlineSize: "100%",
  },
  text: {
    blockSize: 14,
    inlineSize: "100%",
  },
  avatar: {
    borderRadius: vars["--ads-radius-full"],
    inlineSize: 40,
    minBlockSize: 40,
  },
  /*
   * Shape-matched rungs. Each one takes the geometry of the component it
   * reserves space for, so a loading row does not resize when the real content
   * arrives: `chip` is Badge's 24px pill, `control` is the 36px default control
   * height with the control corner, and `row` is a table/list row's 20px text
   * band at full width.
   */
  chip: {
    borderRadius: vars["--ads-radius-full"],
    inlineSize: 72,
    minBlockSize: 24,
  },
  control: {
    borderRadius: vars["--ads-radius-control"],
    inlineSize: 96,
    minBlockSize: vars["--ads-control-height"],
  },
  row: {
    blockSize: 20,
    inlineSize: "100%",
  },
  stack: {
    display: "grid",
    gap: vars["--ads-space-8"],
    inlineSize: "100%",
  },
  lastLine: {
    inlineSize: "68%",
  },
  tree: {
    display: "grid",
    gap: vars["--ads-space-4"],
    inlineSize: "100%",
  },
  treeRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-8"],
  },
  header: {
    alignItems: "end",
    borderBlockEndColor: vars["--ads-color-border-subtle"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-16"],
    justifyContent: "space-between",
    paddingBlockEnd: vars["--ads-space-20"],
  },
  headerCopy: {
    display: "grid",
    flexGrow: 1,
    gap: vars["--ads-space-12"],
    minInlineSize: 0,
  },
});

const variantStyles = {
  avatar: styles.avatar,
  block: styles.block,
  chip: styles.chip,
  control: styles.control,
  row: styles.row,
  text: styles.text,
} as const;
