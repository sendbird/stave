import { describe, expect, test } from "bun:test";
import {
  appendSelectionQuoteToDraft,
  formatSelectionQuote,
  MAX_SELECTION_QUOTE_CHARS,
} from "@/lib/editor/selection-quote";

const PATH = ".stave/context/plans/retry.md";

describe("formatSelectionQuote", () => {
  test("quotes each line under the file path and line range", () => {
    expect(
      formatSelectionQuote({
        filePath: PATH,
        startLine: 3,
        endLine: 5,
        text: "## Steps\n\n- retry three times",
      }),
    ).toBe(
      `\`${PATH}\` lines 3-5:\n> ## Steps\n>\n> - retry three times`,
    );
  });

  test("names a single line and drops blank edge lines", () => {
    expect(
      formatSelectionQuote({ filePath: PATH, startLine: 7, endLine: 7, text: "\nkeep\n" }),
    ).toBe(`\`${PATH}\` line 7:\n> keep`);
  });

  test("returns null for a whitespace-only selection and cuts long ones", () => {
    expect(
      formatSelectionQuote({ filePath: PATH, startLine: 1, endLine: 2, text: " \n " }),
    ).toBeNull();
    const quote = formatSelectionQuote({
      filePath: PATH,
      startLine: 1,
      endLine: 1,
      text: "x".repeat(MAX_SELECTION_QUOTE_CHARS + 10),
    });
    expect(quote?.endsWith("\n> …")).toBe(true);
  });
});

describe("appendSelectionQuoteToDraft", () => {
  test("separates the quote from earlier text and leaves room for a comment", () => {
    expect(appendSelectionQuoteToDraft("", "> a")).toBe("> a\n\n");
    expect(appendSelectionQuoteToDraft("Look at this:  \n", "> a")).toBe(
      "Look at this:\n\n> a\n\n",
    );
  });
});
