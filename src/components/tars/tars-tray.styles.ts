import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * Structural widths of the pinned layout. StyleX resolves these at build time,
 * so they restate `TARS_TRAY_WIDTH` and `TARS_CONVERSATION_MIN_WIDTH`
 * (`src/lib/tars/tray-model.ts`) instead of importing them; the tray test keeps them equal.
 */
const TRAY_WIDTH = "26rem";
const CONVERSATION_FLOOR = "440px";

export const tarsTrayStyles = stylex.create({
  /** Applied to the conversation column only while the tray is pinned beside it. */
  conversationFloor: { minWidth: CONVERSATION_FLOOR },
  /**
   * The pinned column beside the conversation. The tray and the side view
   * both take it, at one width, so opening a timeline or a report in the
   * tray's place never moves the conversation.
   */
  panel: {
    display: "flex", flexDirection: "column", flexShrink: 0, minWidth: 0, minHeight: 0,
    width: TRAY_WIDTH, maxWidth: `calc(100% - ${CONVERSATION_FLOOR})`,
    borderInlineStartWidth: vars["--aui-border-width-hairline"], borderInlineStartStyle: "solid", borderInlineStartColor: vars["--aui-color-border-subtle"],
  },
  /** The pinned tray while the side view has its column: kept mounted, out of layout and the accessibility tree. */
  panelFolded: { display: "none" },
  /**
   * The column's title bar: Stave's panel bar (`panelBarStyles.bar`, icon and
   * title in `panelBarStyles.headerTitle`), the same bar the side view opens
   * with, so each pane names itself the way the right rail's panels do.
   */
  panelHeader: {
    display: "flex", alignItems: "center", gap: vars["--aui-space-8"], flexShrink: 0, minWidth: 0, paddingInline: vars["--aui-space-16"],
    borderBottomWidth: vars["--aui-border-width-hairline"], borderBottomStyle: "solid", borderBottomColor: vars["--aui-color-border-subtle"],
  },
  panelTitle: { flex: 1, minWidth: 0, margin: 0 },
  /**
   * The tray's scroll container. Its inline pad is the focus ring's bleed
   * gutter (`space.4`), so a lane's chevron and its cards start on the panel
   * bar's icon edge (`space.16` with the trigger's and the cards' own pad), as
   * the side view's body does. It has no top pad: a sticky lane header pins
   * to the scroll container's content edge, so a pad there would leave a strip
   * above the pinned header for cards to scroll through; the header's own
   * block pad spaces the first lane from the panel bar.
   */
  panelBody: { flex: 1, minHeight: 0, overflowY: "auto", paddingBlockStart: 0, paddingBlockEnd: vars["--aui-space-8"], paddingInline: vars["--aui-space-4"] },
  /** The narrow tray: anchored to its indicator, wider and taller than a default popover so a card fits. */
  popover: {
    inlineSize: `min(${TRAY_WIDTH}, calc(100dvw - 2 * ${vars["--aui-space-16"]}))`,
    maxBlockSize: `min(calc(100dvh - ${vars["--aui-space-64"]}), var(--available-height, calc(100dvh - ${vars["--aui-space-32"]})))`,
  },
  /** Portaled outside the view, so it restates the view's Korean line-break policy (`textWrap.keepAll`, applied with this body). */
  popoverBody: { paddingInline: vars["--aui-space-4"], paddingBlockEnd: vars["--aui-space-8"] },
  indicator: { display: "inline-flex", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
  /**
   * A lane's header row, pinned to the top of the tray's scroll container
   * while its lane scrolls under it: the disclosure trigger, then the lane's
   * own controls (Clear, Undo) on the end. It paints the tray's surface
   * (`laneHeadOn`), so cards never show through it, and sits on the
   * in-surface sticky layer.
   */
  laneHead: {
    position: "sticky", insetBlockStart: 0, zIndex: vars["--aui-z-index-sticky"],
    display: "flex", alignItems: "center", gap: vars["--aui-space-4"], minWidth: 0, paddingInlineEnd: vars["--aui-space-12"],
  },
  /** The surface the tray sits on: the view's canvas when pinned, the popover's raised surface when it opens over the conversation. */
  laneHeadOnCanvas: { backgroundColor: vars["--aui-color-canvas"] },
  laneHeadOnRaised: { backgroundColor: vars["--aui-color-surface-raised"] },
  laneHeader: { flex: 1, minWidth: 0 },
  /**
   * The AUI disclosure row with the chevron leading and the count trailing the
   * label: the whole row is the hit target, hover lays the quiet-control wash
   * (the ink stays put) and keyboard focus keeps the trigger's own ring.
   */
  laneTrigger: {
    display: "flex", alignItems: "center", justifyContent: "flex-start", gap: vars["--aui-space-8"],
    color: vars["--aui-color-text"],
    backgroundColor: {
      default: "transparent",
      "@media (hover: hover) and (pointer: fine)": { default: "transparent", ":hover": vars["--aui-color-overlay-hover"], ":active": vars["--aui-color-overlay-pressed"] },
    },
  },
  /** The AUI #809 in-surface section title: 15/500. */
  sectionTitle: { display: "flex", alignItems: "baseline", gap: vars["--aui-space-8"], minWidth: 0, fontSize: vars["--aui-font-size-section"], fontWeight: vars["--aui-font-weight-medium"], lineHeight: vars["--aui-line-height-tight"], color: vars["--aui-color-text"] },
  sectionCount: { color: vars["--aui-color-text-muted"], fontVariantNumeric: "tabular-nums", fontWeight: vars["--aui-font-weight-regular"] },
  /** A lane with nothing in it: its title steps down to the muted ink, so the lanes that hold work lead. */
  sectionTitleEmpty: { color: vars["--aui-color-text-muted"] },
  chevron: { flexShrink: 0, color: vars["--aui-color-text-muted"], width: vars["--aui-control-icon-size-md"], height: vars["--aui-control-icon-size-md"] },
  /** Open, the leading chevron turns to point down at its lane (timing from `transition.transform`). */
  chevronOpen: { transform: "rotate(90deg)" },
  /**
   * Each card is a lifted run object (AUI `RunMonitor`), so the lane stacks
   * them on a gap instead of hairline rows. Cards share the section trigger's
   * inline gutter, so titles, cards and the chevron column line up.
   */
  cards: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0, margin: 0, paddingBlockStart: 0, paddingBlockEnd: vars["--aui-space-8"], paddingInline: vars["--aui-space-12"], listStyle: "none" },
  groupingTools: { display: "flex", paddingBlock: vars["--aui-space-4"], paddingInline: vars["--aui-space-12"] },
  projectTrigger: { display: "flex", alignItems: "center", justifyContent: "flex-start", gap: vars["--aui-space-8"], width: "100%", minWidth: 0, paddingInline: vars["--aui-space-12"] },
  projectName: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "start" },
  cardItem: { minWidth: 0 },
  /** A queued card is a drop target; its closest-edge indicator line anchors to it. */
  queuedItem: { position: "relative" },
  queuedItemDragging: { opacity: 0.5 },
  /** Outputs keep the hairline-row grammar: they are links, not run objects. */
  outputList: { gap: 0 },
  outputItem: {
    borderTopWidth: { default: vars["--aui-border-width-hairline"], ":first-child": 0 },
    borderTopStyle: "solid", borderTopColor: vars["--aui-color-border-subtle"],
  },
  meta: { margin: 0, minWidth: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"], overflowWrap: "anywhere" },
  /**
   * The work's branch, the header's second meta line: a git glyph, then the
   * name in the mono face at the meta line's own caption size (the mono face
   * reads larger than the sans at one size, so it never steps above it).
   * One line; the full name is its title. Its inline size is contained, so an
   * unbroken name never widens the header's title column (which would push
   * the title under the state tag); it takes the column's width and ellipsizes.
   */
  branch: { display: "flex", alignItems: "center", gap: vars["--aui-space-4"], minWidth: 0, contain: "inline-size" },
  branchIcon: { flexShrink: 0, width: vars["--aui-control-icon-size-xs"], height: vars["--aui-control-icon-size-xs"] },
  branchName: {
    minWidth: 0, fontFamily: vars["--aui-font-mono"], fontSize: vars["--aui-font-size-caption"], lineHeight: vars["--aui-line-height-caption"],
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  /**
   * What needs the user, in the card's recessed well (`runStyles.well`): one
   * item per row, hairlines between them. Rows stack a label line over text
   * that runs the card's full width, so a long proposal never folds into a
   * narrow column beside its label.
   */
  attention: { display: "flex", flexDirection: "column", minWidth: 0, margin: 0, paddingBlock: 0, paddingInline: vars["--aui-space-12"], listStyle: "none" },
  attentionRow: {
    display: "flex", flexDirection: "column", gap: vars["--aui-space-2"], minWidth: 0, paddingBlock: vars["--aui-space-8"],
    borderTopWidth: { default: vars["--aui-border-width-hairline"], ":first-child": 0 }, borderTopStyle: "solid", borderTopColor: vars["--aui-color-border-subtle"],
  },
  /** The label line: the warning mark centred on the label; an irreversible decision's tag or the Blocked line's report link at the end. */
  attentionHead: { display: "flex", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0 },
  attentionEnd: { flexShrink: 0, marginInlineStart: "auto" },
  attentionText: { minWidth: 0, fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"], color: vars["--aui-color-text"], overflowWrap: "anywhere" },
  /**
   * A Tars decision's row: the proposal itself carries the row, so it drops the
   * label line and keeps one mark (named for assistive technology) on the
   * text's first line, with the irreversible tag on the end.
   */
  attentionInline: { flexDirection: "row", alignItems: "flex-start", gap: vars["--aui-space-8"] },
  /** The mark's box is the text's first line, so the dot centres on it however the text wraps. */
  attentionMarkBox: { display: "flex", alignItems: "center", flexShrink: 0, height: vars["--aui-line-height-control"] },
  attentionInlineText: { flex: 1 },
  actions: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0 },
  /** One output: a single row that opens it, on the hairline rhythm. */
  output: { paddingBlock: vars["--aui-space-4"] },
  /**
   * The output's row, a side-view button or an external link drawn alike: its
   * kind's glyph, what it is over whose work it came from, then where it opens
   * (the side view or the browser). Hover lays the quiet-control wash and
   * keyboard focus draws the AUI ring.
   */
  outputRow: {
    display: "flex", alignItems: "flex-start", justifyContent: "flex-start", gap: vars["--aui-space-8"], width: "100%", minWidth: 0,
    minHeight: vars["--aui-control-height-sm"], paddingBlock: vars["--aui-space-4"], paddingInline: vars["--aui-space-4"],
    borderRadius: vars["--aui-radius-control"], textAlign: "start", whiteSpace: "normal", color: vars["--aui-color-text"], textDecorationLine: "none",
    backgroundColor: {
      default: "transparent",
      "@media (hover: hover) and (pointer: fine)": { default: "transparent", ":hover": vars["--aui-color-overlay-hover"], ":active": vars["--aui-color-overlay-pressed"] },
    },
  },
  /** The glyph's box is the label's line, so it centres on the first line however the text wraps. */
  outputGlyph: { display: "flex", alignItems: "center", flexShrink: 0, height: vars["--aui-line-height-control"], color: vars["--aui-color-text-muted"] },
  outputIcon: { flexShrink: 0, width: vars["--aui-control-icon-size-sm"], height: vars["--aui-control-icon-size-sm"] },
  outputText: { display: "flex", flexDirection: "column", gap: vars["--aui-space-2"], flex: 1, minWidth: 0 },
  outputLabel: { minWidth: 0, fontSize: vars["--aui-font-size-body"], fontWeight: vars["--aui-font-weight-medium"], lineHeight: vars["--aui-line-height-control"], overflowWrap: "anywhere" },
  outputMeta: { margin: 0, minWidth: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"], overflowWrap: "anywhere" },
  empty: { margin: 0, paddingBlock: vars["--aui-space-8"], paddingInline: vars["--aui-space-12"], color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"] },
});

export const tarsFlowStyles = stylex.create({
  root: { marginBlockStart: vars["--aui-space-4"] },
  summary: { display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: vars["--aui-space-8"], minWidth: 0 },
  summaryTitle: { color: vars["--aui-color-text"], fontWeight: vars["--aui-font-weight-medium"], overflowWrap: "anywhere" },
  summaryState: { display: "inline-flex", alignItems: "center", gap: vars["--aui-space-4"], color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], fontVariantNumeric: "tabular-nums" },
  /** The folded flow's live line: under the summary, on the trigger's text edge. */
  live: { paddingInlineStart: `calc(${vars["--aui-space-8"]} + ${vars["--aui-control-icon-size-md"]} + ${vars["--aui-space-8"]})`, paddingInlineEnd: vars["--aui-space-8"], minWidth: 0 },
  nodes: { margin: 0, padding: 0, listStyle: "none" },
  /** Same inline pad as a stage button, so every node's text starts on one edge. */
  node: { display: "flex", flexDirection: "column", gap: vars["--aui-space-2"], minWidth: 0, paddingBlock: vars["--aui-space-4"], paddingInline: vars["--aui-space-4"] },
  nodeLabel: { margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"] },
  nodeText: { margin: 0, color: vars["--aui-color-text"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"], overflowWrap: "anywhere" },
  /** A stage node is the Fleet link for its task: the whole row is the hit target. */
  stageButton: {
    display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-start", gap: vars["--aui-space-8"], width: "100%", minWidth: 0,
    minHeight: vars["--aui-control-height-sm"], paddingBlock: vars["--aui-space-4"], paddingInline: vars["--aui-space-4"],
    borderRadius: vars["--aui-radius-control"], textAlign: "start", fontSize: "inherit", whiteSpace: "normal",
  },
  /** A node that opens the side view, with its Fleet menu at the end of the row. */
  nodeRow: { display: "flex", alignItems: "flex-start", gap: vars["--aui-space-4"], minWidth: 0 },
  nodeMain: { display: "flex", flexDirection: "column", flex: 1, minWidth: 0 },
  /** The completion node's text inside its button keeps the button's own pad. */
  nodeFlush: { paddingBlock: 0, paddingInline: 0 },
  stageReason: { paddingInline: vars["--aui-space-4"], overflowWrap: "anywhere" },
  stageStatic: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0, paddingBlock: vars["--aui-space-4"], paddingInline: vars["--aui-space-4"] },
  stageTitle: { flex: 1, minWidth: 0, fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"], overflowWrap: "anywhere" },
  attempt: { color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"] },
});
