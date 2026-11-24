/**
 * Column sizing for `DataTable` — the declarative `size` prop, its translation
 * to CSS, and the development-time checks that catch the ways a raw `width`
 * string silently does nothing in a `<table>`.
 *
 * `DataTable` renders a real table, and a table's auto layout is not grid and
 * not flexbox. Three consequences drove every rule below, because callers hit
 * all three:
 *
 *  1. **Grid track syntax is dropped on the floor.** `width: "minmax(220px,
 *     2fr)"` is not a width — `minmax()` and `fr` only exist in grid track
 *     sizing, so the declaration is invalid, the browser discards it, and the
 *     column renders as plain `auto`. Eleven columns across five files were
 *     written this way; none of them had ever applied. Nothing warned.
 *  2. **A content keyword does not pin a column to its content.** In auto
 *     layout `max-content` sets the column's *preferred* width, and a column
 *     with a preferred width still takes a share of the row's leftover space.
 *     Crane's Effort column was `max-content` and measured 179px around a 24px
 *     badge on a wide viewport with short titles.
 *  3. **A pixel width is a floor for the layout, not a promise to the reader.**
 *     `width: "96px"` neither stops a wide table from stretching the column nor
 *     stops a narrow one from clipping it, so a Key column pinned at 96px
 *     clipped `CRN-123` the day the sequence reached three digits.
 *
 * So the sizing intent is named instead of spelled in CSS: `"fit"` shrink-wraps
 * the widest cell and never absorbs leftover width, `"fill"` shares it, and a
 * number is a pixel hint. `width` survives as an escape hatch for the genuinely
 * unusual column, now with the semantics above written down.
 */

/**
 * What a column's width should *mean*, resolved to CSS by `columnSizeWidth`.
 *
 * - `"fit"` — shrink-wrap the widest cell **under `layout="auto"`**. The
 *   column keeps that width at every viewport and hands leftover row width to
 *   the `"fill"` columns. Use it for identifiers, badges, counts, timestamps:
 *   anything whose content bounds its own width. Requires the column's cells
 *   to stay on one line, i.e. not `wrap`. **Does not shrink-wrap under
 *   `layout="fixed"`**: a fixed table takes every declared width literally
 *   and ignores cell content entirely (that is what makes fixed layout fast,
 *   and what makes truncation possible at all), so `"fit"`'s 1% collapses the
 *   column into a sliver instead of sizing to content. On a `layout="fixed"`
 *   table, give a content-bound column a pixel `size` instead — `DataTable`
 *   warns in development when it sees `"fit"` there.
 * - `"fill"` — share the leftover row width with the other `"fill"` columns.
 *   Use it for titles, descriptions, and any column that should absorb slack.
 * - `number` — a pixel width. Honoured exactly once the table is in fixed
 *   layout (every column has a committed width, or the table is declared
 *   `layout="fixed"`); in auto layout the browser treats it as a preference,
 *   so prefer `"fit"` there when you mean "as wide as its content".
 */
export type DataTableColumnSize = "fill" | "fit" | number;

/**
 * `"fit"` is emitted as a 1% width, which reads as a trick and is not one
 * **under `layout="auto"`**: a percentage column in table auto layout can
 * never render narrower than its own min-content width, and `DataTable`'s
 * cells are `nowrap`, so 1% resolves to exactly "the widest cell, and not one
 * pixel of anyone else's slack". The content keywords cannot express that —
 * see this module's header — and `0` / `1px` behave identically but read as a
 * mistake next to a real pixel width.
 *
 * That reasoning inverts under `layout="fixed"`: fixed layout takes declared
 * widths literally and never consults content, so 1% really is 1% of the
 * table and the column collapses into a sliver. There is no CSS-only fix —
 * `table-layout` is table-wide, not per column, so one column cannot opt back
 * into content-based sizing without a measure-on-render pass (out of scope; a
 * resize-observer sizing loop is a bigger change than this warrants). Give a
 * content-bound column a pixel `size` on a fixed-layout table instead;
 * `columnFitFixedLayoutWarnings` says so in development.
 */
const FIT_WIDTH = "1%";

/**
 * The selection, expansion and row-actions columns' widths — the numbers
 * `selectionCell` / `expandCell` / `actionsCell` and their header cells
 * declare in `DataTable.styles.ts` / `DataTable.header.tsx` (StyleX cannot
 * import a constant, so the pair is kept in step by hand).
 *
 * The fixed-layout floor has to count them. It used to count only the data
 * columns, so a table with selection and actions beside four 144px metrics in
 * a 600px frame met its floor with the metrics alone: the 112px the two chrome
 * columns took came out of the `"fill"` column, which rendered 0px wide.
 */
