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
    gap: vars["--ads-space-4"],
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 80%, transparent)`,
    backgroundColor: vars["--ads-color-canvas-subtle"],
    paddingInline: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text"],
  },
  triggerOpen: {
    borderColor: `color-mix(in oklch, ${vars["--ads-color-accent"]} 60%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-canvas-subtle"]} 90%, ${vars["--ads-color-mix-ink"]})`,
  },
  triggerIcon: {
    inlineSize: vars["--ads-control-icon-size-sm"],
    blockSize: vars["--ads-control-icon-size-sm"],
    flexShrink: 0,
    color: vars["--ads-color-text-muted"],
  },
  menu: {
    minInlineSize: "11rem",
  },
});
