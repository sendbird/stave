import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

const spin = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

/** Workspace/origin sync diagnostics card. */
export const workspaceSyncStatusCardStyles = stylex.create({
  /**
   * The card body IS the surface. `SettingsCard` states no inline padding on
   * purpose — a section sits on whatever gutter its host established — so a
   * bordered, inset box here drew a card inside a card and moved its text 17px
   * off the card title above it. Summary and actions are a plain row.
   */
  header: {
    alignItems: "flex-start",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
  },
  headerLead: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  badgeRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  summaryBlock: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  summary: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  path: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    overflowWrap: "anywhere",
    wordBreak: "break-all",
  },
  actionRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  actionIcon: { height: 16, width: 16 },
  actionIconSpinning: {
    animationDuration: {
      default: "1s",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    animationIterationCount: "infinite",
    animationName: spin,
    animationTimingFunction: "linear",
  },
  detailGrid: {
    display: "grid",
    gap: vars["--ads-space-12"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 64rem)": "repeat(2, minmax(0, 1fr))",
    },
  },
  /** Columns of the same body surface, not two more nested cards. */
  detailPanel: {
    minInlineSize: 0,
  },
  infoRows: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  nextStep: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
  },
  nextStepTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  nextStepBody: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
  },
  commandBlock: {
    backgroundColor: vars["--ads-color-surface-tint"],
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  commandLabel: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  },
  commandText: {
    color: vars["--ads-color-text"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-relaxed"],
    overflowWrap: "anywhere",
    wordBreak: "break-all",
  },
  /**
   * Output and error stay boxed — they are transient notices, the one thing on
   * this card that is not part of the standing layout — but they share the
   * body gutter with everything else instead of being the widest box in a
   * stack of narrower ones.
   */
  outputPanel: {
    backgroundColor: vars["--ads-color-surface-tint"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
  },
  outputTitle: {
    alignItems: "center",
    color: vars["--ads-color-text"],
    display: "flex",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    gap: vars["--ads-space-8"],
  },
  outputIcon: { color: vars["--ads-color-text-muted"], height: 16, width: 16 },
  outputBody: {
    color: vars["--ads-color-text-muted"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-relaxed"],
    marginBlockStart: vars["--ads-space-8"],
    whiteSpace: "pre-wrap",
  },
  errorPanel: {
    backgroundColor: vars["--ads-color-danger-soft"],
    borderColor: vars["--ads-color-danger-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-danger-text"],
    fontSize: vars["--ads-font-size-body"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
  },
});
