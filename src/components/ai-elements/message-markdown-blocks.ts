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
 * Every top-level block parses the same on its own as inside the document,
 * with one exception: a link reference or footnote definition applies to the
 * whole document. A message that contains one is rendered as a single block
 * (see {@link markdownRenderBlocks}).
 */
export interface MarkdownSourceBlock {
  /** Offset of the first line of the block in the source. */
  start: number;
  /** Offset just after the last character of the block. */
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

function lexBlocks(source: string, base: number): MarkdownSourceBlock[] {
  const tree = parser.parse(source);
  const blocks: MarkdownSourceBlock[] = [];
  for (const node of tree.children) {
    const startOffset = node.position?.start.offset;
    const endOffset = node.position?.end.offset;
    if (startOffset === undefined || endOffset === undefined) {
      continue;
    }
    // Blocks start on their own line; keep the line's indentation so an
    // indented code block or a nested list marker survives being sliced out.
    const start = lineStart(source, startOffset);
    blocks.push({
      start: base + start,
      end: base + endOffset,
      text: source.slice(start, endOffset),
      hasDefinition: containsDefinition(node),
    });
  }
  return blocks;
}

/**
 * How many leading blocks of `previous` are still valid for `source`.
 *
 * A block is closed once the next block has started, so only the last block
 * can change as text is appended. The exception is the line that starts that
 * last block: until it is complete, more text can turn it into a continuation
 * of the block before (`para\n#` is a heading, `para\n#tag` is not). The
 * reused prefix therefore ends at a block whose first line is complete and
 * unchanged in `source`.
 */
function reusableBlockCount(source: string, previous: MarkdownBlockSplit) {
  const { blocks } = previous;
  for (let index = blocks.length - 1; index > 0; index -= 1) {
    const block = blocks[index]!;
    const lineEnd = previous.source.indexOf("\n", block.start);
    if (lineEnd === -1) {
      continue;
    }
    // Compare through the newline: the prefix and the block's first line are
    // the only text the earlier blocks' boundaries depend on.
    return source.startsWith(previous.source.slice(0, lineEnd + 1)) ? index : 0;
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
