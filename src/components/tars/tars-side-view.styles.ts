import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

export const tarsSideViewStyles = stylex.create({
  /** Wide: the tray's own column (`tarsTrayStyles.panel` sets its width), on the view's canvas. */
  column: { backgroundColor: vars["--aui-color-canvas"] },
  /** Narrow: between the conversation and the composer; its cap comes from the measured view height. */
  inline: {
    display: "flex", flexDirection: "column", flexShrink: 0, minWidth: 0, minHeight: 0,
    borderBlockStartWidth: vars["--aui-border-width-hairline"], borderBlockStartStyle: "solid", borderBlockStartColor: vars["--aui-color-border-subtle"],
    backgroundColor: vars["--aui-color-canvas"],
  },
  inlineCap: (height: number) => ({ maxBlockSize: `${height}px` }),
  /**
   * The view's title bar, then what it is about: the panel bar names the view
   * (its icon and kind, as the tray's bar names Work), the line under it the
   * work and the switcher between the work's views.
   */
  header: {
    display: "flex", flexDirection: "column", flexShrink: 0, minWidth: 0,
    borderBlockEndWidth: vars["--aui-border-width-hairline"], borderBlockEndStyle: "solid", borderBlockEndColor: vars["--aui-color-border-subtle"],
  },
  bar: { display: "flex", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0, paddingInline: vars["--aui-space-16"] },
  heading: { flex: 1, minWidth: 0, margin: 0 },
  headingText: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: vars["--aui-line-height-normal"] },
  /** The work's title beside the switcher; narrower than both, the switcher wraps under it. */
  context: {
    display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: vars["--aui-space-12"], rowGap: vars["--aui-space-8"], minWidth: 0,
    paddingInline: vars["--aui-space-16"], paddingBlockEnd: vars["--aui-space-12"],
  },
  subject: {
    flex: "1 1 12rem", minWidth: 0, margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"],
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  switcher: { flexShrink: 0, maxWidth: "100%" },
  /**
   * The scrolling body. Positioned, so an absolutely placed descendant (a
   * visually hidden label in a stage row) scrolls and clips with it instead of
   * stretching the page under a narrow, height-capped view.
   */
  body: {
    position: "relative", display: "flex", flexDirection: "column", gap: vars["--aui-space-16"], flex: 1, minHeight: 0, minWidth: 0, overflowY: "auto",
    paddingInline: vars["--aui-space-16"], paddingBlockStart: vars["--aui-space-16"], paddingBlockEnd: vars["--aui-space-24"],
  },
  /**
   * A view's root: its sections on the AUI section rhythm (`space.24`), so a
   * heading starts a visibly new part instead of running on from the panel
   * above it. Inside a section, lines keep the compact 8px stack.
   */
  stack: { display: "flex", flexDirection: "column", gap: vars["--aui-space-24"], minWidth: 0 },
  section: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  /** The AUI #809 in-surface section title: 15/500. */
  sectionTitle: { margin: 0, color: vars["--aui-color-text"], fontSize: vars["--aui-font-size-section"], fontWeight: vars["--aui-font-weight-medium"], lineHeight: vars["--aui-line-height-tight"] },
  /** A view's lead: the state it reports and why, before the parts that explain it. */
  summary: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  /** An evidence list inside one raised panel, as the criteria above it, on the panel rows' own pad, instead of loose lines on the canvas. */
  evidencePanel: { display: "flex", flexDirection: "column", minWidth: 0, paddingBlock: vars["--aui-space-8"], paddingInline: vars["--aui-space-12"] },
  meta: { margin: 0, minWidth: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"], overflowWrap: "anywhere" },
  text: { margin: 0, minWidth: 0, color: vars["--aui-color-text"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"], overflowWrap: "anywhere", whiteSpace: "pre-wrap" },
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
