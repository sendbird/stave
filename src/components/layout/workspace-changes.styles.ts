import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";
import { SERVICE_GIT } from "@/lib/themes/service-git";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

/**
 * A row's status code swaps for its action cluster on hover/focus, but the
 * trigger is the ROW and the targets are descendants — which StyleX has no
 * selector for. The row publishes its state as custom properties and the two
 * layers read them.
 */
const ROW_CODE_OPACITY = "--stave-scm-row-code";
const ROW_ACTION_OPACITY = "--stave-scm-row-actions";
const ROW_ACTION_EVENTS = "--stave-scm-row-events";

const dangerWash = `color-mix(in oklch, ${vars.colorDanger} 15%, transparent)`;
const warningWash = `color-mix(in oklch, ${vars.colorWarning} 15%, transparent)`;
const dangerHoverWash = `color-mix(in oklch, ${vars.colorDanger} 10%, transparent)`;
const gitOpenHoverWash = `color-mix(in oklab, ${SERVICE_GIT.open} 10%, transparent)`;
const warningPanel = `color-mix(in oklch, ${vars.colorWarning} 10%, transparent)`;
const warningEdge = `color-mix(in oklch, ${vars.colorWarning} 40%, transparent)`;
const dangerPanel = `color-mix(in oklch, ${vars.colorDanger} 10%, transparent)`;
const dangerEdge = `color-mix(in oklch, ${vars.colorDanger} 40%, transparent)`;

/** Verification / PR / working-tree signal colors, keyed by local check tone. */
export const checkToneStyles = stylex.create({
  ok: { color: vars.colorSuccessText },
  warn: { color: vars.colorWarningText },
  fail: { color: vars.colorDangerText },
  neutral: { color: vars.colorTextMuted },
});

/** Per-file status-code ink in the changes list. */
export const scmStatusToneStyles = stylex.create({
  conflict: {
    color: `color-mix(in oklab, ${vars.colorText} 45%, ${SERVICE_GIT.closed})`,
  },
  unstaged: {
    color: `color-mix(in oklab, ${vars.colorText} 45%, ${SERVICE_GIT.modified})`,
  },
  staged: {
    color: `color-mix(in oklab, ${vars.colorText} 45%, ${SERVICE_GIT.open})`,
  },
  none: { color: vars.colorTextMuted },
});

/** Row-action ink, per destructive / affirmative / neutral intent. */
export const scmActionToneStyles = stylex.create({
  default: {
    backgroundColor: { default: "transparent", ":hover": vars.colorCanvasSubtle },
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
  },
  destructive: {
    backgroundColor: { default: "transparent", ":hover": dangerHoverWash },
    color: { default: vars.colorDangerText, ":hover": vars.colorDangerText },
  },
  success: {
    backgroundColor: { default: "transparent", ":hover": gitOpenHoverWash },
    color: {
      default: `color-mix(in oklab, ${vars.colorText} 45%, ${SERVICE_GIT.open})`,
      ":hover": `color-mix(in oklab, ${vars.colorText} 45%, ${SERVICE_GIT.open})`,
    },
  },
});

/** Summary-line ink for the staged / working-tree / conflict counters. */
export const scmSummaryToneStyles = stylex.create({
  staged: {
    color: `color-mix(in oklab, ${vars.colorText} 45%, ${SERVICE_GIT.open})`,
  },
  workingTree: { color: vars.colorTextMuted },
  conflicts: {
    color: `color-mix(in oklab, ${vars.colorText} 45%, ${SERVICE_GIT.closed})`,
  },
});

