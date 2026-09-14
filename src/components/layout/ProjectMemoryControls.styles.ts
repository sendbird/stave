import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Project-memory settings controls (collection template, kinds, clear/reset). */
export const projectMemoryControlsStyles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-16"],
  },
  errorBlock: {
    color: vars["--ads-color-danger-text"],
    display: "flex",
    flexDirection: "column",
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
  },
  loading: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
  },
  fieldset: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-16"],
  },
  toggleRow: {
    alignItems: "flex-start",
    display: "flex",
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-16"],
    justifyContent: "space-between",
  },
  toggleHint: {
    color: vars["--ads-color-text-muted"],
    display: "block",
    fontSize: vars["--ads-font-size-caption"],
    marginBlockStart: vars["--ads-space-4"],
  },
  kindsFieldset: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  legend: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    marginBlockEnd: vars["--ads-space-8"],
  },
  kindRow: {
    alignItems: "center",
    display: "flex",
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
  },
  templateLabel: {
    display: "block",
    fontSize: vars["--ads-font-size-body"],
  },
  templateLabelStack: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  templateTitle: {
    fontWeight: vars["--ads-font-weight-medium"],
  },
  templateHint: {
    color: vars["--ads-color-text-muted"],
    display: "block",
    fontSize: vars["--ads-font-size-caption"],
  },
  templateTextarea: {
    fontSize: vars["--ads-font-size-body"],
    minHeight: 192,
    resize: "vertical",
  },
  actionRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  footer: {
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    paddingBlockStart: vars["--ads-space-16"],
  },
  footerCount: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
  },
  footerActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  dialogError: {
    color: vars["--ads-color-danger-text"],
    fontSize: vars["--ads-font-size-body"],
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-20"],
    maxWidth: "48rem",
  },
  sectionTitle: {
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  sectionLead: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    marginBlockStart: vars["--ads-space-4"],
  },
});
