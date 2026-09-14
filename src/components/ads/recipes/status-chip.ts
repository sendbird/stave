import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

export type StatusChipSize = "sm" | "md";
export type StatusChipTone =
  | "neutral"
  | "accent"
  | "info"
  | "warning"
  | "success"
  | "danger";
export type StatusChipVariant = "soft" | "outline";

/**
 * Shared visual contract for small semantic status objects. It deliberately
 * reads the existing semantic role pairs (`*Soft` + `*Text`) rather than
 * introducing component-specific color values.
 */
export const statusChip = stylex.create({
  root: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: vars["--ads-radius-full"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "inline-flex",
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-medium"],
    gap: vars["--ads-space-4"],
    justifySelf: "start",
    lineHeight: vars["--ads-line-height-tight"],
    maxInlineSize: "100%",
    minInlineSize: 0,
    paddingBlock: 0,
    whiteSpace: "nowrap",
  },
  md: {
    fontSize: vars["--ads-font-size-caption"],
    minBlockSize: 24,
    paddingInline: vars["--ads-space-8"],
  },
  sm: {
    fontSize: vars["--ads-font-size-micro"],
    minBlockSize: 20,
    paddingInline: vars["--ads-space-4"],
  },
  outline: {
    backgroundColor: "transparent",
    borderColor: vars["--ads-color-border"],
  },
  softNeutral: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    color: vars["--ads-color-text-muted"],
  },
  softAccent: {
    backgroundColor: vars["--ads-color-accent-soft"],
    color: vars["--ads-color-accent"],
  },
  softInfo: {
    backgroundColor: vars["--ads-color-info-soft"],
    color: vars["--ads-color-info-text"],
  },
  softWarning: {
    backgroundColor: vars["--ads-color-warning-soft"],
    color: vars["--ads-color-warning-text"],
  },
  softSuccess: {
    backgroundColor: vars["--ads-color-success-soft"],
    color: vars["--ads-color-success-text"],
  },
  softDanger: {
    backgroundColor: vars["--ads-color-danger-soft"],
    color: vars["--ads-color-danger-text"],
  },
  outlineNeutral: { color: vars["--ads-color-text-muted"] },
  outlineAccent: { color: vars["--ads-color-accent"] },
  outlineInfo: { color: vars["--ads-color-info-text"] },
  outlineWarning: { color: vars["--ads-color-warning-text"] },
  outlineSuccess: { color: vars["--ads-color-success-text"] },
  outlineDanger: { color: vars["--ads-color-danger-text"] },
  /*
   * `solid` — one high-emphasis rung above `soft`, for the status that has to
   * be read before anything else in the view (an incident row's severity, a
   * live run, a hard-blocked ticket, an unread count on a collapsed rail). It
   * is deliberately the last resort in §1.2's placement rule, not a
   * decoration: a table where every chip is solid has no hierarchy left to
   * spend.
   *
   * The fill is the tone's BASE token — the same 600-step solid `Button tone`
   * paints — with `colorTextInverted` as the label. That pairing is gated at
   * 4.5:1 in `scripts/lib/color-policy.mjs` for every base token in all three
   * themes (light floors at `colorSuccess` 4.52:1, dark peaks past 8:1 with
   * its dark ink), so the variant cannot silently fall under the floor if a
   * token moves. Before the ramps were retuned the base tokens sat at 2.30:1 /
   * 2.54:1 and the variant had to borrow the darker `*Text` step as its fill;
   * that workaround is gone.
   *
   * `neutral` takes `colorTextMuted` rather than `colorText`: in light,
   * `colorAccent` is itself near-black (L 0.216), so a `colorText` fill
   * (L 0.16) would make the neutral and accent objects near-indistinguishable
   * — two tones, one rendering. `accent` keeps the `colorAccent` /
   * `colorAccentText` pair the primary Button already uses, so the strongest
   * object in the system matches the strongest control in the system.
   *
   * These rows live here rather than in `Badge` because `Badge solid` is no
   * longer the only solid semantic object: `Indicator`'s corner mark is always
   * solid (a count knocked out of its anchor cannot be a tint), and a second
   * private copy of the seven pairs is how two tone vocabularies drift apart.
   */
  solidNeutral: {
    backgroundColor: vars["--ads-color-text-muted"],
    color: vars["--ads-color-text-inverted"],
  },
  solidAccent: {
    backgroundColor: vars["--ads-color-accent"],
    color: vars["--ads-color-accent-text"],
  },
  solidInfo: {
    backgroundColor: vars["--ads-color-info"],
    color: vars["--ads-color-text-inverted"],
  },
  solidWarning: {
    backgroundColor: vars["--ads-color-warning"],
    color: vars["--ads-color-text-inverted"],
  },
  solidSuccess: {
    backgroundColor: vars["--ads-color-success"],
    color: vars["--ads-color-text-inverted"],
  },
  solidDanger: {
    backgroundColor: vars["--ads-color-danger"],
    color: vars["--ads-color-text-inverted"],
  },
});

export const statusChipSizeStyles = {
  md: statusChip.md,
  sm: statusChip.sm,
} as const;

export const statusChipSoftToneStyles = {
  accent: statusChip.softAccent,
  danger: statusChip.softDanger,
  info: statusChip.softInfo,
  neutral: statusChip.softNeutral,
  success: statusChip.softSuccess,
  warning: statusChip.softWarning,
} as const;

export const statusChipOutlineToneStyles = {
  accent: statusChip.outlineAccent,
  danger: statusChip.outlineDanger,
  info: statusChip.outlineInfo,
  neutral: statusChip.outlineNeutral,
  success: statusChip.outlineSuccess,
  warning: statusChip.outlineWarning,
} as const;

export const statusChipSolidToneStyles = {
  accent: statusChip.solidAccent,
  danger: statusChip.solidDanger,
  info: statusChip.solidInfo,
  neutral: statusChip.solidNeutral,
  success: statusChip.solidSuccess,
  warning: statusChip.solidWarning,
} as const;

export const statusChipIconSizes: Record<StatusChipSize, number> = {
  md: 14,
  sm: 12,
};
