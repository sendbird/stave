import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** A field-shaped trigger whose search box lives inside its own list. */
export const searchablePickerStyles = stylex.create({
  value: {
    alignItems: "baseline",
    columnGap: vars["--aui-space-8"],
    display: "flex",
    flex: "1 1 0",
    minInlineSize: 0,
    overflow: "hidden",
    textAlign: "start",
  },
  valueLabel: {
    color: vars["--aui-color-text"],
    flexShrink: 0,
    maxInlineSize: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  valueDetail: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
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
    blockSize: `calc(${vars["--aui-font-size-body"]} * ${vars["--aui-line-height-normal"]})`,
  },
  placeholder: {
    color: vars["--aui-color-text-placeholder"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  popup: {
    inlineSize: "var(--anchor-width)",
    minInlineSize: "16rem",
    padding: vars["--aui-space-0"],
  },
  list: {
    maxBlockSize: "min(20rem, calc(var(--available-height) - 4rem))",
  },
  item: {
    alignItems: "start",
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
  },
  // The row's first grid track: mark, then copy.
  itemMain: {
    alignItems: "flex-start",
    columnGap: vars["--aui-space-8"],
    display: "flex",
    minInlineSize: 0,
  },
  // A muted trailing value (a price, a count) shares the detail's first line.
  // The detail wraps in its own column without moving or clipping the value.
  itemMeta: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
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
    columnGap: vars["--aui-space-8"],
    display: "flex",
    flexWrap: "wrap",
    minInlineSize: 0,
  },
  itemDetailRow: { alignItems: "baseline", columnGap: vars["--aui-space-8"], display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", minInlineSize: 0 },
  badge: {
    alignSelf: "center",
    flexShrink: 0,
  },
  // No ink of its own: the row's colour is the list's, so a chosen row reads in
  // the accent like every other AUI picker, beside its check.
  itemLabel: { minInlineSize: 0, overflowWrap: "anywhere" },
  itemDetail: { color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], minInlineSize: 0, overflowWrap: "anywhere" },
  // A chip for a chosen value no option lists: the warning rim and ink say
  // "this no longer resolves" without hiding the value.
  chipMissing: {
    backgroundColor: "transparent",
    borderColor: vars["--aui-color-warning-border"],
    borderStyle: "dashed",
    color: vars["--aui-color-warning-text"],
  },
  loading: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    columnGap: vars["--aui-space-8"],
    display: "flex",
    fontSize: vars["--aui-font-size-body"],
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
  },
});
