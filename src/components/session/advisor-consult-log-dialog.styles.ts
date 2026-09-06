import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const advisorConsultLogDialogStyles = stylex.create({
  dialogContent: {
    gap: 0,
    maxWidth: "48rem",
    padding: 0,
  },
  header: {
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    paddingBlock: vars.space12,
    paddingInline: vars.space16,
  },
  staticContent: {
    maxWidth: "48rem",
  },
  staticTitle: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  staticDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },
  emptyBody: {
    color: vars.colorTextMuted,
    fontSize: "0.8125rem",
    paddingBlock: vars.space24,
    paddingInline: vars.space16,
  },
  grid: {
    display: "grid",
    maxHeight: "min(34rem, 70vh)",
    minHeight: 0,
    "@media (min-width: 768px)": {
      gridTemplateColumns: "15rem 1fr",
    },
  },
  listColumn: {
    borderColor: vars.colorBorder,
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    padding: 6,
    "@media (min-width: 768px)": {
      borderRightStyle: "solid",
      borderRightWidth: vars.borderWidthHairline,
    },
  },

  // Section + prose primitives.
  sectionLabel: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  prose: {
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    fontSize: vars.fontSizeCaption,
    lineHeight: 1.5,
    marginTop: vars.space4,
    overflowWrap: "break-word",
    paddingBlock: 6,
    paddingInline: vars.space8,
    whiteSpace: "pre-wrap",
  },
  proseInk: {
    color: vars.colorText,
  },
  proseMuted: {
    color: vars.colorTextMuted,
  },

  // Consult row (an ADS host button). `layout="host"` supplies the quiet hover
  // wash, focus ring, and color transition; this owns geometry, the selected
  // fill, and restores full-contrast text (host quiet chrome rests muted).
  row: {
    borderRadius: vars.radiusControl,
    color: vars.colorText,
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    minWidth: 0,
    paddingBlock: 6,
    paddingInline: vars.space8,
    textAlign: "left",
    width: "100%",
  },
  rowSelected: {
    backgroundColor: vars.colorSelectionFill,
  },
  rowHeader: {
    alignItems: "center",
    display: "flex",
    gap: 6,
    minWidth: 0,
  },
  verdictDot: {
    borderRadius: vars.radiusFull,
    flexShrink: 0,
    height: 6,
    width: 6,
  },
  rowTitle: {
    flex: 1,
    fontSize: "0.8125rem",
    fontWeight: vars.fontWeightMedium,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  chip: {
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    flexShrink: 0,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    letterSpacing: "0.025em",
    lineHeight: "1rem",
    paddingInline: vars.space4,
  },
  rowMeta: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    fontSize: vars.fontSizeMicro,
    gap: 6,
    lineHeight: "1rem",
    minWidth: 0,
  },
  rowMetaLabel: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowCurrentTurn: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    flexShrink: 0,
    fontSize: vars.fontSizeMicro,
    lineHeight: "1rem",
    paddingInline: vars.space4,
  },
  rowDuration: {
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  },

  // Detail pane.
  detail: {
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingBlock: vars.space12,
    paddingInline: vars.space16,
  },
  detailStatus: {
    color: vars.colorText,
    fontSize: "0.8125rem",
    fontWeight: vars.fontWeightMedium,
  },
  detailUnresolved: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    lineHeight: 1.45,
    marginTop: vars.space2,
  },
  section: {
    marginTop: vars.space12,
  },
  checkList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginTop: 6,
  },
  checkItem: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars.space8,
  },
  checkBody: {
    flex: 1,
    minWidth: 0,
  },
  checkLabel: {
    color: vars.colorText,
    fontSize: vars.fontSizeCaption,
    lineHeight: 1.45,
  },
  checkLabelFail: {
    color: vars.colorDangerText,
    fontWeight: vars.fontWeightMedium,
  },
  checkDetail: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    lineHeight: 1.45,
    overflowWrap: "break-word",
  },
  lifecycleList: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space2,
    marginTop: vars.space4,
  },
  lifecycleItem: {
    alignItems: "baseline",
    display: "flex",
    fontSize: vars.fontSizeMicro,
    gap: vars.space8,
    lineHeight: 1.5,
  },
  lifecycleAt: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  },
  lifecycleLabel: {
    color: vars.colorTextMuted,
    flex: 1,
    minWidth: 0,
  },
  setupGrid: {
    display: "grid",
    columnGap: vars.space12,
    gridTemplateColumns: "1fr 1fr",
    marginTop: vars.space4,
    rowGap: 6,
  },
  setupCell: {
    minWidth: 0,
  },
  setupTerm: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  setupValue: {
    color: vars.colorText,
    fontSize: vars.fontSizeMicro,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  spendList: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    marginTop: vars.space4,
  },
  spendRow: {
    alignItems: "baseline",
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
  },
  spendTerm: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    fontSize: vars.fontSizeMicro,
  },
  spendValue: {
    color: vars.colorText,
    fontSize: vars.fontSizeMicro,
    fontVariantNumeric: "tabular-nums",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  footnote: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    lineHeight: 1.45,
    marginTop: vars.space4,
  },
  postConsultList: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space2,
    marginTop: vars.space4,
  },
  postConsultItem: {
    alignItems: "baseline",
    display: "flex",
    fontSize: vars.fontSizeMicro,
    gap: vars.space8,
    lineHeight: 1.5,
  },
  postConsultAt: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  },
  postConsultTitle: {
    color: vars.colorText,
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  verdictControl: {
    marginTop: 6,
  },
  tally: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    lineHeight: 1.45,
    marginTop: 6,
  },
});

// Tone chips read a soft fill, matching border, and text ink from the
// semantic scale. Neutral falls back to the muted surface.
export const advisorConsultLogChipTone = stylex.create({
  armed: {
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    color: vars.colorTextMuted,
  },
  pending: {
    backgroundColor: vars.colorInfoSoft,
    borderColor: vars.colorInfoBorder,
    color: vars.colorInfoText,
  },
  completed: {
    backgroundColor: vars.colorSuccessSoft,
    borderColor: vars.colorSuccessBorder,
    color: vars.colorSuccessText,
  },
  warning: {
    backgroundColor: vars.colorWarningSoft,
    borderColor: vars.colorWarningBorder,
    color: vars.colorWarningText,
  },
  unresolved: {
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    color: vars.colorTextMuted,
  },
});

export const advisorConsultLogVerdictDot = stylex.create({
  helpful: { backgroundColor: vars.colorSuccess },
  not_helpful: { backgroundColor: vars.colorWarning },
  ignored: { backgroundColor: vars.colorTextMuted },
});
