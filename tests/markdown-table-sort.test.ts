import { describe, expect, test } from "bun:test";
import type { Element, Root } from "hast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import {
  compareTableCells,
  nextTableSort,
  parseSortableNumber,
  plainTableFromHast,
  sortTableRowIndices,
  visibleTableRowIndices,
} from "@/lib/markdown/table-sort";

function tableNode(markdown: string): Element {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype);
  const tree = processor.runSync(processor.parse(markdown)) as Root;
  const table = tree.children.find(
    (node): node is Element => node.type === "element" && node.tagName === "table",
  );
  if (!table) throw new Error("no table");
  return table;
}

describe("parseSortableNumber", () => {
  test("reads numbers with separators, currency, percent and short units", () => {
    expect(parseSortableNumber("1,204")).toBe(1204);
    expect(parseSortableNumber("$12.50")).toBe(12.5);
    expect(parseSortableNumber("-3.5%")).toBe(-3.5);
    expect(parseSortableNumber("+4.9%")).toBe(4.9);
    expect(parseSortableNumber("12 ms")).toBe(12);
    expect(parseSortableNumber("1.5e3")).toBe(1500);
    expect(parseSortableNumber("−2")).toBe(-2);
  });

  test("leaves versions, dates and words as text", () => {
    expect(parseSortableNumber("1.2.3")).toBeNull();
    expect(parseSortableNumber("2024-01-05")).toBeNull();
    expect(parseSortableNumber("ready")).toBeNull();
    expect(parseSortableNumber("")).toBeNull();
  });
});

describe("table sorting", () => {
  test("numbers compare by value and before text", () => {
    expect(compareTableCells("9", "10")).toBeLessThan(0);
    expect(compareTableCells("1,000", "200")).toBeGreaterThan(0);
    expect(compareTableCells("12", "apple")).toBeLessThan(0);
    expect(compareTableCells("item 2", "item 10")).toBeLessThan(0);
  });

  test("sorts both ways, keeps empty cells last and ties in written order", () => {
    const rows = [["b", "10"], ["a", ""], ["c", "9"], ["d", "10"], ["e", "—"]];
    expect(sortTableRowIndices(rows, { column: 1, direction: "ascending" })).toEqual([2, 0, 3, 1, 4]);
    expect(sortTableRowIndices(rows, { column: 1, direction: "descending" })).toEqual([0, 3, 2, 1, 4]);
  });

  test("a header press cycles ascending, descending, written order", () => {
    const first = nextTableSort(null, 1);
    expect(first).toEqual({ column: 1, direction: "ascending" });
    const second = nextTableSort(first, 1);
    expect(second).toEqual({ column: 1, direction: "descending" });
    expect(nextTableSort(second, 1)).toBeNull();
    expect(nextTableSort(second, 0)).toEqual({ column: 0, direction: "ascending" });
  });

  test("the filter keeps rows holding every term, case-insensitively, in sorted order", () => {
    const rows = [["Alpha", "ok"], ["beta", "failed"], ["Gamma", "OK"]];
    expect(visibleTableRowIndices(rows, null, "ok")).toEqual([0, 2]);
    expect(visibleTableRowIndices(rows, { column: 0, direction: "descending" }, "ok")).toEqual([2, 0]);
    expect(visibleTableRowIndices(rows, null, "beta failed")).toEqual([1]);
    expect(visibleTableRowIndices(rows, null, "  ")).toEqual([0, 1, 2]);
  });
});

describe("plainTableFromHast", () => {
  test("reads a table of plain and emphasized text", () => {
    const table = plainTableFromHast(
      tableNode("| Name | Score |\n| --- | ---: |\n| **Ann** | 3 |\n| Bob | 12 |"),
    );
    expect(table).toEqual({ columns: ["Name", "Score"], rows: [["Ann", "3"], ["Bob", "12"]] });
  });

  test("a link, inline code or image in any cell keeps the table as written", () => {
    expect(plainTableFromHast(tableNode("| a | b |\n|---|---|\n| [x](https://e.com) | 1 |\n| y | 2 |"))).toBeNull();
    expect(plainTableFromHast(tableNode("| a | b |\n|---|---|\n| `x` | 1 |\n| y | 2 |"))).toBeNull();
    expect(plainTableFromHast(tableNode("| a | b |\n|---|---|\n| ![i](x.png) | 1 |\n| y | 2 |"))).toBeNull();
  });

  test("a table with fewer than two body rows has nothing to sort", () => {
    expect(plainTableFromHast(tableNode("| a | b |\n|---|---|\n| x | 1 |"))).toBeNull();
  });
});
