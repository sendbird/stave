import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

export const secretBindingControlStyles = stylex.create({
  content: {
    width: 320,
  },
  label: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  labelIcon: {
    height: 14,
    width: 14,
  },
  empty: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1.25rem",
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-8"],
  },
  item: {
    alignItems: "flex-start",
    gap: vars["--aui-space-8"],
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
  },
  itemTitleRow: {
    alignItems: "center",
    display: "flex",
    gap: 6,
    minWidth: 0,
  },
  itemTitle: {
    fontSize: vars["--aui-font-size-body"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemEnvVar: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderRadius: vars["--aui-radius-mark"],
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-micro"],
    lineHeight: "1rem",
    paddingBlock: vars["--aui-space-2"],
    paddingInline: vars["--aui-space-4"],
  },
  itemPreview: {
    color: vars["--aui-color-text-muted"],
    display: "block",
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  footnote: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1rem",
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-8"],
  },
});
