import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const chatInputStyles = stylex.create({
  root: {
    backgroundColor: vars["--ads-color-canvas"],
    paddingBlock: "0.625rem",
    paddingInline: {
      default: vars["--ads-space-12"],
      "@media (min-width: 640px)": vars["--ads-space-16"],
    },
  },
  rootEmpty: {
    paddingBottom: vars["--ads-space-24"],
  },
  measure: {
    marginInline: "auto",
    maxWidth: 1152,
  },
  menuLabelRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  menuLabelRecent: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-micro"],
    gap: vars["--ads-space-8"],
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  menuItemStart: {
    alignItems: "flex-start",
    gap: vars["--ads-space-8"],
  },
  menuItemGap: {
    gap: vars["--ads-space-8"],
  },
  itemText: {
    flexGrow: 1,
    minWidth: 0,
  },
  itemTitle: {
    display: "block",
    fontSize: vars["--ads-font-size-body"],
  },
  itemTitleTruncate: {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    width: "100%",
  },
  itemDescription: {
    color: vars["--ads-color-text-muted"],
    display: "block",
    fontSize: vars["--ads-font-size-caption"],
  },
  itemDescriptionCapitalize: {
    color: vars["--ads-color-text-muted"],
    display: "block",
    fontSize: vars["--ads-font-size-caption"],
    textTransform: "capitalize",
  },
  runDot: {
    backgroundColor: vars["--ads-color-accent"],
    borderRadius: vars["--ads-radius-full"],
    flexShrink: 0,
    height: 6,
    marginTop: vars["--ads-space-4"],
    width: 6,
  },
  // Geometry lives on the composer lane's group recipe
  // (`COMPOSER_CONTROL_GROUP`): it is the lane that knows whether this row is
  // full-width, and it is the marker that tells the two halves to stop each
  // claiming the whole row. Nothing product-specific is left here.
  compareControlMenuTrigger: {
    paddingInline: vars["--ads-space-4"],
  },
  tooltipContent: {
    maxWidth: 288,
  },
  menuContentWide: {
    width: 320,
  },
});
