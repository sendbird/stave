import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Preset bar toggle + preset manager list inside their settings cards. */
export const presetsSectionStyles = stylex.create({
  shortcutNote: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
  },
  emphasis: {
    color: vars.colorText,
    fontWeight: vars.fontWeightMedium,
  },
  addButton: {
    gap: 6,
  },
  addIcon: {
    height: 14,
    width: 14,
  },
  editorPopover: {
    width: "20rem",
  },
  restoreRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
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
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  row: {
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    padding: vars.space12,
  },
  rowInner: {
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 1280px)": "row",
    },
    gap: vars.space12,
    alignItems: {
      default: "stretch",
      "@media (min-width: 1280px)": "center",
    },
  },
  rowMain: {
    alignItems: "flex-start",
    display: "flex",
    flex: 1,
    gap: vars.space12,
    minWidth: 0,
  },
  mark: {
    alignItems: "center",
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexShrink: 0,
    height: 36,
    justifyContent: "center",
    position: "relative",
    width: 36,
  },
  markIcon: {
    color: vars.colorTextMuted,
    height: vars.controlIconSizeMd,
    width: vars.controlIconSizeMd,
  },
  cliBadge: {
    backgroundColor: vars.colorCanvas,
    borderRadius: vars.radiusMark,
    bottom: -4,
    color: vars.colorTextMuted,
    height: 12,
    position: "absolute",
    right: -4,
    width: 12,
  },
  rowBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    minWidth: 0,
  },
  rowHead: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  rowLabel: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  shortcutChip: {
    fontSize: vars.fontSizeMicro,
    height: 20,
    paddingInline: 6,
  },
  rowMeta: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },
  rowActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  actionButton: {
    gap: 6,
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
    gap: 6,
  },
});
