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
    gap: vars.space12,
    justifyContent: "space-between",
  },
  headerLead: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  badgeRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  summaryBlock: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
  },
  summary: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
  },
  path: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    overflowWrap: "anywhere",
    wordBreak: "break-all",
  },
  actionRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
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
    gap: vars.space12,
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
    gap: vars.space8,
  },
  nextStep: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
  },
  nextStepTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  nextStepBody: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
  },
  commandBlock: {
    backgroundColor: vars.colorSurfaceTint,
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  commandLabel: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  },
  commandText: {
    color: vars.colorText,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightRelaxed,
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
    backgroundColor: vars.colorSurfaceTint,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    paddingBlock: vars.space12,
    paddingInline: vars.space12,
  },
  outputTitle: {
    alignItems: "center",
    color: vars.colorText,
    display: "flex",
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    gap: vars.space8,
  },
  outputIcon: { color: vars.colorTextMuted, height: 16, width: 16 },
  outputBody: {
    color: vars.colorTextMuted,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightRelaxed,
    marginBlockStart: vars.space8,
    whiteSpace: "pre-wrap",
  },
  errorPanel: {
    backgroundColor: vars.colorDangerSoft,
    borderColor: vars.colorDangerBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorDangerText,
    fontSize: vars.fontSizeBody,
    paddingBlock: vars.space12,
    paddingInline: vars.space12,
  },
});
