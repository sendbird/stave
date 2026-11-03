import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const stageCheckStyles = stylex.create({
  field: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"], minWidth: 0 },
  list: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"], margin: 0, padding: 0, listStyle: "none" },
  check: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    padding: vars["--ads-space-8"],
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border-subtle"],
    backgroundColor: vars["--ads-color-surface"],
    minWidth: 0,
  },
  head: { display: "flex", alignItems: "center", gap: vars["--ads-space-4"], minWidth: 0 },
  name: {
    flex: "1 1 auto",
    minWidth: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text"],
    overflowWrap: "anywhere",
  },
  popup: { width: "18rem", maxWidth: "var(--available-width)", overflow: "hidden" },
});
