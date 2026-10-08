import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const turnDocumentRevisionsStyles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    marginTop: vars["--ads-space-8"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    backgroundColor: vars["--ads-color-surface-tint"],
    color: vars["--ads-color-text-muted"],
    fontSize: "0.875em",
    fontWeight: vars["--ads-font-weight-medium"],
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    minWidth: 0,
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-4"],
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
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
    color: vars["--ads-color-text-muted"],
    fontSize: "0.8125em",
    fontVariantNumeric: "tabular-nums",
  },
  actions: {
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-4"],
  },
});
