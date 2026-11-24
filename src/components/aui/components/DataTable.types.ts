/**
 * The public column / sort / selection contract for `DataTable`.
 *
 * Split out of `DataTable.tsx` when column sizing gained a real vocabulary
 * (`size`, see `DataTable.sizing.ts`): the contract a caller writes against is
 * the part of this component that most needs room to be documented, and it was
 * sharing a 1,500-line file with the renderer. Nothing here has behavior — the
 * table reads these fields, and every rule about what a value *does* lives next
 * to the code that applies it.
 */
import type * as React from "react";

import type { ListVirtualization } from "../utils/windowed-list";
import type { DataTableEmptyStateSlot } from "./DataTable.empty";
import type { DataTablePagination } from "./DataTable.pagination.types";
import type { DataTableColumnSize } from "./DataTable.sizing";

/**
 * Opt-in row-virtualization options for {@link DataTable}: the options every
 * windowed AUI list shares (`enabled`, `estimateRowHeight` — 44px here — and
 * `overscan`, 8), plus the frame's bounded height.
 */
export type DataTableVirtualization = ListVirtualization & {
  /**
   * Bounded scroll-container height. A number is treated as px; a string is
   * used verbatim. Ignored in `fillHeight` mode unless explicitly supplied.
   */
  maxBlockSize?: number | string;
};

export type DataTableSortDirection = "ascending" | "descending";

export type DataTableColumnPinning = {
  /** Column ids held to the logical inline start (left in LTR, right in RTL). */
  leading?: string[];
  /** Column ids held to the logical inline end (right in LTR, left in RTL). */
  trailing?: string[];
};

