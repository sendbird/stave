import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Connected-browser-tab card inside the Information panel. */
export const workspaceConnectedBrowserCardStyles = stylex.create({
  root: {
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    padding: vars.space12,
  },
  row: {
    alignItems: "flex-start",
    display: "flex",
    gap: 10,
  },
  iconBox: {
    alignItems: "center",
    backgroundColor: vars.colorSurfaceTint,
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexShrink: 0,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  icon: { color: vars.colorTextMuted, height: 16, width: 16 },
  body: { flex: 1, minWidth: 0 },
  titleRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  title: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  chip: {
    borderRadius: vars.radiusFull,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightRegular,
    height: 20,
    lineHeight: 1,
    paddingBlock: 0,
    paddingInline: vars.space8,
  },
  note: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightRelaxed,
    marginBlockStart: vars.space4,
  },
});
