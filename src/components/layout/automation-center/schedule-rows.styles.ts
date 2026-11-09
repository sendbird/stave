import * as stylex from "@stylexjs/stylex";

import { vars } from "../../aui/tokens/tokens.stylex";

const accent = (percent: number) =>
  `color-mix(in oklch, ${vars["--aui-color-accent"]} ${percent}%, transparent)`;

/** One Schedules row: a select target plus its own Run now / Pause actions. */
export const scheduleRowStyles = stylex.create({
  list: { display: "grid", gap: vars["--aui-space-8"], listStyle: "none", margin: 0, padding: 0 },
  /** The last result: its state mark centered on the single-line label. */
  result: {
    alignItems: "center",
    columnGap: vars["--aui-space-4"],
    display: "inline-flex",
    minInlineSize: 0,
  },
  row: {
    backgroundColor: { default: "transparent", ":hover": vars["--aui-color-overlay-hover"] },
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 0,
  },
  rowActive: { backgroundColor: accent(8), borderColor: accent(50) },
  select: {
    alignItems: "flex-start",
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
    padding: 10,
    textAlign: "left",
  },
  head: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    inlineSize: "100%",
    minInlineSize: 0,
  },
  name: {
    color: vars["--aui-color-text"],
    flexGrow: 1,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  state: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "14px",
  },
  meta: {
    color: vars["--aui-color-text-muted"],
    columnGap: vars["--aui-space-8"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--aui-font-size-caption"],
    inlineSize: "100%",
    lineHeight: "14px",
    minInlineSize: 0,
    rowGap: 2,
  },
  metaText: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  actions: {
    display: "flex",
    gap: vars["--aui-space-4"],
    justifyContent: "flex-end",
    paddingBlockEnd: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-8"],
  },
  action: { blockSize: 40, flexShrink: 0, fontSize: vars["--aui-font-size-caption"], gap: 6 },
});
