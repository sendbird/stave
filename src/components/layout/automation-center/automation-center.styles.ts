import * as stylex from "@stylexjs/stylex";

import { vars } from "../../aui/tokens/tokens.stylex";

/**
 * Semantic run tones translated to AUI visual roles. `automation-center.utils`
 * stays value-only; this module is where a tone becomes paint.
 */
export const runToneDotStyles = stylex.create({
  neutral: { backgroundColor: vars["--aui-color-text-muted"] },
  accent: { backgroundColor: vars["--aui-color-accent"] },
  info: { backgroundColor: vars["--aui-color-info"] },
  warning: { backgroundColor: vars["--aui-color-warning"] },
  success: { backgroundColor: vars["--aui-color-success"] },
  danger: { backgroundColor: vars["--aui-color-danger"] },
});

/** Chrome shared by every automation-center panel. */
export const automationStyles = stylex.create({
  /** Dense status chip: the Badge default box is too tall for these rows. */
  statusBadge: {
    flexShrink: 0,
    fontSize: vars["--aui-font-size-micro"],
    minBlockSize: 20,
    paddingInline: vars["--aui-space-4"],
  },
  /** Small uppercase section eyebrow. */
  eyebrow: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    letterSpacing: "0.08em",
    margin: 0,
    textTransform: "uppercase",
  },
  sectionHeading: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "0.12em",
    margin: 0,
    textTransform: "uppercase",
  },
  statusDot: {
    blockSize: 8,
    borderRadius: vars["--aui-radius-full"],
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
