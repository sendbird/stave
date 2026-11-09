import * as React from "react";

import { controlChrome } from "../recipes/control-chrome";
import {
  controlHeights,
  controlIconSizes,
  controlSquares,
} from "../recipes/control-metrics";
import { sx } from "../utils/stylex";
import { styles } from "./Button.styles";
import type { ButtonSize, ButtonVariant } from "./Button.types";

/** Put text in a real shrinking flex item so ellipsis can take effect. */
export function withTruncatingButtonLabels(
  children: React.ReactNode,
): React.ReactNode {
  const grouped: React.ReactNode[] = [];
  React.Children.forEach(children, (child) => {
    const previous = grouped[grouped.length - 1];
    if ((typeof child === "string" || typeof child === "number") &&
        (typeof previous === "string" || typeof previous === "number")) {
      grouped[grouped.length - 1] = String(previous) + String(child);
    } else {
      grouped.push(child);
    }
  });
  return React.Children.map(grouped, (child) =>
    typeof child === "string" || typeof child === "number" ? (
      <span className={sx(styles.label)}>{child}</span>
    ) : child,
  );
}

export const buttonVariantStyles = {
  dashed: styles.dashed,
  floating: styles.floating,
  link: styles.link,
  outlined: styles.outlined,
  primary: styles.primary,
  quiet: controlChrome.triggerQuiet,
  secondary: styles.secondary,
  soft: styles.soft,
} as const satisfies Record<ButtonVariant, unknown>;

export const buttonSizePadStyles = {
  "2xs": styles.xs2,
  lg: styles.lg,
  md: styles.md,
  sm: styles.sm,
  xs: styles.xs,
} as const satisfies Record<ButtonSize, unknown>;

export const buttonSizeGapStyles = {
  "2xs": styles.gapXs,
  lg: styles.gapLg,
  md: styles.gapMd,
  sm: styles.gapSm,
  xs: styles.gapXs,
} as const satisfies Record<ButtonSize, unknown>;

/** Height and square per rung; `2xs` is Button-owned (see `ButtonSize`). */
export const buttonHeightStyles = {
  "2xs": styles.height2xs,
  ...controlHeights,
} as const satisfies Record<ButtonSize, unknown>;

export const buttonSquareStyles = {
  "2xs": styles.square2xs,
  ...controlSquares,
} as const satisfies Record<ButtonSize, unknown>;

/** `2xs` keeps the `xs` glyph (14px): there is no 12px rung to step down to. */
export const buttonIconSizes = {
  "2xs": controlIconSizes.xs,
  ...controlIconSizes,
} as const satisfies Record<ButtonSize, string>;
