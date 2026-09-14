import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { vars } from "../tokens/tokens.stylex";
import { themeProps } from "../theming/theme-props";
import { cx, sx, type XstyleProp } from "../utils/stylex";

/**
 * Tile scale, expressed on the shared control-height rungs so a tile that
 * leads a 36px row is the same box as the control beside it: `xs` 28, `sm` 32,
 * `md` 36, `lg` 40. `xl` (48) is the one rung above the control scale — the
 * hero/empty-state medallion, which leads a page rather than a row.
 */
export type IconTileSize = "xs" | "sm" | "md" | "lg" | "xl";

export type IconTileTone =
  | "neutral"
  | "accent"
  | "info"
  | "warning"
  | "success"
  | "danger";

/**
 * `squared` (radiusControl) matches the row and card leads it sits beside;
 * `round` is the medallion treatment for a centred hero or a list rail where
 * the tile stands alone rather than aligning to a control edge.
 */
export type IconTileShape = "round" | "squared";

export type IconTileProps = React.ComponentProps<"span"> & {
  /** Box scale on the control-height rungs, plus `xl` for a hero medallion. @default "md" */
  size?: IconTileSize;
  /** Corner treatment. @default "squared" */
  shape?: IconTileShape;
  /**
   * Semantic color family, resolved through the same `*Soft` + `*Text` role
   * pairs every other tinted object in the system reads.
   * @default "neutral"
   */
  tone?: IconTileTone;
} & XstyleProp;

/**
 * Decorative tinted container for a single glyph, number, or letterform: the
 * lead of a list row, an integration or feature card, a dialog header, and the
 * empty-state medallion.
 *
 * It is deliberately **not** interactive — every tile in the repository is an
 * `aria-hidden` span inside an interactive ancestor, so the tile owns no tab
 * stop, focus ring, or hover wash. Wrap it in `Button`/`Item`/`Link` when the
 * whole row is the target.
 *
 * The glyph is the caller's: pass an icon at `iconTileGlyphSizes[size]` rather
 * than picking a pixel by hand.
 */
export function IconTile({
  className,
  shape = "squared",
  size = "md",
  tone = "neutral",
  xstyle,
  ...props
}: IconTileProps) {
  const theme = themeProps("icon-tile", { size, tone });
  return (
    <span
      {...props}
      {...theme}
      aria-hidden={props["aria-hidden"] ?? true}
      className={cx(
        sx(
          styles.root,
          sizeStyles[size],
          shape === "round" ? styles.round : styles.squared,
          toneStyles[tone],
          xstyle,
        ),
        theme.className,
        className,
      )}
    />
  );
}

/**
 * Glyph size per tile rung. Exported for the same reason
 * `statusChipIconSizes` is: the tile cannot size an arbitrary child node, and
 * every site that picked its own pixel drifted.
 */
export const iconTileGlyphSizes: Record<IconTileSize, number> = {
  xs: 14,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
};

const styles = stylex.create({
  root: {
    alignItems: "center",
    // The rim is unconditional. A tile's fill is one step from its host —
    // measured against `colorSurfaceRaised`, neutral separates at ΔE 3.08
    // (light) / 2.75 (dark), roughly half of every semantic tint (5.5–8.5),
    // and in light `colorAccentSoft` IS `colorCanvasSubtle`, so accent is
    // exactly as faint. Half the sites had already added this hairline by hand
    // and half had not, for no stated reason. `EmptyState`'s own root says the
    // rule: depth against the canvas comes from the surface step + hairline.
    borderColor: vars["--ads-color-border"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxSizing: "border-box",
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-semibold"],
    justifyContent: "center",
    lineHeight: vars["--ads-line-height-tight"],
  },
  round: { borderRadius: vars["--ads-radius-full"] },
  squared: { borderRadius: vars["--ads-radius-control"] },
  xs: {
    blockSize: vars["--ads-control-height-xs"],
    inlineSize: vars["--ads-control-height-xs"],
  },
  sm: {
    blockSize: vars["--ads-control-height-sm"],
    inlineSize: vars["--ads-control-height-sm"],
  },
  md: {
    blockSize: vars["--ads-control-height-md"],
    inlineSize: vars["--ads-control-height-md"],
  },
  lg: {
    blockSize: vars["--ads-control-height-lg"],
    inlineSize: vars["--ads-control-height-lg"],
  },
  xl: {
    blockSize: 48,
    inlineSize: 48,
  },
  toneNeutral: {
    // `colorCanvasSubtle`, not `colorSurfaceTint`. In light the two are the
    // same value, so a site could pick either and look correct; in dark
    // `colorSurfaceTint` (L 0.22) falls BELOW `colorSurfaceRaised` (0.2475)
    // while every `*Soft` tint rises above it. A tint that reads as a lift in
    // one theme and a hole in the other is not one object.
    backgroundColor: vars["--ads-color-canvas-subtle"],
    color: vars["--ads-color-text-muted"],
  },
  toneAccent: {
    // selection-ok: this tint identifies a decorative accent tile, not a
    // selected/current surface.
    backgroundColor: vars["--ads-color-accent-soft"],
    color: vars["--ads-color-accent"],
  },
  toneInfo: {
    // `colorInfoText`, not `colorInfo` — the ink/surface pair the color policy
    // declares for this fill. `colorInfo` on `colorInfoSoft` is 4.42:1.
    backgroundColor: vars["--ads-color-info-soft"],
    color: vars["--ads-color-info-text"],
  },
  toneWarning: {
    backgroundColor: vars["--ads-color-warning-soft"],
    color: vars["--ads-color-warning-text"],
  },
  toneSuccess: {
    backgroundColor: vars["--ads-color-success-soft"],
    color: vars["--ads-color-success-text"],
  },
  toneDanger: {
    backgroundColor: vars["--ads-color-danger-soft"],
    color: vars["--ads-color-danger-text"],
  },
});

const sizeStyles = {
  lg: styles.lg,
  md: styles.md,
  sm: styles.sm,
  xl: styles.xl,
  xs: styles.xs,
} as const;

const toneStyles = {
  accent: styles.toneAccent,
  danger: styles.toneDanger,
  info: styles.toneInfo,
  neutral: styles.toneNeutral,
  success: styles.toneSuccess,
  warning: styles.toneWarning,
} as const;
