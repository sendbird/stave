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
  icon: { width: 16, height: 16, flexShrink: 0 },
  confirmActions: {
    display: "flex",
    gap: vars["--ads-space-4"],
    justifyContent: "flex-end",
  },
});
