import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

export const secretsStyles = stylex.create({
  addButton: {
    gap: vars.space4,
  },
  addIcon: {
    blockSize: vars.controlIconSizeSm,
    inlineSize: vars.controlIconSizeSm,
  },
  notice: {
    alignItems: "start",
    backgroundColor: vars.colorSurfaceTint,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    gap: vars.space8,
    padding: vars.space12,
  },
  noticeIcon: {
    color: vars.colorSuccess,
    flexShrink: 0,
    blockSize: vars.controlIconSizeMd,
    marginBlockStart: vars.space2,
    inlineSize: vars.controlIconSizeMd,
  },
  noticeText: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
  },
  form: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    padding: vars.space12,
  },
  fieldLabel: {
    display: "block",
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  fieldOptional: {
    color: vars.colorTextMuted,
    fontWeight: vars.fontWeightRegular,
    marginInlineStart: vars.space4,
  },
  /** Reproduces `space-y-1.5` between a label's text and its following block. */
  stacked: {
    marginBlockStart: vars.space4,
  },
  fieldControl: {
    fontSize: vars.fontSizeCaption,
    blockSize: vars.controlHeightSm,
  },
  fieldControlMono: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    blockSize: vars.controlHeightSm,
  },
  valueRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
  },
  iconAction: {
    flexShrink: 0,
  },
  actionIcon: {
    blockSize: vars.controlIconSizeSm,
    inlineSize: vars.controlIconSizeSm,
  },
  hint: {
    color: vars.colorTextMuted,
    display: "block",
    fontWeight: vars.fontWeightRegular,
    lineHeight: vars.lineHeightTight,
  },
  hintCode: {
    backgroundColor: vars.colorCanvasSubtle,
    borderRadius: vars.radiusMark,
    marginInline: vars.space4,
    paddingBlock: vars.space2,
    paddingInline: vars.space4,
  },
  descriptionArea: {
    fontSize: vars.fontSizeCaption,
    minBlockSize: vars.space64,
  },
  formActions: {
    display: "flex",
    gap: vars.space8,
    justifyContent: "flex-end",
  },
  loadingRow: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
    paddingBlock: vars.space16,
  },
  emptyText: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    paddingBlock: vars.space8,
  },
  list: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
  },
  row: {
    alignItems: "center",
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: {
      default: vars.borderWidthHairline,
      ":first-child": 0,
    },
    display: "flex",
    gap: vars.space12,
    padding: vars.space12,
  },
  rowMark: {
    alignItems: "center",
    backgroundColor: vars.colorCanvasSubtle,
    borderRadius: vars.radiusControl,
    display: "flex",
    flexShrink: 0,
    blockSize: vars.space32,
    justifyContent: "center",
    inlineSize: vars.space32,
  },
  rowMarkIcon: {
    color: vars.colorTextMuted,
    blockSize: vars.controlIconSizeMd,
    inlineSize: vars.controlIconSizeMd,
  },
  rowBody: {
    flex: 1,
    minInlineSize: 0,
  },
  rowTitleLine: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    minInlineSize: 0,
  },
  rowTitle: {
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowEnvVar: {
    backgroundColor: vars.colorCanvasSubtle,
    borderRadius: vars.radiusMark,
    color: vars.colorTextMuted,
    flexShrink: 0,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeMicro,
    lineHeight: vars.lineHeightTight,
    paddingBlock: vars.space2,
    paddingInline: vars.space4,
  },
  rowValue: {
    color: vars.colorTextMuted,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  copiedIcon: {
    color: vars.colorSuccess,
    blockSize: vars.controlIconSizeSm,
    inlineSize: vars.controlIconSizeSm,
  },
});
