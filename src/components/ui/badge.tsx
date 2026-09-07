import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import {
  badgeStyles,
  badgeToneStyles,
  badgeOutlineToneStyles,
  type BadgeTone,
  type BadgeVariant,
} from "../ads/components/Badge";
import { sx, cx } from "../ads/utils/stylex";
import { transition } from "../ads/recipes/transition";

/**
 * The legacy shim vocabulary, which folds ADS's two orthogonal axes — `tone`
 * (hue) and `variant` (fill weight) — into one `variant` word.
 */
type LegacyVariant =
  | "default"
  | "secondary"
  | "success"
  | "warning"
  | "destructive"
  | "outline"
  | "ghost"
  | "link";

/**
 * Each legacy word decomposed back into the ADS pair it means. Typed as an
 * exhaustive `Record`, so adding a legacy name without deciding its tone and
 * fill is a compile error rather than a silently untoned badge.
 */
const legacyVariants: Record<
  LegacyVariant,
  { tone: BadgeTone; variant: BadgeVariant }
> = {
  default: { tone: "accent", variant: "soft" },
  secondary: { tone: "neutral", variant: "soft" },
  success: { tone: "success", variant: "soft" },
  warning: { tone: "warning", variant: "soft" },
  destructive: { tone: "danger", variant: "soft" },
  outline: { tone: "neutral", variant: "outline" },
  ghost: { tone: "neutral", variant: "soft" },
  link: { tone: "accent", variant: "soft" },
};

const isLegacyVariant = (
  variant: LegacyVariant | BadgeVariant,
): variant is LegacyVariant => variant in legacyVariants;

/**
 * `variant` accepts BOTH vocabularies. Previously it accepted only the legacy
 * words, so a caller reaching for the ADS spelling (`variant="soft"`) fell
 * through the tone map to `undefined` and rendered an untoned badge. The two
 * unions overlap only on `"outline"`, which means the same thing in each.
 *
 * `tone` is the ADS axis and always wins when given; without it the legacy word
 * supplies the tone, so every existing caller renders byte-identically.
 */
export type BadgeShimProps = {
  className?: string;
  tone?: BadgeTone;
  variant?: LegacyVariant | BadgeVariant | null;
};

function resolveBadge(variant: LegacyVariant | BadgeVariant, tone?: BadgeTone) {
  const resolved = isLegacyVariant(variant)
    ? legacyVariants[variant]
    : { tone: "neutral" as BadgeTone, variant };
  return { tone: tone ?? resolved.tone, variant: resolved.variant };
}

export function badgeVariants({
  className,
  tone,
  variant = "default",
}: BadgeShimProps = {}) {
  const resolved = resolveBadge(variant ?? "default", tone);
  return cx(
    sx(
      badgeStyles.root,
      transition.colors,
      resolved.variant === "outline" && badgeStyles.outlineBase,
      resolved.variant === "outline"
        ? badgeOutlineToneStyles[resolved.tone]
        : badgeToneStyles[resolved.tone],
    ),
    className,
  );
}

export function Badge({
  className,
  render,
  tone,
  variant = "default",
  ...props
}: useRender.ComponentProps<"span"> & Pick<BadgeShimProps, "tone" | "variant">) {
  return useRender({
    defaultTagName: "span",
    render,
    props: mergeProps<"span">(
      { className: badgeVariants({ className, tone, variant }) },
      props,
    ),
    state: { slot: "badge", variant },
  });
}
