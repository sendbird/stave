import * as stylex from "@stylexjs/stylex";

import { densityPad } from "../tokens/density.stylex";
import { vars } from "../tokens/tokens.stylex";

/**
 * The header's StyleX rules: the band, the column cells and the sort control.
 * Split out of `DataTable.header.tsx` (2026-11-14) when that file reached the
 * source size cap; `DataTable.header.tsx` re-exports both names, so every
 * import keeps working.
 */
export const headerStyles = stylex.create({
  head: {
    // Quiet header: same surface as the body — a solid gray band reads heavy
    // and table chrome stays recessive. The hairline underline comes
    // from the header cells' borderBlockEnd; hierarchy from muted text.
    backgroundColor: vars["--aui-color-surface-raised"],
  },
  stickyHead: {
    // Lift the pinned header above scrolling rows with a soft shadow.
    // zIndexSticky keeps it above row content but below in-surface panels
    // (PeekPanel docks over the table at zIndexPanel).
    boxShadow: vars["--aui-elevation-raised"],
    insetBlockStart: 0,
    position: "sticky",
    zIndex: vars["--aui-z-index-sticky"],
  },
  headerCell: {
    // The rule under the header is `colorBorder`, not the `colorBorderSubtle`
    // used between rows. The header band shares the body's surface on purpose
    // (a filled gray band reads heavy), so the ONLY thing separating a pinned
    // header from the rows scrolling beneath it was an 8%-alpha hairline plus
    // `elevationRaised` at 5% ink — invisible on white. One step of border weight
    // is the least ink that actually does the job.
    borderBlockEndColor: vars["--aui-color-border"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--aui-border-width-hairline"],
    // Type and ink are the shared column header (`tableHead.cell`, composed
    // in DataTable.headRow.tsx): 12/500 muted, stated on the cell rather than
    // inherited so plain and sortable headers sit on one 16px line box.
    // Medium, not semibold — at 12px muted, 600 is heavier ink than the
    // 14px/400 data it labels; the SORTED column earns the extra weight.
    paddingInline: vars["--aui-space-12"],
    textAlign: "start",
    verticalAlign: "middle",
    overflowWrap: "anywhere",
    whiteSpace: "nowrap",
  },
  /*
   * The active sort column takes `tableHead.sorted` (body ink, 600), composed
   * in DataTable.headRow.tsx. `aria-sort` was already authored on the `<th>`
   * and nothing selected on it, so a sorted column looked exactly like an
   * unsorted one apart from the glyph — the most useful piece of state this
   * table carries was told only to assistive tech.
   */
  headerCellWrap: {
    whiteSpace: "normal",
  },
  headerCellResizable: {
    position: "relative",
  },
  headerInner: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    justifyContent: "space-between",
    // Keep plain headers as tall as sortable headers, independent of content.
    minBlockSize: vars["--aui-control-height-xs"],
    minInlineSize: 0,
  },
  /** Header label + its `headerHint`, kept together as one item of the row. */
  headerLabelGroup: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
  },
  /*
   * The column's alignment has to be restated here. `alignEnd` puts
   * `text-align: end` on the `<th>`, which moves nothing inside a flex
   * container — and the resize handle is absolutely positioned, so this row
   * holds exactly one in-flow item that `space-between` parked at the start.
   * A right-aligned numeric column therefore drew its header label at the
   * left edge of the cell (or, when the header was the widest content in the
   * column, one glyph short of the right edge), never on the edge its numbers
   * line up on.
   *
   * `center` is stated for the same reason. A sortable center column still
   * carries its indicator on the trailing side, which shifts the label by
   * half the glyph; nothing in the repo aligns a column that way, and fixing
   * it properly needs a mirrored spacer rather than a justification change.
   */
  headerInnerCenter: {
    justifyContent: "center",
  },
  headerInnerEnd: {
    justifyContent: "flex-end",
  },
  selectionHeaderCell: {
    borderBlockEndColor: vars["--aui-color-border"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--aui-border-width-hairline"],
    // Same number and same asymmetric padding as `selectionCell` (20px
    // `Checkbox` + space12 leading + space8 trailing) — the select-all box has
    // to sit exactly above the row boxes. See the note there for why the two
    // edges differ; a header cell that disagreed with its body cell is exactly
    // what `actionsHeaderCell` below was fixed for.
    inlineSize: 40,
    paddingInlineEnd: vars["--aui-space-8"],
    paddingInlineStart: vars["--aui-space-12"],
    textAlign: "center",
  },
  actionsHeaderCell: {
    borderBlockEndColor: vars["--aui-color-border"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    // Same number as `actionsCell`. These two declared 72 and 96 for the same
    // column: under `tableLayout: fixed` the header silently won and the 96 was
    // dead, under auto layout they fought. 72 is what actually rendered.
    inlineSize: 72,
    // The header labels' tight line height, so "Actions" sits on their line.
    lineHeight: vars["--aui-line-height-caption"],
    paddingInline: vars["--aui-space-12"],
    textAlign: "end",
    whiteSpace: "nowrap",
  },
  spacerHeaderCell: {
    borderBlockEndColor: vars["--aui-color-border"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--aui-border-width-hairline"],
    padding: 0,
  },
  expandHeaderCell: {
    borderBlockEndColor: vars["--aui-color-border"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--aui-border-width-hairline"],
    // Matches `expandCell`: 32px `expandButton` + 2 * space12, which is what
    // both cells have always rendered. Geometry untouched — see `expandCell`.
    inlineSize: 56,
    paddingInline: vars["--aui-space-12"],
    textAlign: "center",
  },
  /**
   * Sortable column header. Everything below except the type ramp is new: this
   * was a `padding: 0`, `background: transparent` button with no `:hover` arm
   * and no transition anywhere in the file, so the single most-clicked control
   * in the table gave zero feedback before the rows re-ordered under you, and
   * its hit box was the 16px line box of a 12px label — under the 24px floor
   * `recipes/touch-target.ts` exists to enforce.
   *
   * The negative inline margin cancels the new padding so the label still lines
   * up with the cell's `space12` inset and with the body text below it.
   */
  sortButton: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":active": vars["--aui-color-overlay-pressed"],
      "@media (hover: hover)": {
        default: "transparent",
        ":hover": vars["--aui-color-overlay-hover"],
        ":active": vars["--aui-color-overlay-pressed"],
      },
    },
    borderRadius: vars["--aui-radius-control"],
    borderWidth: 0,
    color: {
      default: "inherit",
      "@media (hover: hover)": {
        default: "inherit",
        ":hover": vars["--aui-color-text"],
      },
    },
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: vars["--aui-font-sans"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: "inherit",
    gap: vars["--aui-space-4"],
    lineHeight: vars["--aui-line-height-caption"],
    marginInline: `calc(-1 * ${vars["--aui-space-4"]})`,
    maxInlineSize: "100%",
    minBlockSize: vars["--aui-control-height-xs"],
    minInlineSize: 0,
    overflow: "hidden",
    paddingBlock: 0,
    paddingInline: vars["--aui-space-4"],
    textAlign: "inherit",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  /**
   * End-aligned columns lead with the indicator so the label ends where the
   * cells end. See `DataTableSortButton` for why the glyph cannot simply be
   * dropped: it is the affordance that says the column is sortable at all.
   */
  sortButtonEndAligned: {
    flexDirection: "row-reverse",
  },
  sortButtonWrap: {
    alignItems: "start",
    flexWrap: "wrap",
    overflow: "visible",
    textOverflow: "clip",
    whiteSpace: "normal",
  },
  /*
   * The label, and only the label, absorbs a column too narrow for its header.
   * Without this it is a flex item at its `auto` minimum, so it refuses to
   * shrink and the button's `overflow: hidden` clips whatever follows it — the
   * sort glyph and the multi-sort order badge. A header whose words do not fit
   * lost the one mark that says the column is sorted, while the words kept
   * their full width. (Found by the Sparkler fork's Insights review, where a
   * `headerHint` beside the label made it visible.)
   */
  sortButtonLabel: {
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  sortButtonLabelWrap: {
    minInlineSize: 0,
    overflowWrap: "anywhere",
    // Undoes the single-line clamp above: a wrapping header reflows instead of
    // ending in an ellipsis, the same trade `sortButtonWrap` makes on the
    // button around it.
    overflow: "visible",
    textOverflow: "clip",
    whiteSpace: "normal",
  },
  /**
   * The neutral `ChevronsUpDown` glyph. It used to sit at full `colorTextMuted`
   * on every sortable column at rest, so a table of ten sortable columns showed
   * ten up/down arrows and none of them meant anything — the sorted column had
   * no way to stand out. It now fades in on hover/focus of its header (see the
   * `[data-aui-sort-indicator]` rules in `styles.css`, the same pattern the
   * selection checkboxes use) and the ACTIVE arrow is always solid.
   */
  sortIndicator: {
    flexShrink: 0,
  },
  /**
   * Multi-sort rank chip. It was sized with `controlHeightXs` (28px) on both
   * axes — a control-height token on a one-digit numeric chip inside a header
   * whose own text is 12px. Two of them pushed the header row from ~42px to
   * ≥52px, taller than the data rows. It is a chip, so it is sized like one.
   */
  sortOrderBadge: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-accent-soft"],
    borderRadius: vars["--aui-radius-full"],
    color: vars["--aui-color-text-muted"],
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    justifyContent: "center",
    lineHeight: 1,
    minBlockSize: vars["--aui-control-icon-size-md"],
    minInlineSize: vars["--aui-control-icon-size-md"],
    paddingInline: vars["--aui-space-4"],
  },
  // The header is one step tighter than the body it heads (`cellCompact` /
  // `cellRegular` below stay at sm/md). It used to take the SAME padding as a
  // data row, which put a 42px band of 12px label text on top of 45px rows —
  // the "th looks big" reading. A column label is chrome; it should not cost as
  // much vertical space as a record.
  headerCellCompact: {
    paddingBlock: densityPad.xs,
  },
  headerCellRegular: {
    paddingBlock: densityPad.sm,
  },
});

export const headerDensityStyles = {
  compact: headerStyles.headerCellCompact,
  regular: headerStyles.headerCellRegular,
} as const;
