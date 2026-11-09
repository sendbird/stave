import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

export const entriesTabStyles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
  },
  header: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: vars["--aui-space-12"],
  },
  headerText: {
    display: "flex",
    minWidth: 0,
    flex: 1,
    flexDirection: "column",
    gap: vars["--aui-space-4"],
  },
  title: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
    color: vars["--aui-color-text"],
  },
  description: {
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  addButton: {
    gap: vars["--aui-space-4"],
  },
  emptyState: {
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "dashed",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface-tint"],
  },
  emptyIcon: {
    width: 16,
    height: 16,
  },
  buttonIcon: {
    width: 14,
    height: 14,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
});
