import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

export const openPathDialogStyles = stylex.create({
  backdrop: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: vars["--aui-space-16"],
    backgroundColor: vars["--aui-color-overlay"],
  },
  panel: {
    width: "100%",
    maxWidth: "28rem",
    padding: vars["--aui-space-16"],
  },
  title: {
    margin: 0,
    fontSize: vars["--aui-font-size-lead"],
    fontWeight: vars["--aui-font-weight-semibold"],
    color: vars["--aui-color-text"],
  },
  description: {
    marginBlock: 0,
    marginBlockStart: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-text-muted"],
  },
  pathLabel: {
    marginBlockStart: vars["--aui-space-12"],
  },
  pathRow: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    marginBlockStart: vars["--aui-space-4"],
  },
  pathInput: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "0%",
  },
  browseButton: {
    flexShrink: 0,
    gap: 6,
  },
  browseIcon: {
    width: 16,
    height: 16,
  },
  error: {
    marginBlock: 0,
    marginBlockStart: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-danger-text"],
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: vars["--aui-space-8"],
    marginBlockStart: vars["--aui-space-16"],
  },
});
