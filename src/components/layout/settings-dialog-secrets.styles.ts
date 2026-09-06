import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

export const secretsStyles = stylex.create({
  addButton: {
    gap: vars.space4,
  },
  addIcon: {
    height: 14,
    width: 14,
  },
  notice: {
    alignItems: "flex-start",
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
    height: vars.controlIconSizeMd,
    marginTop: 2,
    width: vars.controlIconSizeMd,
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
    marginLeft: vars.space4,
  },
  /** Reproduces `space-y-1.5` between a label's text and its following block. */
  stacked: {
    marginTop: 6,
  },
  fieldControl: {
    fontSize: vars.fontSizeCaption,
    height: vars.controlHeightSm,
  },
  fieldControlMono: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    height: vars.controlHeightSm,
  },
  valueRow: {
    alignItems: "center",
    display: "flex",
    gap: 6,
  },
  iconAction: {
    flexShrink: 0,
  },
  actionIcon: {
    height: 14,
    width: 14,
  },
  hint: {
    color: vars.colorTextMuted,
    display: "block",
    fontWeight: vars.fontWeightRegular,
    lineHeight: "1rem",
  },
  hintCode: {
    backgroundColor: vars.colorCanvasSubtle,
    borderRadius: vars.radiusMark,
    marginInline: vars.space4,
    paddingBlock: 2,
    paddingInline: vars.space4,
  },
  descriptionArea: {
    fontSize: vars.fontSizeCaption,
    minHeight: vars.space64,
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
    height: vars.space32,
    justifyContent: "center",
    width: vars.space32,
  },
  rowMarkIcon: {
    color: vars.colorTextMuted,
    height: vars.controlIconSizeMd,
    width: vars.controlIconSizeMd,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitleLine: {
    alignItems: "center",
    display: "flex",
    gap: 6,
    minWidth: 0,
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
    lineHeight: "1rem",
    paddingBlock: 2,
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
    height: 14,
    width: 14,
  },
});
