import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

export const entryFormStyles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
  },
  fieldLabel: {
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  hint: {
    display: "block",
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  fieldError: {
    display: "block",
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-danger-text"],
  },
  commands: {
    minHeight: "7rem",
  },
  invalidControl: {
    borderColor: vars["--aui-color-danger-border"],
  },
  triggerFull: {
    width: "100%",
  },
  switchRow: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
  },
  switchLabel: {
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text"],
  },
  advancedToggle: {
    height: 32,
    paddingInline: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
  },
  advanced: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
    borderTopWidth: vars["--aui-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--aui-color-border"],
    paddingTop: vars["--aui-space-12"],
  },
  idDisplayRow: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
  },
  idDisplay: {
    minWidth: 0,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
  },
  idDisplaySet: {
    color: vars["--aui-color-text"],
  },
  idDisplayEmpty: {
    color: vars["--aui-color-text-muted"],
  },
  idEditButton: {
    height: 32,
  },
  grid: {
    display: "grid",
    gap: vars["--aui-space-12"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 40rem)": "1fr 1fr",
    },
  },
  toggleGroup: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--aui-space-16"],
    borderRadius: vars["--aui-radius-panel"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface-tint"],
    paddingInline: vars["--aui-space-12"],
    paddingBlock: 10,
  },
});
