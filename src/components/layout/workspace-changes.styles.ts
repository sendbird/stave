import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

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

const dangerWash = `color-mix(in oklch, ${vars["--ads-color-danger"]} 15%, transparent)`;
const warningWash = `color-mix(in oklch, ${vars["--ads-color-warning"]} 15%, transparent)`;
const dangerHoverWash = `color-mix(in oklch, ${vars["--ads-color-danger"]} 10%, transparent)`;
const gitOpenHoverWash = `color-mix(in oklab, var(--service-git-open) 10%, transparent)`;
const warningPanel = `color-mix(in oklch, ${vars["--ads-color-warning"]} 10%, transparent)`;
const warningEdge = `color-mix(in oklch, ${vars["--ads-color-warning"]} 40%, transparent)`;
const dangerPanel = `color-mix(in oklch, ${vars["--ads-color-danger"]} 10%, transparent)`;
const dangerEdge = `color-mix(in oklch, ${vars["--ads-color-danger"]} 40%, transparent)`;

/** Verification / PR / working-tree signal colors, keyed by local check tone. */
export const checkToneStyles = stylex.create({
  ok: { color: vars["--ads-color-success-text"] },
  warn: { color: vars["--ads-color-warning-text"] },
  fail: { color: vars["--ads-color-danger-text"] },
  neutral: { color: vars["--ads-color-text-muted"] },
});

/** Per-file status-code ink in the changes list. */
export const scmStatusToneStyles = stylex.create({
  conflict: {
    color: `color-mix(in oklab, ${vars["--ads-color-text"]} 45%, var(--service-git-closed))`,
  },
  unstaged: {
    color: `color-mix(in oklab, ${vars["--ads-color-text"]} 45%, var(--service-git-modified))`,
  },
  staged: {
    color: `color-mix(in oklab, ${vars["--ads-color-text"]} 45%, var(--service-git-open))`,
  },
  none: { color: vars["--ads-color-text-muted"] },
});

/** Row-action ink, per destructive / affirmative / neutral intent. */
export const scmActionToneStyles = stylex.create({
  default: {
    backgroundColor: { default: "transparent", ":hover": vars["--ads-color-canvas-subtle"] },
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
  },
  destructive: {
    backgroundColor: { default: "transparent", ":hover": dangerHoverWash },
    color: { default: vars["--ads-color-danger-text"], ":hover": vars["--ads-color-danger-text"] },
  },
  success: {
    backgroundColor: { default: "transparent", ":hover": gitOpenHoverWash },
    color: {
      default: `color-mix(in oklab, ${vars["--ads-color-text"]} 45%, var(--service-git-open))`,
      ":hover": `color-mix(in oklab, ${vars["--ads-color-text"]} 45%, var(--service-git-open))`,
    },
  },
});

