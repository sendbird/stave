import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Shared instructions within the Information panel. */
export const workspaceResumeBriefStyles = stylex.create({
  root: {
    marginBlockEnd: vars["--aui-space-12"],
  },
  intro: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-relaxed"],
    marginBlockEnd: vars["--aui-space-12"],
  },
  draftStatus: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    marginBlockEnd: vars["--aui-space-8"],
  },
  error: {
    color: vars["--aui-color-danger-text"],
    fontSize: vars["--aui-font-size-caption"],
    marginBlockEnd: vars["--aui-space-8"],
  },
  form: {
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
    color: vars["--aui-color-text"],
    display: "block",
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  fieldHint: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-relaxed"],
  },
  fieldFooter: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: vars["--aui-space-8"],
  },
  counter: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
  counterWarning: { color: vars["--aui-color-warning-text"] },
  warning: {
    color: vars["--aui-color-warning-text"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-relaxed"],
    marginInlineStart: 0,
  },
  metaRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    marginInlineStart: 0,
  },
  appliedMark: {
    color: vars["--aui-color-success-text"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  formActions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
    marginBlock: 0,
  },
  term: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  definition: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-relaxed"],
    marginBlockStart: vars["--aui-space-4"],
    marginInlineStart: 0,
    overflowWrap: "break-word",
    whiteSpace: "pre-wrap",
  },
  meta: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  metaValue: { marginInlineStart: 0 },
  empty: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-relaxed"],
  },
});
