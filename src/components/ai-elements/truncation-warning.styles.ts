import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const truncationWarningStyles = stylex.create({
  banner: {
    display: "flex",
    alignItems: "flex-start",
    gap: vars["--ads-space-8"],
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-warning-border"],
    backgroundColor: vars["--ads-color-warning-soft"],
    color: vars["--ads-color-warning-text"],
  },
  bannerCompact: {
    paddingInline: vars["--ads-space-8"],
    paddingBlock: 6,
    fontSize: "0.75em",
  },
  bannerRegular: {
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    fontSize: "0.875em",
  },
  icon: {
    marginTop: vars["--ads-space-2"],
    flexShrink: 0,
    width: vars["--ads-control-icon-size-md"],
    height: vars["--ads-control-icon-size-md"],
  },
  iconCompact: {
    width: vars["--ads-control-icon-size-sm"],
    height: vars["--ads-control-icon-size-sm"],
  },
  body: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-2"],
  },
  title: {
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-tight"],
    color: vars["--ads-color-text"],
  },
  description: {
    lineHeight: vars["--ads-line-height-tight"],
    color: vars["--ads-color-text-muted"],
  },
});
