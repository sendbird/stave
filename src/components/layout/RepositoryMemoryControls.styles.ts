import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Project-memory settings controls (collection template, kinds, clear/reset). */
export const repositoryMemoryControlsStyles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-16"],
  },
  errorBlock: {
    color: vars["--aui-color-danger-text"],
    display: "flex",
    flexDirection: "column",
    fontSize: vars["--aui-font-size-body"],
    gap: vars["--aui-space-8"],
  },
  loading: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
  },
  fieldset: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-16"],
  },
  toggleRow: {
    alignItems: "flex-start",
    display: "flex",
    fontSize: vars["--aui-font-size-body"],
    gap: vars["--aui-space-16"],
    justifyContent: "space-between",
  },
  toggleHint: {
    color: vars["--aui-color-text-muted"],
    display: "block",
    fontSize: vars["--aui-font-size-caption"],
    marginBlockStart: vars["--aui-space-4"],
  },
  kindsFieldset: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
  },
  legend: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    marginBlockEnd: vars["--aui-space-8"],
  },
  kindRow: {
    alignItems: "center",
    display: "flex",
    fontSize: vars["--aui-font-size-body"],
    gap: vars["--aui-space-8"],
  },
  templateLabel: {
    display: "block",
    fontSize: vars["--aui-font-size-body"],
  },
  templateLabelStack: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
  },
  templateTitle: {
    fontWeight: vars["--aui-font-weight-medium"],
  },
  templateHint: {
    color: vars["--aui-color-text-muted"],
    display: "block",
    fontSize: vars["--aui-font-size-caption"],
  },
  templateTextarea: {
    fontSize: vars["--aui-font-size-body"],
    minHeight: 192,
    resize: "vertical",
  },
  actionRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  footer: {
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    paddingBlockStart: vars["--aui-space-16"],
  },
  footerCount: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
  },
  footerActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  dialogError: {
    color: vars["--aui-color-danger-text"],
    fontSize: vars["--aui-font-size-body"],
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-20"],
    maxWidth: "48rem",
  },
  sectionTitle: {
    fontSize: vars["--aui-font-size-lead"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  sectionLead: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    marginBlockStart: vars["--aui-space-4"],
  },
});
