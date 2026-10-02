import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const collapsibleResponseStyles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: vars["--ads-space-4"],
    minWidth: 0,
  },
  // The body owns the width so a fenced block scrolls inside it instead of
  // widening the panel.
  body: { alignSelf: "stretch", minWidth: 0, maxWidth: "100%" },
  // Under eleven body lines at the panel scale; `collapsible-response.utils`
  // only collapses answers that are always taller than this.
  bodyCollapsed: {
    maxBlockSize: "16rem",
    overflow: "hidden",
    maskImage: `linear-gradient(to bottom, black calc(100% - ${vars["--ads-space-48"]}), transparent)`,
  },
});
