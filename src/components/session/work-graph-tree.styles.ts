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
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    color: vars["--ads-color-text-muted"],
    margin: 0,
  },
  list: {
    marginTop: vars["--ads-space-4"],
    display: "flex",
    minWidth: 0,
    flexDirection: "column",
  },
  completedToggle: { marginTop: vars["--ads-space-4"], color: vars["--ads-color-text-muted"] },
  // Glyphs inside controls take the control-icon floor; the 12px marks left
  // at a raw size in this file are status marks and graph nodes, not affordances.
  toggleIcon: { width: vars["--ads-control-icon-size-sm"], height: vars["--ads-control-icon-size-sm"] },
  row: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: vars["--ads-space-2"],
    borderRadius: vars["--ads-radius-panel"],
    paddingInline: vars["--ads-space-8"],
    paddingBlock: "0.375rem",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
    animationName: {
      default: rowFadeIn,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: {
      default: "200ms",
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    animationTimingFunction: vars["--ads-motion-ease-standard"],
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
    fontSize: vars["--ads-font-size-body"],
    lineHeight: "1.25rem",
    margin: 0,
  },
  labelLineTerminal: { color: vars["--ads-color-text-muted"] },
  label: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: vars["--ads-font-weight-medium"],
  },
  detail: {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1rem",
    color: vars["--ads-color-text-muted"],
    margin: 0,
  },
  // An error the user has to read, so it takes the status/alert step. The
  // 16px clamp line was sized for Micro and would crop 14px descenders.
  controlError: {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-danger"],
    margin: 0,
  },
  elapsed: {
    flexShrink: 0,
    paddingTop: "0.125rem",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1rem",
    fontVariantNumeric: "tabular-nums",
    color: vars["--ads-color-text-muted"],
  },
  content: {
    marginBlock: `calc(-1 * ${vars["--ads-space-4"]} - 0.125rem)`,
    display: "flex",
    minWidth: 0,
    flex: 1,
    alignItems: "flex-start",
    gap: "0.625rem",
    borderRadius: vars["--ads-radius-control"],
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
    gap: vars["--ads-space-2"],
  },
  controlIcon: { width: vars["--ads-control-icon-size-sm"], height: vars["--ads-control-icon-size-sm"] },
  badge: {
    flexShrink: 0,
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    paddingInline: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-micro"],
    lineHeight: "1rem",
    fontWeight: vars["--ads-font-weight-medium"],
    letterSpacing: "0.025em",
  },
  badgeNeutral: {
    borderColor: vars["--ads-color-border"],
    color: vars["--ads-color-text-muted"],
  },
  badgeWarning: {
    borderColor: vars["--ads-color-warning-border"],
    color: vars["--ads-color-warning"],
  },
});
