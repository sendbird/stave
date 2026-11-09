import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

export const turnDocumentRevisionsStyles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    marginTop: vars["--aui-space-8"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    backgroundColor: vars["--aui-color-surface-tint"],
    color: vars["--aui-color-text-muted"],
    fontSize: "0.875em",
    fontWeight: vars["--aui-font-weight-medium"],
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    minWidth: 0,
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-4"],
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
  },
  icon: {
    flexShrink: 0,
    width: 14,
    height: 14,
  },
  name: {
    minWidth: 0,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: "0.875em",
  },
  revision: {
    flexShrink: 0,
    color: vars["--aui-color-text-muted"],
    fontSize: "0.8125em",
    fontVariantNumeric: "tabular-nums",
  },
  actions: {
    display: "flex",
    flexShrink: 0,
    gap: vars["--aui-space-4"],
  },
});
