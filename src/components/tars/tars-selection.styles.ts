import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

export const tarsSelectionStyles = stylex.create({
  toolbar: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0 },
  suggestions: { flex: "2 1 16rem", paddingBlockEnd: 0 },
  root: { display: "flex", flex: "1 1 16rem", alignItems: "center", padding: vars["--aui-space-8"], minWidth: 0 },
  target: { minWidth: 0, maxWidth: "100%" },
  open: { display: "flex", flex: "1 1 auto", alignItems: "center", gap: vars["--aui-space-4"], minWidth: 0, height: "auto", whiteSpace: "normal" },
  copy: { display: "flex", flexDirection: "column", minWidth: 0, textAlign: "start" },
  identity: { color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"] },
  openIcon: { width: vars["--aui-control-icon-size-sm"], height: vars["--aui-control-icon-size-sm"], flexShrink: 0, color: vars["--aui-color-text-muted"] },
  details: { whiteSpace: "pre-line", overflowWrap: "anywhere" },
  // The sent message's target reads as metadata above the user's words, like the chip's identity line.
  messageTarget: { margin: 0, minWidth: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], overflowWrap: "anywhere" },
});
