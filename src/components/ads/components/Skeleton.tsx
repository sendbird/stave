import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import type { SkeletonRootProps } from "../headless/skeleton";
import { treeRowHeights } from "../recipes/control-metrics";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";

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
  /** Placeholder shape: `block` (rect), `text` (line stack), `avatar` (circle). @default "block" */
  variant?: "text" | "block" | "avatar";
};

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

  if (variant === "text" && lines > 1) {
    return (
      <div
        {...props}
        aria-hidden
        className={cx(sx(styles.stack), className)}
        style={placeholderStyle}
      >
        {Array.from({ length: lines }).map((_, index) => (
          <span
            className={cx(
              sx(
                styles.root,
                styles.text,
                index === lines - 1 && styles.lastLine,
              ),
              "atelier-motion-skeleton",
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
      aria-hidden
      className={cx(
        sx(styles.root, variantStyles[variant]),
        "atelier-motion-skeleton",
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
};

/** Shape-matched loading rows for a page tree/sidebar navigation surface. */
export function TreeSkeleton({
  className,
  density = "regular",
  rows = 5,
  ...props
}: TreeSkeletonProps) {
  return (
    <div {...props} aria-hidden className={cx(sx(styles.tree), className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          className={sx(styles.treeRow, treeRowHeights[density])}
          key={index}
        >
          <Skeleton
            height={14}
            radius={vars.radiusMark}
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

export type PageHeaderSkeletonProps = React.ComponentProps<"div">;

/** Shape-matched loading state for the common breadcrumb/title/action header. */
export function PageHeaderSkeleton({
  className,
  ...props
}: PageHeaderSkeletonProps) {
  return (
    <div {...props} aria-hidden className={cx(sx(styles.header), className)}>
      <div className={sx(styles.headerCopy)}>
        <Skeleton height={12} variant="block" width="38%" />
        <Skeleton height={28} variant="block" width="54%" />
      </div>
      <Skeleton height={32} radius={vars.radiusControl} width={96} />
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
    backgroundColor: vars.colorCanvasSubtle,
    borderRadius: vars.radiusMark,
    color: vars.colorTextMuted,
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
    borderRadius: vars.radiusFull,
    inlineSize: 40,
    minBlockSize: 40,
  },
  stack: {
    display: "grid",
    gap: vars.space8,
    inlineSize: "100%",
  },
  lastLine: {
    inlineSize: "68%",
  },
  tree: {
    display: "grid",
    gap: vars.space4,
    inlineSize: "100%",
  },
  treeRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    paddingInline: vars.space8,
  },
  header: {
    alignItems: "end",
    borderBlockEndColor: vars.colorBorderSubtle,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars.borderWidthHairline,
    display: "flex",
    gap: vars.space16,
    justifyContent: "space-between",
    paddingBlockEnd: vars.space20,
  },
  headerCopy: {
    display: "grid",
    flexGrow: 1,
    gap: vars.space12,
    minInlineSize: 0,
  },
});

const variantStyles = {
  avatar: styles.avatar,
  block: styles.block,
  text: styles.text,
} as const;
