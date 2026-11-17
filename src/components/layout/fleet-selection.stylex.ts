import * as stylex from "@stylexjs/stylex";
export const fleetSelectionRowMarker = stylex.defineMarker();

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Shared selection column for attention rows and the task table. */
export const fleetSelectionColumn = stylex.create({
  cell: {
    boxSizing: "border-box",
    lineHeight: 0,
    verticalAlign: "middle",
    inlineSize: `calc(${vars["--aui-control-mark-size-lg"]} + ${vars["--aui-space-12"]} * 2)`,
    paddingInline: vars["--aui-space-12"],
  },
  leading: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
  },
});
