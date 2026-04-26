import type { CSSProperties, ElementType, HTMLAttributes } from "react";
import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";

export interface ShimmerProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  children: string;
  as?: ElementType;
  duration?: number;
  spread?: number;
}

function ShimmerComponent({
  children,
  as: Component = "p",
  className,
  duration = 2,
  spread = 2,
  style,
  ...props
}: ShimmerProps) {
  const resolvedSpread = useMemo(
    () => `${Math.max(children.length, 1) * spread}px`,
    [children, spread],
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
      className={cn(
        "inline-block bg-[length:250%_100%] bg-clip-text bg-no-repeat text-transparent",
        "[background-position:100%_center] [--shimmer-base-color:var(--color-muted-foreground)]",
        "animate-text-shimmer motion-reduce:animate-none",
        className,
      )}
      style={shimmerStyle}
      {...props}
    >
      {children}
    </Component>
  );
}

export const Shimmer = memo(ShimmerComponent);
