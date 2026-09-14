import * as stylex from "@stylexjs/stylex";
import type { StyleXValue } from "../ads/utils/stylex";
import type { ComponentType, ReactNode } from "react";
import type { Button as BaseButton } from "@base-ui/react/button";
import { Button as AdsButton, type ButtonBaseProps } from "../ads/components/Button";
import { buttonVariantStyles, buttonSizeGapStyles, buttonSizePadStyles } from "../ads/components/Button.config";
import { styles } from "../ads/components/Button.styles";
import { buttonToneVariantStyles } from "../ads/components/Button.tone-styles";
import { vars } from "../ads/tokens/tokens.stylex";
import { controlHeights, controlSquares } from "../ads/recipes/control-metrics";
import { focusRing } from "../ads/recipes/focus-ring";
import { transition } from "../ads/recipes/transition";
import { sx, cx } from "../ads/utils/stylex";

const ForwardButton = AdsButton as ComponentType<ButtonBaseProps>;
// `floating` is the ADS weight for a raised, detached, viewport-level action —
// it owns the round corners (`--ads-button-radius-*: radiusFull`) and the
// elevation that every such control in this repository was otherwise
// hand-rolling on top of `ghost`/`outline`. Exposed here so a host caller can
// name the weight instead of re-deriving its paint.
const variants = { default: "primary", outline: "outline", secondary: "secondary", ghost: "quiet", destructive: "soft", link: "link", floating: "floating" } as const;
const sizes = { default: "md", xs: "xs", sm: "sm", lg: "lg", icon: "md", "icon-xs": "xs", "icon-sm": "sm", "icon-lg": "lg" } as const;
type Options = {
  xstyle?: StyleXValue;
  /**
   * Forwarded to ADS `Button indicator` — the corner overlay slot (a count
   * pill, an attention dot). Typed here because this wrapper's props are
   * `BaseButton.Props & Options`, which does not include ADS's own additions;
   * without it the one slot that a chrome control cannot express any other way
   * (the root clips, so a positioned child is cut on two edges) is unreachable
   * from every consumer that imports `Button` from `@/components/ui`.
   */
  indicator?: ReactNode;
  variant?: keyof typeof variants | null;
  size?: keyof typeof sizes | null;
  /**
   * ADS's shape axis, forwarded explicitly.
   *
   * The `icon`/`icon-sm`/`icon-xs`/`icon-lg` values of `size` are this repo's
   * legacy spelling of "square at that rung": they conflate SHAPE with SCALE,
   * which is the conflation ADS split apart. Passing `iconOnly` with a plain
   * scale step (`size="sm" iconOnly`) is the current grammar, and it is the
   * only way to say "square" for a size step that has no `icon-*` alias.
   * When omitted, the legacy `icon-*` prefix still decides, so existing call
   * sites keep rendering exactly as before.
   */
  iconOnly?: boolean;
  className?: string;
  /**
   * ADS box ownership. `control` (the default) lets ADS size the box and its
   * glyph, and it does so through an unlayered `> svg` rule that no author
   * style can outrank. `host` keeps every ADS behaviour and token but hands the
   * geometry — height, gutters, glyph box — to the caller's own styles, which
   * is what a lane that pins its controls to one height and one glyph size
   * needs (the composer control lanes, the top bar row).
   */
  layout?: "control" | "host";
};

/**
 * ADS retired the per-variant `danger*` style keys and now expresses every
 * semantic tone through `--ads-button-tone-*` custom properties that `Button`
 * publishes as an inline style. `buttonVariants` emits classes only and has no
 * element to attach that style to, so the class-only path declares the same
 * five properties itself and keeps `variant="destructive"` painting as before.
 */
const toneVariables = stylex.create({
  danger: {
    "--ads-button-tone-border": vars["--ads-color-danger-border"],
    "--ads-button-tone-fill": vars["--ads-color-danger"],
    "--ads-button-tone-hover": vars["--ads-color-danger-hover"],
    "--ads-button-tone-ink": vars["--ads-color-danger-text"],
    "--ads-button-tone-soft": vars["--ads-color-danger-soft"],
  },
});

/** Class-only consumers share the same ADS recipes as real buttons. */
export function buttonVariants({ variant = "default", size = "default", iconOnly, className }: Options = {}) {
  const weight = variants[variant ?? "default"];
  const scale = sizes[size ?? "default"];
  const square = iconOnly ?? size?.startsWith("icon");
  return cx(sx(styles.root, transition.control, focusRing.ring, buttonVariantStyles[weight], variant === "destructive" && toneVariables.danger, variant === "destructive" && buttonToneVariantStyles[weight], square ? controlSquares[scale] : controlHeights[scale], square ? styles.iconPad : buttonSizePadStyles[scale], square ? styles.gapIcon : buttonSizeGapStyles[scale]), className);
}

/**
 * Preserve the public call contract while ADS owns behavior and styling.
 *
 * `data-variant` / `data-size` are no longer emitted here. ADS `Button` now
 * publishes its own stable theme identity on those exact attribute names
 * (`themeProps("button", …)`), spread after the caller's props, so a duplicate
 * in this wrapper's spelling was overwritten before it reached the DOM. The
 * rendered element carries the ADS spelling — `ghost` reads as
 * `data-variant="quiet"`, `destructive` as `data-variant="soft"
 * data-tone="danger"`, `icon-sm` as `data-size="sm"`.
 */
export function Button({ variant = "default", size = "default", iconOnly, className, ...props }: BaseButton.Props & Options) {
  const scale = sizes[size ?? "default"];
  const square = iconOnly ?? size?.startsWith("icon");
  return <ForwardButton {...props} className={typeof className === "string" ? className : undefined} variant={variants[variant ?? "default"]} tone={variant === "destructive" ? "danger" : "default"} size={scale} iconOnly={Boolean(square)} data-slot="button" />;
}
