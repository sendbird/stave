import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

export const compareRunPrepareDialogStyles = stylex.create({
  content: {
    gap: 0,
    maxHeight: "88vh",
    maxWidth: "56rem",
    overflow: "hidden",
    padding: 0,
  },
  header: {
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    paddingBlock: vars.space24,
    paddingInline: "1.75rem",
    paddingRight: vars.space64,
  },
  headerRow: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars.space12,
  },
  headerMark: {
    alignItems: "center",
    backgroundColor: vars.colorAccentSoft,
    borderRadius: vars.radiusControl,
    color: vars.colorAccent,
    display: "flex",
    flexShrink: 0,
    height: 36,
    justifyContent: "center",
    marginTop: 2,
    width: 36,
  },
  headerText: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
  },
  headerTitleRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  headerTitle: {
    fontSize: vars.fontSizeLead,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "-0.015em",
  },
  headerStep: {
    color: vars.colorAccent,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  headerDescription: {
    lineHeight: "1.5rem",
    maxWidth: "42rem",
  },

  scroller: {
    minHeight: 0,
    overflowY: "auto",
    paddingInline: "1.75rem",
  },
  section: {
    paddingBlock: vars.space24,
  },
  sectionBordered: {
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
    paddingBlock: vars.space24,
  },
  sectionIntro: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    marginBottom: vars.space12,
  },
  sectionHeadingRow: {
    alignItems: "flex-end",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
    justifyContent: "space-between",
    marginBottom: vars.space12,
  },
  sectionHeadingGroup: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
  },
  heading: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
  },
  helpText: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    lineHeight: "1.25rem",
  },
  branchTag: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "inline-flex",
    fontSize: vars.fontSizeCaption,
    gap: 6,
  },
  textarea: {
    lineHeight: "1.5rem",
    minHeight: "7rem",
    paddingBlock: 10,
    paddingInline: vars.space12,
    resize: "vertical",
  },
  textareaShort: {
    lineHeight: "1.5rem",
    minHeight: "6rem",
    paddingBlock: 10,
    paddingInline: vars.space12,
    resize: "vertical",
  },

  candidateList: {
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
  },
  candidateRow: {
    alignItems: "center",
    columnGap: vars.space12,
    display: "grid",
    gridTemplateColumns: {
      default: "2rem minmax(8rem, 0.55fr) minmax(18rem, 1fr)",
      "@media (max-width: 640px)": "2rem minmax(0, 1fr)",
    },
    minHeight: "5rem",
    paddingBlock: vars.space12,
  },
  candidateRowDivider: {
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
  },
  candidateIndex: {
    color: vars.colorTextMuted,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeMicro,
  },
  candidateMain: {
    minWidth: 0,
  },
  candidateName: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
  },
  candidateSub: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    marginTop: 2,
  },

  judgeGrid: {
    alignItems: "center",
    display: "grid",
    gap: vars.space16,
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 640px)": "minmax(0,1fr) minmax(20rem,1fr)",
    },
  },
  judgeIntro: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars.space12,
  },
  judgeMark: {
    alignItems: "center",
    backgroundColor: vars.colorAccentSoft,
    borderRadius: vars.radiusControl,
    color: vars.colorAccent,
    display: "flex",
    flexShrink: 0,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  judgeIntroText: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
  },

  safetyRow: {
    alignItems: "flex-start",
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
    display: "flex",
    fontSize: vars.fontSizeBody,
    gap: vars.space12,
    paddingBlock: vars.space20,
  },
  safetyIcon: {
    color: vars.colorSuccessText,
    flexShrink: 0,
    height: 16,
    marginTop: 2,
    width: 16,
  },
  safetyText: {
    color: vars.colorTextMuted,
    lineHeight: "1.5rem",
  },

  footer: {
    alignItems: "center",
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
    justifyContent: {
      default: null,
      "@media (min-width: 640px)": "space-between",
    },
    paddingBlock: vars.space16,
    paddingInline: "1.75rem",
  },
  footerTrail: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },
  footerActions: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
  },

  // Icons
  markIcon: { height: 18, width: 18 },
  smallIcon: { height: 14, width: 14 },
  playIcon: { height: 16, width: 16 },

  // ModelSelector overrides
  selectorFull: {
    width: "100%",
  },
  selectorTrigger: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    height: 36,
    maxWidth: "none",
    paddingInline: vars.space12,
    width: "100%",
  },
  selectorMenu: {
    maxWidth: {
      default: null,
      "@media (min-width: 640px)": "32rem",
    },
  },
});
