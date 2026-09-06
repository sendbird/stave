import type * as React from "react";

import { MenuTrigger } from "../headless/menu";
import { controlChrome } from "../recipes/control-chrome";
import { controlHeightBySize } from "../recipes/control-metrics";
import { controlWidth } from "../recipes/control-width";
import { focusRing } from "../recipes/focus-ring";
import { menu } from "../recipes/menu";
import { transition } from "../recipes/transition";
import { cx, sx } from "../utils/stylex";

/**
 * `quiet` is the borderless "reveals itself on hover" weight — the same
 * affordance `Button variant="quiet"` names, and literally the same recipe
 * (`controlChrome.triggerQuiet`) behind both. `ghost` was this component's
 * private spelling of it, and two names for one weight is how a consumer ends
 * up believing they are two weights and picking by coin flip.
 *
 * @deprecated `ghost` — use `quiet`. The alias is exact, not approximate: both
 * resolve to the identical chrome, gutter and default size.
 */
export type MenuTriggerVariant = "default" | "ghost" | "quiet" | "unstyled";
export type MenuTriggerSize = "sm" | "md" | "lg";

export type MenuTriggerProps = Omit<
  React.ComponentProps<typeof MenuTrigger>,
  "size"
> & {
  /**
   * Stretch to the full inline size of the container and pin the caret to the
   * trailing edge (`Select.Trigger` geometry). Opt in only where the trigger
   * genuinely owns a column — a property row, table cell, or filter slot.
   * By default a menu trigger is a content-width button, and it now refuses to
   * be stretched by a `display: grid` or stretching-flex parent.
   * @default false
   */
  fullWidth?: boolean;
  /**
   * Control height, from the shared control-metrics map (sm 32 / md 36 /
   * lg 40). Quiet triggers default to sm; standalone triggers default to md.
   * `lg` exists so a menu trigger can align with a `lg` Button/TextField in
   * the same form row.
   */
  size?: MenuTriggerSize;
  /** Visual treatment for standalone controls vs. triggers embedded in toolbars. */
  variant?: MenuTriggerVariant;
};

// Inline gutter per size, from the shared recipe (Button parity).
const triggerSizeStyles = {
  lg: menu.triggerLg,
  md: menu.triggerMd,
  sm: menu.triggerSm,
} as const;

/**
 * The styled menu trigger, split out of `Menu.tsx` (which sits at its size
 * ceiling) and re-exported from it as `Menu.Trigger` — the import path and the
 * exported type names are unchanged.
 */
export function MenuTriggerPart({
  className,
  fullWidth = false,
  size,
  variant = "default",
  ...props
}: MenuTriggerProps) {
  // One weight, two spellings; `ghost` is the deprecated one. Resolved once,
  // here, so nothing downstream has to know both words.
  const quiet = variant === "ghost" || variant === "quiet";
  const resolvedSize = size ?? (quiet ? "sm" : "md");
  const styled = variant !== "unstyled";

  return (
    <MenuTrigger
      {...props}
      className={(state) =>
        cx(
          sx(
            styled && menu.trigger,
            styled && (fullWidth ? controlWidth.field : controlWidth.intrinsic),
            styled && fullWidth && menu.triggerFullWidth,
            styled && triggerSizeStyles[resolvedSize],
            // Color state comes from the shared control chrome so the trigger
            // reacts exactly like the Button it visually quotes (§2), and
            // stays visibly held while its popup is open.
            styled &&
              (quiet ? controlChrome.triggerQuiet : controlChrome.trigger),
            quiet && menu.triggerGhost,
            styled && transition.colors,
            styled && focusRing.ring,
            styled && controlHeightBySize[resolvedSize],
            styled && state.open && controlChrome.triggerOpen,
          ),
          typeof className === "function" ? className(state) : className,
        )
      }
    />
  );
}
