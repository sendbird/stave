import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const coreStyles = stylex.create({
  suggestionList: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars.space8, marginBottom: vars.space12, overflowX: "auto", paddingBottom: vars.space4 },
  suggestionButton: { maxWidth: "100%", cursor: "pointer", borderRadius: vars.radiusFull, paddingInline: vars.space16, textAlign: "left" },
  modelFallback: { display: "inline-flex", width: 16, height: 16, alignItems: "center", justifyContent: "center", borderRadius: vars.radiusMark, backgroundColor: vars.colorSurfaceTint, fontSize: vars.fontSizeMicro, fontWeight: vars.fontWeightSemibold, color: vars.colorTextMuted },
  modelImage: { width: 16, height: 16, flexShrink: 0, objectFit: "contain" },
  shimmer: { display: "inline-block", backgroundSize: "250% 100%", backgroundClip: "text", backgroundRepeat: "no-repeat", backgroundPosition: "100% center", color: "transparent", animationName: "text-shimmer", animationTimingFunction: "linear", animationIterationCount: "infinite", "@media (prefers-reduced-motion: reduce)": { animationName: "none" } },
  settle: { animationName: "thinking-label-settle", animationDuration: "220ms", "@media (prefers-reduced-motion: reduce)": { animationName: "none" } },
  inlineToken: { display: "inline-flex", alignItems: "baseline" },
  tokenMargin: { marginInline: vars.space2 },
});
