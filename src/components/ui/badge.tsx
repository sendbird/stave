import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { badgeStyles, badgeToneStyles, badgeOutlineToneStyles, type BadgeTone } from "../ads/components/Badge";
import { sx, cx } from "../ads/utils/stylex";
import { transition } from "../ads/recipes/transition";

type Variant = "default" | "secondary" | "success" | "warning" | "destructive" | "outline" | "ghost" | "link";
const tones: Record<Variant, BadgeTone> = {
  default: "accent", secondary: "neutral", success: "success", warning: "warning",
  destructive: "danger", outline: "neutral", ghost: "neutral", link: "accent",
};
export function badgeVariants({ variant = "default", className }: { variant?: Variant | null; className?: string } = {}) {
  const tone = tones[variant ?? "default"];
  return cx(sx(badgeStyles.root, transition.colors,
    variant === "outline" && badgeStyles.outlineBase,
    variant === "outline" ? badgeOutlineToneStyles[tone] : badgeToneStyles[tone]), className);
}
export function Badge({ className, variant = "default", render, ...props }: useRender.ComponentProps<"span"> & { variant?: Variant }) {
  return useRender({ defaultTagName: "span", render,
    props: mergeProps<"span">({ className: badgeVariants({ variant, className }) }, props),
    state: { slot: "badge", variant },
  });
}