export type DataTableColumn<TRow> = {
  align?: "start" | "center" | "end";
  cell: (row: TRow) => React.ReactNode;
  /**
   * Opt in to inline cell editing for this column. When true, each cell enters
   * an editable text input on click / Enter / F2 and commits through the
   * table's `onCellEdit`. Defaults to false (the cell renders `cell(row)` and
   * is not interactive). Has no effect while the table is `loading`.
   *
   * One visible editable column (with `onCellEdit`) makes the whole table a
   * `role="grid"`: a single Tab stop, arrow keys between cells — see
   * `DataTable.gridKeyboard.ts` and `onCellEdit`.
   */
  editable?: boolean;
  /**
   * Current text value for an editable cell's input. Used to seed the field
   * when editing begins (and to restore it on cancel). Defaults to an empty
   * string. Only consulted when `editable` is true.
   */
  getEditValue?: (row: TRow) => string;
  /**
   * Declares the column a measure — a time, a count, an amount, a size, an
   * id — so its body cells are set in the machine register's mono face with
   * tabular numerals (`recipes/measured`). The ink stays the cell's and the
   * alignment stays `align` (`"end"` for amounts that are compared down the
   * column). The header keeps the text face: it is a word. @default false
   */
  measured?: boolean;
  /**
   * `false` leaves the column out of the CSV the table's export control and
   * `dataTableToCsv` write. Use it for a column of controls or thumbnails.
   * @default true
   */
  exportable?: boolean;
  /**
   * The value written to CSV for this column. Without it the export falls
   * back to `sortValue(row)`, then to what `cell(row)` returns when that is
   * text or a number, then to `row[id]` when that is.
   */
  exportValue?: (row: TRow) => number | string | null | undefined;
  header: React.ReactNode;
  /**
   * A control that sits beside the header label rather than inside it — an
   * info tooltip explaining what the column measures, typically.
   *
   * It needs its own slot because a sortable column renders its `header`
   * inside the sort `<button>`, and a second button nested in that one is
   * invalid HTML: the browser decides for itself which one a click reaches.
   * Anything interactive that belongs to the header goes here; static
   * adornments can stay in `header`.
   */
  headerHint?: React.ReactNode;
  hideable?: boolean;
  /**
   * Put the column away while the table's own frame is narrower than this
   * many pixels, and bring it back when it widens — the column that matters
   * least in a list that shares its row with a detail panel or a phone. A
   * list that runs out of room should drop its least important column, not
   * scroll the important ones half out of view. Measured on the table's
   * scroll frame, so it answers to the table's width, not the viewport's.
   */
  hideBelow?: number;
  hidden?: boolean;
  id: string;
  /**
   * The column's floor, in px. The table's own floor is the sum of its
   * columns' minimums: past it the frame scrolls instead of squeezing a
   * column further.
   *
   * - `layout="auto"`: the column never renders narrower than this (or than
   *   its widest cell). A `wrap` column's floor is this, else 10rem.
   * - `layout="fixed"`: the width a column that declares no width is kept at
   *   (64px when unset) — fixed layout hands such a column whatever the
   *   declared ones leave over, which reached 0px on a narrow container.
   * - `resizable`: the narrowest a reader may drag the divider to.
   *
   * The rendered width still comes from `size`; this only bounds it.
   */
  minWidth?: number;
  /**
   * Whether a reader may move this column: drag its header, or press
   * Alt+ArrowLeft / Alt+ArrowRight (Alt+Home / Alt+End) on it. `false` keeps
   * it from being picked up; other columns can still move past it. A pinned
   * column moves inside its pinned group only.
   * @default true when the table has `onColumnOrderChange` or `defaultColumnOrder`
   */
  reorderable?: boolean;
  /** Enable a draggable / keyboard-driven divider on this column's trailing edge. */
  resizable?: boolean;
  /**
   * How wide the column should be, stated as intent rather than CSS:
   *
   * - `"fit"` — shrink-wrap the widest cell and never take a share of the
   *   row's leftover width. Identifiers, badges, counts, dates. Only
   *   shrink-wraps under `layout="auto"`: a `layout="fixed"` table takes
   *   declared widths literally and ignores content, so `"fit"` collapses the
   *   column into a sliver instead. Give a content-bound column a pixel
   *   `size` on a `layout="fixed"` table instead (`DataTable` warns in
   *   development when it sees `"fit"` there).
   * - `"fill"` — absorb the leftover width alongside the other `"fill"`
   *   columns. Titles, descriptions, anything elastic.
   * - `number` — pixels.
   *
   * Takes precedence over `width`, and a reader's drag takes precedence over
   * both. See `DataTable.sizing.ts` for why a `<table>` cannot express `"fit"`
   * as `max-content` and what each value compiles to.
   */
  size?: DataTableColumnSize;
  sortable?: boolean;
  /**
   * The column's part in the stacked presentation the table switches to below
   * its `stackBelow` width (see `DataTableProps.stackBelow`):
   *
   * - `"title"` — the row's heading line, beside the selection checkbox and
   *   the row actions. Without one, the first visible column is the title.
   * - `"meta"` (default) — one `label: value` line under the title, the label
   *   being the column's `header`.
   * - `"hidden"` — left out while stacked, and out of the Columns menu. Use it
   *   for what a phone-width list can do without; `hideBelow` still applies
   *   in either presentation.
   *
   * Has no effect while the table renders as a table.
   */
  stackRole?: DataTableStackRole;
  /**
   * The cell's ink (S7, R5). The row's TITLE column — the one with
   * `stackRole: "title"`, else the first visible column — reads in primary
   * ink; every other cell reads one step quieter in `colorTextMuted`, so a
   * scan down the table lands on what each row is. `"neutral"` keeps a
   * secondary column in primary ink (an amount that IS the point of the
   * table); `"muted"` quiets a title column. Badges, links and other
   * components inside a cell keep their own ink either way.
   */
  tone?: DataTableColumnTone;
  /**
   * Comparable value for UNCONTROLLED sorting (used only when the table sorts
   * its own rows — no `sort` prop). Controlled tables sort app-side and can
   * omit this. Columns without `sortValue` are skipped by the internal sort.
   */
  sortValue?: (row: TRow) => string | number | null | undefined;
  /**
   * Escape hatch: a raw CSS width applied to the column's cells. It is read as
   * table auto-layout CSS, so grid track syntax (`minmax()`, `fr`) is invalid
   * here and the browser drops it silently — `DataTable` warns in development
   * when it sees any. A bare percentage (`"22%"`) is valid CSS but almost
   * never what a caller means (it neither shrink-wraps content nor fills
   * leftover space the way `size` does), so `DataTable` also warns in
   * development when `width` is a percentage and `size` is absent. Prefer
   * `size`; reach for `width` only for a value the three `size` values
   * genuinely cannot express.
   */
  width?: string;
  wrap?: boolean;
};

