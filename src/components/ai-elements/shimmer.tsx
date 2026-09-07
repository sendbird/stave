import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from "react";
import { memo, useMemo } from "react";
import { coreStyles } from "./ai-element-core.styles";
import { vars } from "../ads/tokens/tokens.stylex";
import { cx, sx } from "../ads/utils/stylex";

/**
 * The band is a token pair, not a literal. It used to mix the base ink with
 * `white 60%`, which only reads as a highlight on a light canvas — on a dark
 * theme the sweep brightened *away* from the surface and looked like a defect.
 * Mixing toward `colorCanvas` keeps the intent (the phrase momentarily fades
 * into the surface it sits on) in every theme, because the canvas follows the
 * theme.
 */
const SHIMMER_BASE = `var(--shimmer-base-color, ${vars.colorTextMuted})`;
const SHIMMER_HIGHLIGHT = `color-mix(in srgb, ${SHIMMER_BASE}, ${vars.colorCanvas} 60%)`;

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
        `linear-gradient(90deg, transparent calc(50% - ${resolvedSpread}), var(--shimmer-highlight-color, ${SHIMMER_HIGHLIGHT}), transparent calc(50% + ${resolvedSpread}))`,
        `linear-gradient(${SHIMMER_BASE}, ${SHIMMER_BASE})`,
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
