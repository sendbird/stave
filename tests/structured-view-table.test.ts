import { describe, expect, test } from "bun:test";
import {
  structuredColumnAlign,
  structuredTablePage,
  structuredTablePageCount,
  structuredTableRows,
  visibleStructuredRows,
} from "@/lib/structured-view/table-view";
import type { StructuredTableView } from "@/lib/structured-view/view-spec";

const view: StructuredTableView = {
  type: "table",
  columns: [
    { key: "name" },
    { key: "count", type: "number" },
    { key: "when", type: "date" },
    { key: "ok", type: "boolean", align: "center" },
  ],
  rows: [
    { name: "item 10", count: 3, when: "2026-03-01", ok: true },
    { name: "item 2", count: null, when: "2026-01-15", ok: false },
    { name: "Alpha", count: 12, when: "2026-02-01", ok: true },
    { name: "beta", count: 3, when: null, ok: null },
  ],
};
const rows = structuredTableRows(view);
const names = (list: ReturnType<typeof visibleStructuredRows>) => list.map((row) => row.values.name);

describe("structured table view", () => {
  test("keeps the written order without a sort", () => {
    expect(names(visibleStructuredRows(view, rows, null, ""))).toEqual(["item 10", "item 2", "Alpha", "beta"]);
  });

  test("sorts numbers by value with empty cells last and a stable tiebreak", () => {
    expect(names(visibleStructuredRows(view, rows, { columnId: "count", direction: "asc" }, ""))).toEqual([
      "item 10",
      "beta",
      "Alpha",
      "item 2",
    ]);
    expect(names(visibleStructuredRows(view, rows, { columnId: "count", direction: "desc" }, ""))).toEqual([
      "Alpha",
      "item 10",
      "beta",
      "item 2",
    ]);
  });

  test("sorts text naturally and dates by time", () => {
    expect(names(visibleStructuredRows(view, rows, { columnId: "name", direction: "asc" }, ""))).toEqual([
      "Alpha",
      "beta",
      "item 2",
      "item 10",
    ]);
    expect(names(visibleStructuredRows(view, rows, { columnId: "when", direction: "asc" }, ""))).toEqual([
      "item 2",
      "Alpha",
      "item 10",
      "beta",
    ]);
  });

  test("searches every term across the row's cells", () => {
    expect(names(visibleStructuredRows(view, rows, null, "item 2026-01"))).toEqual(["item 2"]);
    expect(names(visibleStructuredRows(view, rows, null, "ALPHA"))).toEqual(["Alpha"]);
    expect(visibleStructuredRows(view, rows, null, "missing")).toEqual([]);
  });

  test("pages the rows and clamps the page", () => {
    const many = Array.from({ length: 25 }, (_, index) => index);
    expect(structuredTablePageCount(many.length)).toBe(3);
    expect(structuredTablePageCount(0)).toBe(1);
    expect(structuredTablePage(many, 3)).toEqual(many.slice(20));
    expect(structuredTablePage(many, 9)).toEqual(many.slice(20));
    expect(structuredTablePage(many, 0)).toEqual(many.slice(0, 10));
  });

  test("aligns numbers at the end unless the view says otherwise", () => {
    expect(view.columns.map(structuredColumnAlign)).toEqual(["start", "end", "start", "center"]);
  });
});
