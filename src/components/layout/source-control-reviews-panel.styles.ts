import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

const spin = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

export const reviewsStyles = stylex.create({
  // --- inbox rows ---------------------------------------------------------
  inboxRow: {
    alignItems: "flex-start",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
      ":focus-visible": vars["--ads-color-overlay-hover"],
    },
    borderRadius: vars["--ads-radius-panel"],
    // The lead glyph inherits this so it brightens with the row, replacing the
    // `group-hover:` pair StyleX has no cross-element selector for.
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    display: "flex",
    gap: vars["--ads-space-12"],
    minBlockSize: vars["--ads-space-64"],
    minInlineSize: 0,
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    textAlign: "start",
    inlineSize: "100%",
  },
  inboxRowMark: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderRadius: vars["--ads-radius-control"],
    color: "inherit",
    display: "flex",
    flexShrink: 0,
    blockSize: vars["--ads-control-height-xs"],
    justifyContent: "center",
    marginBlockStart: vars["--ads-space-2"],
    inlineSize: vars["--ads-control-height-xs"],
  },
  inboxRowBody: { flex: 1, minInlineSize: 0 },
  inboxRowRepo: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  inboxRowTitle: {
    color: vars["--ads-color-text"],
    display: "-webkit-box",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-control"],
    marginBlockStart: vars["--ads-space-4"],
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  inboxRowMeta: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    columnGap: vars["--ads-space-8"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--ads-font-size-micro"],
    lineHeight: vars["--ads-line-height-normal"],
    marginBlockStart: vars["--ads-space-4"],
    rowGap: vars["--ads-space-4"],
  },
  inboxList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-2"],
    padding: vars["--ads-space-4"],
  },

  // --- shared states ------------------------------------------------------
  centeredStatus: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
    justifyContent: "center",
    minBlockSize: 160,
  },
  fillStatus: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    flex: 1,
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
    justifyContent: "center",
  },
  errorBox: {
    backgroundColor: vars["--ads-color-danger-soft"],
    borderColor: vars["--ads-color-danger-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    margin: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
  },
  errorRow: { alignItems: "flex-start", display: "flex", gap: vars["--ads-space-8"] },
  errorIcon: {
    color: vars["--ads-color-danger-text"],
    flexShrink: 0,
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
    marginBlockStart: vars["--ads-space-2"],
  },
  errorTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  errorDetail: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
    marginBlockStart: vars["--ads-space-4"],
    overflowWrap: "break-word",
  },
  emptyState: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    minBlockSize: 192,
    paddingInline: vars["--ads-space-24"],
    textAlign: "center",
  },
  emptyMark: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderRadius: vars["--ads-radius-panel"],
    color: vars["--ads-color-text-muted"],
    display: "flex",
    blockSize: vars["--ads-control-height-lg"],
    justifyContent: "center",
    inlineSize: vars["--ads-control-height-lg"],
  },
  emptyMarkIcon: { blockSize: vars["--ads-space-20"], inlineSize: vars["--ads-space-20"] },
  emptyTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    marginBlockStart: vars["--ads-space-12"],
  },
  emptyBody: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
    marginBlockStart: vars["--ads-space-4"],
    maxInlineSize: "16rem",
  },

  // --- files tab ----------------------------------------------------------
  filesPane: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    padding: vars["--ads-space-8"],
  },
  filesWarning: {
    backgroundColor: vars["--ads-color-warning-soft"],
    borderRadius: vars["--ads-radius-panel"],
    color: vars["--ads-color-warning-text"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  fileRow: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
      ":focus-visible": vars["--ads-color-overlay-hover"],
    },
    borderRadius: vars["--ads-radius-panel"],
    cursor: { default: null, ":disabled": "not-allowed" },
    display: "flex",
    gap: vars["--ads-space-8"],
    minBlockSize: vars["--ads-control-height-xl"],
    minInlineSize: 0,
    opacity: { default: null, ":disabled": vars["--ads-opacity-disabled"] },
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-8"],
    textAlign: "start",
    inlineSize: "100%",
  },
  fileIcon: {
    blockSize: vars["--ads-control-icon-size-md"],
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  fileName: {
    color: vars["--ads-color-text"],
    flex: 1,
    fontSize: vars["--ads-font-size-caption"],
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  fileDiffStat: {
    flexShrink: 0,
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-micro"],
  },
  additions: { color: vars["--ads-color-diff-added-text"] },
  deletions: { color: vars["--ads-color-diff-removed-text"] },
  filesFootnote: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-8"],
  },

  // --- conversation tab ---------------------------------------------------
  conversationPane: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-16"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
  },
  conversationSection: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  sectionLabel: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  bodyText: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
    overflowWrap: "break-word",
    whiteSpace: "pre-wrap",
  },
  mutedText: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
  },
  timeline: { display: "flex", flexDirection: "column", gap: vars["--ads-space-12"] },
  timelineItem: {
    backgroundColor: vars["--ads-color-surface-tint"],
    borderRadius: vars["--ads-radius-panel"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  timelineMeta: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    columnGap: vars["--ads-space-8"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--ads-font-size-micro"],
    rowGap: vars["--ads-space-4"],
  },
  timelineAuthor: { color: vars["--ads-color-text"], fontWeight: vars["--ads-font-weight-medium"] },
  timelineBody: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
    marginBlockStart: vars["--ads-space-8"],
    overflowWrap: "break-word",
    whiteSpace: "pre-wrap",
  },

  // --- checks tab ---------------------------------------------------------
  checksEmpty: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
    paddingBlock: vars["--ads-space-32"],
    paddingInline: vars["--ads-space-16"],
    textAlign: "center",
  },
  checksList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    padding: vars["--ads-space-8"],
  },
  checkRow: {
    alignItems: "center",
    borderRadius: vars["--ads-radius-panel"],
    display: "flex",
    gap: vars["--ads-space-8"],
    minBlockSize: vars["--ads-control-height-xl"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-8"],
  },
  checkIcon: {
    blockSize: vars["--ads-control-icon-size-md"],
    flexShrink: 0,
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  checkIconSuccess: { color: vars["--ads-color-success-text"] },
  checkIconFail: { color: vars["--ads-color-danger-text"] },
  checkIconPending: { color: vars["--ads-color-warning-text"] },
  checkName: {
    color: vars["--ads-color-text"],
    flex: 1,
    fontSize: vars["--ads-font-size-caption"],
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  checkStatus: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-micro"],
    letterSpacing: "0.025em",
    textTransform: "uppercase",
  },

  // --- shell --------------------------------------------------------------
  shell: {
    display: "flex",
    flexDirection: "column",
    blockSize: "100%",
    minBlockSize: 0,
  },
  detailHeader: {
    alignItems: "center",
    borderBlockEndColor: vars["--ads-color-border"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-8"],
    minBlockSize: vars["--ads-space-48"],
    paddingBlock: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-8"],
  },
  detailHeaderText: { flex: 1, minInlineSize: 0 },
  breadcrumb: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  detailTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  iconMd: { blockSize: vars["--ads-control-icon-size-md"], inlineSize: vars["--ads-control-icon-size-md"] },
  iconSm: { blockSize: vars["--ads-control-icon-size-sm"], inlineSize: vars["--ads-control-icon-size-sm"] },
  iconXs: { blockSize: vars["--ads-space-12"], inlineSize: vars["--ads-space-12"] },
  spinning: { animationDuration: "1s", animationIterationCount: "infinite", animationName: { default: spin, "@media (prefers-reduced-motion: reduce)": "none" }, animationTimingFunction: "linear" },
  summaryStrip: {
    borderBlockEndColor: vars["--ads-color-border"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  badgeRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-4"],
  },
  monoBadge: { fontFamily: vars["--ads-font-mono"] },
  summaryLine: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  // The ADS tabs root is a grid, so the shell is expressed as grid ROWS
  // (strip, then a scrolling body) instead of being flipped to flex with
  // `gap: 0` — that override both fought the component and collapsed the row
  // gap the `line` strip needs under its baseline rule. Scrolling has exactly
  // one owner: the panel row.
  tabs: {
    flexGrow: 1,
    gridTemplateRows: "auto minmax(0, 1fr)",
    minBlockSize: 0,
  },
  // The inbox strip is a pill track plus a refresh button on one bordered
  // row, so its rows are strip / body / footer and the row gap stays 0 — the
  // border is the divider, and a gap under it would detach the list.
  inboxTabs: {
    blockSize: "100%",
    gridTemplateRows: "auto minmax(0, 1fr) auto",
    minBlockSize: 0,
    rowGap: 0,
  },
  inboxStrip: {
    alignItems: "center",
    borderBlockEndColor: vars["--ads-color-border"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-8"],
    minBlockSize: vars["--ads-control-height-xl"],
    paddingBlock: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-8"],
  },
  // No `width: 100%` and no `flex: 1` on the triggers: a stretched strip is
  // what made the `line` rule and the pill track read as two stacked chromes.
  // The inline padding keeps the `line` variant's baseline rule spanning the
  // panel while the labels stay aligned with the body content.
  // The `line` strip: no `inlineSize: 100%` and no `flex: 1` on the triggers.
  // A stretched strip plus a hand-drawn `border-block-end` around it was what
  // made the pill track and the baseline rule read as two stacked chromes.
  // The list is a grid item, so it already spans the panel and its own inset
  // baseline rule spans with it; the inline padding only insets the labels so
  // they align with the body content below.
  detailTabList: {
    minInlineSize: 0,
    paddingBlockStart: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-8"],
  },
  // The inbox keeps the enclosed pill track (a two-item segmented control next
  // to a refresh button), so the ADS list owns all of its own chrome here.
  inboxTabList: { minInlineSize: 0 },
  tabPanel: { minBlockSize: 0, overflow: "auto" },
  detailFooter: {
    backgroundColor: vars["--ads-color-surface"],
    borderBlockStartColor: vars["--ads-color-border"],
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars["--ads-border-width-hairline"],
    flexShrink: 0,
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  footerNote: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    marginBlockStart: vars["--ads-space-4"],
    textAlign: "center",
  },
  inboxFooter: {
    borderBlockStartColor: vars["--ads-color-border"],
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars["--ads-border-width-hairline"],
    flexShrink: 0,
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  inboxFooterText: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-micro"],
    gap: vars["--ads-space-4"],
  },
  truncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  shrink0: { flexShrink: 0 },
});
