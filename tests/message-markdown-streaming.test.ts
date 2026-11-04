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
  splitMessageMarkdown,
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
    // Each block keeps the newlines up to the next one.
    expect(markdownRenderBlocks(split)).toEqual([
      "- first\n\n- second\n\n\n- third after two blank lines\n\n",
      "After the list.\n\n",
      "Run this:\n\n",
      "```ts\nconst a = 1;\n\n\nconst b = 2;\n```\n\n",
      "Then this:\n\n",
      "~~~\nplain\n~~~\n\n",
      "Results:\n\n",
      "| Name | Value |\n| --- | ---: |\n| `alpha` | 1 |\n| beta | [link](https://example.com) |\n\n",
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
    // `#` and `***` end the list or quote; `#tag` and `***bold***` continue
    // its paragraph lazily.
    for (const [before, after] of [
      ["- item\n#", "- item\n#tag"],
      ["> quote\n***", "> quote\n***bold***"],
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
    expect(edited.blocks.map((block) => block.text)).toEqual([
      "uno\n\n",
      "two\n\n",
      "three",
    ]);
  });

  test("reuses every block before the one that can still change", () => {
    // The last block's first two lines are complete: only it is re-parsed.
    const complete = splitMarkdownBlocks("one\n\ntwo\n\nthree\nmore\n");
    const next = splitMarkdownBlocks(
      "one\n\ntwo\n\nthree\nmore\nfour",
      complete,
    );
    expect(next.blocks[0]).toBe(complete.blocks[0]!);
    expect(next.blocks[1]).toBe(complete.blocks[1]!);
    expect(next.blocks[2]?.text).toBe("three\nmore\nfour");

    // Its second line is still being written (it could still turn the first
    // line into a table header): the block before is re-parsed too.
    const oneLine = splitMarkdownBlocks("one\n\ntwo\n\nthree\n");
    const grown = splitMarkdownBlocks("one\n\ntwo\n\nthree\nfour", oneLine);
    expect(grown.blocks[0]).toBe(oneLine.blocks[0]!);
    expect(grown.blocks[1]).not.toBe(oneLine.blocks[1]!);

    // Its first line is still being written: the block before is re-parsed too.
    const partial = splitMarkdownBlocks("one\n\ntwo\n\nthr");
    const after = splitMarkdownBlocks("one\n\ntwo\n\nthree", partial);
    expect(after.blocks[0]).toBe(partial.blocks[0]!);
    expect(after.blocks[1]).not.toBe(partial.blocks[1]!);
  });
});

/**
 * Inputs where a block's structure depends on the text around it: a later
 * line that merges a block back into the one before, a block that loses its
 * closing newline, a node the parser reads differently after a paragraph or an
 * indented code block, setext underlines, tables, HTML blocks, lazy
 * continuation, and definitions.
 */
const CONTEXT_SENSITIVE: Record<string, string> = {
  tableThatTurnsBackIntoParagraph: "x\n2. b\n|---|-\n\nafter",
  closingTagAfterList:
    "1. a\n</script>\n\n- b\n</style>\n\n- c\n</pre>\n\nafter",
  tableInterruptingParagraph: "x\n2)\n|:-|\n\n| a | b |\n| --- | --- |\nrow\n\nend",
  emptyListItemAfterParagraph: "para\n- -\n- b\n\npara\n> -",
  indentedCode: "    code\n\n-\n\n>\n    code\n\n*\n\ndone",
  orderedListNotAtOne: "intro\n2. two\n3. three\n\n2. list\n3. more",
  setext:
    "Title\n=====\nSub\n---\nprose\n--\n- item\n---\n\nAnother\n===\n\n> q\n---",
  htmlBlocks:
    "<div>\n*a*\n</div>\n\n<script>\nlet a = 1;\n\n</script>\nafter\n<!-- c\n\n-->\n<pre>\nx\n</pre>\n<x-y>\ntext",
  lazyContinuation:
    "> quote\nlazy\n- item\nlazy item\n\n1. one\n2. two\nlazy\n\n> - nested\nlazy too",
  definitions:
    "See [x] and [^n].\n\n[x]: /u\n  \"title\nmore\"\n\n[^n]: note\n    more\n\ntail",
};

