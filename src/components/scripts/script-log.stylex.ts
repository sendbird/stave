import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";
import { localStack } from "../../lib/ui-layers.stylex";

export const logMarker = stylex.defineMarker();
export const logStyles = stylex.create({
  root: { marginTop: 10, display: "flex", flexDirection: "column", gap: vars["--aui-space-4"] },
  viewport: { position: "relative", overflow: "hidden", borderRadius: vars["--aui-radius-control"], borderWidth: 1, borderStyle: "solid", borderColor: vars["--aui-color-border"] },
  actions: {
    pointerEvents: "none", position: "absolute", right: 6, top: 6, zIndex: localStack["--stave-stack-raised"],
    display: "flex", alignItems: "center", gap: vars["--aui-space-4"],
    opacity: { default: 0, [stylex.when.ancestor(":is(:hover, :focus-within)", logMarker)]: 1, "@media (hover: none)": 1 },
    transitionProperty: "opacity", transitionDuration: { default: vars["--aui-motion-duration-fast"], "@media (prefers-reduced-motion: reduce)": "0s" },
  },
  action: { pointerEvents: "auto", width: 24, height: 24, borderRadius: vars["--aui-radius-control"], backgroundColor: vars["--aui-color-canvas"], color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] } },
  icon: { width: 14, height: 14 },
  smallIcon: { width: 12, height: 12 },
  success: { color: vars["--aui-color-success-text"] },
  output: { overflow: "auto", whiteSpace: "pre-wrap", backgroundColor: "var(--terminal)", color: "var(--terminal-foreground)", paddingInline: vars["--aui-space-12"], paddingBlock: vars["--aui-space-8"], fontFamily: vars["--aui-font-mono"], fontSize: vars["--aui-font-size-caption"], lineHeight: 1.6, maxHeight: "11rem" },
  expanded: { maxHeight: "28rem" },
  jump: { position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)", height: 24, gap: vars["--aui-space-4"], borderRadius: vars["--aui-radius-full"], paddingInline: 10, fontSize: vars["--aui-font-size-caption"], boxShadow: vars["--aui-elevation-raised"] },
  error: { borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: vars["--aui-color-danger-border"], backgroundColor: vars["--aui-color-danger-soft"], paddingInline: 10, paddingBlock: vars["--aui-space-8"], fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-danger-text"] },
  footer: { display: "flex", alignItems: "center", gap: vars["--aui-space-8"], paddingInline: 2, fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"] },
  exit: { fontWeight: vars["--aui-font-weight-medium"] },
  failed: { color: vars["--aui-color-danger-text"] },
});
