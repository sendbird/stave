import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Installed Claude plugins switchboard inside the settings section. */
export const claudePluginsStyles = stylex.create({
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
  },
  actions: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  empty: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
  },
  list: {
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
  },
  listItem: {
    alignItems: "start",
    borderTopColor: {
      default: vars["--ads-color-border"],
      ":first-child": "transparent",
    },
    borderTopStyle: "solid",
    borderTopWidth: {
      default: vars["--ads-border-width-hairline"],
      ":first-child": 0,
    },
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  itemBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  itemHead: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  itemName: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemMeta: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemScope: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  itemDescription: {
    color: vars["--ads-color-text-muted"],
    display: "-webkit-box",
    fontSize: vars["--ads-font-size-caption"],
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  itemSwitch: {
    flexShrink: 0,
    marginBlockStart: vars["--ads-space-2"],
  },
});
