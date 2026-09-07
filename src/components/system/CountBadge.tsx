import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

export type CountBadgeTone = "accent" | "warning" | "neutral";

/**
 * The count pill a chrome control wears in its corner: unread notifications,
 * tasks needing attention, open terminals in a pane toolbar.
 *
 * Four surfaces had grown four of these — 20px accent (notifications), 16px
 * warning (Tasks, Fleet attention), 14px neutral (Lens toolbar) — with three
 * different ring colors, three type sizes and three hand-written negative
 * offsets. One box, one type step, one ring; the only thing that varies is
 * TONE, because that is the only thing that differed on purpose (a count that
 * needs a decision is not a count that reports a total).
 *
 * It renders the mark only. The ANCHOR belongs to ADS `Button indicator`,
 * which owns the corner, the overhang and lifting the button's own overflow
 * clamp — the clamp is why every one of those four badges shipped with two
 * flat sides. Pass this as `indicator=`, never as a positioned child.
 */
export function CountBadge({
  cap = 99,
  count,
  tone = "accent",
}: {
  /** Largest number shown literally; above it the label becomes `<cap>+`. */
  cap?: number;
  count: number;
  /**
   * `accent` — something new arrived. `warning` — something is waiting on the
   * user. `neutral` — a total, reported without urgency. @default "accent"
   */
  tone?: CountBadgeTone;
}) {
  return (
    <span {...stylex.props(styles.root, toneStyles[tone])}>
      {count > cap ? `${cap}+` : count}
    </span>
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    borderRadius: vars.radiusFull,
    // A knockout ring, so the pill separates from the glyph it overlaps
    // instead of merging with it. Hairline in the page fill: both hosts (the
    // top bar and a pane toolbar) sit on canvas-family chrome, and a ring that
    // follows the ink instead would read as a second, heavier pill.
    borderColor: vars.colorCanvas,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "inline-flex",
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightSemibold,
    justifyContent: "center",
    // `1` and not a token: the pill is a single glyph row whose box is set by
    // the two metrics below, so any leading at all would push the digits off
    // centre.
    lineHeight: 1,
    minBlockSize: 16,
    // Not `inlineSize`: `99+` is wider than `9`, and the pill grows rather
    // than clipping. The 16px floor keeps a one-digit count circular.
    minInlineSize: 16,
    paddingInline: vars.space4,
  },
  accent: {
    backgroundColor: vars.colorAccent,
    color: vars.colorAccentText,
  },
  // The soft pair, not `colorWarning` + `colorText`. ADS declares exactly one
  // foreground for a solid fill — `colorAccentText` on `colorAccent` — and
  // `colorText` is a body-ink role whose contract is "reads on the surface
  // ramp", not "reads on a saturated amber". It measured ~7.6:1 in the default
  // light theme and ~1.8:1 in the default dark one, and worse in the ported
  // themes (Dracula's pale yellow under near-white body ink is ~1.05:1), so
  // the loudest pill in the chrome was the one nobody could read. The soft
  // fill with its declared text step is legible in every theme, and the
  // warning-coloured ring keeps it reading as a deliberate amber mark rather
  // than a wash.
  warning: {
    backgroundColor: vars.colorWarningSoft,
    borderColor: vars.colorWarningBorder,
    color: vars.colorWarningText,
  },
  neutral: {
    // The one tone that states its own edge: a neutral fill has no contrast
    // against the chrome behind it, so the ring has to carry the perimeter.
    // `colorCanvasSubtle` and not `colorSurfaceTint`, which is byte-identical
    // to `colorAccentSoft` in the default light theme — so on a selected,
    // accent-tinted host the pill's fill vanished into the control behind it
    // and only the hairline was left to say a pill was there.
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    color: vars.colorTextMuted,
  },
});

const toneStyles = {
  accent: styles.accent,
  neutral: styles.neutral,
  warning: styles.warning,
} as const;
