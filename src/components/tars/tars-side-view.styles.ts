import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * Structural sizes of the side view. StyleX resolves these at build time, so
 * they restate `TARS_SIDE_VIEW_MIN_WIDTH` and `TARS_CONVERSATION_MIN_WIDTH`
 * (`src/lib/tars/side-view.ts`, `tray-model.ts`); the side-view test keeps them equal.
 */
const MIN_WIDTH = "26rem";
const CONVERSATION_FLOOR = "440px";

export const tarsSideViewStyles = stylex.create({
  /** Wide: the tray's column, half the view, never pushing the conversation under its floor. */
  column: {
    display: "flex", flexDirection: "column", flexShrink: 0, minWidth: 0, minHeight: 0,
    width: `clamp(${MIN_WIDTH}, 50%, calc(100% - ${CONVERSATION_FLOOR}))`,
    borderInlineStartWidth: vars["--aui-border-width-hairline"], borderInlineStartStyle: "solid", borderInlineStartColor: vars["--aui-color-border-subtle"],
    backgroundColor: vars["--aui-color-canvas"],
  },
  /** Narrow: between the conversation and the composer; its cap comes from the measured view height. */
  inline: {
    display: "flex", flexDirection: "column", flexShrink: 0, minWidth: 0, minHeight: 0,
    borderBlockStartWidth: vars["--aui-border-width-hairline"], borderBlockStartStyle: "solid", borderBlockStartColor: vars["--aui-color-border-subtle"],
    backgroundColor: vars["--aui-color-canvas"],
  },
  inlineCap: (height: number) => ({ maxBlockSize: `${height}px` }),
  header: {
    display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-8"], flexShrink: 0, minWidth: 0,
    paddingInline: vars["--aui-space-16"], paddingBlock: vars["--aui-space-8"],
    borderBlockEndWidth: vars["--aui-border-width-hairline"], borderBlockEndStyle: "solid", borderBlockEndColor: vars["--aui-color-border-subtle"],
  },
  heading: { display: "flex", flexDirection: "column", flex: "1 1 12rem", minWidth: 0, margin: 0 },
  eyebrow: { color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], lineHeight: vars["--aui-line-height-caption"], fontWeight: vars["--aui-font-weight-regular"] },
  title: {
    color: vars["--aui-color-text"], fontSize: vars["--aui-font-size-body"], fontWeight: vars["--aui-font-weight-semibold"], lineHeight: vars["--aui-line-height-normal"],
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
  },
  headerControls: { display: "flex", alignItems: "center", gap: vars["--aui-space-8"], flexShrink: 0, marginInlineStart: "auto" },
  body: {
    display: "flex", flexDirection: "column", gap: vars["--aui-space-16"], flex: 1, minHeight: 0, minWidth: 0, overflowY: "auto",
    paddingInline: vars["--aui-space-16"], paddingBlock: vars["--aui-space-12"],
  },
  section: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  /** The AUI #809 in-surface section title: 15/500. */
  sectionTitle: { margin: 0, color: vars["--aui-color-text"], fontSize: vars["--aui-font-size-section"], fontWeight: vars["--aui-font-weight-medium"], lineHeight: vars["--aui-line-height-tight"] },
  meta: { margin: 0, minWidth: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], lineHeight: vars["--aui-line-height-caption"], overflowWrap: "anywhere" },
  text: { margin: 0, minWidth: 0, color: vars["--aui-color-text"], fontSize: vars["--aui-font-size-caption"], lineHeight: vars["--aui-line-height-caption"], overflowWrap: "anywhere", whiteSpace: "pre-wrap" },
  list: { display: "flex", flexDirection: "column", gap: vars["--aui-space-12"], margin: 0, padding: 0, listStyle: "none", minWidth: 0 },
  /**
   * A list of rows inside one AUI #809 raised panel (`raisedPanel.panel` +
   * `raisedPanel.row`): this resets the list and lets a row stack its lines.
   */
  panelList: { display: "flex", flexDirection: "column", margin: 0, padding: 0, listStyle: "none" },
  panelRow: { flexDirection: "column", alignItems: "stretch", gap: vars["--aui-space-4"] },
  criterion: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  criterionHead: { display: "flex", alignItems: "flex-start", gap: vars["--aui-space-8"], minWidth: 0 },
  /** The 13px interface row (AUI #809 S2). */
  criterionText: { flex: 1, minWidth: 0, margin: 0, color: vars["--aui-color-text"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"], overflowWrap: "anywhere" },
  badge: { flexShrink: 0 },
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0 },
  /** The changes view: files above the selected file's diff, each scrolling in the body. */
  diff: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  diffHeader: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: vars["--aui-space-8"], minWidth: 0 },
  diffBody: { minWidth: 0, overflowX: "auto" },
  /** A saved text's title row: the title, then its copy button at the end. */
  textHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: vars["--aui-space-8"], minWidth: 0 },
  /**
   * A saved message or instruction, whole: line breaks, indentation and code
   * kept, long lines wrapped instead of scrolled out of sight, never cut. The
   * side view's body scrolls past a long one.
   */
  savedText: {
    margin: 0, minWidth: 0, paddingInline: vars["--aui-space-12"], paddingBlock: vars["--aui-space-8"],
    color: vars["--aui-color-text"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-relaxed"],
    whiteSpace: "pre-wrap", overflowWrap: "anywhere", tabSize: 4,
  },
  /** A criterion keeps the line breaks it was written with. */
  keepBreaks: { whiteSpace: "pre-wrap" },
  /** A focus target for a part the side view was asked to show (unmet criteria, one stage). */
  anchor: { scrollMarginBlockStart: vars["--aui-space-12"] },
});
