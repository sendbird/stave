import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

const spin = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

export const kickoffSectionStyles = stylex.create({
  accessoryRow: {
    display: "flex",
    gap: vars.space8,
  },
  sourceList: {
    display: "grid",
    gap: vars.space8,
  },
  sourceItem: {
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorCanvas,
  },
  sourceHeader: {
    display: "flex",
    alignItems: "center",
    gap: vars.space12,
    paddingInline: vars.space12,
    paddingBlock: 10,
  },
  sourceTrigger: {
    display: "flex",
    minWidth: 0,
    flex: 1,
    alignItems: "center",
    gap: vars.space8,
    textAlign: "left",
    background: "none",
    border: "none",
    padding: 0,
    color: "inherit",
    font: "inherit",
    cursor: "default",
  },
  chevron: {
    width: 14,
    height: 14,
    flexShrink: 0,
    color: vars.colorTextMuted,
  },
  triggerBody: {
    minWidth: 0,
    flex: 1,
  },
  triggerLabelRow: {
    display: "flex",
    alignItems: "center",
    gap: vars.space8,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  triggerSummary: {
    marginBlockStart: 2,
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  moveButtons: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
  },
  moveIcon: {
    width: 14,
    height: 14,
  },
  serverBadges: {
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: vars.space4,
  },
  sourcePanel: {
    display: "grid",
    gap: vars.space16,
    borderTopWidth: vars.borderWidthHairline,
    borderTopStyle: "solid",
    borderTopColor: vars.colorBorder,
    paddingInline: vars.space12,
    paddingBlock: vars.space12,
  },
  fieldGrid: {
    display: "grid",
    gap: vars.space12,
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 40rem)": "repeat(2, minmax(0, 1fr))",
    },
  },
  labelField: {
    display: "grid",
    gap: 6,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  labelFieldBlock: {
    display: "block",
    gridColumn: "1 / -1",
    marginBlock: 0,
  },
  selectTrigger: {
    width: "100%",
    backgroundColor: vars.colorCanvas,
  },
  monoInput: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
  },
  resolutionHint: {
    minHeight: 80,
  },
  removeRow: {
    display: "flex",
    justifyContent: "flex-end",
  },
  actionIcon: {
    width: 14,
    height: 14,
  },
  actionIconSpinning: {
    width: 14,
    height: 14,
    animationName: spin,
    animationDuration: "1s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    "@media (prefers-reduced-motion: reduce)": {
      animationName: "none",
    },
  },
  emptyNote: {
    marginBlock: 0,
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "dashed",
    borderColor: vars.colorBorder,
    paddingInline: vars.space12,
    paddingBlock: vars.space16,
    fontSize: vars.fontSizeBody,
    color: vars.colorTextMuted,
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars.space12,
    borderTopWidth: vars.borderWidthHairline,
    borderTopStyle: "solid",
    borderTopColor: vars.colorBorder,
    paddingBlockStart: vars.space12,
  },
  footerNote: {
    marginBlock: 0,
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  modelSelector: {
    width: "100%",
  },
  modelSelectorTrigger: {
    height: 40,
    width: "100%",
    maxWidth: "none",
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    backgroundColor: {
      default: vars.colorCanvas,
      ":hover": vars.colorOverlayHover,
    },
    paddingInline: vars.space12,
  },
  promptField: {
    display: "grid",
    gap: vars.space8,
  },
  promptTextarea: {
    minHeight: 224,
    backgroundColor: vars.colorCanvas,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    lineHeight: "20px",
  },
  promptFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars.space8,
  },
  promptStatus: {
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  resetButton: {
    height: 28,
    fontSize: vars.fontSizeCaption,
  },
});
