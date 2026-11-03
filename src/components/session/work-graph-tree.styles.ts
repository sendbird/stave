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
    flexShrink: 0,
  },
  /* The heading and its counts share one baseline; the counts wrap under the
     heading in a narrow rail rather than squeezing it. */
  headingRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: vars["--ads-space-8"],
    rowGap: vars["--ads-space-2"],
    minWidth: 0,
  },
  summary: {
    margin: 0,
    minWidth: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1rem",
    fontVariantNumeric: "tabular-nums",
    color: vars["--ads-color-text-muted"],
  },
  list: {
    marginTop: vars["--ads-space-4"],
    marginBottom: 0,
    marginInline: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    minWidth: 0,
    flexDirection: "column",
  },
  rowRevealable: { cursor: "pointer" },
  /* Same box as the status mark beside it (20px tall, centred), so the
     chevron lines up with the label's first line however the copy wraps. */
  disclosure: {
    display: "flex",
    height: 20,
    width: vars["--ads-control-icon-size-sm"],
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    color: vars["--ads-color-text-muted"],
  },
  disclosureInteractive: { cursor: "pointer" },
  disclosureIcon: {
    width: vars["--ads-control-icon-size-sm"],
    height: vars["--ads-control-icon-size-sm"],
  },
  /* "Show 2 subagents of …": the fold says what it hides, in the detail's
     step, and opens the branch when pressed. */
  foldHint: {
    margin: 0,
    width: "fit-content",
    maxWidth: "100%",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1rem",
    color: vars["--ads-color-text-muted"],
    cursor: "pointer",
    overflowWrap: "anywhere",
    textDecorationLine: {
      default: "none",
      "@media (hover: hover)": { default: "none", ":hover": "underline" },
    },
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
    borderRadius: vars["--ads-radius-control"],
    paddingInline: vars["--ads-space-8"],
    paddingBlock: "0.375rem",
    // Hover is a pointer affordance: a touch tap must not leave a fill behind.
    backgroundColor: {
      default: "transparent",
      "@media (hover: hover)": {
        default: "transparent",
        ":hover": vars["--ads-color-overlay-hover"],
      },
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
  labelExpanded: {
    display: "-webkit-box",
    overflow: "hidden",
    overflowWrap: "anywhere",
    textOverflow: "unset",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 3,
    whiteSpace: "normal",
  },
  labelLineExpanded: {
    alignItems: "flex-start",
    flexWrap: "wrap",
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
  detailExpanded: {
    overflowWrap: "anywhere",
    WebkitLineClamp: 4,
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
    fontSize: vars["--ads-font-size-caption"],
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
