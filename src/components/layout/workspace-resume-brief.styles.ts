import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Shared instructions within the Information panel. */
export const workspaceResumeBriefStyles = stylex.create({
  root: {
    marginBlockEnd: vars["--ads-space-12"],
  },
  intro: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-relaxed"],
    marginBlockEnd: vars["--ads-space-12"],
  },
  draftStatus: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginBlockEnd: vars["--ads-space-8"],
  },
  error: {
    color: vars["--ads-color-danger-text"],
    fontSize: vars["--ads-font-size-caption"],
    marginBlockEnd: vars["--ads-space-8"],
  },
  form: {
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
    color: vars["--ads-color-text"],
    display: "block",
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  fieldHint: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-relaxed"],
  },
  fieldFooter: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: vars["--ads-space-8"],
  },
  counter: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
  counterWarning: { color: vars["--ads-color-warning-text"] },
  warning: {
    color: vars["--ads-color-warning-text"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-relaxed"],
    marginInlineStart: 0,
  },
  metaRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    marginInlineStart: 0,
  },
  appliedMark: {
    color: vars["--ads-color-success-text"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  formActions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    marginBlock: 0,
  },
  term: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  definition: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-relaxed"],
    marginBlockStart: vars["--ads-space-4"],
    marginInlineStart: 0,
    overflowWrap: "break-word",
    whiteSpace: "pre-wrap",
  },
  meta: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  metaValue: { marginInlineStart: 0 },
  empty: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-relaxed"],
  },
});
