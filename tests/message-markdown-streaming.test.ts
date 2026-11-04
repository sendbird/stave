import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MarkdownMessage,
  renderMarkdownBlock,
} from "@/components/ai-elements/message-markdown";
import {
  LruCache,
  markdownRenderBlocks,
  splitMarkdownBlocks,
  type MarkdownBlockSplit,
} from "@/components/ai-elements/message-markdown-blocks";
import { hardenSetextHeadings } from "@/components/ai-elements/message-markdown.setext";

/**
 * Replies that exercise every way a block boundary can be misplaced: lists
 * whose items are separated by blank lines, nested lists, tables, fences that
 * contain blank lines, a fence that never closes, setext headings (real ones
 * and the prose-above-a-rule case `hardenSetextHeadings` rewrites), links,
 * inline code, raw HTML and definitions that apply to the whole document.
 */
const FIXTURES: Record<string, string> = {
  headings: "# One\n\nIntro text.\n\n## Two\nBody right under it.\n\n###### Six",
  looseList: "- first\n\n- second\n\n\n- third after two blank lines\n\nAfter the list.",
  nestedList:
    "1. Step one\n   - detail a\n   - detail b\n\n     more about b\n2. Step two\n   1. sub\n\n3. Step three",
  orderedRestart: "1. a\n2. b\n\nBreak.\n\n3. c\n4. d",
  table:
    "Results:\n\n| Name | Value |\n| --- | ---: |\n| `alpha` | 1 |\n| beta | [link](https://example.com) |\n\nDone.",
  fencedWithBlankLines:
    "Run this:\n\n```ts\nconst a = 1;\n\n\nconst b = 2;\n```\n\nThen this:\n\n~~~\nplain\n~~~",
  unclosedFence: "Partial output:\n\n```python\ndef main():\n    print('hi')\n\n    return 1",
  setextHardened: "Deployed to staging.\n---\nNext up: production.\n\nAnother line\n---",
  setextReal: "Title\n=====\n\nSubtitle\n--------\n\n- item\n---",
  links:
    "See [the docs](https://example.com/docs), <https://example.com/auto>, www.example.com and `src/app.ts`.\n\nA bare https://example.com/path link.",
  inlineCode: "Use `bun test` then `bun run lint`.\n\n`a` and ``b ` c``.",
  blockquote: "> quoted\n> continues\nlazily\n\n> second quote\n\nafter",
  html: "<details>\n<summary>More</summary>\n\nHidden **text**\n\n</details>\n\n<!-- note -->",
  indentedCode: "Para\n\n    indented code\n    more\n\nAfter.",
  thematicBreaks: "a\n\n***\n\nb\n\n___\n\n- - -",
  referenceDefinitions:
    "Read [the guide][guide] and [^1].\n\nMore text.\n\n[guide]: https://example.com/guide\n\n[^1]: A footnote.",
  definitionInQuote: "Use [x].\n\n> [x]: https://example.com/x",
  taskList: "- [ ] todo\n- [x] done\n\n~~gone~~",
  empty: "",
  whitespace: "\n\n  \n",
};

/** React `useId` values depend on tree position, not on the content. */
function normalizeIds(html: string) {
  return html.replace(/_R_[0-9a-zA-Z]+_/g, "_R_id_");
}

function render(content: string, isStreaming = false) {
  return normalizeIds(renderToStaticMarkup(
    createElement(MarkdownMessage, {
      content,
      isStreaming,
      messageFontSize: 18,
      messageCodeFontSize: 14,
    }),
  ));
}

function innerHtml(html: string) {
  return html.slice(html.indexOf(">") + 1, html.lastIndexOf("</div>"));
}

/** The previous renderer: the whole reply through Markdown at once. */
function renderWholeDocument(content: string) {
  return normalizeIds(
    renderToStaticMarkup(renderMarkdownBlock(hardenSetextHeadings(content))),
  );
}

function prefixes(content: string) {
  return Array.from({ length: content.length + 1 }, (_, end) =>
    content.slice(0, end),
  );
}

