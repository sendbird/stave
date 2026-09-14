import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const envEditorStyles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  label: {
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  empty: {
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-text-muted"],
  },
  rows: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-4"],
  },
  input: {
    height: 32,
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
  },
  equals: {
    color: vars["--ads-color-text-muted"],
  },
  removeButton: {
    flexShrink: 0,
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-danger-text"],
    },
  },
  addButton: {
    height: 28,
    gap: vars["--ads-space-4"],
  },
  icon: {
    width: 14,
    height: 14,
  },
});
