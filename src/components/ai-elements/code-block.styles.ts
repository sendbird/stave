import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";
import { chatType } from "./chat-type.stylex";

export const codeBlockStyles = stylex.create({
  /*
   * A block in a reply: the markdown block gap below it and none above
   * (`MARKDOWN_BLOCK_GAP`), so stacked code blocks sit as far apart as a
   * paragraph and a code block.
   */
  root: {
    marginTop: 0,
    marginBottom: { default: vars["--aui-space-12"], ":last-child": 0 },
    overflow: "hidden",
    borderRadius: vars["--aui-radius-panel"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
    // The header and the highlighted body share the theme's code surface.
    backgroundColor: "var(--editor)",
  },
  // Code glyphs follow the code font size setting; the line keeps the
  // conversation scale's secondary ratio (20px at 14px).
  content: {
    fontFamily: vars["--aui-font-mono"],
    lineHeight: chatType["--chat-type-secondary-leading"],
  },
  fallbackPre: {
    overflowX: "auto",
    backgroundColor: "var(--editor)",
    paddingInline: vars["--aui-space-16"],
    paddingBlock: vars["--aui-space-12"],
    fontFamily: vars["--aui-font-mono"],
    lineHeight: chatType["--chat-type-secondary-leading"],
    tabSize: 4,
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
    fontSize: chatType["--chat-type-meta"],
    lineHeight: chatType["--chat-type-meta-leading"],
    color: vars["--aui-color-text-muted"],
  },
  filename: {
    fontFamily: vars["--aui-font-mono"],
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
