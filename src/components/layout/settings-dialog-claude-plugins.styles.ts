import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Installed Claude plugins switchboard inside the settings section. */
export const claudePluginsStyles = stylex.create({
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
  itemScope: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  itemDescription: {
    color: vars["--aui-color-text-muted"],
    display: "-webkit-box",
    fontSize: vars["--aui-font-size-caption"],
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  itemSwitch: {
    flexShrink: 0,
    marginBlockStart: vars["--aui-space-2"],
  },
});
