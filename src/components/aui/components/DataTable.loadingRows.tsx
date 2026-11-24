import { themeProps, themeSlotProps } from "../theming/theme-props";
import { transition } from "../recipes/transition";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import { cellInlineStyle, pinnedCellStyles } from "./DataTable.cellLayout";
import {
  DataTableSampledCell,
  useSampledCellShapes,
} from "./DataTable.loadingSample";
import { stackRoleOf } from "./DataTable.responsive";
import { stackedStyles } from "./DataTable.stacked.styles";
import { cellDensityStyles, styles } from "./DataTable.styles";
import type { DataTableViewProps } from "./DataTable.view.types";
import { Checkbox } from "./Checkbox";
import { Skeleton } from "./Skeleton";

export type DataTableLoadingRowsProps<TRow extends { id: string }> = Pick<
  DataTableViewProps<TRow>,
  | "bodyRef"
  | "density"
  | "direction"
  | "expansion"
  | "fixedLayout"
  | "hasFixedColumnLayout"
  | "loadingSamples"
  | "pinnedCellFor"
  | "resolveColumnMinWidth"
  | "resolveColumnWidth"
  | "rowActions"
  | "selection"
  | "skeletonRowCount"
  | "stack"
  | "visibleColumns"
>;

const BAR_WIDTHS = ["72%", "56%", "84%", "64%"];

/**
 * Shape-matched skeleton rows under the real header while the table loads.
 * Split out of `DataTable.view.tsx`; the cells are the body cells — the same
 * density padding, pinning, widths, `minWidth` floor, `wrap` floor and
 * alignment — so the columns do not move when the data lands.
 *
 * With a row to measure (`loadingSamples`: a refetch's own rows, else the
 * caller's `loadingSample`) each cell renders that row's content invisibly
 * and draws the shared skeleton shapes over it (`DataTable.loadingSample`):
 * an avatar or badge row is as tall, and an undeclared column as wide, as it
 * will be. Without one, each cell is one line box of the cell's type with
 * its cap band painted — a text row's exact height; a taller cell or an
 * undeclared width still moves when the data lands.
 *
 * Stacked, a skeleton row is a stacked row: a title bar, and each meta line's
 * real label beside a value placeholder.
 */
export function DataTableLoadingRows<TRow extends { id: string }>({
  bodyRef,
  density,
  direction,
  expansion,
  fixedLayout,
  hasFixedColumnLayout,
  loadingSamples,
  pinnedCellFor,
  resolveColumnMinWidth,
  resolveColumnWidth,
  rowActions,
  selection,
  skeletonRowCount,
  stack,
  visibleColumns,
}: DataTableLoadingRowsProps<TRow>) {
  const sampled = loadingSamples.length > 0;
  const shapes = useSampledCellShapes(bodyRef, sampled || Boolean(selection));
  // One sample repeated in every row: vary its text bands so the column does
  // not read as a solid slab. A refetch's own rows already vary.
  const repeated = sampled && loadingSamples.length < skeletonRowCount;
  const stackedRow = stack
    ? [
        stackedStyles.row,
        density === "compact"
          ? stackedStyles.rowCompact
          : stackedStyles.rowRegular,
      ]
    : [];
  const stackedCell = stack && stackedStyles.cell;

  return Array.from({ length: skeletonRowCount }).map((_, index) => {
    const skeletonRowTheme = themeProps("data-table-row");
    const sample = sampled
      ? loadingSamples[index % loadingSamples.length]
      : undefined;
    return (
      <tr
        {...skeletonRowTheme}
        className={cx(
          sx(
            styles.row,
            index < skeletonRowCount - 1 && styles.rowDivider,
            transition.colors,
            ...stackedRow,
          ),
          skeletonRowTheme.className,
        )}
        key={index}
        role={stack ? "row" : undefined}
      >
        {expansion ? (
          <td
            className={sx(
              styles.expandCell,
              cellDensityStyles[density],
              stackedCell,
              stack && stackedStyles.expandCell,
            )}
          >
            {/* The expand toggle's own box: a 32px control. */}
            <Skeleton
              height={vars["--aui-control-height-sm"]}
              variant="control"
              width={vars["--aui-control-height-sm"]}
            />
          </td>
        ) : null}
        {selection ? (
          <td
            className={sx(
              styles.selectionCell,
              cellDensityStyles[density],
              stackedCell,
              stack && stackedStyles.selectCell,
            )}
          >
            {/* The row checkbox itself, drawn invisibly and painted over: its
                hit area is taller than its 16px box (36px measured), so a
                16px placeholder left a selectable row 4px short. */}
            <DataTableSampledCell
              cellKey={`${index}:__select`}
              direction={direction}
              shapes={shapes[`${index}:__select`]}
            >
              <Checkbox
                aria-label=""
                checked={false}
                className="aui-data-table__selection-checkbox"
                tabIndex={-1}
              />
            </DataTableSampledCell>
          </td>
        ) : null}
        {visibleColumns.map((column, columnIndex) => {
          const pinnedCell = pinnedCellFor(column.id);
          const stackRole = stackRoleOf(stack, column.id);
          const placeholder =
            sample === undefined ? (
              /* One line box of the cell's own type with its cap band
                 painted: a text row is the same height loading and loaded
                 (a 12px bar left every row 8px short). Varied widths keep
                 the column from reading as a solid slab. */
              <Skeleton
                className={sx(styles.loadingBar)}
                variant="text"
                width={BAR_WIDTHS[(index + columnIndex) % BAR_WIDTHS.length]}
              />
            ) : (
              <DataTableSampledCell
                align={column.align}
                cellKey={`${index}:${column.id}`}
                direction={direction}
                shapes={shapes[`${index}:${column.id}`]}
                varyIndex={repeated ? index + columnIndex : undefined}
              >
                {column.cell(sample)}
              </DataTableSampledCell>
            );
          return (
            <td
              {...themeSlotProps("data-table-row", "cell")}
              className={sx(
                styles.cell,
                cellDensityStyles[density],
                column.wrap && styles.cellWrap,
                column.align === "end" && styles.alignEnd,
                column.align === "center" && styles.alignCenter,
                fixedLayout && styles.cellConstrained,
                ...pinnedCellStyles(pinnedCell, direction),
                stackedCell,
                stackRole === "title" && stackedStyles.titleCell,
                stackRole === "meta" && stackedStyles.metaCell,
              )}
              key={column.id}
              style={cellInlineStyle(
                resolveColumnWidth(column),
                pinnedCell,
                resolveColumnMinWidth(column),
              )}
            >
              {stackRole === "meta" ? (
                <span aria-hidden className={sx(stackedStyles.metaLabel)}>
                  {column.header}
                </span>
              ) : null}
              {placeholder}
            </td>
          );
        })}
        {rowActions ? (
          <td
            className={sx(
              styles.actionsCell,
              cellDensityStyles[density],
              stackedCell,
              stack && stackedStyles.actionsCell,
            )}
          >
            {sample === undefined ? (
              <Skeleton height={16} width={48} />
            ) : (
              <DataTableSampledCell
                align="end"
                cellKey={`${index}:__actions`}
                direction={direction}
                shapes={shapes[`${index}:__actions`]}
              >
                {rowActions(sample)}
              </DataTableSampledCell>
            )}
          </td>
        ) : null}
        {hasFixedColumnLayout ? (
          <td aria-hidden className={sx(styles.spacerCell)} />
        ) : null}
      </tr>
    );
  });
}
