import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

/**
 * Top-level Markdown blocks of a message, found with the same parser the
 * renderer uses (remark-parse + remark-gfm), so fenced code, lists and tables
 * are never cut in half the way splitting on blank lines would.
 *
 * Rendering a reply block by block lets a streaming message render each
 * finished block once and re-render only the block that is still growing.
 * Each block must therefore parse on its own exactly as inside the document:
 *
 * - A block's text runs up to the next block (or the end of the source), so
 *   it keeps the newlines that end it. They matter: `1. a\n</script>\n` keeps
 *   the closing tag inside the list item, `1. a\n</script>` does not.
 * - Some top-level nodes parse differently without the node before them, so
 *   they stay in that node's block (see {@link startsOwnBlock}).
 * - A link reference or footnote definition applies to the whole document. A
 *   message that contains one is rendered as a single block (see
 *   {@link markdownRenderBlocks}).
 */
export interface MarkdownSourceBlock {
  /** Offset of the first line of the block in the source. */
  start: number;
  /** Offset where the next block starts, or the end of the source. */
  end: number;
  text: string;
  /** The block holds a link reference or footnote definition. */
  hasDefinition: boolean;
}

export interface MarkdownBlockSplit {
  source: string;
  blocks: readonly MarkdownSourceBlock[];
}

const parser = unified().use(remarkParse).use(remarkGfm).freeze();

type MarkdownNode = ReturnType<typeof parser.parse>["children"][number];

function containsDefinition(node: MarkdownNode): boolean {
  if (node.type === "definition" || node.type === "footnoteDefinition") {
    return true;
  }
  return "children" in node
    ? (node.children as MarkdownNode[]).some(containsDefinition)
    : false;
}

function lineStart(source: string, offset: number) {
  return source.lastIndexOf("\n", offset - 1) + 1;
}

const FENCE_OPENING = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Whether a top-level node can be rendered apart from the node before it.
 *
 * The parser carries state from one top-level node into the next in two
 * cases, so the next node parses differently on its own:
 * - Right after a paragraph (no blank line between), the next node is parsed
 *   as interrupting it. `para\n- -` is a list item holding `-`, while `- -`
 *   alone is a list item holding an empty list; `x\n2)\n|:-` is a table, while
 *   `2)\n|:-` alone is an empty list item.
 * - Around an indented code block, empty list items parse differently: after
 *   one, even past blank lines, `-` is a paragraph (`    code\n\n-`), while
 *   after an empty quote or list item an indented code block changes how the
 *   lines after it parse (`>\n    code\n\n*` ends in an empty list).
 * Such a node joins the block of the node before it; an indented code block
 * joins the blocks on both sides. Model replies rarely use indented code.
 */
function startsOwnBlock(
  source: string,
  previous: { node: MarkdownNode; indentedCode: boolean },
  indentedCode: boolean,
  nodeStart: number,
) {
  if (indentedCode || previous.indentedCode) {
    return false;
  }
  if (previous.node.type === "paragraph") {
    const gap = source.slice(previous.node.position?.end.offset, nodeStart);
    // A blank line between them ends the paragraph's influence.
    return gap.indexOf("\n") !== gap.lastIndexOf("\n");
  }
  return true;
}

function lexBlocks(source: string, base: number): MarkdownSourceBlock[] {
  const tree = parser.parse(source);
  const starts: { start: number; hasDefinition: boolean }[] = [];
  let previous: { node: MarkdownNode; indentedCode: boolean } | null = null;
  for (const node of tree.children) {
    const startOffset = node.position?.start.offset;
    if (startOffset === undefined) {
      continue;
    }
    // Blocks start on their own line; keep the line's indentation so an
    // indented code block or a nested list marker survives being sliced out.
    const start = lineStart(source, startOffset);
    const hasDefinition = containsDefinition(node);
    const indentedCode =
      node.type === "code" && !FENCE_OPENING.test(source.slice(start));
    const current = starts.at(-1);
    if (
      current &&
      previous &&
      !startsOwnBlock(source, previous, indentedCode, start)
    ) {
      current.hasDefinition ||= hasDefinition;
    } else {
      starts.push({ start, hasDefinition });
    }
    previous = { node, indentedCode };
  }
  return starts.map(({ start, hasDefinition }, index) => {
    const end = starts[index + 1]?.start ?? source.length;
    return {
      start: base + start,
      end: base + end,
      text: source.slice(start, end),
      hasDefinition,
    };
  });
}

