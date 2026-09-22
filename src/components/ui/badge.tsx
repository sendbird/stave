import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import {
  badgeStyles,
  badgeToneStyles,
  badgeOutlineToneStyles,
  type BadgeSize,
  type BadgeTone,
  type BadgeVariant,
} from "../ads/components/Badge";
import { withTruncatingLabels } from "../ads/components/truncating-label";
import { themeProps, themeSlotProps } from "../ads/theming/theme-props";
import { sx, cx, type XstyleProp } from "../ads/utils/stylex";
import { transition } from "../ads/recipes/transition";
import {
  statusChip,
  statusChipSizeStyles,
  statusChipSolidToneStyles,
} from "../ads/recipes/status-chip";

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
  size?: BadgeSize;
  tone?: BadgeTone;
  variant?: LegacyVariant | BadgeVariant | null;
} & XstyleProp;

function resolveBadge(variant: LegacyVariant | BadgeVariant, tone?: BadgeTone) {
  const resolved = isLegacyVariant(variant)
    ? legacyVariants[variant]
    : { tone: "neutral" as BadgeTone, variant };
  return { tone: tone ?? resolved.tone, variant: resolved.variant };
}

export function badgeVariants({
  className,
  tone,
  size = "md",
  xstyle,
  variant = "default",
}: BadgeShimProps = {}) {
  const resolved = resolveBadge(variant ?? "default", tone);
  // Keep class-only consumers on the same size and tone recipes.
  return cx(
    sx(
      statusChip.root,
      statusChipSizeStyles[size],
      transition.colors,
      resolved.variant === "outline" && statusChip.outline,
      resolved.variant === "outline"
        ? badgeOutlineToneStyles[resolved.tone]
        : resolved.variant === "solid"
          ? statusChipSolidToneStyles[resolved.tone === "warm" ? "warning" : resolved.tone]
          : badgeToneStyles[resolved.tone],
      xstyle,
    ),
    className,
  );
}

export function Badge({
  children,
  className,
  render,
  size = "md",
  tone,
  variant = "default",
  xstyle,
  ...props
}: useRender.ComponentProps<"span"> & BadgeShimProps) {
  const resolved = resolveBadge(variant ?? "default", tone);
  const theme = themeProps("badge", { ...resolved, size });
  return useRender({
    defaultTagName: "span",
    render,
    props: mergeProps<"span">(
      {
        ...theme,
        className: cx(badgeVariants({ className, tone, variant, size, xstyle }), theme.className),
        children: withTruncatingLabels(children, badgeStyles.label, themeSlotProps("badge", "label")),
      },
      props,
    ),
    state: { slot: "badge" },
  });
}
