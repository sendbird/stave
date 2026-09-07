import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import type { PrStatusTone } from "@/lib/pr-status";

/**
 * `src/lib/pr-status.ts` publishes a semantic tone and nothing else. This module
 * is the single place that turns that tone into Git service-token visuals.
 *
 * The `var(--service-git-*)` strings must stay literals here. StyleX treats an
 * imported theme helper as a `.stylex.ts` module and fails the isolated test
 * transform otherwise.
 */

const gitOpenInk = `color-mix(in oklab, ${vars.colorText} 45%, var(--service-git-open))`;
const gitMergedInk = `color-mix(in oklab, ${vars.colorText} 45%, var(--service-git-merged))`;
const gitClosedInk = `color-mix(in oklab, ${vars.colorText} 45%, var(--service-git-closed))`;
const gitModifiedInk = `color-mix(in oklab, ${vars.colorText} 45%, var(--service-git-modified))`;
const gitOpenSoft = `color-mix(in oklab, var(--service-git-open) 12%, ${vars.colorSurface})`;
const gitMergedSoft = `color-mix(in oklab, var(--service-git-merged) 12%, ${vars.colorSurface})`;
const gitClosedSoft = `color-mix(in oklab, var(--service-git-closed) 12%, ${vars.colorSurface})`;
const gitModifiedSoft = `color-mix(in oklab, var(--service-git-modified) 12%, ${vars.colorSurface})`;
const gitOpenHover = `color-mix(in oklab, var(--service-git-open) 18%, ${vars.colorSurface})`;

/** Foreground tint for a status glyph. */
export const prToneIconStyles = stylex.create({
  neutral: { color: vars.colorTextMuted },
  open: { color: gitOpenInk },
  attention: { color: gitModifiedInk },
  danger: { color: gitClosedInk },
  done: { color: gitMergedInk },
  closed: { color: gitClosedInk },
});

export const prStatusIconStyles = stylex.create({
  glyph: { width: 14, height: 14, flexShrink: 0 },
});

/**
 * Canonical chip fills, addressed by PR tone. Host-owned so a merged chip can
 * be purple even when the theme accent is cobalt.
 */
export const prToneBadgeStyles = stylex.create({
  neutral: {
    backgroundColor: vars.colorCanvasSubtle,
    color: vars.colorTextMuted,
  },
  open: {
    backgroundColor: gitOpenSoft,
    color: gitOpenInk,
  },
  attention: {
    backgroundColor: gitModifiedSoft,
    color: gitModifiedInk,
  },
  danger: {
    backgroundColor: gitClosedSoft,
    color: gitClosedInk,
  },
  done: {
    backgroundColor: gitMergedSoft,
    color: gitMergedInk,
  },
  closed: {
    backgroundColor: gitClosedSoft,
    color: gitClosedInk,
  },
});

/** Create-PR trigger treatment for a branch with no linked PR yet. */
export const prCreateButtonStyles = stylex.create({
  trigger: {
    backgroundColor: {
      default: gitOpenSoft,
      ":hover": gitOpenHover,
    },
    borderColor: vars.colorBorder,
    boxShadow: vars.elevationRaised,
    color: gitOpenInk,
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
