import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

export const compareRunPanelStyles = stylex.create({
  // Empty state (no compare run selected)
  emptyViewport: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-canvas"],
    display: "flex",
    height: "100%",
    justifyContent: "center",
    padding: vars["--aui-space-24"],
  },
  emptyRoot: {
    backgroundColor: "transparent",
    borderStyle: "none",
    padding: 0,
  },
  emptyHeader: {
    gap: vars["--aui-space-12"],
  },
  emptyMedia: {
    // Empty-state medallion: neutral by contract. Accent is reserved for the
    // primary action, active/selected state, and links.
    backgroundColor: vars["--aui-color-surface-tint"],
    borderRadius: vars["--aui-radius-frame"],
    color: vars["--aui-color-text-muted"],
    // Logical names, matching the keys AUI `emptyStateStyles.media` declares
    // (`inlineSize: 48` / `minBlockSize: 48`). StyleX treats `width` and
    // `inlineSize` as distinct atomic properties, so overriding with the
    // physical name would leave the medallion 48px on whichever axis AUI still
    // owns and render it non-square.
    blockSize: 56,
    inlineSize: 56,
    minBlockSize: 56,
  },
  emptyTextGroup: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
  },
  emptyTitle: {
    fontSize: vars["--aui-font-size-heading"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  emptyDescription: {
    fontSize: vars["--aui-font-size-body"],
    maxWidth: "28rem",
  },

  // Root shell
  root: {
    backgroundColor: vars["--aui-color-canvas"],
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
  },

  // Header region
  header: {
    backgroundColor: vars["--aui-color-surface"],
    borderBottomColor: vars["--aui-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    flexShrink: 0,
    paddingBlock: vars["--aui-space-16"],
    paddingInline: vars["--aui-space-20"],
  },
  headerRow: {
    alignItems: "flex-start",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-16"],
    justifyContent: "space-between",
  },
  headerMain: {
    minWidth: 0,
  },
  headerTitleRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  headerIcon: {
    color: vars["--aui-color-text-muted"],
    height: 16,
    width: 16,
  },
  headerTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-lead"],
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "-0.01em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  promptRow: {
    alignItems: "flex-start",
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-8"],
    marginTop: vars["--aui-space-8"],
    maxWidth: "48rem",
  },
  promptLabel: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  promptText: {
    color: vars["--aui-color-text"],
    display: "-webkit-box",
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  headerActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--aui-space-8"],
  },
  actionButton: {
    height: 32,
  },
  actionButtonShrink: {
    flexShrink: 0,
    height: 32,
  },

  // Stepper
  stepper: {
    backgroundColor: vars["--aui-color-canvas"],
    borderBottomColor: vars["--aui-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    display: "grid",
    flexShrink: 0,
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  },
  step: {
    minWidth: 0,
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-16"],
    position: "relative",
  },
  stepDivider: {
    borderRightColor: vars["--aui-color-border"],
    borderRightStyle: "solid",
    borderRightWidth: vars["--aui-border-width-hairline"],
  },
  stepActive: {
    backgroundColor: vars["--aui-color-accent-soft"],
  },
  stepHeadRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  stepBadge: {
    alignItems: "center",
    borderColor: vars["--aui-color-border-strong"],
    borderRadius: vars["--aui-radius-full"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text-muted"],
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars["--aui-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-semibold"],
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  stepBadgeActive: {
    backgroundColor: vars["--aui-color-accent"],
    borderColor: vars["--aui-color-accent"],
    color: vars["--aui-color-accent-text"],
  },
  stepBadgeComplete: {
    backgroundColor: vars["--aui-color-success-soft"],
    borderColor: vars["--aui-color-success-border"],
    color: vars["--aui-color-success-text"],
  },
  stepLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  stepLabelActive: {
    color: vars["--aui-color-text"],
  },
  stepDescription: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    marginTop: vars["--aui-space-4"],
    overflow: "hidden",
    paddingLeft: "1.75rem",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  stepUnderline: {
    backgroundColor: vars["--aui-color-accent"],
    bottom: 0,
    height: 2,
    insetInline: 0,
    position: "absolute",
  },

  // Terminal notice
  notice: {
    alignItems: "flex-start",
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    gap: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-20"],
  },
  noticeNeutral: {
    backgroundColor: vars["--aui-color-surface"],
    borderBottomColor: vars["--aui-color-border"],
  },
  noticeDestructive: {
    backgroundColor: vars["--aui-color-danger-soft"],
    borderBottomColor: vars["--aui-color-danger-border"],
  },
  noticeIcon: {
    flexShrink: 0,
    height: 16,
    marginTop: 2,
    width: 16,
  },
  noticeIconNeutral: {
    color: vars["--aui-color-text-muted"],
  },
  noticeIconDestructive: {
    color: vars["--aui-color-danger"],
  },
  noticeBody: {
    minWidth: 0,
  },
  noticeTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  noticeDescription: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1.25rem",
    marginTop: 2,
  },

  // Judge banner
  judge: {
    alignItems: "flex-start",
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    gap: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-20"],
  },
  judgeNeutral: {
    backgroundColor: vars["--aui-color-surface"],
    borderBottomColor: vars["--aui-color-border"],
  },
  judgeFailed: {
    backgroundColor: vars["--aui-color-warning-soft"],
    borderBottomColor: vars["--aui-color-warning-border"],
  },
  // A completed judge is the resting state of this banner, not an alert:
  // it keeps the neutral surface and lets the title and score speak.
  judgeCompleted: {
    backgroundColor: vars["--aui-color-surface"],
    borderBottomColor: vars["--aui-color-border"],
  },
  judgeMark: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    height: 20,
    justifyContent: "center",
    marginTop: 1,
    width: 20,
  },
  judgeMarkNeutral: {
    color: vars["--aui-color-text-muted"],
  },
  judgeMarkFailed: {
    color: vars["--aui-color-warning-text"],
  },
  judgeBody: {
    flex: 1,
    minWidth: 0,
  },
  judgeHeadRow: {
    alignItems: "center",
    columnGap: vars["--aui-space-8"],
    display: "flex",
    flexWrap: "wrap",
    rowGap: vars["--aui-space-4"],
  },
  judgeTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  judgeScore: {
    color: vars["--aui-color-text"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  judgeMeta: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  judgeRationale: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1.25rem",
    marginTop: vars["--aui-space-4"],
  },

  // Review contract row
  review: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-surface"],
    borderBottomColor: vars["--aui-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    columnGap: vars["--aui-space-20"],
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-20"],
    rowGap: vars["--aui-space-8"],
  },
  reviewHead: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  reviewIcon: {
    color: vars["--aui-color-text-muted"],
    height: 16,
    width: 16,
  },
  reviewHeadLabel: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  reviewCriteria: {
    alignItems: "center",
    columnGap: vars["--aui-space-16"],
    display: "flex",
    flexWrap: "wrap",
    minWidth: 0,
    rowGap: vars["--aui-space-4"],
  },
  reviewCriterion: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "inline-flex",
    fontSize: vars["--aui-font-size-caption"],
    gap: 6,
  },
  reviewDot: {
    backgroundColor: vars["--aui-color-accent"],
    borderRadius: vars["--aui-radius-full"],
    height: 4,
    width: 4,
  },

  // Grid + variant cards
  scroller: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    padding: vars["--aui-space-16"],
  },
  grid: {
    backgroundColor: vars["--aui-color-surface"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-raised"],
    display: "grid",
    minWidth: 760,
    overflow: "hidden",
  },
  variant: {
    display: "flex",
    flexDirection: "column",
    minHeight: "23rem",
    minWidth: 0,
  },
  variantDivider: {
    borderLeftColor: vars["--aui-color-border"],
    borderLeftStyle: "solid",
    borderLeftWidth: vars["--aui-border-width-hairline"],
  },
  // The recommendation is named by `recommendedTag`; a wash behind the whole
  // column would say it a second time and tint every score in it.
  variantRecommended: {
    backgroundColor: vars["--aui-color-surface"],
  },
  variantHeader: {
    backgroundColor: vars["--aui-color-surface"],
    borderBottomColor: vars["--aui-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-16"],
  },
  variantHeaderRow: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
  },
  variantTitleRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  variantIndex: {
    color: vars["--aui-color-text-muted"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-micro"],
  },
  variantTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  /** The candidate's state: the shared mark and word, never a color of its own. */
  variantState: {
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
  },
  recommendedTag: {
    alignItems: "center",
    color: vars["--aui-color-accent"],
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars["--aui-font-size-micro"],
    fontWeight: vars["--aui-font-weight-semibold"],
    gap: vars["--aui-space-4"],
  },
  variantModelRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    marginTop: vars["--aui-space-4"],
    minWidth: 0,
  },
  variantModelText: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  variantScoreInline: {
    color: vars["--aui-color-text"],
    flexShrink: 0,
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  variantMetaRow: {
    color: vars["--aui-color-text-muted"],
    columnGap: vars["--aui-space-12"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    marginTop: vars["--aui-space-12"],
    rowGap: vars["--aui-space-4"],
  },
  variantMetaItem: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars["--aui-space-4"],
  },
  /** What a running candidate does now, under its meta line. */
  variantNow: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    marginBottom: 0,
    marginTop: vars["--aui-space-4"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  variantConflicts: {
    color: vars["--aui-color-danger"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  variantBody: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-16"],
  },
  variantError: {
    backgroundColor: vars["--aui-color-danger-soft"],
    borderColor: vars["--aui-color-danger-border"],
    borderRadius: vars["--aui-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-danger-text"],
    fontSize: vars["--aui-font-size-caption"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-8"],
  },
  variantLoading: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-24"],
  },
  variantWarning: {
    backgroundColor: vars["--aui-color-warning-soft"],
    borderColor: vars["--aui-color-warning-border"],
    borderRadius: vars["--aui-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-warning-text"],
    fontSize: vars["--aui-font-size-caption"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-8"],
  },
  variantEmptyFiles: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    paddingBlock: vars["--aui-space-24"],
  },
  fileList: {
    display: "flex",
    flexDirection: "column",
  },
  fileRow: {
    alignItems: "center",
    borderBottomColor: vars["--aui-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    gap: vars["--aui-space-8"],
    minWidth: 0,
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-4"],
  },
  fileRowLast: {
    borderBottomWidth: 0,
  },
  fileCode: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    width: 32,
  },
  filePath: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  assessment: {
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    marginTop: vars["--aui-space-16"],
    paddingTop: vars["--aui-space-12"],
  },
  assessmentHead: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
    marginBottom: vars["--aui-space-8"],
  },
  assessmentHeadLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  assessmentScore: {
    color: vars["--aui-color-text"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  assessmentSummary: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1.25rem",
  },
  criteriaList: {
    borderBottomColor: vars["--aui-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    marginTop: vars["--aui-space-12"],
  },
  criteriaRow: {
    borderTopColor: vars["--aui-color-border-subtle"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    columnGap: vars["--aui-space-12"],
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) auto",
    paddingBlock: vars["--aui-space-8"],
  },
  criteriaRowFirst: {
    borderTopWidth: 0,
  },
  criteriaMain: {
    minWidth: 0,
  },
  criteriaTerm: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  criteriaRationale: {
    color: vars["--aui-color-text-muted"],
    display: "-webkit-box",
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1rem",
    marginTop: 2,
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  criteriaScore: {
    color: vars["--aui-color-text"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  risk: {
    color: vars["--aui-color-warning-text"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1rem",
    marginTop: vars["--aui-space-8"],
  },
  variantFooter: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-canvas"],
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    gap: vars["--aui-space-8"],
    justifyContent: "flex-end",
    paddingBlock: 10,
    paddingInline: vars["--aui-space-16"],
  },

  // Decorative icon sizes
  icon14: { height: 14, width: 14 },
  icon16: { height: 16, width: 16 },
  icon12: { height: 12, width: 12 },
  icon28: { height: 28, width: 28 },
});
