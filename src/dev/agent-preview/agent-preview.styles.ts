import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Styles for the dev-only agent trace preview root. */
export const agentPreviewStyles = stylex.create({
  toggle: {
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-text"],
    },
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    paddingBlock: vars["--aui-space-4"],
    paddingInline: 10,
  },
  toggleActive: {
    backgroundColor: vars["--aui-color-accent-soft"],
    borderColor: vars["--aui-color-accent"],
    color: vars["--aui-color-text"],
  },
  column: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: vars["--aui-space-12"],
    minWidth: 0,
  },
  columnHeader: {
    borderBottomColor: vars["--aui-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-2"],
    paddingBottom: vars["--aui-space-8"],
  },
  columnTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  columnNote: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  columnBody: {
    backgroundColor: vars["--aui-color-surface"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    minWidth: 0,
    padding: vars["--aui-space-16"],
  },
  page: {
    backgroundColor: vars["--aui-color-canvas"],
    color: vars["--aui-color-text"],
    minHeight: "100vh",
    padding: vars["--aui-space-24"],
  },
  container: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-20"],
    marginInline: "auto",
    maxWidth: 1500,
  },
  controlsRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-16"],
  },
  heading: {
    fontSize: vars["--aui-font-size-lead"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  toggleGroup: {
    alignItems: "center",
    display: "flex",
    gap: 6,
  },
  fontLabel: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-8"],
  },
  fontValue: {
    color: vars["--aui-color-text"],
    fontVariantNumeric: "tabular-nums",
  },
});
