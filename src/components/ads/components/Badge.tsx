import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";
import * as React from "react";

import { focusRing } from "../recipes/focus-ring";
import {
  statusChip,
  statusChipOutlineToneStyles,
  statusChipSizeStyles,
  statusChipSoftToneStyles,
  statusChipSolidToneStyles,
} from "../recipes/status-chip";
import { touchTarget } from "../recipes/touch-target";
import { transition } from "../recipes/transition";
import { valueToken, valueTokenRemoveIconSizes } from "../recipes/value-token";
import { withTruncatingLabels } from "./truncating-label";
import {
  themeProps,
  themeSlotProps,
  themeTargetClassName,
} from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "info"
  | "warning"
  /** @deprecated Alias of `"warning"` (renders identically) — use `tone="warning"`; removal reserved for the next major. */
  | "warm"
  | "success"
  | "danger";

export type BadgeVariant = "soft" | "outline" | "solid";

/**
 * Chip scale. `md` (24px) is the in-content default; `sm` (20px) is the dense
 * rung for a 28–32px table row, an inline list cell, or a sidebar count, where
 * a 24px chip sets the row height instead of sitting inside it.
 */
export type BadgeSize = "sm" | "md";

export type BadgeProps = Omit<React.ComponentProps<"span">, "onRemove"> & {
  /**
   * Render a small leading status dot in the tone color — semantic color on a
   * small element for quieter tone signaling (pairs well with `outline`).
   */
  dot?: boolean;
  /** Render a trailing remove (×) button; called on click. */
  onRemove?: () => void;
  /** Accessible label for the remove button. @default "Remove" */
  removeLabel?: string;
  /** Chip scale: `sm` 20px for dense rows, `md` 24px in content. @default "md" */
  size?: BadgeSize;
  /**
   * Semantic color family. `"warm"` is a deprecated alias of `"warning"`
   * (identical rendering); it keeps working until the next major.
   * @default "neutral"
   */
  tone?: BadgeTone;
  /**
   * Visual weight: `soft` = tinted fill (default), `outline` = hairline border
   * on a transparent background with tone-colored text, `solid` = filled chip
   * with inverted text for the one status in a view that must be read before
   * anything else.
   * @default "soft"
   */
  variant?: BadgeVariant;
} & XstyleProp;

/**
 * Status / label chip (baseline `Badge` anatomy). Set `onRemove` for a
 * removable token (filters, multi-select) — Atelier's extension over a static
 * Badge, so there is no separate `Tag` component.
 */
export function Badge({
  children,
  className,
  dot = false,
  onRemove,
  removeLabel = "Remove",
  size = "md",
  tone = "neutral",
  variant = "soft",
  xstyle,
  ...props
}: BadgeProps) {
  const theme = themeProps("badge", { size, tone, variant });
  return (
    <span
      {...props}
      {...theme}
      className={cx(
        sx(
          statusChip.root,
          statusChipSizeStyles[size],
          transition.colors,
          variant === "outline" && statusChip.outline,
          variantToneStyles[variant][tone],
          onRemove ? styles.removable : null,
          xstyle,
        ),
        theme.className,
        className,
      )}
    >
      {dot ? (
        <span
          aria-hidden
          className={sx(styles.dot)}
          {...themeSlotProps("badge", "dot")}
        />
      ) : null}
      {withTruncatingLabels(
        children,
        styles.label,
        themeSlotProps("badge", "label"),
      )}
      {onRemove ? (
        <button
          aria-label={removeLabel}
          className={cx(
            sx(
              valueToken.remove,
              styles.removeInk,
              transition.control,
              touchTarget.coarse,
              focusRing.ring,
            ),
            themeTargetClassName("badge-remove"),
          )}
          onClick={onRemove}
          type="button"
        >
          <X aria-hidden size={valueTokenRemoveIconSizes.md} />
        </button>
      ) : null}
    </span>
  );
}

const styles = stylex.create({
  /**
   * The truncating label box: a real block container, so `text-overflow`
   * applies. `min-inline-size: 0` lets it shrink below its content size as a
   * flex item, which is what lets the ellipsis appear at all.
   */
  label: {
    display: "block",
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  removable: {
    paddingInlineEnd: vars["--ads-space-4"],
  },
  // Tone rides on the small dot (currentColor), not on extra surface area.
  dot: {
    backgroundColor: "currentColor",
    blockSize: 6,
    borderRadius: vars["--ads-radius-full"],
    flexShrink: 0,
    inlineSize: 6,
  },
  /**
   * Ink only. The 16px painted box, its radius, and its overlay hover/pressed
   * states are `recipes/value-token`'s `remove`, shared with `Combobox.Chip`.
   * The WCAG 2.5.8 floor is served by `touchTarget.coarse` at the call site (an
   * out-of-flow 44px pseudo-element under `(pointer: coarse)`), the same way
   * Checkbox/Switch/RadioGroup do it, instead of inflating the glyph square;
   * the root leaves overflow visible so that target stays hittable without
   * changing the badge's painted geometry.
   *
   * `inherit` is the whole declaration: the × takes the tone's own ink, so a
   * danger badge removes in red rather than in a second neutral.
   *
   * **This used to also fade the glyph to `opacity: 0.7`.** Against the badge's
   * own fill that measured 2.93:1 on the default `neutral` tone in light —
   * under the WCAG 1.4.11 3.0:1 floor for a non-text control, on the most
   * common removable object in the system. It survived because the five
   * semantic tones sit on darker ink and stayed above the floor (3.20–5.33),
   * and because neutral reads as "quiet on purpose" rather than as broken.
   * Removing the fade restores 5.38:1 and moves no geometry; hover is now an
   * overlay, which is what every other quiet icon control in ADS already used.
   */
  removeInk: {
    color: "inherit",
  },
  // `warm` is a deprecated alias of `warning` and rendered identically because
  // the hue-named tokens it read held the same values. Those tokens are gone
  // (they named a shade, not a role); the alias reads the role tokens directly
  // now, so the prop keeps working with no rendered change.
});

const toneStyles = {
  ...statusChipSoftToneStyles,
  warm: statusChipSoftToneStyles.warning,
} as const;

const outlineToneStyles = {
  ...statusChipOutlineToneStyles,
  warm: statusChipOutlineToneStyles.warning,
} as const;

/**
 * The seven `solid` pairs now live in `recipes/status-chip` — `Badge solid` is
 * no longer the system's only solid semantic object, and `Indicator`'s corner
 * mark reads the same rows. `warm` keeps its deprecated alias here, where the
 * rest of `Badge`'s back-compat lives, rather than leaking a deprecated name
 * into a shared recipe.
 */
const solidToneStyles = {
  ...statusChipSolidToneStyles,
  warm: statusChipSolidToneStyles.warning,
} as const;

/**
 * variant → tone → style. One lookup instead of the previous ternary chain, so
 * a third variant cannot be added without deciding its tone row.
 */
const variantToneStyles = {
  outline: outlineToneStyles,
  soft: toneStyles,
  solid: solidToneStyles,
} as const satisfies Record<BadgeVariant, Record<BadgeTone, unknown>>;

export {
  styles as badgeStyles,
  toneStyles as badgeToneStyles,
  outlineToneStyles as badgeOutlineToneStyles,
};
