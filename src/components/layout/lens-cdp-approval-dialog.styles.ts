import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

export const lensApprovalStyles = stylex.create({
  /** Wider than the default dialog once there is room for the fact rows. */
  content: {
    maxWidth: {
      default: "28rem",
      "@media (min-width: 640px)": "32rem",
    },
  },
  header: { gap: vars.space12 },
  headerRow: { alignItems: "flex-start", display: "flex", gap: vars.space12 },
  headerBadge: {
    alignItems: "center",
    backgroundColor: vars.colorCanvasSubtle,
    blockSize: 40,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexShrink: 0,
    inlineSize: 40,
    justifyContent: "center",
  },
  headerIcon: {
    blockSize: vars.controlIconSizeSm,
    color: vars.colorTextMuted,
    inlineSize: vars.controlIconSizeSm,
  },
  headerText: { minInlineSize: 0 },
  description: { marginBlockStart: vars.space4 },
  body: { display: "grid", fontSize: vars.fontSizeBody, gap: vars.space8 },
  fact: {
    backgroundColor: vars.colorSurfaceTint,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "grid",
    gap: vars.space4,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  factLabel: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  factValue: { fontSize: vars.fontSizeCaption },
  factValueTruncated: {
    fontSize: vars.fontSizeCaption,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  factValueMono: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  hint: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
    margin: 0,
  },
});
