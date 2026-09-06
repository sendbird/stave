import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Macros settings list, rows, and editor wrappers. */
export const macrosSectionStyles = stylex.create({
  addButton: {
    gap: 6,
  },
  addIcon: {
    height: 14,
    width: 14,
  },
  editorWrap: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    padding: vars.space16,
  },
  editorWrapInline: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    marginBlockStart: vars.space12,
    padding: vars.space16,
  },
  empty: {
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "dashed",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    paddingBlock: vars.space20,
    paddingInline: vars.space16,
  },
  list: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
  },
  row: {
    borderTopColor: {
      default: vars.colorBorder,
      ":first-child": "transparent",
    },
    borderTopStyle: "solid",
    borderTopWidth: {
      default: vars.borderWidthHairline,
      ":first-child": 0,
    },
    padding: vars.space12,
  },
  rowMain: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars.space12,
  },
  mark: {
    alignItems: "center",
    backgroundColor: vars.colorOverlayHover,
    borderRadius: vars.radiusControl,
    display: "flex",
    flexShrink: 0,
    height: 32,
    justifyContent: "center",
    position: "relative",
    width: 32,
  },
  markIcon: {
    color: vars.colorTextMuted,
    height: vars.controlIconSizeMd,
    width: vars.controlIconSizeMd,
  },
  rowBody: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: vars.space4,
    minWidth: 0,
  },
  rowHead: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  rowLabel: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  slugCode: {
    backgroundColor: vars.colorCanvasSubtle,
    borderRadius: vars.radiusMark,
    color: vars.colorTextMuted,
    flexShrink: 0,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeMicro,
    lineHeight: "1rem",
    paddingBlock: 2,
    paddingInline: 6,
  },
  instantBadge: {
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    height: 20,
    paddingInline: 6,
  },
  rowMeta: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },
  rowActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: 2,
  },
  actionIcon: {
    height: 14,
    width: 14,
  },
  deleteButton: {
    color: {
      default: vars.colorDangerText,
      ":hover": vars.colorDangerText,
    },
  },
});