/** Render a split the way `MarkdownMessage` does: block by block. */
function renderSplit(split: MarkdownBlockSplit) {
  return markdownRenderBlocks(split)
    .map((text) => normalizeIds(renderToStaticMarkup(renderMarkdownBlock(text))))
    .join("\n");
}

/**
 * Stream `content` one character at a time. At every prefix, the streaming
 * split and the split of the reply finished at that point (after the same
 * streaming history) must equal a full parse and render like the whole
 * document.
 */
function expectStreamMatchesWholeDocument(content: string, renderEvery = 1) {
  let previous: MarkdownBlockSplit | null = null;
  for (const [index, prefix] of prefixes(content).entries()) {
    const source = hardenSetextHeadings(prefix);
    const full = splitMarkdownBlocks(source);
    const streaming = splitMessageMarkdown(source, previous, true);
    const finished = splitMessageMarkdown(source, previous, false);
    expect({ prefix, blocks: streaming.blocks }).toEqual({
      prefix,
      blocks: full.blocks,
    });
    expect({ prefix, blocks: finished.blocks }).toEqual({
      prefix,
      blocks: full.blocks,
    });
    if (index % renderEvery === 0 || index === content.length) {
      expect({ prefix, html: renderSplit(streaming) }).toEqual({
        prefix,
        html: renderWholeDocument(prefix),
      });
    }
    previous = streaming;
  }
}

/** A small deterministic generator, so a failure names a reproducible seed. */
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) & 0x7f_ff_ff_ff;
    return state / 0x7f_ff_ff_ff;
  };
}

const RANDOM_LINES = [
  "x", "para", "2. b", "1. a", "- a", "-", "- -", "*", "1.", "2)", "  - nested",
  "   more", "|---|", "|---|-", "| a | b |", "| --- | --- |", "|:-", "a|b",
  "---", "===", "--", "***", "# h", "#tag", "> q", ">", "> -", "```", "~~~ts",
  "    code", "\tcode", "</script>", "</pre>", "<div>", "</div>", "<!-- c",
  "-->", "", "", "", "[x]: /u", "[^1]: note", "\"title\"", "10. ten",
  "- [ ] t", "foo\\",
];

describe("block split and render at every streamed prefix", () => {
  test("a table that turns back into a paragraph does not freeze the list before it", () => {
    const before = splitMessageMarkdown("x\n2. b\n|---|", null, true);
    const streaming = splitMessageMarkdown("x\n2. b\n|---|-", before, true);
    const finished = splitMessageMarkdown("x\n2. b\n|---|-", streaming, false);
    for (const split of [streaming, finished]) {
      expect(markdownRenderBlocks(split)).toEqual(["x\n2. b\n|---|-"]);
      expect(renderSplit(split)).toBe(renderWholeDocument("x\n2. b\n|---|-"));
    }
    expect(renderSplit(streaming)).not.toContain("<ol");
  });

  test("a finished reply keeps the newline that ends each block", () => {
    for (const tag of ["</script>", "</style>", "</pre>"]) {
      for (const marker of ["1.", "-"]) {
        const content = `${marker} a\n${tag}\n\nafter`;
        const html = renderSplit(splitMessageMarkdown(content, null, false));
        expect(html).toBe(renderWholeDocument(content));
        expect(html).toMatch(/<li[^>]*>a\n&lt;\//);
      }
    }
  });

  for (const [name, content] of Object.entries(CONTEXT_SENSITIVE)) {
    test(`${name}: streamed and finished renders equal the whole document`, () => {
      expectStreamMatchesWholeDocument(content);
    });
  }

  test("every fixture streamed back to back matches the whole document", () => {
    expectStreamMatchesWholeDocument(Object.values(FIXTURES).join("\n\n"), 7);
  });

  test("random line mixes match the whole document at every prefix", () => {
    const random = seededRandom(20_261_104);
    for (let doc = 0; doc < 40; doc += 1) {
      const lineCount = 2 + Math.floor(random() * 7);
      const content = Array.from(
        { length: lineCount },
        () => RANDOM_LINES[Math.floor(random() * RANDOM_LINES.length)],
      ).join("\n");
      expectStreamMatchesWholeDocument(content, 3);
    }
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
