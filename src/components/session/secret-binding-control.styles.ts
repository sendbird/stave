import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const secretBindingControlStyles = stylex.create({
  content: {
    width: 320,
  },
  label: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  labelIcon: {
    height: 14,
    width: 14,
  },
  empty: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1.25rem",
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-8"],
  },
  item: {
    alignItems: "flex-start",
    gap: vars["--ads-space-8"],
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
    fontSize: vars["--ads-font-size-body"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemEnvVar: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderRadius: vars["--ads-radius-mark"],
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-micro"],
    lineHeight: "1rem",
    paddingBlock: vars["--ads-space-2"],
    paddingInline: vars["--ads-space-4"],
  },
  itemPreview: {
    color: vars["--ads-color-text-muted"],
    display: "block",
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  footnote: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    lineHeight: "1rem",
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-8"],
  },
});
