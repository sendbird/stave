import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const coreStyles = stylex.create({
  suggestionList: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--ads-space-8"], marginBottom: vars["--ads-space-12"], overflowX: "auto", paddingBottom: vars["--ads-space-4"] },
  suggestionButton: { maxWidth: "100%", cursor: "pointer", borderRadius: vars["--ads-radius-full"], paddingInline: vars["--ads-space-16"], textAlign: "left" },
  modelFallback: { display: "inline-flex", width: 16, height: 16, alignItems: "center", justifyContent: "center", borderRadius: vars["--ads-radius-mark"], backgroundColor: vars["--ads-color-surface-tint"], fontSize: vars["--ads-font-size-micro"], fontWeight: vars["--ads-font-weight-semibold"], color: vars["--ads-color-text-muted"] },
  modelImage: { width: 16, height: 16, flexShrink: 0, objectFit: "contain" },
  shimmer: { display: "inline-block", backgroundSize: "250% 100%", backgroundClip: "text", backgroundRepeat: "no-repeat", backgroundPosition: "100% center", color: "transparent", animationName: "text-shimmer", animationTimingFunction: "linear", animationIterationCount: "infinite", "@media (prefers-reduced-motion: reduce)": { animationName: "none" } },
  settle: { animationName: "thinking-label-settle", animationDuration: "220ms", "@media (prefers-reduced-motion: reduce)": { animationName: "none" } },
  inlineToken: { display: "inline-flex", alignItems: "baseline" },
  tokenMargin: { marginInline: vars["--ads-space-2"] },
});
