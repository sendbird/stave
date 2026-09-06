import * as React from "react";

import { controlChrome } from "../recipes/control-chrome";
import type { ControlScale } from "../recipes/control-metrics";
import { sx } from "../utils/stylex";
import { styles } from "./Button.styles";
import type { ButtonIconSize, ButtonSize, ButtonVariant } from "./Button.types";

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

const legacyIconScale = {
  icon: "md",
  iconLg: "lg",
  iconSm: "sm",
} as const satisfies Record<ButtonIconSize, ControlScale>;

export function isLegacyButtonIconSize(
  size: ButtonSize,
): size is ButtonIconSize {
  return size in legacyIconScale;
}

export function getLegacyButtonIconScale(size: ButtonIconSize): ControlScale {
  return legacyIconScale[size];
}

export const buttonVariantStyles = {
  floating: styles.floating,
  link: styles.link,
  outline: styles.outline,
  primary: styles.primary,
  quiet: controlChrome.triggerQuiet,
  secondary: styles.secondary,
  soft: styles.soft,
} as const satisfies Record<Exclude<ButtonVariant, "danger">, unknown>;

export const buttonDangerToneStyles = {
  floating: styles.dangerInk,
  link: styles.dangerInk,
  outline: styles.dangerOutline,
  primary: styles.danger,
  quiet: styles.dangerQuiet,
  secondary: styles.dangerSecondary,
  soft: styles.dangerSoft,
} as const satisfies Record<Exclude<ButtonVariant, "danger">, unknown>;

export const buttonSizePadStyles = {
  lg: styles.lg,
  md: styles.md,
  sm: styles.sm,
  xs: styles.xs,
} as const satisfies Record<ControlScale, unknown>;

export const buttonSizeGapStyles = {
  lg: styles.gapLg,
  md: styles.gapMd,
  sm: styles.gapSm,
  xs: styles.gapXs,
} as const satisfies Record<ControlScale, unknown>;
