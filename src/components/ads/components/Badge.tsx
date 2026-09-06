import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";
import * as React from "react";

import { focusRing } from "../recipes/focus-ring";
import { touchTarget } from "../recipes/touch-target";
import { transition } from "../recipes/transition";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "info"
  | "warning"
  /** @deprecated Alias of `"warning"` (renders identically) — use `tone="warning"`; removal reserved for the next major. */
  | "warm"
  | "success"
  | "danger";

export type BadgeVariant = "soft" | "outline";

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
  /**
   * Semantic color family. `"warm"` is a deprecated alias of `"warning"`
   * (identical rendering); it keeps working until the next major.
   * @default "neutral"
   */
  tone?: BadgeTone;
  /**
   * Visual style: `soft` = tinted fill (default), `outline` = hairline border
   * on a transparent background with tone-colored text.
   * @default "soft"
   */
  variant?: BadgeVariant;
};

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
  tone = "neutral",
  variant = "soft",
  ...props
}: BadgeProps) {
  return (
    <span
      {...props}
      className={cx(
        sx(
          styles.root,
          transition.colors,
          variant === "outline" && styles.outlineBase,
          variant === "outline" ? outlineToneStyles[tone] : toneStyles[tone],
          onRemove ? styles.removable : null,
        ),
        className,
      )}
    >
      {dot ? <span aria-hidden className={sx(styles.dot)} /> : null}
      {withTruncatingLabels(children)}
      {onRemove ? (
        <button
          aria-label={removeLabel}
          className={sx(
            styles.remove,
            transition.control,
            touchTarget.coarse,
            focusRing.ring,
          )}
          onClick={onRemove}
          type="button"
        >
          <X aria-hidden size={12} />
        </button>
      ) : null}
    </span>
  );
}

/**
 * `text-overflow` only applies to a **block container**. The Badge root is a
 * flex container (it has to be — dot, label, remove button), so its bare text
 * lived in an anonymous flex item that never inherited the property, and the
 * `overflow`/`text-overflow`/`white-space` triple on the root clipped long
 * labels mid-glyph instead of eliding them.
 *
 * The truncation therefore moves onto a real block child — the same
 * `recipes/menu.ts` `itemLabel` pattern `Button` now uses. Only *text* children
 * are wrapped so element children stay direct flex items and the `gap` between
 * the dot, the label and the remove button is unchanged.
 */
function withTruncatingLabels(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child) =>
    typeof child === "string" || typeof child === "number" ? (
      <span className={sx(styles.label)}>{child}</span>
    ) : (
      child
    ),
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    // Transitions come from `recipes/transition` (`transition.colors`),
    // composed at the call site.
    // Transparent by default so `soft` and `outline` share metrics.
    borderColor: "transparent",
    borderRadius: vars.radiusFull,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "inline-flex",
    fontSize: vars.fontSizeCaption,
    // A badge is the system's default home for a count, and a proportional
    // ramp makes "9 → 10 → 11" change the chip's own width as it updates,
    // nudging everything after it in the row. Tabular figures pin every digit
    // to one advance width.
    fontVariantNumeric: "tabular-nums",
    // §5 weight roles: 600 is reserved for titles and genuinely strong
    // headings. A badge is a label on a small object, and its emphasis already
    // comes from the tone fill and the chip itself — a weight jump on top of
    // those is the third signal §5 tells you not to reach for.
    fontWeight: vars.fontWeightMedium,
    gap: vars.space4,
    justifySelf: "start",
    lineHeight: vars.lineHeightTight,
    maxInlineSize: "100%",
    minBlockSize: 24,
    minInlineSize: 0,
    // The label owns overflow clipping. The root must stay visible so the
    // removable button's coarse-pointer hit area can bleed beyond the 24px
    // painted chip instead of being clipped back to the failing target size.
    paddingBlock: 0,
    paddingInline: vars.space8,
    whiteSpace: "nowrap",
  },
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
    paddingInlineEnd: vars.space4,
  },
  // Tone rides on the small dot (currentColor), not on extra surface area.
  dot: {
    backgroundColor: "currentColor",
    blockSize: 6,
    borderRadius: vars.radiusFull,
    flexShrink: 0,
    inlineSize: 6,
  },
  /*
   * 16px painted box, unchanged — the chip's proportions depend on it. The
   * WCAG 2.5.8 floor is served by `touchTarget.coarse` at the call site (an
   * out-of-flow 44px pseudo-element under `(pointer: coarse)`), the same way
   * Checkbox/Switch/RadioGroup do it, instead of inflating the glyph square.
   * The root deliberately leaves overflow visible so the full coarse-pointer
   * target remains hittable without changing the badge's painted geometry.
   */
  remove: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
      ":active": vars.colorOverlayPressed,
    },
    blockSize: 16,
    borderRadius: vars.radiusFull,
    borderStyle: "none",
    color: "inherit",
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    inlineSize: 16,
    justifyContent: "center",
    opacity: { default: 0.7, ":hover": 1 },
    padding: 0,
  },
  neutral: {
    backgroundColor: vars.colorCanvasSubtle,
    color: vars.colorTextMuted,
  },
  accent: {
    backgroundColor: vars.colorAccentSoft,
    color: vars.colorAccent,
  },
  info: {
    backgroundColor: vars.colorInfoSoft,
    color: vars.colorInfoText,
  },
  // `warm` is a deprecated alias of `warning` and rendered identically because
  // the hue-named tokens it read held the same values. Those tokens are gone
  // (they named a shade, not a role); the alias reads the role tokens directly
  // now, so the prop keeps working with no rendered change.
  warm: {
    backgroundColor: vars.colorWarningSoft,
    color: vars.colorWarningText,
  },
  warning: {
    backgroundColor: vars.colorWarningSoft,
    color: vars.colorWarningText,
  },
  success: {
    backgroundColor: vars.colorSuccessSoft,
    color: vars.colorSuccessText,
  },
  danger: {
    backgroundColor: vars.colorDangerSoft,
    color: vars.colorDangerText,
  },
  // Outline: neutral hairline, tone carried by text (and the `dot`).
  outlineBase: {
    backgroundColor: "transparent",
    borderColor: vars.colorBorder,
  },
  outlineNeutral: { color: vars.colorTextMuted },
  outlineAccent: { color: vars.colorAccent },
  outlineInfo: { color: vars.colorInfoText },
  outlineWarm: { color: vars.colorWarningText },
  outlineWarning: { color: vars.colorWarningText },
  outlineSuccess: { color: vars.colorSuccessText },
  outlineDanger: { color: vars.colorDangerText },
});

const toneStyles = {
  accent: styles.accent,
  danger: styles.danger,
  info: styles.info,
  neutral: styles.neutral,
  success: styles.success,
  warning: styles.warning,
  warm: styles.warm,
} as const;

const outlineToneStyles = {
  accent: styles.outlineAccent,
  danger: styles.outlineDanger,
  info: styles.outlineInfo,
  neutral: styles.outlineNeutral,
  success: styles.outlineSuccess,
  warning: styles.outlineWarning,
  warm: styles.outlineWarm,
} as const;

export { styles as badgeStyles, toneStyles as badgeToneStyles, outlineToneStyles as badgeOutlineToneStyles };