/**
 * Lines a block's start depends on: its first line and the one after it.
 * Most block starts are decided by their own first line: `- item\n#` is a
 * list and a heading, `- item\n#tag` one list. A GFM table also needs the
 * delimiter row under its first line; until that row is complete the table
 * can turn back into lines of the node before it (`x\n2. b\n|---|` is a
 * paragraph and a table, `x\n2. b\n|---|-` one paragraph).
 */
const LINES_THAT_DECIDE_A_BLOCK_START = 2;

function decidingLinesEnd(source: string, blockStart: number) {
  let lineEnd = blockStart - 1;
  for (let line = 0; line < LINES_THAT_DECIDE_A_BLOCK_START; line += 1) {
    lineEnd = source.indexOf("\n", lineEnd + 1);
    if (lineEnd === -1) {
      return -1;
    }
  }
  return lineEnd + 1;
}

/**
 * How many leading blocks of `previous` are still valid for `source`.
 *
 * A block is closed once the next block has started, so only the last block
 * can change as text is appended. The exception is the start of a block:
 * until the lines that decide it are complete (see
 * {@link LINES_THAT_DECIDE_A_BLOCK_START}), more text can merge it back into
 * the block before. The reused prefix therefore ends at a block whose deciding
 * lines are complete and unchanged in `source`.
 *
 * A definition's extent can change with later lines (a title can continue on
 * the next line), and a message with one renders as a whole anyway, so such a
 * message is always split from scratch.
 */
function reusableBlockCount(source: string, previous: MarkdownBlockSplit) {
  const { blocks } = previous;
  if (blocks.some((block) => block.hasDefinition)) {
    return 0;
  }
  for (let index = blocks.length - 1; index > 0; index -= 1) {
    const decidedThrough = decidingLinesEnd(
      previous.source,
      blocks[index]!.start,
    );
    if (decidedThrough === -1) {
      continue;
    }
    // The earlier blocks' boundaries depend only on the text before this
    // block and on its deciding lines.
    return source.startsWith(previous.source.slice(0, decidedThrough))
      ? index
      : 0;
  }
  return 0;
}

/**
 * Split `source` into top-level blocks. Pass the split of an earlier version
 * of the same message (a streaming reply before its latest delta) to re-parse
 * only from the last block that can still change.
 */
export function splitMarkdownBlocks(
  source: string,
  previous?: MarkdownBlockSplit | null,
): MarkdownBlockSplit {
  if (previous?.source === source) {
    return previous;
  }
  const keep = previous ? reusableBlockCount(source, previous) : 0;
  if (keep === 0 || !previous) {
    return { source, blocks: lexBlocks(source, 0) };
  }
  const resumeAt = previous.blocks[keep]!.start;
  return {
    source,
    blocks: [
      ...previous.blocks.slice(0, keep),
      ...lexBlocks(source.slice(resumeAt), resumeAt),
    ],
  };
}

/**
 * The split a message renders. While it streams, the split resumes from the
 * previous one. A finished message is split with one full parse, so what a
 * renderer caches for it is exactly the whole document's structure, whatever
 * the streaming splits looked like.
 */
export function splitMessageMarkdown(
  source: string,
  previous: MarkdownBlockSplit | null,
  isStreaming: boolean,
): MarkdownBlockSplit {
  return splitMarkdownBlocks(source, isStreaming ? previous : null);
}

/**
 * The texts to render one by one. A definition anywhere makes the whole
 * message one block, because a reference in one block can use a definition
 * from another.
 */
export function markdownRenderBlocks(split: MarkdownBlockSplit): string[] {
  if (split.blocks.some((block) => block.hasDefinition)) {
    return split.source.trim() ? [split.source] : [];
  }
  return split.blocks.map((block) => block.text);
}

/**
 * A small least-recently-used map. Reading an entry marks it as most recent;
 * writing past `maxEntries` drops the oldest one.
 */
export class LruCache<K, V> {
  readonly #entries = new Map<K, V>();

  constructor(readonly maxEntries: number) {}

  get(key: K): V | undefined {
    const value = this.#entries.get(key);
    if (value !== undefined) {
      this.#entries.delete(key);
      this.#entries.set(key, value);
    }
    return value;
  }

  set(key: K, value: V) {
    this.#entries.delete(key);
    this.#entries.set(key, value);
    while (this.#entries.size > this.maxEntries) {
      const oldest = this.#entries.keys().next().value as K;
      this.#entries.delete(oldest);
    }
  }

  get size() {
    return this.#entries.size;
  }
}
