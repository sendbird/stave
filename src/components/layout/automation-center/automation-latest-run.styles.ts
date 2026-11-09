import * as stylex from "@stylexjs/stylex";

import { vars } from "../../aui/tokens/tokens.stylex";

export const latestRunStyles = stylex.create({
  root: {
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    padding: vars["--aui-space-12"],
  },
  emptyCopy: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    marginBlock: 0,
    marginBlockStart: 6,
  },
  header: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
  },
  meta: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    columnGap: vars["--aui-space-8"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--aui-font-size-caption"],
    marginBlockStart: vars["--aui-space-8"],
    rowGap: vars["--aui-space-4"],
  },
  summary: {
    display: "-webkit-box",
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-control"],
    marginBlockEnd: 0,
    marginBlockStart: vars["--aui-space-8"],
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  summaryError: { color: vars["--aui-color-danger-text"] },
  summaryDefault: { color: vars["--aui-color-text"] },
  actions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginBlockStart: vars["--aui-space-12"],
  },
  actionButton: {
    blockSize: 32,
    fontSize: vars["--aui-font-size-caption"],
    gap: 6,
  },
  actionButtonQuiet: {
    blockSize: 32,
    fontSize: vars["--aui-font-size-caption"],
    paddingInline: 10,
  },
  actionIcon: { blockSize: 14, inlineSize: 14 },
});
