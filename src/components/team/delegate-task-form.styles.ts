import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

/**
 * Delegate form only. Two type steps: Body for anything the user acts on
 * (group titles, controls, checkbox text) and Caption for helper lines.
 */
export const delegateTaskFormStyles = stylex.create({
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: vars["--ads-space-12"],
  },
  headerText: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-2"],
    minWidth: 0,
  },
  form: { display: "flex", flexDirection: "column", gap: vars["--ads-space-16"] },
  group: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"] },
  groupTitle: {
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  caption: {
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  // Routed identity on the left, the quiet "Change" affordance on the right.
  assigneeRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: vars["--ads-space-8"],
  },
  assigneeText: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minWidth: 0,
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  controlsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    alignItems: "end",
    gap: vars["--ads-space-8"],
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minWidth: 0,
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  fieldLabel: {
    display: "block",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text-muted"],
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "flex-start",
    gap: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  checkboxNote: {
    display: "block",
    marginTop: vars["--ads-space-2"],
    fontSize: vars["--ads-font-size-caption"],
  },
});
