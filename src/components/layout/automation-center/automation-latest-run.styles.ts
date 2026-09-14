import * as stylex from "@stylexjs/stylex";

import { vars } from "../../ads/tokens/tokens.stylex";

export const latestRunStyles = stylex.create({
  root: {
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    padding: vars["--ads-space-12"],
  },
  emptyCopy: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    marginBlock: 0,
    marginBlockStart: 6,
  },
  header: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
  },
  meta: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    columnGap: vars["--ads-space-8"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--ads-font-size-micro"],
    marginBlockStart: vars["--ads-space-8"],
    rowGap: vars["--ads-space-4"],
  },
  summary: {
    display: "-webkit-box",
    fontSize: vars["--ads-font-size-micro"],
    lineHeight: vars["--ads-line-height-control"],
    marginBlockEnd: 0,
    marginBlockStart: vars["--ads-space-8"],
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  summaryError: { color: vars["--ads-color-danger-text"] },
  summaryDefault: { color: vars["--ads-color-text"] },
  actions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginBlockStart: vars["--ads-space-12"],
  },
  actionButton: {
    blockSize: 32,
    fontSize: vars["--ads-font-size-caption"],
    gap: 6,
  },
  actionButtonQuiet: {
    blockSize: 32,
    fontSize: vars["--ads-font-size-caption"],
    paddingInline: 10,
  },
  actionIcon: { blockSize: 14, inlineSize: 14 },
});
