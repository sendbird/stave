import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * Chrome only. Geometry belongs to ADS: the trigger takes its height from
 * `size="sm"` (`controlHeights.sm`, 32) rather than restating `2rem`, and the
 * popup surface, radius, elevation, padding and item rows come from
 * `recipes/menu` through the `dropdown-menu` shim.
 *
 * `--secondary` is a subtle tinted surface with no ADS token twin, so the
 * quiet trigger fill mixes toward the canvas-subtle token. The hover washes
 * follow the ADS overlay-wash rule rather than re-tinting `secondary`.
 */
export const permissionModeSelectorStyles = stylex.create({
  trigger: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars.space4,
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 80%, transparent)`,
    backgroundColor: vars.colorCanvasSubtle,
    paddingInline: vars.space8,
    fontSize: vars.fontSizeBody,
    color: vars.colorText,
  },
  triggerOpen: {
    borderColor: `color-mix(in oklch, ${vars.colorAccent} 60%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorCanvasSubtle} 90%, ${vars.colorMixInk})`,
  },
  triggerIcon: {
    inlineSize: vars.controlIconSizeSm,
    blockSize: vars.controlIconSizeSm,
    flexShrink: 0,
    color: vars.colorTextMuted,
  },
  menu: {
    minInlineSize: "11rem",
  },
});
