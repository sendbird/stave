import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageResponse } from "@/components/ai-elements/message";
import { MarkdownMessage } from "@/components/ai-elements/message-markdown";
import {
  markdownRenderBlocks,
  splitMessageMarkdown,
} from "@/components/ai-elements/message-markdown-blocks";
import { applyAppLocale } from "@/i18n";

applyAppLocale("en");

function renderMarkdown(content: string, isStreaming = false): string {
  return renderToStaticMarkup(
    createElement(MarkdownMessage, {
      content,
      isStreaming,
      messageCodeFontSize: 14,
      messageFontSize: 16,
    }),
  );
}

function renderResponse(content: string, isStreaming = false): string {
  return renderToStaticMarkup(createElement(MessageResponse, { isStreaming }, content));
}

const plainTable = "| Name | Score |\n| --- | ---: |\n| Ann | 3 |\n| Bob | 12 |\n| Cy | 7 |";

describe("sortable tables", () => {
  test("a plain-text table gets sortable headers with no sort applied", () => {
    const html = renderMarkdown(plainTable);
    expect(html.match(/data-table-sort="none"/g)?.length).toBe(2);
    expect(html.match(/aria-sort="none"/g)?.length).toBe(2);
    expect(html.indexOf("Ann")).toBeLessThan(html.indexOf("Bob"));
    expect(html.indexOf("Bob")).toBeLessThan(html.indexOf("Cy"));
    // Three rows need no filter.
    expect(html).not.toContain('type="search"');
  });

  test("a table with a link or inline code stays as written", () => {
    const linked = renderMarkdown("| a | b |\n|---|---|\n| [x](https://example.com) | 1 |\n| y | 2 |");
    expect(linked).not.toContain("data-table-sort");
    const coded = renderMarkdown("| a | b |\n|---|---|\n| `x` | 1 |\n| y | 2 |");
    expect(coded).not.toContain("data-table-sort");
  });

  test("a table past ten rows gets a filter field", () => {
    const rows = Array.from({ length: 11 }, (_, index) => `| row ${index} | ${index} |`).join("\n");
    const html = renderMarkdown(`| Name | Value |\n| --- | --- |\n${rows}`);
    expect(html).toContain('type="search"');
    expect(html).toContain('aria-label="Filter table rows"');
    expect(html).toContain('placeholder="Filter rows"');
  });

  test("the table a reply is still writing is not sortable yet", () => {
    const html = renderMarkdown(`Intro\n\n${plainTable}`, true);
    expect(html).not.toContain("data-table-sort");
  });
});

describe("math", () => {
  test("inline math is set apart from prices; before KaTeX loads it shows its TeX", () => {
    const html = renderMarkdown("It costs $5 and $10, and $x^2$ grows.");
    expect(html).toContain("It costs $5 and $10, and ");
    expect(html).toContain("$x^2$</span>");
    expect(html).not.toContain("language-math");
  });

  test("a $$ block and a math fence are display math", () => {
    for (const content of ["$$\n\\int_0^1 x\\,dx\n$$", "```math\n\\int_0^1 x\\,dx\n```", "$$\\int_0^1 x\\,dx$$"]) {
      const html = renderResponse(content);
      expect(html).toContain('data-math="display"');
      expect(html).toContain("\\int_0^1 x\\,dx");
    }
  });

  test("a $$ block with a blank line inside stays one block", () => {
    const split = splitMessageMarkdown("$$\na\n\nb\n$$\n\nafter", null, false);
    expect(markdownRenderBlocks(split)).toEqual(["$$\na\n\nb\n$$\n\n", "after"]);
  });
});

describe("JSON and terminal fences", () => {
  test("a json fence renders as a folding tree with Show code and Copy", () => {
    const html = renderResponse('```json\n{"name": "stave", "tags": ["a", "b"], "count": 2}\n```');
    expect(html).toContain("data-json-tree");
    expect(html).toContain("Show code");
    expect(html).toContain('aria-label="Copy code"');
    expect(html).toContain("&quot;stave&quot;");
    expect(html).toContain('aria-expanded="true"');
  });

  test("an untagged fence holding a JSON array is a tree; invalid JSON stays code", () => {
    expect(renderResponse("```\n[1, 2, 3]\n```")).toContain("data-json-tree");
    const invalid = renderResponse('```json\n{"a": 1,}\n```');
    expect(invalid).not.toContain("data-json-tree");
    expect(invalid).toContain("data-code-block");
  });

  test("terminal output shows its colors without escape codes", () => {
    const html = renderResponse("```ansi\n\\x1b[31mFAIL\\x1b[0m tests/a.test.ts\n```");
    expect(html).toContain("data-terminal-output");
    expect(html).toContain(">FAIL</span>");
    expect(html).not.toContain("\\x1b");
    expect(html).toMatch(/style="color:var\([^"]+\)">FAIL/);
  });

  test("a fence the reply is still writing stays plain code", () => {
    const html = renderResponse('Intro\n\n```json\n{"a": 1}\n```', true);
    expect(html).not.toContain("data-json-tree");
    expect(html).toContain("data-code-block");
  });
});
