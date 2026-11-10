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
  panelBody: { flex: 1, minHeight: 0, overflowY: "auto", paddingBlock: vars["--aui-space-8"], paddingInline: vars["--aui-space-8"] },
  /** The narrow tray: anchored to its indicator, wider and taller than a default popover so a card fits. */
  popover: {
    inlineSize: `min(${TRAY_WIDTH}, calc(100dvw - 2 * ${vars["--aui-space-16"]}))`,
    maxBlockSize: `min(calc(100dvh - ${vars["--aui-space-64"]}), var(--available-height, calc(100dvh - ${vars["--aui-space-32"]})))`,
  },
  /** Portaled outside the view, so it restates the view's Korean line-break policy (`textWrap.keepAll`, applied with this body). */
  popoverBody: { paddingInline: vars["--aui-space-8"], paddingBlockEnd: vars["--aui-space-8"] },
  indicator: { display: "inline-flex", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
  /** The AUI #809 in-surface section title: 15/500. */
  sectionTitle: { display: "flex", alignItems: "center", gap: vars["--aui-space-8"], flex: 1, minWidth: 0, fontSize: vars["--aui-font-size-section"], fontWeight: vars["--aui-font-weight-medium"], lineHeight: vars["--aui-line-height-tight"], color: vars["--aui-color-text"] },
  sectionCount: { color: vars["--aui-color-text-muted"], fontVariantNumeric: "tabular-nums", fontWeight: vars["--aui-font-weight-regular"] },
  chevron: { flexShrink: 0, color: vars["--aui-color-text-muted"], width: vars["--aui-control-icon-size-md"], height: vars["--aui-control-icon-size-md"] },
  /**
   * Each card is a lifted run object (AUI `RunMonitor`), so the lane stacks
   * them on a gap instead of hairline rows. Cards share the section trigger's
   * inline gutter, so titles, cards and the chevron column line up.
   */
  cards: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0, margin: 0, paddingBlockStart: 0, paddingBlockEnd: vars["--aui-space-8"], paddingInline: vars["--aui-space-12"], listStyle: "none" },
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
  actions: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0 },
  /** One output: what it is (the opener), then whose work it came from. */
  output: { display: "flex", flexDirection: "column", gap: vars["--aui-space-2"], paddingBlock: vars["--aui-space-8"] },
  outputButton: {
    display: "flex", alignItems: "center", justifyContent: "flex-start", width: "100%", minWidth: 0,
    minHeight: vars["--aui-control-height-sm"], paddingInline: vars["--aui-space-4"],
    borderRadius: vars["--aui-radius-control"], textAlign: "start", whiteSpace: "normal",
  },
  /** The opener's own inline pad, so the label and the work it came from start on one edge. */
  outputMeta: { paddingInline: vars["--aui-space-4"] },
  outputLink: {
    display: "inline-flex", alignItems: "center", gap: vars["--aui-space-4"], minWidth: 0, minHeight: vars["--aui-control-height-sm"], paddingInline: vars["--aui-space-4"],
    color: vars["--aui-color-accent"], fontSize: vars["--aui-font-size-body"], textDecoration: { default: "none", ":hover": "underline" },
  },
  outputLabel: { minWidth: 0, fontSize: vars["--aui-font-size-body"], fontWeight: vars["--aui-font-weight-medium"], overflowWrap: "anywhere" },
  outputIcon: { flexShrink: 0, width: vars["--aui-control-icon-size-sm"], height: vars["--aui-control-icon-size-sm"] },
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
