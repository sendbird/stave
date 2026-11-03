import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  commandItemMatches,
} from "@/components/ui/command";
import { searchHighlightRanges, splitSearchHighlight } from "@/lib/search-highlight";
import { SearchHighlight } from "@/components/system/SearchHighlight";

/** A row component that renders its CommandItem itself, out of the walk's sight. */
function WrappedRow(props: { value: string; label: string }) {
  return createElement(CommandItem, { value: props.value, keywords: [props.label] }, props.label);
}

describe("command adapter filter", () => {
  test("one rule: every word in the value or a keyword", () => {
    expect(commandItemMatches("", "open-fleet")).toBe(true);
    expect(commandItemMatches("open fl", "open-fleet")).toBe(true);
    expect(commandItemMatches("OPEN", "x", ["Open Fleet"])).toBe(true);
    expect(commandItemMatches("open zzz", "open-fleet")).toBe(false);
  });

  test("a group of wrapped rows is not pruned as empty", () => {
    const html = renderToStaticMarkup(
      createElement(Command, null,
        createElement(CommandList, null,
          createElement(CommandGroup, { heading: "Navigation" },
            createElement(WrappedRow, { value: "open-fleet", label: "Open Fleet View" }),
            createElement(WrappedRow, { value: "open-usage", label: "Open AI usage" }),
          ),
        ),
      ),
    );
    expect(html).toContain("Navigation");
    expect(html).toContain("Open Fleet View");
    expect(html).toContain("Open AI usage");
  });
});

describe("search highlight", () => {
  test("marks every occurrence of every word, case-insensitively, merged", () => {
    expect(searchHighlightRanges("Open Fleet View and open Issues", "open")).toEqual([[0, 4], [20, 24]]);
    expect(splitSearchHighlight("Quick Open File", "open file")).toEqual([
      { text: "Quick ", match: false },
      { text: "Open", match: true },
      { text: " ", match: false },
      { text: "File", match: true },
    ]);
    expect(searchHighlightRanges("aaa", "aa a")).toEqual([[0, 3]]);
  });

  test("Korean matches as typed, including a syllable being composed", () => {
    expect(searchHighlightRanges("작업 열기", "열")).toEqual([[3, 4]]);
    expect(searchHighlightRanges("작업 열기", "작업 열기")).toEqual([[0, 2], [3, 5]]);
  });

  test("no mark when there is no query, no match, or lowercasing changes the length", () => {
    expect(searchHighlightRanges("Checkout", "")).toEqual([]);
    expect(searchHighlightRanges("Checkout", "deploy")).toEqual([]);
    // "İ" lowercases to two code units, which would shift every offset.
    expect(searchHighlightRanges("İstanbul deploy", "deploy")).toEqual([]);
  });

  test("renders the matched characters in a mark and keeps the rest as text", () => {
    const html = renderToStaticMarkup(createElement(SearchHighlight, { text: "Quick Open File", query: "open" }));
    expect(html).toMatch(/^Quick <mark class="[^"]+">Open<\/mark> File$/);
    expect(renderToStaticMarkup(createElement(SearchHighlight, { text: "Quick", query: "zzz" }))).toBe("Quick");
  });
});
