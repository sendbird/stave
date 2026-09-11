import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Shared instructions within the Information panel. */
export const workspaceResumeBriefStyles = stylex.create({
  root: {
    marginBlockEnd: vars.space12,
  },
  intro: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightRelaxed,
    marginBlockEnd: vars.space12,
  },
  draftStatus: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    marginBlockEnd: vars.space8,
  },
  error: {
    color: vars.colorDangerText,
    fontSize: vars.fontSizeCaption,
    marginBlockEnd: vars.space8,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
  },
  fieldLabel: {
    color: vars.colorText,
    display: "block",
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  fieldHint: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightRelaxed,
  },
  fieldFooter: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: vars.space8,
  },
  counter: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    fontSize: vars.fontSizeCaption,
    fontVariantNumeric: "tabular-nums",
  },
  counterWarning: { color: vars.colorWarningText },
  warning: {
    color: vars.colorWarningText,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightRelaxed,
    marginInlineStart: 0,
  },
  metaRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars.space8,
    marginInlineStart: 0,
  },
  appliedMark: {
    color: vars.colorSuccessText,
    fontWeight: vars.fontWeightMedium,
  },
  formActions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    marginBlock: 0,
  },
  term: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  definition: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightRelaxed,
    marginBlockStart: vars.space4,
    marginInlineStart: 0,
    overflowWrap: "break-word",
    whiteSpace: "pre-wrap",
  },
  meta: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },
  metaValue: { marginInlineStart: 0 },
  empty: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightRelaxed,
  },
});