export const changesStyles = stylex.create({
  // ---- Tab shell ---------------------------------------------------------
  // The tabs root is an ADS grid, so the shell is expressed as grid ROWS —
  // strip, then a body that owns the scrolling — the same idiom
  // `source-control-reviews-panel.styles.ts` uses. It used to say
  // `display: flex`, which never won over the ADS root's own `display: grid`
  // and left the strip sharing the panel height with the body 50/50.
  // `gridTemplateRows` is now the shim default; the row gap is the local part.
  shell: {
    blockSize: "100%",
    minBlockSize: 0,
    overflow: "hidden",
    rowGap: 0,
  },
  modeBar: {
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    flexShrink: 0,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  tabList: {
    backgroundColor: vars.colorSurfaceTint,
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    // No `width: 100%`: the segmented control shrink-wraps its two labels. A
    // stretched track in a 300px rail is what forced the strip to overflow.
    justifyContent: "flex-start",
    padding: vars.space4,
  },
  // The inner strip is the ADS `line` idiom (same as the Reviews detail tabs),
  // not an enclosed pill track. That is the only shape that fits: as a `sm`
  // pill the three labelled+counted tabs measured ~300px of intrinsic width on
  // their own, so inside a 300px rail — shared with the verification chip and
  // two action buttons — the list hit its `overflow-x: auto` and clipped
  // "Checks" off the right edge. Stripping the track (no fill, no border, no
  // `space1` inset) and the tabs' leading glyphs takes the strip to ~220px,
  // which clears the narrowest rail width the panel reaches.
  //
  // `boxShadow: none` drops the ADS baseline rule: `viewBar` already paints a
  // bottom border one row below, and the two stacked into a double rule. The
  // 2px active bar is still anchored to the list's own bottom edge, so the
  // strip keeps reading as an underlined tab bar.
  //
  // `flexGrow: 1` + `minWidth: 0` let it take the leftover row and still
  // shrink; it never forces the row wider than the rail.
  /**
   * The row's bottom rule belongs to `viewBar` (it has to span the actions as
   * well as the strip, so the strip cannot own it), which is why the ADS
   * `line` list's own inset hairline is suppressed here.
   *
   * What was missing is the other half of that deal: the strip has to REACH
   * the rule it is supposed to underline. ADS now stretches a `line` list to
   * its row's cross size and its tabs with it, and `viewBar` gives up its
   * bottom padding, so the tab box ends exactly on the row's rule. The
   * hairline of negative end margin then lets the 2px active bar paint OVER
   * that rule instead of stacking on top of it as a second mark — the
   * `indicatorLine` geometry ADS documents, restated for a rule the host owns.
   * Measured before: a 24px strip centred in a 49px row put the bar 14px above
   * the rule.
   */
  tabListInline: {
    backgroundColor: "transparent",
    borderRadius: 0,
    boxShadow: "none",
    flexBasis: "auto",
    flexGrow: 1,
    flexShrink: 1,
    justifyContent: "flex-start",
    marginBlockEnd: `calc(-1 * ${vars.borderWidthHairline})`,
    minWidth: 0,
    padding: 0,
  },
  /**
   * No `height`: the trigger's box is the ADS recipe's
   * (`tabHeightBySize[size]` → 28px at the default `sm`, bumped to 44 under a
   * coarse pointer). A literal `height: 32` here pinned the box off that ramp
   * AND defeated the touch-target bump, since `height` and the recipe's
   * `minBlockSize` are separate properties.
   */
  /*
   * The mode strip is the ADS pill idiom, so the tab keeps the ADS control
   * radius: at `radiusPanel` the tab was rounder than the gliding indicator
   * that shares its box, so the pill and its label disagreed by a step on
   * every corner. Type and height are the `xs` rung's; only the roomier
   * `space12` gutter and the `space8` icon/label pair (Button's) are stated,
   * because this strip is a two-item segmented control rather than a dense
   * counted strip.
   */
  tabWide: {
    flex: "none",
    gap: vars.space8,
    paddingInline: vars.space12,
  },
  // Tightened for the `line` strip: a bare underlined tab has no track to sit
  // inside, so `space12` of side padding was buying separation the list's own
  // `space2` gap already provides — and it was ~72px of the overflow.
  // Height, like `tabWide` above, is the `sm` recipe's rather than a literal.
  // Type, gutter and height are the ADS `xs` rung's (Caption in a 24px box
  // with a `space8` gutter) — restating them here only risked drifting off it.
  // No radius: a pill radius on a `line` tab rounded a box that has no fill,
  // and clipped the corners of the underline the variant is named after.
  // `space4` between the label and its count is the ADS step for a subscript
  // pair, which is what the count is.
  tab: {
    flex: "none",
    gap: vars.space4,
  },
  // Micro (on the ramp) rather than Caption: the count is a subscript on the
  // label, and this strip is the one that had to fight overflow in a 300px
  // rail — a rung up here buys nothing and costs width per tab.
  tabCount: { color: vars.colorTextMuted, fontSize: vars.fontSizeMicro },
  tabAlert: { color: vars.colorDangerText, fontSize: vars.fontSizeMicro },
  // Grid rows, not flex children: the panel row is already `minmax(0, 1fr)`,
  // so the pane only has to stop being a scroll container of its own and let
  // the single `paneScroll` owner do it.
  pane: { minHeight: 0, overflow: "hidden" },
  paneScroll: { minHeight: 0, overflow: "auto" },
  // `flexWrap: wrap` is the container-relative escape hatch, and it replaces a
  // magic breakpoint: while the strip, the chip and the two actions all fit on
  // one line they stay on one line; when the rail is too narrow the toolbar
  // drops to a second row instead of squeezing the tablist into its own
  // horizontal scroller (which is what hid "Checks"). Both actions stay
  // reachable at every width, and no scrollbar appears.
  viewBar: {
    alignItems: "center",
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    columnGap: vars.space8,
    display: "flex",
    flexWrap: "wrap",
    minWidth: 0,
    // No bottom padding: this row hosts a `line` tab strip, and a line strip
    // is a baseline — its rule and its active bar have to meet the row's own
    // bottom rule. `space8` under the strip is what put 8px of air plus the
    // strip's centring between the two, so the row showed an underline
    // floating above an unrelated hairline. The top padding stays, and the
    // 32px actions beside the strip still set the row's height.
    paddingBlockEnd: 0,
    paddingBlockStart: vars.space8,
    paddingInline: vars.space12,
    rowGap: vars.space4,
  },
  glyphSm: { height: 14, width: 14 },
  glyphMd: { height: 16, width: 16 },
  glyphXs: { height: 12, width: 12 },

  // ---- Status chips in the view bar --------------------------------------
  statusChip: {
    alignItems: "center",
    borderRadius: vars.radiusPanel,
    display: "flex",
    flexShrink: 0,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    gap: vars.space4,
    paddingBlock: vars.space4,
    paddingInline: 6,
  },
  statusChipPressable: {
    backgroundColor: { default: "transparent", ":hover": vars.colorCanvasSubtle },
  },
  // `marginInlineStart: auto` pins the actions to the trailing edge whether
  // they share the tablist's row or have wrapped onto their own.
  toolbar: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars.space4,
    marginInlineStart: "auto",
  },
  refreshButton: {
    borderRadius: vars.radiusPanel,
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
    height: 32,
    width: 32,
  },
  autoRefreshButton: {
    borderRadius: vars.radiusPanel,
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
    gap: vars.space4,
    height: 32,
    paddingInline: 6,
  },
  autoRefreshButtonOn: {
    color: { default: vars.colorSuccessText, ":hover": vars.colorSuccessText },
  },
  autoRefreshLabel: {
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  autoRefreshMenu: { width: "11rem" },
  autoRefreshMenuLabel: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  autoRefreshItem: { justifyContent: "space-between" },
  autoRefreshCheck: { color: vars.colorSuccessText, height: 14, width: 14 },
  spinning: {
    animationDuration: {
      default: vars.motionDurationLoop,
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    animationIterationCount: "infinite",
    animationName: spin,
    animationTimingFunction: "linear",
  },

  // ---- Verification popovers ---------------------------------------------
  // Width only: `density="flush"` on the popover owns the padding reset, and
  // the header/rows own the one `space12` inner gutter.
  popover: { width: "20rem" },
  popoverHeader: {
    borderBottomColor: vars.colorBorderSubtle,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  popoverHeaderRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    justifyContent: "space-between",
  },
  popoverTitle: { fontSize: vars.fontSizeCaption },
  popoverHint: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    marginTop: vars.space2,
  },
  popoverList: {
    maxHeight: "18rem",
    overflowY: "auto",
    paddingBlock: vars.space4,
  },
  popoverItem: {
    fontSize: vars.fontSizeCaption,
    paddingBlock: 6,
    paddingInline: vars.space12,
  },
  // Caption is ADS's smallest control-text rung (Button `xs`); these three
  // labels sat below it, so the panel's actions read smaller than the text
  // they act on. `controlHeightXs` is the box that rung comes with — at 24 and
  // 20 these were off the ramp entirely, which also meant the compact-density
  // axis could not move them.
  fixAllButton: {
    fontSize: vars.fontSizeCaption,
    gap: vars.space4,
    height: vars.controlHeightXs,
    paddingInline: vars.space8,
  },
  fixOneButton: {
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
    fontSize: vars.fontSizeCaption,
    flexShrink: 0,
    gap: vars.space4,
    height: vars.controlHeightXs,
    marginInlineStart: "auto",
    paddingInline: 6,
  },
  failureHead: {
    alignItems: "center",
    color: vars.colorText,
    display: "flex",
    fontWeight: vars.fontWeightMedium,
    gap: 6,
  },
  failureTag: {
    borderRadius: vars.radiusMark,
    fontSize: vars.fontSizeMicro,
    letterSpacing: "0.025em",
    paddingBlock: 1,
    paddingInline: vars.space4,
    textTransform: "uppercase",
  },
  failureTagBlocking: {
    backgroundColor: dangerWash,
    color: vars.colorDangerText,
  },
  failureTagWarn: {
    backgroundColor: warningWash,
    color: vars.colorWarningText,
  },
  truncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  failureMessage: {
    color: vars.colorTextMuted,
    marginTop: vars.space2,
    overflowWrap: "break-word",
    whiteSpace: "pre-wrap",
  },
  findingButton: {
    alignItems: "flex-start",
    backgroundColor: { default: "transparent", ":hover": vars.colorCanvasSubtle },
    display: "flex",
    flexDirection: "column",
    fontSize: vars.fontSizeCaption,
    gap: vars.space2,
    paddingBlock: 6,
    paddingInline: vars.space12,
    textAlign: "start",
    width: "100%",
  },
  findingButtonInline: {
    borderRadius: vars.radiusControl,
    paddingBlock: vars.space4,
    paddingInline: 6,
  },
  findingHead: {
    alignItems: "center",
    color: vars.colorText,
    display: "flex",
    fontWeight: vars.fontWeightMedium,
    gap: 6,
    maxWidth: "100%",
  },
  findingSeverity: {
    backgroundColor: vars.colorCanvasSubtle,
    borderRadius: vars.radiusMark,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    letterSpacing: "0.025em",
    paddingBlock: 1,
    paddingInline: vars.space4,
    textTransform: "uppercase",
  },
  findingMessage: {
    color: vars.colorTextMuted,
    overflowWrap: "break-word",
    whiteSpace: "pre-wrap",
  },

  // ---- Checks tab --------------------------------------------------------
  checks: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    paddingBlock: vars.space12,
    paddingInline: vars.space12,
  },
  checksSection: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    paddingBlock: 10,
    paddingInline: vars.space12,
  },
  checksHead: { alignItems: "center", display: "flex", gap: vars.space8 },
  checksIcon: {
    alignItems: "center",
    display: "flex",
    height: 16,
    justifyContent: "center",
    width: 16,
  },
  checksTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  checksSummary: {
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    marginInlineStart: "auto",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  checksLine: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  checksStrong: { color: vars.colorText, fontWeight: vars.fontWeightMedium },
  checksStack: { display: "flex", flexDirection: "column", gap: 6 },
  checksList: { display: "flex", flexDirection: "column", gap: vars.space4 },
  failureItem: { fontSize: vars.fontSizeCaption },
  checksTodoList: {
    color: vars.colorTextMuted,
    display: "flex",
    flexDirection: "column",
    fontSize: vars.fontSizeCaption,
    gap: vars.space2,
  },
  checksTodoRow: { alignItems: "flex-start", display: "flex", gap: 6 },
  checksTodoDot: {
    backgroundColor: vars.colorWarning,
    borderRadius: vars.radiusFull,
    flexShrink: 0,
    height: 4,
    marginTop: vars.space4,
    width: 4,
  },
  checksTodoMore: { fontSize: vars.fontSizeCaption, paddingInlineStart: 10 },

  // ---- Changes list ------------------------------------------------------
  changesBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space16,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  summarySection: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    paddingInline: vars.space4,
  },
  summaryHead: {
    alignItems: "center",
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
  },
  summaryLead: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
    minWidth: 0,
  },
  branchBadge: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusControl,
    fontWeight: vars.fontWeightRegular,
    gap: vars.space4,
    height: 24,
    justifyContent: "flex-start",
    maxWidth: "100%",
    paddingInline: vars.space8,
  },
  branchIcon: { color: vars.colorTextMuted, height: 14, width: 14 },
  summaryCount: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  busyLoader: { color: vars.colorTextMuted, flexShrink: 0 },
  summaryLabels: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars.fontSizeCaption,
    gap: vars.space8,
  },
  summaryHint: { color: vars.colorTextMuted, fontSize: vars.fontSizeCaption },
  composer: {
    borderTopColor: vars.colorBorderSubtle,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    paddingTop: vars.space12,
  },
  composerRow: { alignItems: "flex-start", display: "flex", gap: vars.space8 },
  composerInput: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusPanel,
    fontSize: vars.fontSizeBody,
    height: 36,
  },
  commitButton: {
    borderRadius: vars.radiusPanel,
    fontSize: vars.fontSizeBody,
    height: 36,
    paddingInline: vars.space12,
  },
  bulkRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  bulkButton: {
    borderRadius: vars.radiusPanel,
    fontSize: vars.fontSizeBody,
    height: 32,
  },
  sections: { display: "flex", flexDirection: "column", gap: vars.space12 },
  conflictNotice: {
    backgroundColor: warningPanel,
    borderColor: warningEdge,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorWarningText,
    fontSize: vars.fontSizeBody,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  errorNotice: {
    backgroundColor: dangerPanel,
    borderColor: dangerEdge,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorDangerText,
    fontSize: vars.fontSizeBody,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  emptyNotice: {
    backgroundColor: vars.colorSurfaceTint,
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusFrame,
    borderStyle: "dashed",
    borderWidth: vars.borderWidthHairline,
    paddingBlock: vars.space12,
    paddingInline: vars.space12,
  },
  emptyNoticeText: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
  },
  section: { display: "flex", flexDirection: "column", gap: 6 },
  sectionHead: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    justifyContent: "space-between",
    paddingInline: vars.space4,
  },
  // Labels the panel's top-level grouping, so it is a section header, not a
  // mark: Micro plus uppercase plus 0.14em tracking made the one line that
  // names a group the smallest and least legible type in the pane.
  sectionTitle: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
  },
  sectionBadge: {
    borderRadius: vars.radiusControl,
    fontWeight: vars.fontWeightRegular,
    paddingInline: vars.space8,
  },
  sectionItems: { display: "flex", flexDirection: "column", gap: 6 },

  // ---- File row ----------------------------------------------------------
  fileRow: {
    [ROW_CODE_OPACITY]: { default: "1", ":focus-within": "0", ":hover": "0" },
    [ROW_ACTION_OPACITY]: { default: "0", ":focus-within": "1", ":hover": "1" },
    [ROW_ACTION_EVENTS]: {
      default: "none",
      ":focus-within": "auto",
      ":hover": "auto",
    },
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":focus-within": vars.colorOverlayHover,
      ":hover": vars.colorOverlayHover,
    },
    borderColor: "transparent",
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    gap: vars.space8,
    paddingBlock: 6,
    paddingInline: vars.space8,
  },
  fileOpen: {
    alignItems: "center",
    borderRadius: vars.radiusControl,
    display: "flex",
    flex: 1,
    gap: vars.space8,
    minWidth: 0,
    textAlign: "start",
  },
  fileBody: { flex: 1, minWidth: 0 },
  fileTitleRow: { alignItems: "center", display: "flex", gap: vars.space8 },
  fileName: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  fileBadge: {
    borderRadius: vars.radiusControl,
    fontSize: vars.fontSizeMicro,
    paddingInline: 6,
  },
  fileVerification: { height: 12, width: 12 },
  filePath: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  fileTail: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    height: 24,
    justifyContent: "flex-end",
    position: "relative",
    width: 84,
  },
  fileCode: {
    alignItems: "center",
    display: "flex",
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    inset: 0,
    justifyContent: "flex-end",
    opacity: `var(${ROW_CODE_OPACITY})`,
    paddingInlineEnd: vars.space4,
    pointerEvents: "none",
    position: "absolute",
    transitionDuration: {
      default: vars.motionDurationQuick,
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "opacity",
    transitionTimingFunction: vars.motionEaseStandard,
  },
  fileActions: {
    alignItems: "center",
    display: "flex",
    gap: vars.space2,
    inset: 0,
    justifyContent: "flex-end",
    opacity: `var(${ROW_ACTION_OPACITY})`,
    pointerEvents: `var(${ROW_ACTION_EVENTS})`,
    position: "absolute",
    transitionDuration: {
      default: vars.motionDurationQuick,
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "opacity",
    transitionTimingFunction: vars.motionEaseStandard,
  },
  rowActionButton: {
    borderColor: "transparent",
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    height: 24,
    padding: 0,
    width: 24,
  },
  contextMenu: { width: "13rem" },

  // ---- History -----------------------------------------------------------
  historyBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  historyHead: {
    alignItems: "center",
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
    paddingInline: vars.space4,
  },
  historyCount: { color: vars.colorTextMuted, fontSize: vars.fontSizeCaption },
  historyList: { display: "flex", flexDirection: "column" },
  historyRow: {
    backgroundColor: { default: "transparent", ":hover": vars.colorOverlayHover },
    borderRadius: vars.radiusPanel,
    display: "flex",
    gap: vars.space12,
    paddingBlock: vars.space8,
    paddingInline: vars.space4,
  },
  historyRail: {
    display: "flex",
    flexShrink: 0,
    justifyContent: "center",
    paddingTop: 6,
    position: "relative",
    width: 20,
  },
  historyNode: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusFull,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxShadow: vars.elevationRaised,
    height: 10,
    width: 10,
  },
  historyThread: {
    backgroundColor: vars.colorBorderSubtle,
    bottom: -12,
    position: "absolute",
    top: 16,
    width: 1,
  },
  historyContent: {
    flex: 1,
    minWidth: 0,
    paddingBlock: vars.space2,
  },
  historyLead: { alignItems: "flex-start", display: "flex", gap: vars.space12 },
  historySubject: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  historyMeta: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars.fontSizeCaption,
    gap: vars.space8,
    marginTop: vars.space4,
  },
  historyHash: {
    color: vars.colorTextMuted,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
  },
  historyDot: {
    backgroundColor: vars.colorBorder,
    borderRadius: vars.radiusFull,
    height: 4,
    width: 4,
  },
  historyCommitIcon: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    height: 16,
    marginTop: vars.space2,
    width: 16,
  },
});
