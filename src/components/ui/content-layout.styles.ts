import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const contentLayout = stylex.create({
  externalLink: { color: vars.colorAccent, textDecorationLine: "underline", textUnderlineOffset: 2, overflowWrap: "anywhere" },
  ellipsis: { display: "flex", width: vars.space20, height: vars.space20, alignItems: "center", justifyContent: "center" },
  ellipsisIcon: { width: vars.space16, height: vars.space16 },
  serviceLogo: { height: "1em", width: "auto", flexShrink: 0 },
  serviceIcon: { height: "1em", width: "1em", flexShrink: 0 },
  serviceBadge: {
    display: "inline-flex", maxWidth: "100%", alignItems: "center", gap: "0.35em",
    borderRadius: vars.radiusControl, borderWidth: vars.borderWidthHairline, borderStyle: "solid", borderColor: vars.colorBorder,
    backgroundColor: { default: `color-mix(in oklch, ${vars.colorSurfaceTint} 40%, transparent)`, ":hover": vars.colorSurfaceTint },
    paddingInline: "0.45em", paddingBlock: "0.1em", verticalAlign: "middle", fontSize: "0.8125em",
    fontWeight: vars.fontWeightMedium, lineHeight: 1, color: vars.colorText, textDecorationLine: "none",
  },
  serviceLabel: { minWidth: 0, maxWidth: "16rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  externalIcon: { width: "0.9em", height: "0.9em", flexShrink: 0, color: vars.colorTextMuted },
  serviceTooltip: { maxWidth: "24rem", wordBreak: "break-all" },
});
