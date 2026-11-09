import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

export const stageCheckStyles = stylex.create({
  field: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  list: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], margin: 0, padding: 0, listStyle: "none" },
  check: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    padding: vars["--aui-space-8"],
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border-subtle"],
    backgroundColor: vars["--aui-color-surface"],
    minWidth: 0,
  },
  head: { display: "flex", alignItems: "center", gap: vars["--aui-space-4"], minWidth: 0 },
  name: {
    flex: "1 1 auto",
    minWidth: 0,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-text"],
    overflowWrap: "anywhere",
  },
  popup: { width: "18rem", maxWidth: "var(--available-width)", overflow: "hidden" },
});
