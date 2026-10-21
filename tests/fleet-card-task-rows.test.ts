import { describe, expect, test } from "bun:test";
import {
  orderFleetCardTaskRows,
  splitFleetSearchMatch,
} from "@/lib/fleet/card-task-rows";

type Row = { id: string; title: string; agent?: string };

const ROWS: Row[] = [
  { id: "a", title: "Refactor settings" },
  { id: "b", title: "Fix flaky test" },
  { id: "c", title: "Update docs", agent: "Reviewer" },
  { id: "d", title: "Checkout timeout on retry" },
  { id: "e", title: "Retry banner copy" },
];

function order(query: string | undefined, rows: Row[] = ROWS) {
  return orderFleetCardTaskRows({
    rows,
    limit: 3,
    query,
    searchableTextOf: (row) => [row.title, ...(row.agent ? [row.agent] : [])],
  });
}

function collapsedIds(result: ReturnType<typeof order>) {
  return result.orderedRows.slice(0, result.collapsedCount).map((row) => row.id);
}

describe("orderFleetCardTaskRows", () => {
  test("without a query, keeps the order and shows the first rows", () => {
    const result = order(undefined);
    expect(result.orderedRows.map((row) => row.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(collapsedIds(result)).toEqual(["a", "b", "c"]);
    expect(result.noTaskMatched).toBe(false);
    expect(order("   ").collapsedCount).toBe(3);
  });

  test("a match past the limit shows without expanding the card", () => {
    const result = order("checkout");
    expect(collapsedIds(result)).toEqual(["d", "a", "b"]);
    expect(result.matchedCount).toBe(1);
    expect(result.noTaskMatched).toBe(false);
  });

  test("every match shows even when there are more matches than the limit", () => {
    const rows = ROWS.map((row) => ({ ...row, title: `Retry ${row.title}` }));
    const result = order("RETRY", rows);
    expect(result.collapsedCount).toBe(5);
    expect(result.matchedCount).toBe(5);
  });

  test("matches keep their relative order and lead the other rows", () => {
    const result = order("retry");
    expect(result.orderedRows.map((row) => row.id)).toEqual(["d", "e", "a", "b", "c"]);
    expect(collapsedIds(result)).toEqual(["d", "e", "a"]);
  });

  test("an agent name matches the tasks it runs", () => {
    expect(collapsedIds(order("reviewer"))[0]).toBe("c");
  });

  test("reports when no task matched, so the card matched by its own name", () => {
    const result = order("main-branch");
    expect(result.noTaskMatched).toBe(true);
    expect(collapsedIds(result)).toEqual(["a", "b", "c"]);
  });

  test("never claims more visible rows than the card has", () => {
    const result = order("fix", ROWS.slice(0, 2));
    expect(result.collapsedCount).toBe(2);
  });
});

describe("splitFleetSearchMatch", () => {
  test("splits around the first case-insensitive match, keeping original case", () => {
    expect(splitFleetSearchMatch("Checkout Timeout", "timeout")).toEqual({
      before: "Checkout ",
      match: "Timeout",
      after: "",
    });
  });

  test("returns null for no query or no match", () => {
    expect(splitFleetSearchMatch("Checkout", "")).toBeNull();
    expect(splitFleetSearchMatch("Checkout", "deploy")).toBeNull();
  });

  test("skips the highlight when lowercasing changes the text length", () => {
    // "İ" lowercases to two code units, which would shift every offset.
    expect(splitFleetSearchMatch("İstanbul deploy", "deploy")).toBeNull();
  });
});
