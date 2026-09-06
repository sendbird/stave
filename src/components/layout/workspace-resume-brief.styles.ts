import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Manually maintained "Workspace direction" block above the turn recap. */
export const workspaceResumeBriefStyles = stylex.create({
  root: {
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    marginBlockEnd: vars.space12,
    paddingBlockEnd: vars.space12,
  },
  header: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
    justifyContent: "space-between",
    paddingBlock: vars.space8,
  },
  heading: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
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
