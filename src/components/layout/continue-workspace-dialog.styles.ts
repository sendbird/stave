import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const continueWorkspaceStyles = stylex.create({
  surface: {
    maxWidth: {
      default: "28rem",
      "@media (min-width: 40rem)": "36rem",
    },
  },
  form: {
    display: "grid",
    gap: vars["--ads-space-16"],
  },
  body: {
    display: "grid",
    gap: vars["--ads-space-16"],
  },
  summaryGrid: {
    display: "grid",
    gap: vars["--ads-space-12"],
    borderRadius: vars["--ads-radius-frame"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface-tint"],
    padding: vars["--ads-space-16"],
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
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-semibold"],
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: vars["--ads-color-text-muted"],
  },
  stack: {
    display: "grid",
    gap: vars["--ads-space-8"],
    justifyItems: "start",
  },
  badge: {
    justifyContent: "flex-start",
  },
  branchIcon: {
    width: 14,
    height: 14,
    color: vars["--ads-color-text-muted"],
  },
  truncated: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  caption: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  cellHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--ads-space-8"],
  },
  changeButton: {
    height: 24,
    paddingInline: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
      ":active": vars["--ads-color-text"],
    },
  },
  pickerPanel: {
    display: "grid",
    gap: vars["--ads-space-8"],
    borderRadius: vars["--ads-radius-frame"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface-tint"],
    padding: vars["--ads-space-12"],
  },
  fieldBlock: {
    display: "grid",
    gap: vars["--ads-space-8"],
  },
  fieldLabel: {
    margin: 0,
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  nameInput: {
    height: 40,
    borderRadius: vars["--ads-radius-mark"],
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-canvas"],
  },
  error: {
    margin: 0,
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-danger-text"],
  },
  submitLoader: {
    marginInlineEnd: vars["--ads-space-8"],
  },
});
