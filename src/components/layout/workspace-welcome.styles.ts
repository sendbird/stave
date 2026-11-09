import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Empty-project welcome screen shown before a workspace is opened. */
export const workspaceWelcomeStyles = stylex.create({
  root: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-canvas"],
    display: "flex",
    inset: 0,
    justifyContent: "center",
    overflow: "auto",
    padding: vars["--aui-space-24"],
    position: "absolute",
    zIndex: vars["--aui-z-index-panel"],
  },
  column: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-24"],
    marginBlock: "auto",
    maxWidth: "36rem",
    width: "100%",
  },
  intro: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
  },
  eyebrow: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  title: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-title"],
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "-0.02em",
    lineHeight: vars["--aui-line-height-title"],
  },
  lede: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-relaxed"],
  },
  action: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
  },
  actionIcon: { height: 16, width: 16 },
  actionHint: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  /** A link inside a hint reads at the hint's size and keeps its line height. */
  inlineLink: {
    blockSize: "auto",
    fontSize: "inherit",
    minBlockSize: 0,
    paddingBlock: 0,
    verticalAlign: "baseline",
  },
  steps: {
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text-muted"],
    display: "flex",
    flexDirection: "column",
    fontSize: vars["--aui-font-size-body"],
    gap: vars["--aui-space-16"],
    lineHeight: vars["--aui-line-height-relaxed"],
    listStyleType: "none",
    marginBlock: 0,
    paddingBlockStart: vars["--aui-space-20"],
    paddingInline: 0,
  },
  stepLead: { color: vars["--aui-color-text"] },
});
