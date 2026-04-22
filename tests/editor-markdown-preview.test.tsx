import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorMarkdownPreview } from "@/components/layout/editor-markdown-preview";

describe("EditorMarkdownPreview", () => {
  test("renders headings, tables, and fenced code blocks for editor preview", () => {
    const html = renderToStaticMarkup(
      createElement(EditorMarkdownPreview, {
        content: [
          "# Preview Title",
          "",
          "> callout",
          "",
          "| Name | Value |",
          "| --- | --- |",
          "| Mode | Preview |",
          "",
          "```ts",
          "const enabled = true;",
          "```",
        ].join("\n"),
        fontSize: 15,
      }),
    );

    expect(html).toContain("<h1");
    expect(html).toContain("Preview Title");
    expect(html).toContain("<blockquote");
    expect(html).toContain("<table");
    expect(html).toContain("const enabled = true;");
    expect(html).toContain(">ts<");
  });

  test("keeps relative links inert while preserving external links", () => {
    const html = renderToStaticMarkup(
      createElement(EditorMarkdownPreview, {
        content: "[Local](./docs/guide.md) and [External](https://openai.com/)",
        fontSize: 15,
      }),
    );

    expect(html).toContain('href="./docs/guide.md"');
    expect(html).toContain('href="https://openai.com/"');
    expect(html).toContain('target="_blank"');
  });
});
