import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const entryFormStyles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  fieldLabel: {
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  hint: {
    display: "block",
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-text-muted"],
  },
  fieldError: {
    display: "block",
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-danger-text"],
  },
  commands: {
    minHeight: "7rem",
  },
  invalidControl: {
    borderColor: vars["--ads-color-danger-border"],
  },
  triggerFull: {
    width: "100%",
  },
  switchRow: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
  },
  switchLabel: {
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text"],
  },
  advancedToggle: {
    height: 32,
    paddingInline: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
  },
  advanced: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border"],
    paddingTop: vars["--ads-space-12"],
  },
  idDisplayRow: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
  },
  idDisplay: {
    minWidth: 0,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
  },
  idDisplaySet: {
    color: vars["--ads-color-text"],
  },
  idDisplayEmpty: {
    color: vars["--ads-color-text-muted"],
  },
  idEditButton: {
    height: 32,
  },
  grid: {
    display: "grid",
    gap: vars["--ads-space-12"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 40rem)": "1fr 1fr",
    },
  },
  toggleGroup: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--ads-space-16"],
    borderRadius: vars["--ads-radius-panel"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface-tint"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: 10,
  },
});
