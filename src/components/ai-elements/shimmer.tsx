import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from "react";
import { memo, useMemo } from "react";
import { coreStyles } from "./ai-element-core.styles";
import { cx, sx } from "../ads/utils/stylex";

export interface ShimmerProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /**
   * Text to shimmer. Non-string children are supported for callers that need to
   * split the phrase into per-character nodes (the gradient still clips across
   * the whole phrase); those callers must pass `textLength` so the highlight
   * spread stays proportional to the visible text.
   */
  children: ReactNode;
  as?: ElementType;
  duration?: number;
  spread?: number;
  /** Character count used to size the highlight when `children` is not a string. */
  textLength?: number;
}

function ShimmerComponent({
  children,
  as: Component = "p",
  className,
  duration = 2,
  spread = 2,
  textLength,
  style,
  ...props
}: ShimmerProps) {
  const resolvedSpread = useMemo(
    () => {
      const length = textLength ?? (typeof children === "string" ? children.length : 1);
      return `${Math.max(length, 1) * spread}px`;
    },
    [children, spread, textLength],
  );

  const shimmerStyle = useMemo<CSSProperties>(
    () => ({
      animationDuration: `${duration}s`,
      backgroundImage: [
        `linear-gradient(90deg, transparent calc(50% - ${resolvedSpread}), var(--shimmer-highlight-color, color-mix(in srgb, var(--shimmer-base-color, var(--color-muted-foreground)), white 60%)), transparent calc(50% + ${resolvedSpread}))`,
        "linear-gradient(var(--shimmer-base-color, var(--color-muted-foreground)), var(--shimmer-base-color, var(--color-muted-foreground)))",
      ].join(", "),
      ...style,
    }),
    [duration, resolvedSpread, style],
  );

  return (
    <Component
      className={cx(sx(coreStyles.shimmer), className)}
      style={shimmerStyle}
      {...props}
    >
      {children}
    </Component>
  );
}

export const Shimmer = memo(ShimmerComponent);