describe("MarkdownMessage block rendering", () => {
  for (const [name, content] of Object.entries(FIXTURES)) {
    test(`${name}: renders the same HTML as one whole-document render`, () => {
      expect(innerHtml(render(content))).toBe(renderWholeDocument(content));
    });
  }

  test("the final streamed render equals the finished render", () => {
    for (const content of Object.values(FIXTURES)) {
      const streamed = render(content, true).replace(' data-streaming="true"', "");
      expect(streamed).toBe(render(content));
    }
  });

  test("every intermediate streamed render is the Markdown of the text so far", () => {
    for (const name of ["nestedList", "table", "unclosedFence", "setextHardened"]) {
      for (const prefix of prefixes(FIXTURES[name]!)) {
        expect(innerHtml(render(prefix, true))).toBe(renderWholeDocument(prefix));
      }
    }
  });

  test("renders Markdown while streaming instead of raw markers", () => {
    const html = render("## Plan\n\n- **first** step\n- second", true);
    expect(html).toContain("<h2");
    expect(html).toContain("<ul");
    expect(html).toContain("<strong");
    expect(html).not.toContain("**");
    expect(html).toContain('data-streaming="true"');
  });

  test("an unclosed fence renders as an in-progress code block", () => {
    const html = render("Here:\n\n```ts\nconst a = 1;\n", true);
    expect(html).toContain("<pre><code>const a = 1;</code></pre>");
  });

  test("only the block a reply is still writing is marked as streaming", () => {
    const seen: { code: string; isStreaming?: boolean }[] = [];
    renderToStaticMarkup(
      createElement(MarkdownMessage, {
        content: "```ts\nfinished\n```\n\nText.\n\n```ts\ngrowing",
        isStreaming: true,
        messageFontSize: 18,
        messageCodeFontSize: 14,
        renderBlockCode: ({ code, isStreaming }) => {
          seen.push({ code, isStreaming });
          return null;
        },
      }),
    );
    expect(seen).toEqual([
      { code: "finished", isStreaming: false },
      { code: "growing", isStreaming: true },
    ]);
  });
});

describe("splitMarkdownBlocks", () => {
  test("keeps fences, lists and tables whole", () => {
    const split = splitMarkdownBlocks(
      hardenSetextHeadings(
        `${FIXTURES.looseList}\n\n${FIXTURES.fencedWithBlankLines}\n\n${FIXTURES.table}`,
      ),
    );
    expect(markdownRenderBlocks(split)).toEqual([
      "- first\n\n- second\n\n\n- third after two blank lines",
      "After the list.",
      "Run this:",
      "```ts\nconst a = 1;\n\n\nconst b = 2;\n```",
      "Then this:",
      "~~~\nplain\n~~~",
      "Results:",
      "| Name | Value |\n| --- | ---: |\n| `alpha` | 1 |\n| beta | [link](https://example.com) |",
      "Done.",
    ]);
  });

  test("a definition makes the whole message one block", () => {
    for (const name of ["referenceDefinitions", "definitionInQuote"]) {
      const source = FIXTURES[name]!;
      expect(markdownRenderBlocks(splitMarkdownBlocks(source))).toEqual([source]);
    }
  });

  test("re-parsing from the last open block matches a full parse at every delta", () => {
    const content = Object.values(FIXTURES).join("\n\n");
    let previous: MarkdownBlockSplit | null = null;
    for (const prefix of prefixes(content)) {
      const source = hardenSetextHeadings(prefix);
      const incremental = splitMarkdownBlocks(source, previous);
      expect(incremental.blocks).toEqual(splitMarkdownBlocks(source).blocks);
      previous = incremental;
    }
  });

  test("a line that only later stops being a block start is re-parsed", () => {
    // `#` and `***` interrupt the paragraph; `#tag` and `***bold***` continue it.
    for (const [before, after] of [
      ["para\n#", "para\n#tag"],
      ["para\n***", "para\n***bold***"],
    ] as const) {
      const previous = splitMarkdownBlocks(before);
      expect(previous.blocks).toHaveLength(2);
      expect(splitMarkdownBlocks(after, previous).blocks).toEqual(
        splitMarkdownBlocks(after).blocks,
      );
    }
  });

  test("an edited (not appended) source is parsed from scratch", () => {
    const previous = splitMarkdownBlocks("one\n\ntwo\n\nthree");
    const edited = splitMarkdownBlocks("uno\n\ntwo\n\nthree", previous);
    expect(edited.blocks.map((block) => block.text)).toEqual(["uno", "two", "three"]);
  });

  test("reuses every block before the one that can still change", () => {
    // The last block's first line is complete: only that block is re-parsed.
    const complete = splitMarkdownBlocks("one\n\ntwo\n\nthree\n");
    const next = splitMarkdownBlocks("one\n\ntwo\n\nthree\nfour", complete);
    expect(next.blocks[0]).toBe(complete.blocks[0]!);
    expect(next.blocks[1]).toBe(complete.blocks[1]!);
    expect(next.blocks[2]?.text).toBe("three\nfour");

    // Its first line is still being written: the block before is re-parsed too.
    const partial = splitMarkdownBlocks("one\n\ntwo\n\nthr");
    const after = splitMarkdownBlocks("one\n\ntwo\n\nthree", partial);
    expect(after.blocks[0]).toBe(partial.blocks[0]!);
    expect(after.blocks[1]).not.toBe(partial.blocks[1]!);
  });
});

describe("LruCache", () => {
  test("evicts the least recently used entry", () => {
    const cache = new LruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
    expect(cache.size).toBe(2);
  });
});
