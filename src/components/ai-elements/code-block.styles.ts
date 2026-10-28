import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const codeBlockStyles = stylex.create({
  root: {
    marginBlock: vars["--ads-space-8"],
    overflow: "hidden",
    borderRadius: vars["--ads-radius-panel"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    // The header and the highlighted body share the theme's code surface.
    backgroundColor: "var(--editor)",
  },
  content: {
    fontFamily: vars["--ads-font-mono"],
  },
  fallbackPre: {
    overflowX: "auto",
    backgroundColor: "var(--editor)",
    paddingInline: vars["--ads-space-16"],
    paddingBlock: vars["--ads-space-12"],
    fontFamily: vars["--ads-font-mono"],
    color: "var(--editor-foreground)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    backgroundColor: "var(--editor)",
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-4"],
  },
  title: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    fontSize: "0.875em",
    color: vars["--ads-color-text-muted"],
  },
  filename: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: "0.875em",
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-4"],
  },
  // A 24x24 hit area around the 12px glyph.
  copyButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: vars["--ads-space-24"],
    minHeight: vars["--ads-space-24"],
    borderRadius: vars["--ads-radius-control"],
    padding: vars["--ads-space-4"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
  },
  copiedIcon: {
    width: 12,
    height: 12,
    color: vars["--ads-color-accent"],
  },
  copyIcon: {
    width: 12,
    height: 12,
  },
});
