import * as stylex from "@stylexjs/stylex";

import { badgeToneStyles } from "@/components/ads/components/Badge";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import type { PrStatusTone } from "@/lib/pr-status";

/**
 * `src/lib/pr-status.ts` publishes a semantic tone and nothing else. This module
 * is the single place that turns that tone into ADS visuals, mirroring how
 * `tracker-visual.styles.ts` translates the tracker tones from
 * `src/lib/tracker-tasks/presentation.ts`.
 */

/** Foreground tint for a status glyph. */
export const prToneIconStyles = stylex.create({
  neutral: { color: vars.colorTextMuted },
  open: { color: vars.colorSuccessText },
  attention: { color: vars.colorWarningText },
  danger: { color: vars.colorDangerText },
  done: { color: vars.colorAccent },
  closed: { color: vars.colorDangerText },
});

export const prStatusIconStyles = stylex.create({
  glyph: { width: 14, height: 14, flexShrink: 0 },
});

/**
 * The `ui` Badge variant that carries each tone. Callers rendering a real
 * `Badge` pass this instead of layering a second tone class on top of the one
 * the component already emits.
 */
export const PR_TONE_BADGE_VARIANT = {
  neutral: "secondary",
  open: "success",
  attention: "warning",
  danger: "destructive",
  done: "default",
  closed: "destructive",
} as const satisfies Record<PrStatusTone, string>;

/**
 * Canonical ADS badge tone fills, addressed by PR tone. Reused verbatim so a
 * status chip on a bare element matches a real `Badge` exactly.
 */
export const prToneBadgeStyles = {
  neutral: badgeToneStyles.neutral,
  open: badgeToneStyles.success,
  attention: badgeToneStyles.warning,
  danger: badgeToneStyles.danger,
  done: badgeToneStyles.accent,
  closed: badgeToneStyles.danger,
} as const;

/** Create-PR trigger treatment for a branch with no linked PR yet. */
export const prCreateButtonStyles = stylex.create({
  trigger: {
    // `colorSelectionFill` is the next step down the same accent tint ramp, so
    // hover reads as "more of the same accent", not as a neutral overlay.
    backgroundColor: {
      default: vars.colorAccentSoft,
      ":hover": vars.colorSelectionFill,
    },
    borderColor: vars.colorBorder,
    boxShadow: vars.elevationRaised,
    color: vars.colorText,
  },
});

/** Class-string forms for call sites that merge into a plain `className`. */
export const PR_TONE_ICON_CLASS: Record<PrStatusTone, string> = {
  neutral: sx(prToneIconStyles.neutral),
  open: sx(prToneIconStyles.open),
  attention: sx(prToneIconStyles.attention),
  danger: sx(prToneIconStyles.danger),
  done: sx(prToneIconStyles.done),
  closed: sx(prToneIconStyles.closed),
};

export const PR_TONE_BADGE_CLASS: Record<PrStatusTone, string> = {
  neutral: sx(prToneBadgeStyles.neutral),
  open: sx(prToneBadgeStyles.open),
  attention: sx(prToneBadgeStyles.attention),
  danger: sx(prToneBadgeStyles.danger),
  done: sx(prToneBadgeStyles.done),
  closed: sx(prToneBadgeStyles.closed),
};
