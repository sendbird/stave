import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const logMarker = stylex.defineMarker();
export const logStyles = stylex.create({
  root: { marginTop: 10, display: "flex", flexDirection: "column", gap: vars.space4 },
  viewport: { position: "relative", overflow: "hidden", borderRadius: vars.radiusControl, borderWidth: 1, borderStyle: "solid", borderColor: vars.colorBorder },
  actions: {
    pointerEvents: "none", position: "absolute", right: 6, top: 6, zIndex: 10,
    display: "flex", alignItems: "center", gap: vars.space4,
    opacity: { default: 0, [stylex.when.ancestor(":is(:hover, :focus-within)", logMarker)]: 1, "@media (hover: none)": 1 },
    transitionProperty: "opacity", transitionDuration: { default: vars.motionDurationFast, "@media (prefers-reduced-motion: reduce)": "0s" },
  },
  action: { pointerEvents: "auto", width: 24, height: 24, borderRadius: vars.radiusControl, backgroundColor: vars.colorCanvas, color: { default: vars.colorTextMuted, ":hover": vars.colorText } },
  icon: { width: 14, height: 14 },
  smallIcon: { width: 12, height: 12 },
  success: { color: vars.colorSuccessText },
  output: { overflow: "auto", whiteSpace: "pre-wrap", backgroundColor: "var(--terminal)", color: "var(--terminal-foreground)", paddingInline: vars.space12, paddingBlock: vars.space8, fontFamily: vars.fontMono, fontSize: vars.fontSizeMicro, lineHeight: 1.6, maxHeight: "11rem" },
  expanded: { maxHeight: "28rem" },
  jump: { position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)", height: 24, gap: vars.space4, borderRadius: vars.radiusFull, paddingInline: 10, fontSize: vars.fontSizeMicro, boxShadow: vars.elevationRaised },
  error: { borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: vars.colorDangerBorder, backgroundColor: vars.colorDangerSoft, paddingInline: 10, paddingBlock: vars.space8, fontSize: vars.fontSizeCaption, color: vars.colorDangerText },
  footer: { display: "flex", alignItems: "center", gap: vars.space8, paddingInline: 2, fontSize: vars.fontSizeMicro, color: vars.colorTextMuted },
  exit: { fontWeight: vars.fontWeightMedium },
  failed: { color: vars.colorDangerText },
});
