import * as stylex from "@stylexjs/stylex";

import { vars } from "../../ads/tokens/tokens.stylex";

/**
 * Semantic run tones translated to ADS visual roles. `automation-center.utils`
 * stays value-only; this module is where a tone becomes paint.
 */
export const runToneDotStyles = stylex.create({
  neutral: { backgroundColor: vars.colorTextMuted },
  accent: { backgroundColor: vars.colorAccent },
  info: { backgroundColor: vars.colorInfo },
  warning: { backgroundColor: vars.colorWarning },
  success: { backgroundColor: vars.colorSuccess },
  danger: { backgroundColor: vars.colorDanger },
});

/** Chrome shared by every automation-center panel. */
export const automationStyles = stylex.create({
  /** Dense status chip: the Badge default box is too tall for these rows. */
  statusBadge: {
    flexShrink: 0,
    fontSize: 9,
    minBlockSize: 20,
    paddingInline: vars.space4,
  },
  /** Small uppercase section eyebrow. */
  eyebrow: {
    color: vars.colorTextMuted,
    fontSize: 9,
    letterSpacing: "0.12em",
    margin: 0,
    textTransform: "uppercase",
  },
  sectionHeading: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "0.12em",
    margin: 0,
    textTransform: "uppercase",
  },
  statusDot: {
    blockSize: 8,
    borderRadius: vars.radiusFull,
    flexShrink: 0,
    inlineSize: 8,
  },
  truncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  smallIcon: { blockSize: 14, inlineSize: 14 },
});
