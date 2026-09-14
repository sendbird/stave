import * as stylex from "@stylexjs/stylex";

import { vars } from "../../ads/tokens/tokens.stylex";

/**
 * Semantic run tones translated to ADS visual roles. `automation-center.utils`
 * stays value-only; this module is where a tone becomes paint.
 */
export const runToneDotStyles = stylex.create({
  neutral: { backgroundColor: vars["--ads-color-text-muted"] },
  accent: { backgroundColor: vars["--ads-color-accent"] },
  info: { backgroundColor: vars["--ads-color-info"] },
  warning: { backgroundColor: vars["--ads-color-warning"] },
  success: { backgroundColor: vars["--ads-color-success"] },
  danger: { backgroundColor: vars["--ads-color-danger"] },
});

/** Chrome shared by every automation-center panel. */
export const automationStyles = stylex.create({
  /** Dense status chip: the Badge default box is too tall for these rows. */
  statusBadge: {
    flexShrink: 0,
    fontSize: vars["--ads-font-size-micro"],
    minBlockSize: 20,
    paddingInline: vars["--ads-space-4"],
  },
  /** Small uppercase section eyebrow. */
  eyebrow: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    letterSpacing: "0.12em",
    margin: 0,
    textTransform: "uppercase",
  },
  sectionHeading: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.12em",
    margin: 0,
    textTransform: "uppercase",
  },
  statusDot: {
    blockSize: 8,
    borderRadius: vars["--ads-radius-full"],
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
