import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const snippetStyles = stylex.create({
  root: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-canvas-subtle"]} 30%, transparent)`,
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
  },
  prefix: {
    userSelect: "none",
    borderRightWidth: vars["--ads-border-width-hairline"],
    borderRightStyle: "solid",
    borderRightColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    paddingInline: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-4"],
    color: vars["--ads-color-text-muted"],
  },
  code: {
    paddingInline: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-4"],
  },
  copyButton: {
    borderLeftWidth: vars["--ads-border-width-hairline"],
    borderLeftStyle: "solid",
    borderLeftColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    paddingInline: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-4"],
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
