import type { StyleXValue } from "../ads/utils/stylex";
import type { ComponentType } from "react";
import type { Button as BaseButton } from "@base-ui/react/button";
import { Button as AdsButton, type ButtonBaseProps } from "../ads/components/Button";
import { buttonVariantStyles, buttonDangerToneStyles, buttonSizeGapStyles, buttonSizePadStyles } from "../ads/components/Button.config";
import { styles } from "../ads/components/Button.styles";
import { controlHeights, controlSquares } from "../ads/recipes/control-metrics";
import { focusRing } from "../ads/recipes/focus-ring";
import { transition } from "../ads/recipes/transition";
import { sx, cx } from "../ads/utils/stylex";

const ForwardButton = AdsButton as ComponentType<ButtonBaseProps>;
const variants = { default: "primary", outline: "outline", secondary: "secondary", ghost: "quiet", destructive: "soft", link: "link" } as const;
const sizes = { default: "md", xs: "xs", sm: "sm", lg: "lg", icon: "md", "icon-xs": "xs", "icon-sm": "sm", "icon-lg": "lg" } as const;
type Options = { xstyle?: StyleXValue; variant?: keyof typeof variants | null; size?: keyof typeof sizes | null; className?: string };

/** Class-only consumers share the same ADS recipes as real buttons. */
export function buttonVariants({ variant = "default", size = "default", className }: Options = {}) {
  const weight = variants[variant ?? "default"];
  const scale = sizes[size ?? "default"];
  const square = size?.startsWith("icon");
  return cx(sx(styles.root, transition.control, focusRing.ring, buttonVariantStyles[weight], variant === "destructive" && buttonDangerToneStyles[weight], square ? controlSquares[scale] : controlHeights[scale], square ? styles.iconPad : buttonSizePadStyles[scale], square ? styles.gapIcon : buttonSizeGapStyles[scale]), className);
}

/** Preserve the public call contract while ADS owns behavior and styling. */
export function Button({ variant = "default", size = "default", className, ...props }: BaseButton.Props & Options) {
  const scale = sizes[size ?? "default"];
  const square = size?.startsWith("icon");
  return <ForwardButton {...props} className={typeof className === "string" ? className : undefined} variant={variants[variant ?? "default"]} tone={variant === "destructive" ? "danger" : "default"} size={scale} iconOnly={Boolean(square)} data-slot="button" data-variant={variant} data-size={size} />;
}
