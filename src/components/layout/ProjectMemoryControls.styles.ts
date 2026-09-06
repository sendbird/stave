import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Project-memory settings controls (collection template, kinds, clear/reset). */
export const projectMemoryControlsStyles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space16,
  },
  errorBlock: {
    color: vars.colorDangerText,
    display: "flex",
    flexDirection: "column",
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
  },
  loading: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
  },
  fieldset: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space16,
  },
  toggleRow: {
    alignItems: "flex-start",
    display: "flex",
    fontSize: vars.fontSizeBody,
    gap: vars.space16,
    justifyContent: "space-between",
  },
  toggleHint: {
    color: vars.colorTextMuted,
    display: "block",
    fontSize: vars.fontSizeCaption,
    marginBlockStart: vars.space4,
  },
  kindsFieldset: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  legend: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    marginBlockEnd: vars.space8,
  },
  kindRow: {
    alignItems: "center",
    display: "flex",
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
  },
  templateLabel: {
    display: "block",
    fontSize: vars.fontSizeBody,
  },
  templateLabelStack: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  templateTitle: {
    fontWeight: vars.fontWeightMedium,
  },
  templateHint: {
    color: vars.colorTextMuted,
    display: "block",
    fontSize: vars.fontSizeCaption,
  },
  templateTextarea: {
    fontSize: vars.fontSizeBody,
    minHeight: 192,
    resize: "vertical",
  },
  actionRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  footer: {
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    paddingBlockStart: vars.space16,
  },
  footerCount: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
  },
  footerActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  dialogError: {
    color: vars.colorDangerText,
    fontSize: vars.fontSizeBody,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space20,
    maxWidth: "48rem",
  },
  sectionTitle: {
    fontSize: vars.fontSizeLead,
    fontWeight: vars.fontWeightSemibold,
  },
  sectionLead: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    marginBlockStart: vars.space4,
  },
});
