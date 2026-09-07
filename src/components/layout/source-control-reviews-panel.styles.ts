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
      ":hover": vars.colorOverlayHover,
      ":focus-visible": vars.colorOverlayHover,
    },
    borderRadius: vars.radiusPanel,
    // The lead glyph inherits this so it brightens with the row, replacing the
    // `group-hover:` pair StyleX has no cross-element selector for.
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
    display: "flex",
    gap: vars.space12,
    minBlockSize: vars.space64,
    minInlineSize: 0,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
    textAlign: "start",
    inlineSize: "100%",
  },
  inboxRowMark: {
    alignItems: "center",
    backgroundColor: vars.colorCanvasSubtle,
    borderRadius: vars.radiusControl,
    color: "inherit",
    display: "flex",
    flexShrink: 0,
    blockSize: vars.controlHeightXs,
    justifyContent: "center",
    marginBlockStart: vars.space2,
    inlineSize: vars.controlHeightXs,
  },
  inboxRowBody: { flex: 1, minInlineSize: 0 },
  inboxRowRepo: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    fontSize: vars.fontSizeCaption,
    gap: vars.space4,
    minInlineSize: 0,
  },
  inboxRowTitle: {
    color: vars.colorText,
    display: "-webkit-box",
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightControl,
    marginBlockStart: vars.space4,
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  inboxRowMeta: {
    alignItems: "center",
    color: vars.colorTextMuted,
    columnGap: vars.space8,
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars.fontSizeMicro,
    lineHeight: vars.lineHeightNormal,
    marginBlockStart: vars.space4,
    rowGap: vars.space4,
  },
  inboxList: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space2,
    padding: vars.space4,
  },

  // --- shared states ------------------------------------------------------
  centeredStatus: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
    justifyContent: "center",
    minBlockSize: 160,
  },
  fillStatus: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    flex: 1,
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
    justifyContent: "center",
  },
  errorBox: {
    backgroundColor: vars.colorDangerSoft,
    borderColor: vars.colorDangerBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    margin: vars.space12,
    paddingBlock: vars.space12,
    paddingInline: vars.space12,
  },
  errorRow: { alignItems: "flex-start", display: "flex", gap: vars.space8 },
  errorIcon: {
    color: vars.colorDangerText,
    flexShrink: 0,
    blockSize: vars.controlIconSizeMd,
    inlineSize: vars.controlIconSizeMd,
    marginBlockStart: vars.space2,
  },
  errorTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  errorDetail: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
    marginBlockStart: vars.space4,
    overflowWrap: "break-word",
  },
  emptyState: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    minBlockSize: 192,
    paddingInline: vars.space24,
    textAlign: "center",
  },
  emptyMark: {
    alignItems: "center",
    backgroundColor: vars.colorCanvasSubtle,
    borderRadius: vars.radiusPanel,
    color: vars.colorTextMuted,
    display: "flex",
    blockSize: vars.controlHeightLg,
    justifyContent: "center",
    inlineSize: vars.controlHeightLg,
  },
  emptyMarkIcon: { blockSize: vars.space20, inlineSize: vars.space20 },
  emptyTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    marginBlockStart: vars.space12,
  },
  emptyBody: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
    marginBlockStart: vars.space4,
    maxInlineSize: "16rem",
  },

  // --- files tab ----------------------------------------------------------
  filesPane: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    padding: vars.space8,
  },
  filesWarning: {
    backgroundColor: vars.colorWarningSoft,
    borderRadius: vars.radiusPanel,
    color: vars.colorWarningText,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  fileRow: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
      ":focus-visible": vars.colorOverlayHover,
    },
    borderRadius: vars.radiusPanel,
    cursor: { default: null, ":disabled": "not-allowed" },
    display: "flex",
    gap: vars.space8,
    minBlockSize: vars.controlHeightXl,
    minInlineSize: 0,
    opacity: { default: null, ":disabled": vars.opacityDisabled },
    paddingBlock: vars.space8,
    paddingInline: vars.space8,
    textAlign: "start",
    inlineSize: "100%",
  },
  fileIcon: {
    blockSize: vars.controlIconSizeMd,
    color: vars.colorTextMuted,
    flexShrink: 0,
    inlineSize: vars.controlIconSizeMd,
  },
  fileName: {
    color: vars.colorText,
    flex: 1,
    fontSize: vars.fontSizeCaption,
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  fileDiffStat: {
    flexShrink: 0,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeMicro,
  },
  additions: { color: vars.colorDiffAddedText },
  deletions: { color: vars.colorDiffRemovedText },
  filesFootnote: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
    paddingBlock: vars.space8,
    paddingInline: vars.space8,
  },

  // --- conversation tab ---------------------------------------------------
  conversationPane: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space16,
    paddingBlock: vars.space12,
    paddingInline: vars.space12,
  },
  conversationSection: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  sectionLabel: {
    color: vars.colorText,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  bodyText: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
    overflowWrap: "break-word",
    whiteSpace: "pre-wrap",
  },
  mutedText: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
  },
  timeline: { display: "flex", flexDirection: "column", gap: vars.space12 },
  timelineItem: {
    backgroundColor: vars.colorSurfaceTint,
    borderRadius: vars.radiusPanel,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  timelineMeta: {
    alignItems: "center",
    color: vars.colorTextMuted,
    columnGap: vars.space8,
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars.fontSizeMicro,
    rowGap: vars.space4,
  },
  timelineAuthor: { color: vars.colorText, fontWeight: vars.fontWeightMedium },
  timelineBody: {
    color: vars.colorText,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
    marginBlockStart: vars.space8,
    overflowWrap: "break-word",
    whiteSpace: "pre-wrap",
  },

  // --- checks tab ---------------------------------------------------------
  checksEmpty: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
    paddingBlock: vars.space32,
    paddingInline: vars.space16,
    textAlign: "center",
  },
  checksList: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    padding: vars.space8,
  },
  checkRow: {
    alignItems: "center",
    borderRadius: vars.radiusPanel,
    display: "flex",
    gap: vars.space8,
    minBlockSize: vars.controlHeightXl,
    paddingBlock: vars.space8,
    paddingInline: vars.space8,
  },
  checkIcon: {
    blockSize: vars.controlIconSizeMd,
    flexShrink: 0,
    inlineSize: vars.controlIconSizeMd,
  },
  checkIconSuccess: { color: vars.colorSuccessText },
  checkIconFail: { color: vars.colorDangerText },
  checkIconPending: { color: vars.colorWarningText },
  checkName: {
    color: vars.colorText,
    flex: 1,
    fontSize: vars.fontSizeCaption,
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  checkStatus: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    fontSize: vars.fontSizeMicro,
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
    borderBlockEndColor: vars.colorBorder,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars.borderWidthHairline,
    display: "flex",
    gap: vars.space8,
    minBlockSize: vars.space48,
    paddingBlock: vars.space4,
    paddingInline: vars.space8,
  },
  detailHeaderText: { flex: 1, minInlineSize: 0 },
  breadcrumb: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  detailTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  iconMd: { blockSize: vars.controlIconSizeMd, inlineSize: vars.controlIconSizeMd },
  iconSm: { blockSize: vars.controlIconSizeSm, inlineSize: vars.controlIconSizeSm },
  iconXs: { blockSize: vars.space12, inlineSize: vars.space12 },
  spinning: { animationDuration: "1s", animationIterationCount: "infinite", animationName: { default: spin, "@media (prefers-reduced-motion: reduce)": "none" }, animationTimingFunction: "linear" },
  summaryStrip: {
    borderBlockEndColor: vars.colorBorder,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  badgeRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space4,
  },
  monoBadge: { fontFamily: vars.fontMono },
  summaryLine: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    lineHeight: vars.lineHeightNormal,
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
    borderBlockEndColor: vars.colorBorder,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars.borderWidthHairline,
    display: "flex",
    gap: vars.space8,
    minBlockSize: vars.controlHeightXl,
    paddingBlock: vars.space4,
    paddingInline: vars.space8,
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
    paddingBlockStart: vars.space4,
    paddingInline: vars.space8,
  },
  // The inbox keeps the enclosed pill track (a two-item segmented control next
  // to a refresh button), so the ADS list owns all of its own chrome here.
  inboxTabList: { minInlineSize: 0 },
  tabPanel: { minBlockSize: 0, overflow: "auto" },
  detailFooter: {
    backgroundColor: vars.colorSurface,
    borderBlockStartColor: vars.colorBorder,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars.borderWidthHairline,
    flexShrink: 0,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  footerNote: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    marginBlockStart: vars.space4,
    textAlign: "center",
  },
  inboxFooter: {
    borderBlockStartColor: vars.colorBorder,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars.borderWidthHairline,
    flexShrink: 0,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  inboxFooterText: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    fontSize: vars.fontSizeMicro,
    gap: vars.space4,
  },
  truncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  shrink0: { flexShrink: 0 },
});
