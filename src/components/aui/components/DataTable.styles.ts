import * as stylex from "@stylexjs/stylex";

import { densityPad } from "../tokens/density.stylex";
import { vars } from "../tokens/tokens.stylex";
import { dataTableVars } from "./DataTable.vars.stylex";

/*
 * `dataTableVars.pinnedCellOverlay` is the reference form (`var(--hash)`), and
 * `transition-property` needs the bare custom-property name. StyleX folds this
 * at build time, so the emitted rule reads `transition-property: --hash`.
 */
const pinnedCellOverlayProperty = dataTableVars.pinnedCellOverlay.slice(4, -1);
/*
 * Row fills by meaning (§1.7, 2026-11-09 rework). A bulk-selected row wears
 * the selection fill (point tint, or the neutral rung under
 * `pointScope="accents"`) beside its checked checkbox; the current/open row
 * (the one an inspector or peek panel shows) wears the STRONG pair, one rung
 * above, so the two stay apart when they meet. Each is also the pinned-cell
 * paint of its row. No inline-start rail or pill.
 */
const selectedFill = {
  default: vars["--aui-color-selection-fill"],
  "@media (hover: hover) and (pointer: fine)": {
    default: null,
    ":hover": vars["--aui-color-selection-fill-hover"],
  },
} as const;
const currentFill = {
  default: vars["--aui-color-selection-fill-strong"],
  "@media (hover: hover) and (pointer: fine)": {
    default: null,
    ":hover": vars["--aui-color-selection-fill-strong-hover"],
  },
} as const;

