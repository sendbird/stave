import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

export const continueWorkspaceStyles = stylex.create({
  surface: {
    maxWidth: {
      default: "28rem",
      "@media (min-width: 40rem)": "36rem",
    },
  },
  form: {
    display: "grid",
    gap: vars["--aui-space-16"],
  },
  body: {
    display: "grid",
    gap: vars["--aui-space-16"],
  },
  summaryGrid: {
    display: "grid",
    gap: vars["--aui-space-12"],
    borderRadius: vars["--aui-radius-frame"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface-tint"],
    padding: vars["--aui-space-16"],
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 40rem)": "repeat(2, minmax(0, 1fr))",
    },
  },
  summaryCell: {
    display: "grid",
    gap: 6,
    alignContent: "start",
  },
  eyebrow: {
    margin: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: vars["--aui-color-text-muted"],
  },
  stack: {
    display: "grid",
    gap: vars["--aui-space-8"],
    justifyItems: "start",
  },
  badge: {
    justifyContent: "flex-start",
  },
  branchIcon: {
    width: 14,
    height: 14,
    color: vars["--aui-color-text-muted"],
  },
  truncated: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  caption: {
    margin: 0,
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  cellHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--aui-space-8"],
  },
  changeButton: {
    height: 24,
    paddingInline: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-text"],
      ":active": vars["--aui-color-text"],
    },
  },
  pickerPanel: {
    display: "grid",
    gap: vars["--aui-space-8"],
    borderRadius: vars["--aui-radius-frame"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface-tint"],
    padding: vars["--aui-space-12"],
  },
  fieldBlock: {
    display: "grid",
    gap: vars["--aui-space-8"],
  },
  fieldLabel: {
    margin: 0,
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  nameInput: {
    height: 40,
    borderRadius: vars["--aui-radius-control"],
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-canvas"],
  },
  error: {
    margin: 0,
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-danger-text"],
  },
  submitLoader: {
    marginInlineEnd: vars["--aui-space-8"],
  },
});
