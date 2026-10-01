import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const agentControlStyles = stylex.create({
  // Grid, not a flex column: flex items shrink to fit and would clip the
  // confirm inside the scroll area instead of letting it scroll.
  panel: {
    display: "grid",
    alignContent: "start",
    gap: vars["--ads-space-8"],
    minHeight: 0,
    overflowY: "auto",
    padding: vars["--ads-space-8"],
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-2"],
  },
  // The agents that match a model search, under the model results.
  matches: {
    display: "grid",
    gap: vars["--ads-space-8"],
    paddingBottom: vars["--ads-space-8"],
  },
  empty: {
    margin: 0,
    paddingBlock: vars["--ads-space-16"],
    textAlign: "center",
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text-muted"],
  },
  manage: { justifySelf: "start" },
  icon: { width: 16, height: 16, flexShrink: 0 },
  confirmActions: {
    display: "flex",
    gap: vars["--ads-space-4"],
    justifyContent: "flex-end",
  },
});
