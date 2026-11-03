import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** A field-shaped trigger whose search box lives inside its own list. */
export const searchablePickerStyles = stylex.create({
  value: {
    alignItems: "baseline",
    columnGap: vars["--ads-space-8"],
    display: "flex",
    flex: "1 1 0",
    minInlineSize: 0,
    overflow: "hidden",
    textAlign: "start",
  },
  valueLabel: {
    color: vars["--ads-color-text"],
    flexShrink: 0,
    maxInlineSize: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  valueDetail: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  icon: {
    alignSelf: "center",
    display: "inline-flex",
    flexShrink: 0,
  },
  // Centres the mark on the label's first line in a two-line item.
  itemIcon: {
    alignItems: "center",
    alignSelf: "flex-start",
    blockSize: `calc(${vars["--ads-font-size-body"]} * ${vars["--ads-line-height-normal"]})`,
  },
  placeholder: {
    color: vars["--ads-color-text-placeholder"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  popup: {
    inlineSize: "var(--anchor-width)",
    minInlineSize: "16rem",
    padding: vars["--ads-space-0"],
  },
  list: {
    maxBlockSize: "min(20rem, calc(var(--available-height) - 4rem))",
  },
  item: {
    alignItems: "start",
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  // The row's first grid track: mark, then copy.
  itemMain: {
    alignItems: "flex-start",
    columnGap: vars["--ads-space-8"],
    display: "flex",
    minInlineSize: 0,
  },
  // A muted trailing value (a price, a count). It ends the line it sits on and
  // drops below that line's text instead of truncating it.
  itemMeta: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    marginInlineStart: "auto",
    whiteSpace: "nowrap",
  },
  itemText: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minInlineSize: 0,
  },
  itemLabelRow: {
    alignItems: "center",
    columnGap: vars["--ads-space-8"],
    display: "flex",
    flexWrap: "wrap",
    minInlineSize: 0,
  },
  itemDetailRow: {
    alignItems: "baseline",
    columnGap: vars["--ads-space-8"],
    display: "flex",
    flexWrap: "wrap",
    minInlineSize: 0,
  },
  badge: {
    alignSelf: "center",
    flexShrink: 0,
  },
  // No ink of its own: the row's colour is the list's, so a chosen row reads in
  // the accent like every other ADS picker, beside its check.
  itemLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemDetail: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  loading: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    columnGap: vars["--ads-space-8"],
    display: "flex",
    fontSize: vars["--ads-font-size-body"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
  },
});