export const CHROME_COLUMN_WIDTHS = {
  actions: 72,
  expansion: 56,
  selection: 40,
} as const;

/** Translate a `size` into the CSS width `DataTable` puts on its cells. */
export function columnSizeWidth(
  size: DataTableColumnSize | undefined,
): string | undefined {
  if (size === undefined) return undefined;
  if (size === "fit") return FIT_WIDTH;
  if (size === "fill") return "auto";
  return `${size}px`;
}

/**
 * The narrowest a fixed-layout table may be: every declared pixel width, plus
 * `minWidth` (64px by default) for each column that declared none, plus the
 * chrome columns.
 *
 * Fixed layout hands an undeclared column whatever the declared ones leave
 * over, and nothing stopped that reaching zero. On a phone-width container a
 * table with three fixed numeric columns gave its one text column 0px — the
 * cells were in the DOM, took no clicks, and read as missing. With a floor, a
 * starved table overflows its own scroll frame instead, which is what a data
 * table on a narrow screen is supposed to do. The chrome columns hold their
 * own width in a fixed table, so the floor counts them too; without them it
 * came up short by exactly their sum and the shortfall came out of the one
 * column that declared no width. (Moved out of `DataTable.root.tsx`.)
 */
export function fixedLayoutFloor(
  columns: ReadonlyArray<{ minWidth?: number }>,
  declaredWidth: (index: number) => string | undefined,
  chrome: { actions: boolean; expansion: boolean; selection: boolean },
  defaultMinWidth: number,
): number | undefined {
  let total =
    (chrome.selection ? CHROME_COLUMN_WIDTHS.selection : 0) +
    (chrome.expansion ? CHROME_COLUMN_WIDTHS.expansion : 0) +
    (chrome.actions ? CHROME_COLUMN_WIDTHS.actions : 0);
  columns.forEach((column, index) => {
    const declared = declaredWidth(index);
    const px =
      typeof declared === "string"
        ? /^(\d+(?:\.\d+)?)px$/.exec(declared.trim())
        : null;
    total += px ? Number(px[1]) : (column.minWidth ?? defaultMinWidth);
  });
  return total > 0 ? total : undefined;
}