/** Summary-line ink for the staged / working-tree / conflict counters. */
export const scmSummaryToneStyles = stylex.create({
  staged: {
    color: `color-mix(in oklab, ${vars["--ads-color-text"]} 45%, var(--service-git-open))`,
  },
  workingTree: { color: vars["--ads-color-text-muted"] },
  conflicts: {
    color: `color-mix(in oklab, ${vars["--ads-color-text"]} 45%, var(--service-git-closed))`,
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
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    flexShrink: 0,
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  tabList: {
    backgroundColor: vars["--ads-color-surface-tint"],
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    // No `width: 100%`: the segmented control shrink-wraps its two labels. A
    // stretched track in a 300px rail is what forced the strip to overflow.
    justifyContent: "flex-start",
    padding: vars["--ads-space-4"],
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
    marginBlockEnd: `calc(-1 * ${vars["--ads-border-width-hairline"]})`,
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
    gap: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
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
    gap: vars["--ads-space-4"],
  },
  // Micro (on the ramp) rather than Caption: the count is a subscript on the
  // label, and this strip is the one that had to fight overflow in a 300px
  // rail — a rung up here buys nothing and costs width per tab.
  tabCount: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
  },
  tabAlert: { color: vars["--ads-color-danger-text"], fontSize: vars["--ads-font-size-micro"] },
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
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    columnGap: vars["--ads-space-8"],
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
    paddingBlockStart: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    rowGap: vars["--ads-space-4"],
  },
  glyphSm: { height: 14, width: 14 },
  glyphMd: { height: 16, width: 16 },
  glyphXs: { height: 12, width: 12 },

  // ---- Status chips in the view bar --------------------------------------
  statusChip: {
    alignItems: "center",
    borderRadius: vars["--ads-radius-panel"],
    display: "flex",
    flexShrink: 0,
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    gap: vars["--ads-space-4"],
    paddingBlock: vars["--ads-space-4"],
    paddingInline: 6,
  },
  statusChipPressable: {
    backgroundColor: { default: "transparent", ":hover": vars["--ads-color-canvas-subtle"] },
  },
  // `marginInlineStart: auto` pins the actions to the trailing edge whether
  // they share the tablist's row or have wrapped onto their own.
  toolbar: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-4"],
    marginInlineStart: "auto",
  },
  refreshButton: {
    borderRadius: vars["--ads-radius-panel"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    height: 32,
    width: 32,
  },
  autoRefreshButton: {
    borderRadius: vars["--ads-radius-panel"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    gap: vars["--ads-space-4"],
    height: 32,
    paddingInline: 6,
  },
  autoRefreshButtonOn: {
    color: { default: vars["--ads-color-success-text"], ":hover": vars["--ads-color-success-text"] },
  },
  autoRefreshLabel: {
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  autoRefreshMenu: { width: "11rem" },
  autoRefreshMenuLabel: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  autoRefreshItem: { justifyContent: "space-between" },
  autoRefreshCheck: { color: vars["--ads-color-success-text"], height: 14, width: 14 },
  spinning: {
    animationDuration: {
      default: vars["--ads-motion-duration-loop"],
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
    borderBottomColor: vars["--ads-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  popoverHeaderRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    justifyContent: "space-between",
  },
  popoverTitle: { fontSize: vars["--ads-font-size-caption"] },
  popoverHint: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginTop: vars["--ads-space-2"],
  },
  popoverList: {
    maxHeight: "18rem",
    overflowY: "auto",
    paddingBlock: vars["--ads-space-4"],
  },
  popoverItem: {
    fontSize: vars["--ads-font-size-caption"],
    paddingBlock: 6,
    paddingInline: vars["--ads-space-12"],
  },
  // Caption is ADS's smallest control-text rung (Button `xs`); these three
  // labels sat below it, so the panel's actions read smaller than the text
  // they act on. `controlHeightXs` is the box that rung comes with — at 24 and
  // 20 these were off the ramp entirely, which also meant the compact-density
  // axis could not move them.
  fixAllButton: {
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-4"],
    height: vars["--ads-control-height-xs"],
    paddingInline: vars["--ads-space-8"],
  },
  fixOneButton: {
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    fontSize: vars["--ads-font-size-caption"],
    flexShrink: 0,
    gap: vars["--ads-space-4"],
    height: vars["--ads-control-height-xs"],
    marginInlineStart: "auto",
    paddingInline: 6,
  },
  failureHead: {
    alignItems: "center",
    color: vars["--ads-color-text"],
    display: "flex",
    fontWeight: vars["--ads-font-weight-medium"],
    gap: 6,
  },
  failureTag: {
    borderRadius: vars["--ads-radius-mark"],
    fontSize: vars["--ads-font-size-micro"],
    letterSpacing: "0.025em",
    paddingBlock: 1,
    paddingInline: vars["--ads-space-4"],
    textTransform: "uppercase",
  },
  failureTagBlocking: {
    backgroundColor: dangerWash,
    color: vars["--ads-color-danger-text"],
  },
  failureTagWarn: {
    backgroundColor: warningWash,
    color: vars["--ads-color-warning-text"],
  },
  truncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  failureMessage: {
    color: vars["--ads-color-text-muted"],
    marginTop: vars["--ads-space-2"],
    overflowWrap: "break-word",
    whiteSpace: "pre-wrap",
  },
  findingButton: {
    alignItems: "flex-start",
    backgroundColor: { default: "transparent", ":hover": vars["--ads-color-canvas-subtle"] },
    display: "flex",
    flexDirection: "column",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-2"],
    paddingBlock: 6,
    paddingInline: vars["--ads-space-12"],
    textAlign: "start",
    width: "100%",
  },
  findingButtonInline: {
    borderRadius: vars["--ads-radius-control"],
    paddingBlock: vars["--ads-space-4"],
    paddingInline: 6,
  },
  findingHead: {
    alignItems: "center",
    color: vars["--ads-color-text"],
    display: "flex",
    fontWeight: vars["--ads-font-weight-medium"],
    gap: 6,
    maxWidth: "100%",
  },
  findingSeverity: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderRadius: vars["--ads-radius-mark"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    letterSpacing: "0.025em",
    paddingBlock: 1,
    paddingInline: vars["--ads-space-4"],
    textTransform: "uppercase",
  },
  findingMessage: {
    color: vars["--ads-color-text-muted"],
    overflowWrap: "break-word",
    whiteSpace: "pre-wrap",
  },

  // ---- Checks tab --------------------------------------------------------
  checks: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
  },
  checksSection: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    paddingBlock: 10,
    paddingInline: vars["--ads-space-12"],
  },
  checksHead: { alignItems: "center", display: "flex", gap: vars["--ads-space-8"] },
  checksIcon: {
    alignItems: "center",
    display: "flex",
    height: 16,
    justifyContent: "center",
    width: 16,
  },
  checksTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  checksSummary: {
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    marginInlineStart: "auto",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  checksLine: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  checksStrong: { color: vars["--ads-color-text"], fontWeight: vars["--ads-font-weight-medium"] },
  checksStack: { display: "flex", flexDirection: "column", gap: 6 },
  checksList: { display: "flex", flexDirection: "column", gap: vars["--ads-space-4"] },
  failureItem: { fontSize: vars["--ads-font-size-caption"] },
  checksTodoList: {
    color: vars["--ads-color-text-muted"],
    display: "flex",
    flexDirection: "column",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-2"],
  },
  checksTodoRow: { alignItems: "flex-start", display: "flex", gap: 6 },
  checksTodoDot: {
    backgroundColor: vars["--ads-color-warning"],
    borderRadius: vars["--ads-radius-full"],
    flexShrink: 0,
    height: 4,
    marginTop: vars["--ads-space-4"],
    width: 4,
  },
  checksTodoMore: { fontSize: vars["--ads-font-size-caption"], paddingInlineStart: 10 },

  // ---- Changes list ------------------------------------------------------
  changesBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-16"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  summarySection: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-4"],
  },
  summaryHead: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
  },
  summaryLead: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  branchBadge: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-control"],
    fontWeight: vars["--ads-font-weight-regular"],
    gap: vars["--ads-space-4"],
    height: 24,
    justifyContent: "flex-start",
    maxWidth: "100%",
    paddingInline: vars["--ads-space-8"],
  },
  branchIcon: { color: vars["--ads-color-text-muted"], height: 14, width: 14 },
  summaryCount: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-medium"],
  },
  busyLoader: { color: vars["--ads-color-text-muted"], flexShrink: 0 },
  summaryLabels: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-8"],
  },
  summaryHint: { color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"] },
  composer: {
    borderTopColor: vars["--ads-color-border-subtle"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    paddingTop: vars["--ads-space-12"],
  },
  composerRow: { alignItems: "flex-start", display: "flex", gap: vars["--ads-space-8"] },
  composerInput: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-panel"],
    fontSize: vars["--ads-font-size-body"],
    height: 36,
  },
  commitButton: {
    borderRadius: vars["--ads-radius-panel"],
    fontSize: vars["--ads-font-size-body"],
    height: 36,
    paddingInline: vars["--ads-space-12"],
  },
  bulkRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  bulkButton: {
    borderRadius: vars["--ads-radius-panel"],
    fontSize: vars["--ads-font-size-body"],
    height: 32,
  },
  sections: { display: "flex", flexDirection: "column", gap: vars["--ads-space-12"] },
  conflictNotice: {
    backgroundColor: warningPanel,
    borderColor: warningEdge,
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-warning-text"],
    fontSize: vars["--ads-font-size-body"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  errorNotice: {
    backgroundColor: dangerPanel,
    borderColor: dangerEdge,
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-danger-text"],
    fontSize: vars["--ads-font-size-body"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  emptyNotice: {
    backgroundColor: vars["--ads-color-surface-tint"],
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "dashed",
    borderWidth: vars["--ads-border-width-hairline"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
  },
  emptyNoticeText: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
  },
  section: { display: "flex", flexDirection: "column", gap: 6 },
  sectionHead: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    justifyContent: "space-between",
    paddingInline: vars["--ads-space-4"],
  },
  // Labels the panel's top-level grouping, so it is a section header, not a
  // mark: Micro plus uppercase plus 0.14em tracking made the one line that
  // names a group the smallest and least legible type in the pane.
  sectionTitle: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  sectionBadge: {
    borderRadius: vars["--ads-radius-control"],
    fontWeight: vars["--ads-font-weight-regular"],
    paddingInline: vars["--ads-space-8"],
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
      ":focus-within": vars["--ads-color-overlay-hover"],
      ":hover": vars["--ads-color-overlay-hover"],
    },
    borderColor: "transparent",
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-8"],
    paddingBlock: 6,
    paddingInline: vars["--ads-space-8"],
  },
  fileOpen: {
    alignItems: "center",
    borderRadius: vars["--ads-radius-control"],
    display: "flex",
    flex: 1,
    gap: vars["--ads-space-8"],
    minWidth: 0,
    textAlign: "start",
  },
  fileBody: { flex: 1, minWidth: 0 },
  fileTitleRow: { alignItems: "center", display: "flex", gap: vars["--ads-space-8"] },
  fileName: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  fileBadge: {
    borderRadius: vars["--ads-radius-control"],
    fontSize: vars["--ads-font-size-micro"],
    paddingInline: 6,
  },
  fileVerification: { height: 12, width: 12 },
  filePath: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
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
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    inset: 0,
    justifyContent: "flex-end",
    opacity: `var(${ROW_CODE_OPACITY})`,
    paddingInlineEnd: vars["--ads-space-4"],
    pointerEvents: "none",
    position: "absolute",
    transitionDuration: {
      default: vars["--ads-motion-duration-quick"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "opacity",
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },
  fileActions: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-2"],
    inset: 0,
    justifyContent: "flex-end",
    opacity: `var(${ROW_ACTION_OPACITY})`,
    pointerEvents: `var(${ROW_ACTION_EVENTS})`,
    position: "absolute",
    transitionDuration: {
      default: vars["--ads-motion-duration-quick"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "opacity",
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },
  rowActionButton: {
    borderColor: "transparent",
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    height: 24,
    padding: 0,
    width: 24,
  },
  contextMenu: { width: "13rem" },

  // ---- History -----------------------------------------------------------
  historyBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  historyHead: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
    paddingInline: vars["--ads-space-4"],
  },
  historyCount: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
  historyList: { display: "flex", flexDirection: "column" },
  historyRow: {
    backgroundColor: { default: "transparent", ":hover": vars["--ads-color-overlay-hover"] },
    borderRadius: vars["--ads-radius-panel"],
    display: "flex",
    gap: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-4"],
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
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-full"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxShadow: vars["--ads-elevation-raised"],
    height: 10,
    width: 10,
  },
  historyThread: {
    backgroundColor: vars["--ads-color-border-subtle"],
    bottom: -12,
    position: "absolute",
    top: 16,
    width: 1,
  },
  historyContent: {
    flex: 1,
    minWidth: 0,
    paddingBlock: vars["--ads-space-2"],
  },
  historyLead: { alignItems: "flex-start", display: "flex", gap: vars["--ads-space-12"] },
  historySubject: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  historyMeta: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-8"],
    marginTop: vars["--ads-space-4"],
  },
  historyHash: {
    color: vars["--ads-color-text-muted"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
  },
  historyDot: {
    backgroundColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-full"],
    height: 4,
    width: 4,
  },
  historyCommitIcon: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    height: 16,
    marginTop: vars["--ads-space-2"],
    width: 16,
  },
});
