import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

export const turnActivityHistoryStyles = stylex.create({
  bar: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--aui-space-8"],
    minWidth: 0,
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  label: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  picker: {
    flex: 1,
    minWidth: 0,
  },
  notice: {
    color: vars["--aui-color-text-muted"],
    flex: 1,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1rem",
    margin: 0,
    minWidth: 0,
  },
});
