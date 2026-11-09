import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";

export const snippetStyles = stylex.create({
  root: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-canvas-subtle"]} 30%, transparent)`,
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
  },
  prefix: {
    userSelect: "none",
    borderRightWidth: vars["--aui-border-width-hairline"],
    borderRightStyle: "solid",
    borderRightColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
    paddingInline: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-4"],
    color: vars["--aui-color-text-muted"],
  },
  code: {
    paddingInline: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-4"],
  },
  copyButton: {
    borderLeftWidth: vars["--aui-border-width-hairline"],
    borderLeftStyle: "solid",
    borderLeftColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
    paddingInline: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-4"],
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
