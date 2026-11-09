import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";

export const codeBlockStyles = stylex.create({
  root: {
    marginBlock: vars["--aui-space-8"],
    overflow: "hidden",
    borderRadius: vars["--aui-radius-panel"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
    // The header and the highlighted body share the theme's code surface.
    backgroundColor: "var(--editor)",
  },
  content: {
    fontFamily: vars["--aui-font-mono"],
  },
  fallbackPre: {
    overflowX: "auto",
    backgroundColor: "var(--editor)",
    paddingInline: vars["--aui-space-16"],
    paddingBlock: vars["--aui-space-12"],
    fontFamily: vars["--aui-font-mono"],
    color: "var(--editor-foreground)",
  },
  plainPre: {
    backgroundColor: "var(--background)",
    color: "inherit",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
    backgroundColor: "var(--editor)",
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-4"],
  },
  title: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    fontSize: "0.875em",
    color: vars["--aui-color-text-muted"],
  },
  filename: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: "0.875em",
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-4"],
  },
  // A 24x24 hit area around the 12px glyph.
  copyButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: vars["--aui-space-24"],
    minHeight: vars["--aui-space-24"],
    borderRadius: vars["--aui-radius-control"],
    padding: vars["--aui-space-4"],
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
  },
  copiedIcon: {
    width: 12,
    height: 12,
    color: vars["--aui-color-accent"],
  },
  copyIcon: {
    width: 12,
    height: 12,
  },
});