export const styles = stylex.create({
  root: {
    display: "grid",
    gap: vars["--aui-space-12"],
    inlineSize: "100%",
    minInlineSize: 0,
  },
  // Fill mode: become a flex column that grows to the parent's height so the
  // scroll frame (below) can flex-grow instead of capping at a fixed height.
  rootFill: {
    blockSize: "100%",
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    minBlockSize: 0,
  },
  // The gap is `actionGap.buttons` (8px), composed in `DataTable.toolbar.tsx`;
  // it was 12 above a `FilterBar` row that spaces its own controls 8 apart.
  toolbar: {
    alignItems: "start",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    minInlineSize: 0,
  },
  filterSlot: {
    flex: "1 1 280px",
    minInlineSize: 0,
  },
  // Resting/hover/press chrome (background, border, box-shadow, color) comes
  // from `controlChrome.trigger` + `controlChrome.triggerOpen` (composed at the
  // call site, `DataTable.tsx`) — this renders as a `Menu.Trigger` sitting
  // beside real `Button`s in the same toolbar, so it must react like one.
  columnSummary: {
    alignItems: "center",
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: vars["--aui-font-sans"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    gap: vars["--aui-space-8"],
    lineHeight: vars["--aui-line-height-body"],
    minBlockSize: vars["--aui-control-height-md"],
    maxInlineSize: "100%",
    overflow: "hidden",
    paddingBlock: 0,
    paddingInline: vars["--aui-space-12"],
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  frame: {
    backgroundColor: vars["--aui-color-surface-raised"],
    borderColor: vars["--aui-color-ring"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    // Flat by contract (§1.5 "Elevation is a lift, not a grouping cue"). The
    // shadow was here because "the bare hairline gave the frame no depth at all
    // on a dark canvas" — but in dark the surface step already does that work
    // (`colorSurfaceRaised` L 0.238 over `colorCanvas` L 0.147), and a shadow
    // under a full-width table frame is the single largest instance of using
    // elevation to group. The sticky header keeps its `elevation1`: that one IS
    // a surface leaving its plane.
    boxShadow: vars["--aui-elevation-raised"],
    // A size container, so an empty table's message can measure the frame's
    // visible width (`100cqi`) rather than the table's, which may be wider.
    containerType: "inline-size",
    inlineSize: "100%",
    maxBlockSize: 480,
    overflow: "auto",
  },
  frameless: {
    borderWidth: 0,
    boxShadow: "none",
  },
  // Fill mode: grow into the flex column and drop the fixed height cap so the
  // table rows extend to the bottom of the available area.
  frameFill: {
    flexBasis: 0,
    flexGrow: 1,
    maxBlockSize: "none",
    minBlockSize: 0,
  },
  // The one body cell an empty table renders; the slot inside it pays the air.
  emptyCell: {
    padding: 0,
  },
  /*
   * Held to the frame's visible width and pinned to its start edge, so on a
   * table wider than its frame the message centres in what the reader sees
   * rather than in the full, partly scrolled-off table.
   */
  emptySlot: {
    boxSizing: "border-box",
    inlineSize: "100cqi",
    insetInlineStart: 0,
    padding: vars["--aui-space-16"],
    position: "sticky",
  },
  /*
   * No table-wide floor. It was a constant 760px, which scrolled ten docs
   * tables sideways by exactly the 30px their 730px frames were short, with
   * every column's content already fitting. The floor is the columns' own:
   * a body cell is `nowrap`, so in auto layout each column's minimum is its
   * widest value; a `wrap` column holds `cellWrap`'s floor; a fixed-layout
   * table derives one from its declared widths (`fixedMinInlineSize`). Past
   * the sum of those, the frame scrolls as before.
   */
  table: {
    borderCollapse: "collapse",
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    inlineSize: "100%",
    lineHeight: vars["--aui-line-height-body"],
    minInlineSize: 0,
  },
  // Kept for the call site: `hideBelow` tables already ran without the old
  // 760px floor, which every auto-layout table now does.
  tableResponsive: {
    minInlineSize: 0,
  },
  tableFixed: {
    // Declared column widths win over content width, so an unbounded string
    // truncates in its cell instead of widening the whole table.
    minInlineSize: 0,
    tableLayout: "fixed",
  },
  spacerCell: {
    padding: 0,
  },
  resizeHandle: {
    alignItems: "stretch",
    alignSelf: "stretch",
    backgroundColor: "transparent",
    color: {
      default: vars["--aui-color-border-subtle"],
      ":active": vars["--aui-color-control-on"],
      ":focus-visible": vars["--aui-color-border-focus"],
      "@media (hover: hover)": {
        default: vars["--aui-color-border-subtle"],
        ":active": vars["--aui-color-control-on"],
        ":focus-visible": vars["--aui-color-border-focus"],
        ":hover": vars["--aui-color-border-strong"],
      },
    },
    cursor: "col-resize",
    display: "flex",
    flex: "0 0 auto",
    insetBlock: 0,
    insetInlineEnd: 0,
    justifyContent: "center",
    marginInlineStart: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-4"],
    position: "absolute",
    touchAction: "none",
  },
  resizeHandleActive: {
    color: vars["--aui-color-control-on"],
  },
  resizeGrip: {
    alignSelf: "center",
    backgroundColor: "currentColor",
    blockSize: vars["--aui-space-20"],
    borderRadius: vars["--aui-radius-full"],
    display: "block",
    inlineSize: `calc(2 * ${vars["--aui-border-width-hairline"]})`,
    maxBlockSize: "60%",
  },
  expandCell: {
    // 32px `expandButton` + 2 * space3, i.e. what this column has always
    // rendered — the declaration said 44 and could not be true: in table auto
    // layout a declared width is a *preference* that never wins against the
    // column's min-content width. Padding deliberately untouched: nothing in
    // this repo renders an expandable `DataTable` (no caller passes
    // `expandedRowIds`), so a geometry change here could not be measured, only
    // asserted. The number is now the one a `layout="fixed"` table would get.
    inlineSize: 56,
    paddingInline: vars["--aui-space-12"],
    textAlign: "center",
    verticalAlign: "middle",
  },
  expandButton: {
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
    blockSize: vars["--aui-control-height-sm"],
    borderRadius: vars["--aui-radius-control"],
    borderWidth: 0,
    color: vars["--aui-color-text-muted"],
    cursor: "pointer",
    display: "inline-flex",
    inlineSize: vars["--aui-control-height-sm"],
    justifyContent: "center",
    padding: 0,
  },
  expandedRow: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
  },
  expandedCell: {
    color: vars["--aui-color-text"],
    lineHeight: vars["--aui-line-height-body"],
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-16"],
  },
  visuallyHidden: {
    blockSize: 1,
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    inlineSize: 1,
    // Pinned: an auto-inset absolute box adds phantom scrollable overflow at
    // its static position (see VisuallyHidden.tsx).
    insetBlockStart: 0,
    insetInlineStart: 0,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
  },
  row: {
    [dataTableVars.pinnedCellOverlay]: {
      default: "transparent",
      ":active": vars["--aui-color-overlay-pressed"],
      "@media (hover: hover)": {
        default: "transparent",
        ":hover": vars["--aui-color-overlay-hover"],
        ":active": vars["--aui-color-overlay-pressed"],
      },
    },
    backgroundColor: {
      default: "transparent",
      ":active": vars["--aui-color-overlay-pressed"],
      "@media (hover: hover)": {
        default: "transparent",
        ":hover": vars["--aui-color-overlay-hover"],
        ":active": vars["--aui-color-overlay-pressed"],
      },
    },
  },
  // §1.3: on the `<tr>`, not each `<td>`, so the last row can drop it.
  rowDivider: {
    borderBlockEndColor: vars["--aui-color-border-subtle"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--aui-border-width-hairline"],
  },
  rowClickable: {
    cursor: "pointer",
  },
  /*
   * `isRowUnavailable`: the record behind the row is not there yet (still
   * being generated) or any more (removed). The row steps back as ONE unit on
   * the shared disabled opacity, the way a disabled menu item does, rather than
   * each cell fading itself by its own amount. Visual only — whether the row
   * opens is still `onRowClick`'s call. Opacity on the `<tr>` composites the
   * whole row, pinned cells included.
   */
  rowUnavailable: {
    opacity: vars["--aui-opacity-disabled"],
  },
  // selection-ok: the row's checkbox is the persistent domain-specific mark.
  rowSelected: {
    [dataTableVars.pinnedCellOverlay]: selectedFill,
    backgroundColor: selectedFill,
  },
  // selection-ok: the open row is the strong rung, one step above a selected
  // row (gated by check:colors per preset × theme × scope); its secondary
  // cells step up to body ink, and the panel it opens is the domain mark.
  rowCurrent: {
    [dataTableVars.pinnedCellOverlay]: currentFill,
    backgroundColor: currentFill,
  },
  cell: {
    color: vars["--aui-color-text"],
    lineHeight: vars["--aui-line-height-body"],
    minInlineSize: 0,
    overflowWrap: "normal",
    // No `paddingBlock` here: `cellDensityStyles` always sets it, so the value
    // that used to sit at this line was dead and read as the source of truth.
    paddingInline: vars["--aui-space-12"],
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  },
  cellMuted: { color: vars["--aui-color-text-muted"] },
  // `overflow-wrap: anywhere` makes a wrapping cell's min-content one
  // character, so without the old table floor a narrow frame would hand the
  // wrap column one character per line. 10rem is that column's floor; the
  // frame scrolls before the column goes narrower.
  cellWrap: {
    minInlineSize: "10rem",
    overflowWrap: "anywhere",
    whiteSpace: "normal",
  },
  cellConstrained: {
    // `overflow: hidden` alone cuts the glyph mid-stroke with no sign that
    // anything was cut; the ellipsis is what tells the reader the value
    // continues. Paired with the `nowrap` on `cell`.
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  pinnedCell: {
    backgroundColor: vars["--aui-color-surface-raised"],
    backgroundImage: `linear-gradient(${dataTableVars.pinnedCellOverlay}, ${dataTableVars.pinnedCellOverlay})`,
    backgroundClip: "padding-box",
    position: "sticky",
    // The row's state wash reaches an opaque sticky cell as an INHERITED value,
    // so the ease has to be here: `transition.colors` on the `<tr>` animates
    // that row's own `background-color` — which is what tints every unpinned
    // cell — and cannot reach a cell painting its own fill. Matching duration
    // and easing to `recipes/transition`'s non-spatial arm is what keeps the
    // two halves of one row arriving together.
    //
    // Deliberately NOT on the row: if the row animated this property too, the
    // cell would interpolate toward a value that is itself still moving.
    transitionDuration: {
      default: vars["--aui-motion-duration-fast"],
      "@media (prefers-reduced-motion: reduce)":
        vars["--aui-motion-duration-micro"],
    },
    transitionProperty: pinnedCellOverlayProperty,
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
    zIndex: vars["--aui-z-index-sticky"],
  },
  pinnedHeaderCell: {
    // The sticky head already creates the header stacking context. Keeping the
    // cell on the shared sticky rung puts it above pinned body cells without
    // competing with in-surface panels at `zIndexPanel`.
    zIndex: vars["--aui-z-index-sticky"],
  },
  pinnedLeadingBoundaryLtr: {
    boxShadow: `inset calc(-1 * ${vars["--aui-border-width-hairline"]}) 0 0 ${vars["--aui-color-border-strong"]}`,
  },
  pinnedLeadingBoundaryRtl: {
    boxShadow: `inset ${vars["--aui-border-width-hairline"]} 0 0 ${vars["--aui-color-border-strong"]}`,
  },
  pinnedTrailingBoundaryLtr: {
    boxShadow: `inset ${vars["--aui-border-width-hairline"]} 0 0 ${vars["--aui-color-border-strong"]}`,
  },
  pinnedTrailingBoundaryRtl: {
    boxShadow: `inset calc(-1 * ${vars["--aui-border-width-hairline"]}) 0 0 ${vars["--aui-color-border-strong"]}`,
  },
  cellEditable: {
    // Tighten padding so the inline input/trigger fills the cell box without
    // shifting the row height relative to a static cell.
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-4"],
  },
  editTrigger: {
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
    color: "inherit",
    cursor: "text",
    display: "block",
    font: "inherit",
    inlineSize: "100%",
    lineHeight: vars["--aui-line-height-body"],
    minBlockSize: vars["--aui-control-height-sm"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-8"],
    textAlign: "inherit",
  },
  editInput: {
    appearance: "none",
    backgroundColor: vars["--aui-color-surface-raised"],
    borderColor: {
      default: vars["--aui-color-border"],
      ":focus": vars["--aui-color-border-focus"],
    },
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text"],
    fontFamily: vars["--aui-font-sans"],
    fontSize: vars["--aui-font-size-body"],
    inlineSize: "100%",
    lineHeight: vars["--aui-line-height-body"],
    minBlockSize: vars["--aui-control-height-sm"],
    minInlineSize: 0,
    paddingBlock: 0,
    paddingInline: vars["--aui-space-8"],
  },
  /*
   * The selection column's two edges answer to different things, so they are
   * not the same value.
   *
   * The LEADING edge keeps the same `space3` text gutter as the cells beside
   * it. Selection no longer injects a decorative rail into that gutter.
   *
   * The TRAILING edge is a gutter between a fixed-size control and the next
   * column, not the start of a line of text, so `space3` buys nothing legible
   * there. It costs the most on exactly this column, which is `opacity: 0` at
   * rest (`data-table-motion.css`): those 4px were part of a 44px leading
   * gutter that showed nothing at all until a reader pointed at the row.
   *
   * `inlineSize` is not decoration — it is the only width a `layout="fixed"`
   * table has to go on — so it has to be the true number: 20 + 12 + 8. It
   * declared 40 while rendering 44 (same class of dead declaration
   * `actionsHeaderCell` documents in `DataTable.header.tsx`), and 40 is now
   * what it is.
   */
  selectionCell: {
    inlineSize: 40,
    paddingInlineEnd: vars["--aui-space-8"],
    paddingInlineStart: vars["--aui-space-12"],
    textAlign: "center",
    verticalAlign: "middle",
  },
  actionsCell: {
    inlineSize: 72,
    paddingInline: vars["--aui-space-12"],
    textAlign: "end",
    verticalAlign: "middle",
  },
  loadingBar: {
    inlineSize: "100%",
    maxInlineSize: 420,
  },
  // §8 — `density` arms read `densityPad`, never `spaceN`.
  cellCompact: {
    paddingBlock: densityPad.sm,
  },
  cellRegular: {
    paddingBlock: densityPad.md,
  },
  alignEnd: {
    // End-aligned is the numeric column: right-aligning digits only lines up
    // the last digit, tabular figures line up every column of them.
    fontVariantNumeric: "tabular-nums",
    textAlign: "end",
  },
  alignCenter: {
    textAlign: "center",
  },
});

export const cellDensityStyles = {
  compact: styles.cellCompact,
  regular: styles.cellRegular,
} as const;
