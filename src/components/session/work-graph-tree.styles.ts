import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

const rowFadeIn = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

export const workGraphTreeStyles = stylex.create({
  root: { minWidth: 0 },
  /* Body-semibold, and no uppercase or tracking: those were standing in
     for a hierarchy the step now supplies directly, and at 11px they cost
     the x-height and word-shape cues that make a header scannable in the
     first place. Matches the section headers in the changes panel and the
     workspace sidebar. */
  heading: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
    color: vars.colorTextMuted,
    margin: 0,
  },
  list: {
    marginTop: vars.space4,
    display: "flex",
    minWidth: 0,
    flexDirection: "column",
  },
  completedToggle: { marginTop: vars.space4, color: vars.colorTextMuted },
  // Glyphs inside controls take the control-icon floor; the 12px marks left
  // at a raw size in this file are status marks and graph nodes, not affordances.
  toggleIcon: { width: vars.controlIconSizeSm, height: vars.controlIconSizeSm },
  row: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: vars.space2,
    borderRadius: vars.radiusPanel,
    paddingInline: vars.space8,
    paddingBlock: "0.375rem",
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
    },
    animationName: {
      default: rowFadeIn,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: {
      default: "200ms",
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    animationTimingFunction: vars.motionEaseStandard,
  },
  statusIconWrap: {
    display: "flex",
    height: 20,
    flexShrink: 0,
    alignItems: "center",
  },
  body: { minWidth: 0, flex: 1 },
  labelLine: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: "0.375rem",
    fontSize: vars.fontSizeBody,
    lineHeight: "1.25rem",
    margin: 0,
  },
  labelLineTerminal: { color: vars.colorTextMuted },
  label: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: vars.fontWeightMedium,
  },
  detail: {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    fontSize: vars.fontSizeCaption,
    lineHeight: "1rem",
    color: vars.colorTextMuted,
    margin: 0,
  },
  // An error the user has to read, so it takes the status/alert step. The
  // 16px clamp line was sized for Micro and would crop 14px descenders.
  controlError: {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    color: vars.colorDanger,
    margin: 0,
  },
  elapsed: {
    flexShrink: 0,
    paddingTop: "0.125rem",
    fontSize: vars.fontSizeCaption,
    lineHeight: "1rem",
    fontVariantNumeric: "tabular-nums",
    color: vars.colorTextMuted,
  },
  content: {
    marginBlock: `calc(-1 * ${vars.space4} - 0.125rem)`,
    display: "flex",
    minWidth: 0,
    flex: 1,
    alignItems: "flex-start",
    gap: "0.625rem",
    borderRadius: vars.radiusControl,
    paddingBlock: "0.375rem",
    textAlign: "left",
  },
  contentRevealable: {
    cursor: "pointer",
    backgroundColor: "transparent",
  },
  controls: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    gap: vars.space2,
  },
  controlIcon: { width: vars.controlIconSizeSm, height: vars.controlIconSizeSm },
  badge: {
    flexShrink: 0,
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    paddingInline: vars.space4,
    fontSize: vars.fontSizeMicro,
    lineHeight: "1rem",
    fontWeight: vars.fontWeightMedium,
    letterSpacing: "0.025em",
  },
  badgeNeutral: {
    borderColor: vars.colorBorder,
    color: vars.colorTextMuted,
  },
  badgeWarning: {
    borderColor: vars.colorWarningBorder,
    color: vars.colorWarning,
  },
});
