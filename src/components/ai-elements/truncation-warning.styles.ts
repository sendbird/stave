import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";

export const truncationWarningStyles = stylex.create({
  banner: {
    display: "flex",
    alignItems: "flex-start",
    gap: vars["--aui-space-8"],
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-warning-border"],
    backgroundColor: vars["--aui-color-warning-soft"],
    color: vars["--aui-color-warning-text"],
  },
  bannerCompact: {
    paddingInline: vars["--aui-space-8"],
    paddingBlock: 6,
    fontSize: `max(0.75em, ${vars["--aui-font-size-caption"]})`,
  },
  bannerRegular: {
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    fontSize: "0.875em",
  },
  icon: {
    marginTop: vars["--aui-space-2"],
    flexShrink: 0,
    width: vars["--aui-control-icon-size-md"],
    height: vars["--aui-control-icon-size-md"],
  },
  iconCompact: {
    width: vars["--aui-control-icon-size-sm"],
    height: vars["--aui-control-icon-size-sm"],
  },
  body: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-2"],
  },
  title: {
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-tight"],
    color: vars["--aui-color-text"],
  },
  description: {
    lineHeight: vars["--aui-line-height-tight"],
    color: vars["--aui-color-text-muted"],
  },
});
