import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Styles for the dev-only agent trace preview root. */
export const agentPreviewStyles = stylex.create({
  toggle: {
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
    },
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    paddingBlock: vars["--ads-space-4"],
    paddingInline: 10,
  },
  toggleActive: {
    backgroundColor: vars["--ads-color-accent-soft"],
    borderColor: vars["--ads-color-accent"],
    color: vars["--ads-color-text"],
  },
  column: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    minWidth: 0,
  },
  columnHeader: {
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-2"],
    paddingBottom: vars["--ads-space-8"],
  },
  columnTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  columnNote: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  columnBody: {
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    minWidth: 0,
    padding: vars["--ads-space-16"],
  },
  page: {
    backgroundColor: vars["--ads-color-canvas"],
    color: vars["--ads-color-text"],
    minHeight: "100vh",
    padding: vars["--ads-space-24"],
  },
  container: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-20"],
    marginInline: "auto",
    maxWidth: 1500,
  },
  controlsRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-16"],
  },
  heading: {
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  toggleGroup: {
    alignItems: "center",
    display: "flex",
    gap: 6,
  },
  fontLabel: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-8"],
  },
  fontValue: {
    color: vars["--ads-color-text"],
    fontVariantNumeric: "tabular-nums",
  },
  columns: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-24"],
    "@media (min-width: 64rem)": {
      flexDirection: "row",
    },
  },
});
