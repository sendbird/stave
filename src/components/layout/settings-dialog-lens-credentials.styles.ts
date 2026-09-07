import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

export const lensCredentialsStyles = stylex.create({
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
  grid: {
    display: "grid",
    gap: vars.space12,
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  hostsField: {
    display: "flex",
    flexDirection: "column",
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    gap: vars.space8,
  },
  hostRows: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  hostRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
  },
  hostInput: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    blockSize: vars.controlHeightSm,
  },
  removeHost: {
    flexShrink: 0,
  },
  removeHostIcon: {
    blockSize: vars.controlIconSizeSm,
    inlineSize: vars.controlIconSizeSm,
  },
  addHostButton: {
    gap: vars.space4,
    blockSize: vars.controlHeightXs,
  },
  addHostIcon: {
    blockSize: vars.controlIconSizeSm,
    inlineSize: vars.controlIconSizeSm,
  },
  hostHelp: {
    color: vars.colorTextMuted,
    display: "block",
    fontWeight: vars.fontWeightRegular,
  },
  fieldLabel: {
    display: "block",
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  fieldControl: {
    fontSize: vars.fontSizeCaption,
    blockSize: vars.controlHeightSm,
  },
  /** Reproduces `space-y-1.5` between a label's text and its following block. */
  stacked: {
    marginBlockStart: vars.space4,
  },
  autoFillRow: {
    alignItems: "start",
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
  },
  autoFillTitle: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  autoFillDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
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
  rowHostLine: {
    alignItems: "center",
    columnGap: vars.space8,
    display: "flex",
    flexWrap: "wrap",
    minInlineSize: 0,
    rowGap: vars.space4,
  },
  rowHost: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  badge: {
    flexShrink: 0,
    fontSize: vars.fontSizeMicro,
  },
  rowUsername: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  actionIcon: {
    blockSize: vars.controlIconSizeSm,
    inlineSize: vars.controlIconSizeSm,
  },
});
