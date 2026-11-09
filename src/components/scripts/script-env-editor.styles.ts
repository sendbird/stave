import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

export const envEditorStyles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
  },
  label: {
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  empty: {
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  rows: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-4"],
  },
  input: {
    height: 32,
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
  },
  equals: {
    color: vars["--aui-color-text-muted"],
  },
  removeButton: {
    flexShrink: 0,
    color: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-danger-text"],
    },
  },
  addButton: {
    height: 28,
    gap: vars["--aui-space-4"],
  },
  icon: {
    width: 14,
    height: 14,
  },
});
