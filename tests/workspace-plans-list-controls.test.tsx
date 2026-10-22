import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { PlansListStatus, PlansSearchField } from "@/components/layout/workspace-plans-list-controls";
import type { PlansListRows } from "@/components/layout/workspace-plans-list-state";

afterEach(() => applyAppLocale("en"));

const noop = () => {};
function rows(count: number) {
  return Array.from({ length: count }, (_, index) => index);
}
function status(view: PlansListRows<unknown>, showAll = false) {
  return renderToStaticMarkup(createElement(PlansListStatus, { view, showAll, onShowAllChange: noop, onClearSearch: noop }));
}

describe("Plans list controls", () => {
  test("a cut list says how many of how many it shows and offers the rest", () => {
    const html = status({ rows: rows(10), total: 12, matched: 10, searching: false, hidden: 2 });
    expect(html).toContain("Showing the 10 most recent of 12");
    expect(html).toContain("Show all");
    expect(html).toContain('role="status"');
  });

  test("an uncut list says it shows all and offers the recent ones back", () => {
    const html = status({ rows: rows(12), total: 12, matched: 12, searching: false, hidden: 0 }, true);
    expect(html).toContain("Showing all 12");
    expect(html).toContain("Show recent only");
  });

  test("a search says how many documents match, or that none does with a way out", () => {
    const found = status({ rows: rows(1), total: 12, matched: 1, searching: true, hidden: 0 });
    expect(found).toContain("1 of 12 documents match");
    expect(found).not.toContain("<button");
    const none = status({ rows: [], total: 12, matched: 0, searching: true, hidden: 0 });
    expect(none).toContain("No documents match this search.");
    expect(none).toContain("Clear search");
  });

  test("the search field is named and offers a clear action once something is typed", () => {
    const empty = renderToStaticMarkup(createElement(PlansSearchField, { query: "", onQueryChange: noop }));
    expect(empty).toContain('aria-label="Search documents"');
    expect(empty).toContain('placeholder="Search by name or task"');
    expect(empty).not.toContain("Clear search");
    const typed = renderToStaticMarkup(createElement(PlansSearchField, { query: "retry", onQueryChange: noop }));
    expect(typed).toContain('value="retry"');
    expect(typed).toContain('aria-label="Clear search"');
  });

  test("Korean", () => {
    applyAppLocale("ko");
    expect(status({ rows: rows(10), total: 37, matched: 10, searching: false, hidden: 27 })).toContain("전체 37개 중 최근 10개 표시");
    expect(status({ rows: rows(2), total: 37, matched: 2, searching: true, hidden: 0 })).toContain("문서 37개 중 2개 일치");
    expect(renderToStaticMarkup(createElement(PlansSearchField, { query: "", onQueryChange: noop }))).toContain('aria-label="문서 검색"');
  });
});
