import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

export const lensCredentialsStyles = stylex.create({
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
    gap: 6,
  },
  hostRows: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  hostRow: {
    alignItems: "center",
    display: "flex",
    gap: 6,
  },
  hostInput: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    height: vars.controlHeightSm,
  },
  removeHost: {
    flexShrink: 0,
  },
  removeHostIcon: {
    height: 14,
    width: 14,
  },
  addHostButton: {
    gap: vars.space4,
    height: 28,
  },
  addHostIcon: {
    height: 14,
    width: 14,
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
    height: vars.controlHeightSm,
  },
  /** Reproduces `space-y-1.5` between a label's text and its following block. */
  stacked: {
    marginTop: 6,
  },
  autoFillRow: {
    alignItems: "flex-start",
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
  rowHostLine: {
    alignItems: "center",
    columnGap: vars.space8,
    display: "flex",
    flexWrap: "wrap",
    minWidth: 0,
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
    height: 14,
    width: 14,
  },
});
