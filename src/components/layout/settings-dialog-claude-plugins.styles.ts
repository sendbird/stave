import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Installed Claude plugins switchboard inside the settings section. */
export const claudePluginsStyles = stylex.create({
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
  },
  actions: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
  },
  empty: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
  },
  list: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
  },
  listItem: {
    alignItems: "flex-start",
    borderTopColor: {
      default: vars.colorBorder,
      ":first-child": "transparent",
    },
    borderTopStyle: "solid",
    borderTopWidth: {
      default: vars.borderWidthHairline,
      ":first-child": 0,
    },
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  itemBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    minWidth: 0,
  },
  itemHead: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  itemName: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemMeta: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemScope: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },
  itemDescription: {
    color: vars.colorTextMuted,
    display: "-webkit-box",
    fontSize: vars.fontSizeCaption,
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  itemSwitch: {
    flexShrink: 0,
    marginBlockStart: 2,
  },
});
