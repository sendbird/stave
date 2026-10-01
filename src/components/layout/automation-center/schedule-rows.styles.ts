import * as stylex from "@stylexjs/stylex";

import { vars } from "../../ads/tokens/tokens.stylex";

const accent = (percent: number) =>
  `color-mix(in oklch, ${vars["--ads-color-accent"]} ${percent}%, transparent)`;

/** One Schedules row: a select target plus its own Run now / Pause actions. */
export const scheduleRowStyles = stylex.create({
  list: { display: "grid", gap: vars["--ads-space-8"], listStyle: "none", margin: 0, padding: 0 },
  resultDot: { display: "inline-block", marginInlineEnd: 4 },
  row: {
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": vars["--ads-color-overlay-hover"] },
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-8"],
    paddingInlineEnd: vars["--ads-space-8"],
  },
  rowActive: { backgroundColor: accent(8), borderColor: accent(50) },
  select: {
    alignItems: "flex-start",
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
    padding: 10,
    textAlign: "left",
  },
  head: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    inlineSize: "100%",
    minInlineSize: 0,
  },
  name: {
    color: vars["--ads-color-text"],
    flexGrow: 1,
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  state: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-micro"],
  },
  meta: {
    color: vars["--ads-color-text-muted"],
    columnGap: vars["--ads-space-8"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--ads-font-size-micro"],
    inlineSize: "100%",
    minInlineSize: 0,
    rowGap: 2,
  },
  metaText: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  action: { blockSize: 40, flexShrink: 0, fontSize: vars["--ads-font-size-caption"], gap: 6 },
});
