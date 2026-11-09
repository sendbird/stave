import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

export const previewStyles = stylex.create({
  page: {
    minHeight: "100dvh",
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-16"],
    padding: vars["--aui-space-24"],
    backgroundColor: vars["--aui-color-canvas"],
    color: vars["--aui-color-text"],
  },
  heading: {
    fontSize: vars["--aui-font-size-title"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  lede: {
    maxWidth: "58rem",
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  stage: {
    display: "flex",
    minHeight: "32rem",
    alignItems: "flex-end",
    gap: vars["--aui-space-16"],
    borderRadius: vars["--aui-radius-frame"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface"],
    padding: vars["--aui-space-16"],
  },
  readout: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
});
