import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Installed and discoverable Codex plugins inside the Providers section. */
export const codexPluginsStyles = stylex.create({
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
  },
  actions: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  empty: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
  },
  list: {
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
  },
  listItem: {
    alignItems: "start",
    borderTopColor: {
      default: vars["--aui-color-border"],
      ":first-child": "transparent",
    },
    borderTopStyle: "solid",
    borderTopWidth: {
      default: vars["--aui-border-width-hairline"],
      ":first-child": 0,
    },
    display: "flex",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  itemBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
  },
  itemHead: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  itemName: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemMeta: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemSource: {
    color: vars["--aui-color-text-muted"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemAction: {
    flexShrink: 0,
  },
});