/** Grid-only track syntax, which a `<table>` discards without a word. */
const GRID_TRACK_SYNTAX = /minmax\(|(?:^|[\s(,])\d*\.?\d+fr\b/;

/** A bare CSS percentage (`"22%"`), the pattern every caller reaches for
 * before discovering `size`. Unlike grid track syntax this one is not
 * dropped by the browser — it renders, just not as either `"fit"` or
 * `"fill"` mean, which is what makes it silent. */
const PERCENT_WIDTH = /^\d*\.?\d+%$/;

export type SizingCheckColumn = {
  id: string;
  minWidth?: number;
  resizable?: boolean;
  size?: DataTableColumnSize;
  width?: string;
  wrap?: boolean;
};

/**
 * Development-time complaints about a column's sizing declaration. Pure and
 * exported so the messages can be asserted directly; `DataTable` prints them
 * once per mount in development and never in production.
 *
 * Each rule exists because the mistake it names is invisible at runtime: the
 * column renders, nothing throws, and the layout is merely not the one the
 * caller wrote.
 */
export function columnSizingWarnings(
  columns: ReadonlyArray<SizingCheckColumn>,
  layout: "auto" | "fixed" = "auto",
): string[] {
  const warnings: string[] = [];

  for (const column of columns) {
    const at = `column "${column.id}"`;

    if (column.width !== undefined && GRID_TRACK_SYNTAX.test(column.width)) {
      warnings.push(
        `${at} sets width: "${column.width}". \`minmax()\` and \`fr\` are grid ` +
          `track syntax; a <table> discards them and the column renders as ` +
          `\`auto\`. Use size: "fill" (or size: "fit" / a pixel number).`,
      );
    }

    if (column.size !== undefined && column.width !== undefined) {
      warnings.push(
        `${at} sets both size and width. \`size\` wins; drop \`width\`.`,
      );
    }

    if (column.size === "fit" && column.wrap) {
      warnings.push(
        `${at} is size: "fit" and wrap. A wrapping cell has no single-line ` +
          `width to shrink-wrap, so the column falls back to sharing leftover ` +
          `space. Drop one of the two.`,
      );
    }

    // `minWidth` floors the column in auto layout, and in a fixed-layout
    // table it floors a column that declares no width. The one place it does
    // nothing is a fixed-layout column with a declared width that a reader
    // cannot resize: the declared width is taken literally.
    const declaresWidth =
      column.size !== undefined || column.width !== undefined;
    if (
      column.minWidth !== undefined &&
      !column.resizable &&
      layout === "fixed" &&
      declaresWidth
    ) {
      warnings.push(
        `${at} sets minWidth on a declared width in a layout="fixed" table. ` +
          `Fixed layout takes the declared width literally, so minWidth ` +
          `does nothing here (it floors undeclared or resizable columns).`,
      );
    }
  }

  return warnings;
}

/** One development-time complaint, keyed by the column it's about. */
export type DataTableSizingWarning = {
  columnId: string;
  message: string;
};

/**
 * Development-time complaint about a percentage `width` used without `size`
 * — the pattern every column in this repo was written with before `size`
 * existed. Unlike `columnSizingWarnings` this returns `{columnId, message}`
 * pairs instead of plain strings, so the caller (`DataTable`) can deduplicate
 * by column id across re-renders: `columns` is routinely a fresh array
 * literal on every render, so a caller-side effect keyed only on `columns`
 * would otherwise repeat this warning on every paint instead of once per
 * column. Pure and exported so the messages can be asserted directly.
 */
export function columnPercentWidthWarnings(
  columns: ReadonlyArray<SizingCheckColumn>,
): DataTableSizingWarning[] {
  const warnings: DataTableSizingWarning[] = [];

  for (const column of columns) {
    if (column.size !== undefined || column.width === undefined) continue;
    if (!PERCENT_WIDTH.test(column.width)) continue;
    warnings.push({
      columnId: column.id,
      // i18n-ignore: developer diagnostic (console.warn on column misuse)
      message:
        `column "${column.id}" sets width: "${column.width}". A percentage ` +
        `neither shrink-wraps content nor names a fixed pixel, so it does not ` +
        `express "fit" or "fill" intent — use size: "fill" for an elastic ` +
        `column, size: "fit" to shrink-wrap its content, or a pixel number.`,
    });
  }

  return warnings;
}

/**
 * Development-time complaint about `size: "fit"` on a `layout="fixed"` table.
 * `"fit"` only shrink-wraps a column's content under `layout="auto"` (see the
 * `DataTableColumnSize` doc comment): fixed layout takes every declared width
 * literally and ignores content entirely, so `"fit"`'s 1% collapses the
 * column into a sliver instead of sizing it to content — this was hit for
 * real on Copy Review's queue table, whose Status/Delivery columns collapsed
 * under `layout="fixed"` before falling back to hand-measured pixels. Keyed
 * on the table's own `layout` prop (not the derived "every column happens to
 * have a committed pixel width" state, which a reader can reach by resizing
 * every column on an `layout="auto"` table — that is not a caller mistake).
 * Same `{columnId, message}` shape and per-column-id dedup contract as
 * `columnPercentWidthWarnings`.
 */
export function columnFitFixedLayoutWarnings(
  columns: ReadonlyArray<SizingCheckColumn>,
  layout: "auto" | "fixed",
): DataTableSizingWarning[] {
  if (layout !== "fixed") return [];
  const warnings: DataTableSizingWarning[] = [];

  for (const column of columns) {
    if (column.size !== "fit") continue;
    warnings.push({
      columnId: column.id,
      // i18n-ignore: developer diagnostic (console.warn on column misuse)
      message:
        `column "${column.id}" is size: "fit" on a layout="fixed" table. ` +
        `Fixed layout takes declared widths literally and never consults ` +
        `content, so "fit"'s 1% collapses the column into a sliver instead of ` +
        `shrink-wrapping it. Give it a pixel size (size: <number>) instead.`,
    });
  }

  return warnings;
}

/**
 * True in a development build. `DataTable` ships as source and is compiled by
 * each consumer's bundler, so there is no `process.env.NODE_ENV` to read (no
 * app in this repo defines one for the browser) — `import.meta.env.DEV` is what
 * Vite substitutes. The cast is deliberate: `packages/design-system` has no
 * `vite/client` types and must keep type-checking on its own with plain `tsc`.
 */
export function isDevBuild(): boolean {
  const meta = import.meta as unknown as { env?: { DEV?: boolean } };
  return meta.env?.DEV === true;
}
