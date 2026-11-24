/**
 * CSV export for `DataTable`: a pure serializer and the browser download the
 * toolbar's export control runs.
 *
 * 2026-11-14. Exports the visible columns; AUI had no export before.
 * The format is RFC 4180: comma separated, CRLF between records, a field
 * quoted when it holds a comma, a quote or a line break, and quotes doubled.
 */
import type * as React from "react";

/** The column fields the serializer reads; a `DataTableColumn` fits. */
export type DataTableCsvColumn<TRow> = {
  /** Read only when it returns text or a number and nothing else gave a value. */
  cell?: (row: TRow) => React.ReactNode;
  /** `false` leaves the column out of the file. */
  exportable?: boolean;
  /** The value written for this column; wins over every fallback. */
  exportValue?: (row: TRow) => number | string | null | undefined;
  /** Written as the header field when it is text; otherwise `id` is. */
  header?: React.ReactNode;
  hidden?: boolean;
  id: string;
  sortValue?: (row: TRow) => number | string | null | undefined;
};

export type DataTableToCsvOptions<TRow> = {
  /** Columns in the order they should be written. */
  columns: ReadonlyArray<DataTableCsvColumn<TRow>>;
  /** Value for a column that declares no `exportValue`. */
  getValue?: (
    row: TRow,
    column: DataTableCsvColumn<TRow>,
  ) => number | string | null | undefined;
  rows: readonly TRow[];
};

const FORMULA_LEAD = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]|^\s|\s$/;

/**
 * One CSV field. Text that a spreadsheet would run as a formula (it starts
 * with `=`, `+`, `-`, `@`, a tab or a carriage return) is prefixed with an
 * apostrophe so it opens as text. A `number` is written as it is: `-12` typed
 * as a number is data, not a formula.
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number")
    return Number.isFinite(value) ? `${value}` : "";
  const text = String(value);
  const guarded = FORMULA_LEAD.test(text) ? `'${text}` : text;
  return NEEDS_QUOTES.test(guarded)
    ? `"${guarded.replaceAll('"', '""')}"`
    : guarded;
}

function primitive(value: unknown): number | string | undefined {
  return typeof value === "string" || typeof value === "number"
    ? value
    : undefined;
}

function columnValue<TRow>(
  row: TRow,
  column: DataTableCsvColumn<TRow>,
  getValue: DataTableToCsvOptions<TRow>["getValue"],
) {
  if (column.exportValue) return column.exportValue(row);
  const given = getValue?.(row, column);
  if (given !== undefined) return given;
  const sorted = column.sortValue?.(row);
  if (sorted !== undefined && sorted !== null) return sorted;
  const rendered = primitive(column.cell?.(row));
  if (rendered !== undefined) return rendered;
  return primitive((row as Record<string, unknown> | null)?.[column.id]);
}

/**
 * Serialize `rows` under a header row. Columns are written in the order
 * given, without the ones marked `hidden` or `exportable: false`. A column's
 * value is its `exportValue(row)`, else `getValue(row, column)`, else its
 * `sortValue(row)`, else what `cell(row)` returns when that is text or a
 * number, else `row[column.id]` when that is. Records end with CRLF except
 * the last, which has no trailing line break.
 */
export function dataTableToCsv<TRow>({
  columns,
  getValue,
  rows,
}: DataTableToCsvOptions<TRow>): string {
  const written = columns.filter(
    (column) => !column.hidden && column.exportable !== false,
  );
  const header = written.map((column) =>
    csvField(primitive(column.header) ?? column.id),
  );
  const records = rows.map((row) =>
    written.map((column) => csvField(columnValue(row, column, getValue))),
  );
  return [header, ...records].map((record) => record.join(",")).join("\r\n");
}

/**
 * Hand `csv` to the browser as a file download. A UTF-8 byte order mark goes
 * in front so a spreadsheet opens non-ASCII text (Korean, accents) correctly.
 */
export function downloadCsv(csv: string, fileName = "table.csv") {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(
    new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.endsWith(".csv") ? fileName : `${fileName}.csv`;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // After the click has been handed off: revoking in the same task can cancel
  // the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
