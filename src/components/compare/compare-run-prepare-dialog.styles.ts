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
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    paddingBlock: vars["--ads-space-24"],
    paddingInline: "1.75rem",
    paddingRight: vars["--ads-space-64"],
  },
  headerRow: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars["--ads-space-12"],
  },
  headerMark: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-surface-tint"],
    borderRadius: vars["--ads-radius-control"],
    color: vars["--ads-color-text-muted"],
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
    gap: vars["--ads-space-8"],
  },
  headerTitle: {
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "-0.015em",
  },
  headerStep: {
    color: vars["--ads-color-accent"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
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
    paddingBlock: vars["--ads-space-24"],
  },
  sectionBordered: {
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    paddingBlock: vars["--ads-space-24"],
  },
  sectionIntro: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    marginBottom: vars["--ads-space-12"],
  },
  sectionHeadingRow: {
    alignItems: "flex-end",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    justifyContent: "space-between",
    marginBottom: vars["--ads-space-12"],
  },
  sectionHeadingGroup: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  heading: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  helpText: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: "1.25rem",
  },
  branchTag: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "inline-flex",
    fontSize: vars["--ads-font-size-caption"],
    gap: 6,
  },
  textarea: {
    lineHeight: "1.5rem",
    minHeight: "7rem",
    paddingBlock: 10,
    paddingInline: vars["--ads-space-12"],
    resize: "vertical",
  },
  textareaShort: {
    lineHeight: "1.5rem",
    minHeight: "6rem",
    paddingBlock: 10,
    paddingInline: vars["--ads-space-12"],
    resize: "vertical",
  },

  candidateList: {
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
  },
  candidateRow: {
    alignItems: "center",
    columnGap: vars["--ads-space-12"],
    display: "grid",
    gridTemplateColumns: {
      default: "2rem minmax(8rem, 0.55fr) minmax(18rem, 1fr)",
      "@media (max-width: 640px)": "2rem minmax(0, 1fr)",
    },
    minHeight: "5rem",
    paddingBlock: vars["--ads-space-12"],
  },
  candidateRowDivider: {
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
  },
  candidateIndex: {
    color: vars["--ads-color-text-muted"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-micro"],
  },
  candidateMain: {
    minWidth: 0,
  },
  candidateName: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  candidateSub: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginTop: 2,
  },

  judgeGrid: {
    alignItems: "center",
    display: "grid",
    gap: vars["--ads-space-16"],
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 640px)": "minmax(0,1fr) minmax(20rem,1fr)",
    },
  },
  judgeIntro: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars["--ads-space-12"],
  },
  // The glyph sits inline at the heading's cap height; a tinted well around
  // it was decoration with no state behind it.
  judgeMark: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    flexShrink: 0,
    height: 20,
    justifyContent: "center",
    marginTop: 1,
    width: 20,
  },
  judgeIntroText: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },

  safetyRow: {
    alignItems: "flex-start",
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-20"],
  },
  safetyIcon: {
    color: vars["--ads-color-success-text"],
    flexShrink: 0,
    height: 16,
    marginTop: 2,
    width: 16,
  },
  safetyText: {
    color: vars["--ads-color-text-muted"],
    lineHeight: "1.5rem",
  },

  footer: {
    alignItems: "center",
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    justifyContent: {
      default: null,
      "@media (min-width: 640px)": "space-between",
    },
    paddingBlock: vars["--ads-space-16"],
    paddingInline: "1.75rem",
  },
  footerTrail: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  footerActions: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
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
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    height: 36,
    maxWidth: "none",
    paddingInline: vars["--ads-space-12"],
    width: "100%",
  },
  selectorMenu: {
    maxWidth: {
      default: null,
      "@media (min-width: 640px)": "32rem",
    },
  },
});
