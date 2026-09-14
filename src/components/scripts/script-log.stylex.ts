import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const logMarker = stylex.defineMarker();
export const logStyles = stylex.create({
  root: { marginTop: 10, display: "flex", flexDirection: "column", gap: vars["--ads-space-4"] },
  viewport: { position: "relative", overflow: "hidden", borderRadius: vars["--ads-radius-control"], borderWidth: 1, borderStyle: "solid", borderColor: vars["--ads-color-border"] },
  actions: {
    pointerEvents: "none", position: "absolute", right: 6, top: 6, zIndex: 10,
    display: "flex", alignItems: "center", gap: vars["--ads-space-4"],
    opacity: { default: 0, [stylex.when.ancestor(":is(:hover, :focus-within)", logMarker)]: 1, "@media (hover: none)": 1 },
    transitionProperty: "opacity", transitionDuration: { default: vars["--ads-motion-duration-fast"], "@media (prefers-reduced-motion: reduce)": "0s" },
  },
  action: { pointerEvents: "auto", width: 24, height: 24, borderRadius: vars["--ads-radius-control"], backgroundColor: vars["--ads-color-canvas"], color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] } },
  icon: { width: 14, height: 14 },
  smallIcon: { width: 12, height: 12 },
  success: { color: vars["--ads-color-success-text"] },
  output: { overflow: "auto", whiteSpace: "pre-wrap", backgroundColor: "var(--terminal)", color: "var(--terminal-foreground)", paddingInline: vars["--ads-space-12"], paddingBlock: vars["--ads-space-8"], fontFamily: vars["--ads-font-mono"], fontSize: vars["--ads-font-size-micro"], lineHeight: 1.6, maxHeight: "11rem" },
  expanded: { maxHeight: "28rem" },
  jump: { position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)", height: 24, gap: vars["--ads-space-4"], borderRadius: vars["--ads-radius-full"], paddingInline: 10, fontSize: vars["--ads-font-size-micro"], boxShadow: vars["--ads-elevation-raised"] },
  error: { borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: vars["--ads-color-danger-border"], backgroundColor: vars["--ads-color-danger-soft"], paddingInline: 10, paddingBlock: vars["--ads-space-8"], fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-danger-text"] },
  footer: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"], paddingInline: 2, fontSize: vars["--ads-font-size-micro"], color: vars["--ads-color-text-muted"] },
  exit: { fontWeight: vars["--ads-font-weight-medium"] },
  failed: { color: vars["--ads-color-danger-text"] },
});
