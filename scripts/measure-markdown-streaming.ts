/**
 * Markdown work for one long reply streamed in small deltas.
 *
 *   bun scripts/measure-markdown-streaming.ts [deltaSize] [runs]
 *
 * Compares three renderers:
 * - plain-text-then-parse: raw text while streaming, one full parse at the end
 *   (Markdown markers visible until the reply finishes);
 * - full-reparse-per-delta: Markdown on the whole reply after every delta;
 * - block-incremental: the transcript renderer — re-split from the last open
 *   block, render that block, render each finished block once; split the
 *   finished reply with one full parse.
 *
 * "Max delta" covers the streaming deltas; "final" is the last step, where the
 * reply finishes. "Parsed" counts characters given to remark (block splitting
 * plus Markdown rendering). Times cover parsing and building React elements, not React
 * reconciliation or layout; the dev preview `?stavePreview=markdown-streaming
 * &measure=1` measures those in a browser.
 */
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  markdownRenderBlocks,
  splitMessageMarkdown,
  type MarkdownBlockSplit,
} from "../src/components/ai-elements/message-markdown-blocks";
import { hardenSetextHeadings } from "../src/components/ai-elements/message-markdown.setext";
import {
  LONG_STREAMING_REPLY,
  streamingDeltas,
} from "../src/dev/markdown-streaming-preview/fixture";

const deltaSize = Number(process.argv[2] ?? 12);
const runs = Number(process.argv[3] ?? 5);
const remarkPlugins = [remarkGfm];

function renderMarkdown(text: string) {
  return Markdown({ children: text, remarkPlugins });
}

interface Result {
  totalMs: number;
  maxDeltaMs: number;
  parsedChars: number;
  finalMs: number;
}

function plainTextThenParse(prefixes: string[]): Result {
  const started = performance.now();
  const final = hardenSetextHeadings(prefixes.at(-1)!);
  renderMarkdown(final);
  const finalMs = performance.now() - started;
  return { totalMs: finalMs, maxDeltaMs: 0, parsedChars: final.length, finalMs };
}

function fullReparsePerDelta(prefixes: string[]): Result {
  let parsedChars = 0;
  let maxDeltaMs = 0;
  let finalMs = 0;
  const started = performance.now();
  prefixes.forEach((prefix, index) => {
    const deltaStarted = performance.now();
    const source = hardenSetextHeadings(prefix);
    renderMarkdown(source);
    parsedChars += source.length;
    finalMs = performance.now() - deltaStarted;
    if (index < prefixes.length - 1) {
      maxDeltaMs = Math.max(maxDeltaMs, finalMs);
    }
  });
  return { totalMs: performance.now() - started, maxDeltaMs, parsedChars, finalMs };
}

function blockIncremental(prefixes: string[]): Result {
  const finished = new Map<string, unknown>();
  let previous: MarkdownBlockSplit | null = null;
  let parsedChars = 0;
  let maxDeltaMs = 0;
  let finalMs = 0;
  const started = performance.now();
  prefixes.forEach((prefix, index) => {
    const deltaStarted = performance.now();
    const isLast = index === prefixes.length - 1;
    const source = hardenSetextHeadings(prefix);
    // Like the transcript renderer: incremental while streaming, one full
    // parse once the reply is finished.
    const split = splitMessageMarkdown(source, previous, !isLast);
    const firstNew = split.blocks.findIndex(
      (block, blockIndex) => block !== previous?.blocks[blockIndex],
    );
    if (firstNew !== -1) {
      parsedChars += source.length - split.blocks[firstNew]!.start;
    }
    previous = split;
    const blocks = markdownRenderBlocks(split);
    blocks.forEach((text, blockIndex) => {
      const streaming = !isLast && blockIndex === blocks.length - 1;
      if (streaming) {
        renderMarkdown(text);
        parsedChars += text.length;
      } else if (!finished.has(text)) {
        finished.set(text, renderMarkdown(text));
        parsedChars += text.length;
      }
    });
    finalMs = performance.now() - deltaStarted;
    if (!isLast) {
      maxDeltaMs = Math.max(maxDeltaMs, finalMs);
    }
  });
  return { totalMs: performance.now() - started, maxDeltaMs, parsedChars, finalMs };
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

const deltas = streamingDeltas(LONG_STREAMING_REPLY, deltaSize);
const prefixes = deltas.map((_, index) => deltas.slice(0, index + 1).join(""));

console.log(
  `reply: ${LONG_STREAMING_REPLY.length} chars, ${deltas.length} deltas of ${deltaSize} chars, median of ${runs} runs`,
);
console.log("strategy                 total ms  max delta ms  final ms  parsed chars");
for (const [name, strategy] of [
  ["plain-text-then-parse", plainTextThenParse],
  ["full-reparse-per-delta", fullReparsePerDelta],
  ["block-incremental", blockIncremental],
] as const) {
  strategy(prefixes); // warm up the parser
  const results = Array.from({ length: runs }, () => strategy(prefixes));
  const row = [
    name.padEnd(24),
    median(results.map((r) => r.totalMs)).toFixed(1).padStart(8),
    median(results.map((r) => r.maxDeltaMs)).toFixed(2).padStart(13),
    median(results.map((r) => r.finalMs)).toFixed(2).padStart(9),
    String(results[0]!.parsedChars).padStart(13),
  ];
  console.log(row.join(" "));
}
