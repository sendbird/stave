import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Segmented container for controls that belong to one object — a primary
 * action plus the menu that configures it.
 *
 * Deliberately chrome-free at rest. The composer toolbar it lives in is a row
 * of bare ghost buttons, so a permanent outline made these controls read as
 * form fields dropped among plain text buttons rather than as peers of them.
 * The outline is therefore an interaction state, not the control's identity:
 * at rest a group weighs exactly what the single-segment ghost button beside it
 * weighs, and hovering, focusing, or opening it draws the halves together.
 *
 * `border-transparent` rather than no border at all, matching the shared
 * `Button` base: the box is always laid out, so revealing it cannot shift the
 * toolbar. Squaring the inner corners is what keeps the halves from rounding
 * away from each other once the divider appears, no matter what radius a
 * segment carries.
 *
 * The outline and divider are the whole reveal; there is deliberately no group
 * background behind them. A `muted/25` wash measured at under 0.02 lightness
 * against both the light and dark composer surface — imperceptible, while each
 * segment's own hover tint is the thing that actually reads. The enclosing
 * border is what says "one object".
 *
 * `/70` rather than the `/55` this carried while it was permanent: an outline
 * that only exists during interaction can afford to be decisive, and the extra
 * weight is what keeps it legible in the lowest-contrast built-in theme
 * (`solarized-light`, where `border` sits 0.055 OKLab lightness from `card` —
 * `/45` landed at 0.025, below the threshold where a hairline reads).
 *
 * The open state matches `[aria-expanded=true]` explicitly rather than relying
 * on Tailwind's bare `aria-expanded` variant, so the intent is legible next to
 * the `data-*` reveals elsewhere in this file's consumers — where presence and
 * truth genuinely differ.
 */
export function ButtonGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="group"
      data-slot="button-group"
      className={cn(
        "group/button-group inline-flex w-fit items-stretch overflow-hidden rounded-md",
        "border border-transparent bg-transparent transition-colors duration-150",
        "hover:border-border/70 focus-within:border-border/70",
        "has-[[aria-expanded=true]]:border-border/70",
        "[&>*]:rounded-none",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Hairline between two segments. Decorative — the segments name themselves —
 * and revealed with the group's outline, so the seam only appears once the
 * user is looking at the control.
 */
export function ButtonGroupSeparator({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      data-slot="button-group-separator"
      className={cn(
        "w-px shrink-0 self-stretch bg-transparent transition-colors duration-150",
        "group-hover/button-group:bg-border/70",
        "group-focus-within/button-group:bg-border/70",
        "group-has-[[aria-expanded=true]]/button-group:bg-border/70",
        className,
      )}
      {...props}
    />
  );
}
