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

  test("renders frontmatter as a metadata card instead of a heading", () => {
    const html = renderToStaticMarkup(
      createElement(EditorMarkdownPreview, {
        content: [
          "---",
          "name: the-high-signal-review",
          "compatible-tools: [claude, codex]",
          "---",
          "",
          "# Skill Body",
        ].join("\n"),
        fontSize: 15,
      }),
    );

    expect(html).toContain("Frontmatter");
    expect(html).toContain("<dt");
    expect(html).toContain("the-high-signal-review");
    expect(html).toContain("claude");
    expect(html).toContain("codex");
    // The frontmatter must not leak into the body as a break + setext heading.
    expect(html).not.toContain("<hr");
    expect(html).not.toContain("<h2");
    expect(html).toContain("<h1");
    expect(html).toContain("Skill Body");
  });

  test("leaves thematic breaks alone when there is no frontmatter", () => {
    const html = renderToStaticMarkup(
      createElement(EditorMarkdownPreview, {
        content: "Intro\n\n---\n\nOutro",
        fontSize: 15,
      }),
    );

    expect(html).not.toContain("Frontmatter");
    expect(html).toContain("<hr");
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

  test("uses a compact left-aligned layout for embedded previews", () => {
    const html = renderToStaticMarkup(
      createElement(EditorMarkdownPreview, {
        content: "Embedded notes",
        fontSize: 13,
        variant: "embedded",
      }),
    );

    expect(html).toContain("max-w-none");
    expect(html).toContain("px-0");
    expect(html).toContain("py-0");
    expect(html).toContain("text-left");
    expect(html).not.toContain("mx-auto");
    expect(html).not.toContain("max-w-4xl");
  });
});