/** A column's ink — see `DataTableColumn.tone`. */
export type DataTableColumnTone = "neutral" | "muted";

/** A column's part in the stacked presentation — see `DataTableColumn.stackRole`. */
export type DataTableStackRole = "hidden" | "meta" | "title";

export type DataTableSort = {
  columnId: string;
  direction: DataTableSortDirection;
};

export type {
  DataTableCursorLoadMorePagination,
  DataTableCursorNavigationPagination,
  DataTableCursorPagination,
  DataTablePagePagination,
  DataTablePagination,
} from "./DataTable.pagination.types";

export type DataTableSelection<TRow extends { id: string }> = {
  /**
   * Accessible label for a row's selection checkbox — the escape hatch for
   * naming the record ("Select Alice Smith"). Defaults to `Select row N`, the
   * row's 1-based position in the rendered page; the row `id` is never spoken
   * because it is usually an opaque key.
   */
  getRowLabel?: (row: TRow) => string;
  /**
   * Optional per-row gate; return false to disable that row's checkbox. The
   * counterpart of `DataTableExpansion.isRowExpandable`, and the difference is
   * deliberate: an unexpandable row has nothing to show, so its toggle is
   * hidden, while an unselectable row is a row the bulk action cannot take —
   * the reader has to see that it is there and cannot be picked, so the
   * checkbox stays and goes disabled.
   *
   * Select-all follows the same gate: it adds and removes exactly the rows the
   * gate allows, and goes disabled when the page holds none. A row already in
   * `selectedRowIds` still renders checked — what the caller selected is the
   * caller's to show — so a gate that starts refusing a selected row does not
   * silently drop it.
   */
  isRowSelectable?: (row: TRow) => boolean;
  onSelectedRowIdsChange?: (selectedRowIds: string[]) => void;
  selectedRowIds: string[];
};

export type DataTableExpansion<TRow extends { id: string }> = {
  /**
   * Accessible label for a row's expand toggle. Defaults to
   * `Expand row N` / `Collapse row N` — the row's 1-based position in the
   * rendered page and the action the press will take, never the row `id`.
   */
  getRowLabel?: (row: TRow) => string;
  /** Optional per-row gate; return false to hide the toggle for that row. */
  isRowExpandable?: (row: TRow) => boolean;
  onExpandedRowIdsChange?: (expandedRowIds: string[]) => void;
  /** Content rendered in a full-width sub-row beneath an expanded row. */
  renderExpanded: (row: TRow) => React.ReactNode;
  expandedRowIds: string[];
};

