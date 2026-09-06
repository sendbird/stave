import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const refContextMenuStyles = stylex.create({
  dialogNarrow: {
    maxWidth: "24rem",
  },
  destructiveHeader: {
    marginBottom: vars.space4,
    display: "flex",
    alignItems: "center",
    gap: vars.space8,
    color: vars.colorDangerText,
  },
  destructiveIcon: {
    width: 16,
    height: 16,
    flexShrink: 0,
  },
  destructiveTitle: {
    color: vars.colorDangerText,
  },
  forceToggle: {
    display: "flex",
    cursor: "pointer",
    alignItems: "center",
    gap: vars.space8,
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 60%, transparent)`,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
    fontSize: vars.fontSizeCaption,
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars.colorCanvasSubtle} 30%, transparent)`,
    },
  },
  forceLabelActive: {
    color: vars.colorDangerText,
  },
  forceLabelMuted: {
    color: vars.colorTextMuted,
  },
  menu: {
    width: "15rem",
  },
  menuLabel: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  warningLabel: {
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    whiteSpace: "normal",
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightRegular,
    lineHeight: "16px",
    color: vars.colorWarningText,
  },
  warningIcon: {
    marginTop: 2,
    width: 12,
    height: 12,
    flexShrink: 0,
  },
  menuIcon: {
    width: 16,
    height: 16,
  },
});
