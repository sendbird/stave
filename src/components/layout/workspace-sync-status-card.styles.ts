import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

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
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
  },
  headerLead: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
  },
  badgeRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  summaryBlock: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
  },
  summary: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  path: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    overflowWrap: "anywhere",
    wordBreak: "break-all",
  },
  actionRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
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
    gap: vars["--aui-space-12"],
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
    gap: vars["--aui-space-8"],
  },
  nextStep: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
  },
  nextStepTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  nextStepBody: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
  },
  commandBlock: {
    backgroundColor: vars["--aui-color-surface-tint"],
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  commandLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  commandText: {
    color: vars["--aui-color-text"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-relaxed"],
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
    backgroundColor: vars["--aui-color-surface-tint"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
  },
  outputTitle: {
    alignItems: "center",
    color: vars["--aui-color-text"],
    display: "flex",
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    gap: vars["--aui-space-8"],
  },
  outputIcon: { color: vars["--aui-color-text-muted"], height: 16, width: 16 },
  outputBody: {
    color: vars["--aui-color-text-muted"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-relaxed"],
    marginBlockStart: vars["--aui-space-8"],
    whiteSpace: "pre-wrap",
  },
  errorPanel: {
    backgroundColor: vars["--aui-color-danger-soft"],
    borderColor: vars["--aui-color-danger-border"],
    borderRadius: vars["--aui-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-danger-text"],
    fontSize: vars["--aui-font-size-body"],
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
  },
});