export type DataTableProps<TRow extends { id: string }> = {
  /**
   * Row currently represented by an inspector or detail panel. Independent
   * from checkbox `selection`, so bulk selection and inspection can coexist.
   */
  currentRowId?: string;
  /** Controlled display order. Missing/new ids are appended in `columns` order. */
  columnOrder?: string[];
  /**
   * Controlled logical-edge pin membership. Columns are grouped at the
   * leading/trailing edges after `columnOrder`; hidden and unknown ids are
   * ignored. Persist this object beside order and widths.
   */
  columnPinning?: DataTableColumnPinning;
  columnVisibility?: Record<string, boolean>;
  /** Initial column order when `columnOrder` is not controlled. */
  defaultColumnOrder?: string[];
  /** Initial pin membership when `columnPinning` is not controlled. */
  defaultColumnPinning?: DataTableColumnPinning;
  /**
   * Column sizing algorithm. `auto` sizes columns to content; `fixed` honours
   * declared widths and lets cells truncate. Defaults to `auto`.
   */
  layout?: "auto" | "fixed";
  columnVisibilityLabel?: React.ReactNode;
  /** Controlled pixel widths for pointer- or keyboard-resized columns. */
  columnWidths?: Record<string, number>;
  columns: Array<DataTableColumn<TRow>>;
  density?: "compact" | "regular";
  /**
   * Show an export control in the toolbar that downloads the rows currently
   * in `rows` as CSV: the visible columns in their current order, under a
   * header row (see `dataTableToCsv`). It exports what is loaded, not a
   * server-side total — a paginated table exports its current page.
   * `fileName` defaults to `"table.csv"` and `label` to `"Export CSV"`.
   * @default false
   */
  exportable?: boolean | { fileName?: string; label?: string };
  /**
   * What the table shows when it has no rows, under its header row: an
   * object configures the default `EmptyState` (`title`, `description`,
   * `action`, `icon`, `tone`, … — each optional, with copy that fits a
   * filtered or an unfiltered table), any other node replaces it. The slot
   * shape the collection components share.
   */
  emptyState?: DataTableEmptyStateSlot;
  /**
   * The load failed with no rows: the empty state's well (same measure,
   * header kept) shows a `role="alert"` `errorTitle` over this node (`true`:
   * a generic line) in danger text, plus `Retry` with `onRetry`. Not while
   * `loading`; with rows nothing changes (see `pagination.error`).
   */
  error?: React.ReactNode;
  /** Heading of the body error. @default "Couldn't load rows" */
  errorTitle?: React.ReactNode;
  /** Re-run the failed load from the body error's `Retry` link. */
  onRetry?: () => void;
  /** Label of the body error's recovery action. @default "Retry" */
  retryLabel?: React.ReactNode;
  /**
   * Let the table fill a bounded parent's block size instead of capping its
   * scroll frame at a fixed height.
   */
  fillHeight?: boolean;
  /**
   * Draw the scroll frame's perimeter and lift. Defaults to `true`; pass false
   * when the table already sits inside a bordered region.
   */
  frame?: boolean;
  /** Per-row expandable sub-rows. Omit for the classic flat table. */
  expansion?: DataTableExpansion<TRow>;
  filter?: React.ReactNode;
  /**
   * The record a row stands for is not available — still being generated, or
   * removed. The row steps back as one unit on `--aui-opacity-disabled`, the
   * way a disabled menu item does, instead of each cell fading by its own
   * amount. Visual only: whether the row opens is still `onRowClick`'s call.
   */
  isRowUnavailable?: (row: TRow) => boolean;
  /**
   * Rows in flight. Skeleton rows stand under the real header (as many as
   * the rows on screen, else four) and the `<table>` is `aria-busy`. Each
   * placeholder takes the geometry of a real row when the table has one to
   * measure — the rows already on screen during a refetch, else
   * `loadingSample` — so the row heights and column widths hold when the
   * data lands. With neither, each cell is one text line.
   */
  loading?: boolean;
  /**
   * A typical row the first-load placeholder is measured from. Each skeleton
   * cell renders this row's real cell content invisibly (inert, hidden from
   * assistive tech) and draws the shared skeleton shapes over what it laid
   * out — a cap band per text line, a circle per avatar, a chip per badge —
   * so a row with avatars or badges is as tall loading as loaded and a
   * column without a declared width is as wide. Make it typical, not
   * extreme: its values are the widths reserved. Cells run for real, so keep
   * side effects out of `cell` renderers.
   */
  loadingSample?: TRow;
  /**
   * Enable multi-column sort: shift-click appends a secondary sort and the
   * header shows a 1-based order index.
   */
  multiSort?: boolean;
  /**
   * Commit handler for inline cell edits. Required for any column's `editable`
   * flag to take effect.
   *
   * With a visible editable column the table renders as a WAI-ARIA data grid:
   * one Tab stop (the active cell), arrows move it (mirrored in RTL),
   * Home/End reach the row's ends, Ctrl/Cmd+Home/End the body's, and
   * PageUp/PageDown a viewport of rows. ArrowUp from the first row enters the
   * header row, whose cells (sort buttons, select-all) are grid cells too, and
   * ArrowDown returns. An expanded row's detail row is one full-width cell in
   * the walk; on the expand cell the inline-end arrow expands a collapsed row
   * and the inline-start arrow collapses an expanded one, and the inline-start
   * arrow on a detail cell returns to its row's expand cell. Enter or F2 opens
   * an editable cell, and typing a character opens it with that character as
   * the draft; Enter commits and Escape cancels, both returning focus to the
   * cell.
   */
  onCellEdit?: (rowId: string, columnId: string, nextValue: string) => void;
  /**
   * Fired with every column id in its new order when a reader moves a column.
   * Giving it (or `defaultColumnOrder`) makes the columns reorderable: drag a
   * header with a mouse or pen, or press Alt+ArrowLeft / Alt+ArrowRight
   * (Alt+Home / Alt+End) on a focused header. Each move is announced in a
   * polite live region. Opt a column out with its `reorderable: false`.
   */
  onColumnOrderChange?: (columnOrder: string[]) => void;
  /**
   * Fired with the new pin membership. Giving it (or `defaultColumnPinning`)
   * adds a "Pin column" section to the Columns menu: each visible column
   * opens "Pin to start", "Pin to end" and "Unpin".
   */
  onColumnPinningChange?: (columnPinning: DataTableColumnPinning) => void;
  onColumnVisibilityChange?: (
    columnVisibility: Record<string, boolean>,
  ) => void;
  /**
   * Giving it shows a two-option row-density switch in the toolbar
   * (comfortable / compact) that calls it; `density` stays the caller's to
   * hold. Without it there is no switch.
   */
  onDensityChange?: (density: "compact" | "regular") => void;
  /** Fired when a resizable column width changes. */
  onColumnWidthsChange?: (columnWidths: Record<string, number>) => void;
  /**
   * Whole-row activation handler. Pointer, Enter, and Space activate the row;
   * events from interactive descendants remain owned by those controls. In an
   * editable (grid) table the row is not a Tab stop: Enter and Space on any
   * cell that is its own focus target activate the row instead.
   */
  onRowClick?: (row: TRow) => void;
  /** Single-sort callback; also receives the primary multi-sort entry. */
  onSortChange?: (sort: DataTableSort) => void;
  /** Ordered multi-sort callback; only fired when multi-sort is enabled. */
  onSortStateChange?: (sort: DataTableSort[]) => void;
  pagination?: DataTablePagination;
  rowActions?: (row: TRow) => React.ReactNode;
  rows: TRow[];
  selection?: DataTableSelection<TRow>;
  /**
   * Initial sort for uncontrolled sorting. The table sorts client-side through
   * each column's `sortValue`.
   */
  defaultSort?: DataTableSort | DataTableSort[];
  /**
   * Controlled active sort. Controlled tables never reorder rows internally;
   * callers provide already-sorted `rows`.
   */
  sort?: DataTableSort | DataTableSort[];
  /**
   * Render rows as a stacked list while the table's own frame is narrower
   * than this many pixels, and as a table again once it widens. Each row
   * becomes its title column on one line — beside the selection checkbox,
   * expand toggle and row actions — over `label: value` lines for the other
   * columns; each column's `stackRole` says which it is. Measured on the scroll
   * frame, like `hideBelow`, so it answers to the table's width rather than
   * the viewport's. Selection, row actions, row activation, expansion and grid
   * keyboard navigation keep working; widths, pinning and resizing are table
   * concerns and pause while stacked. Undefined (the default) never stacks.
   */
  stackBelow?: number;
  stickyHeader?: boolean;
  /**
   * Opt-in row windowing. Only visible rows plus overscan mount inside the
   * bounded scroll frame; dynamic measurement supports expanded sub-rows.
   * A windowed table states its full size to assistive tech: the table
   * carries `aria-rowcount` (every row, the header row and expanded detail
   * rows included) and each rendered row its absolute `aria-rowindex`.
   */
  virtualization?: DataTableVirtualization;
};
