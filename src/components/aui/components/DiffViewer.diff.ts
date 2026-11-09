/**
 * Pure diff engine for `DiffViewer` — line-level LCS diff, the word-boundary
 * diff `granularity="word"` layers on top of a changed line pair, the
 * split-view row pairing, and the context-collapse planner. No React, no
 * styles: `DiffViewer.tsx` owns rendering, this module owns the data.
 *
 * Split out when the word-diff addition pushed `DiffViewer.tsx` past the
 * repo's 500-line file ceiling (`bun run check:structure`) — the same
 * data/rendering split `DataTable.sizing.ts` already uses for `DataTable`.
 *
 * `paintHighlightedLine` is the host-highlighter overlay: syntax color spans
 * compose with word-diff washes by character offset. The highlighter itself
 * stays app-side so this package does not take a syntax-engine dependency.
 */

/** One token-level (word-boundary) op inside a word-diffed changed line. */
export type WordOp = {
  type: "equal" | "add" | "remove";
  text: string;
};

export type DiffOp = {
  type: "equal" | "add" | "remove";
  text: string;
  beforeLine?: number;
  afterLine?: number;
  /**
   * Set only when this op is one half of a changed line **pair** (a "remove"
   * with a matching "add", or vice versa) and `granularity === "word"`. Holds
   * this line's own tokens, each marked as `"equal"` (present on both sides)
   * or changed — see `wordDiffPair`.
   */
  wordOps?: WordOp[];
};

export function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  return text.split("\n");
}

/**
 * Above this many LCS table cells (the changed middle's before × after lines,
 * after the common head and tail are set aside) the middle renders as removed
 * then added instead. The table costs one number per cell; at 4M cells it is
 * already tens of MB and a visible main-thread stall, and a rewrite of two
 * multi-thousand-line files would not finish at all.
 */
export const MAX_LCS_CELLS = 4_000_000;

/**
 * Line diff: the common head and tail are equal runs, and the changed middle
 * is a classic LCS (longest common subsequence) diff via dynamic programming,
 * O(n·m) over the middle only. An edit to one line of a large file therefore
 * costs O(n), not O(n²). A middle above `MAX_LCS_CELLS` falls back to
 * remove-all then add-all: still a correct diff, just not a minimal one.
 */
export function diffLines(before: string[], after: string[]): DiffOp[] {
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head += 1;
  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > head && afterEnd > head && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  const ops: DiffOp[] = [];
  const pushEqual = (i: number, j: number) => ops.push({ afterLine: j + 1, beforeLine: i + 1, text: before[i] as string, type: "equal" });
  for (let k = 0; k < head; k += 1) pushEqual(k, k);
  diffMiddle(before, after, head, beforeEnd, head, afterEnd, ops);
  for (let i = beforeEnd, j = afterEnd; i < before.length; i += 1, j += 1) pushEqual(i, j);
  return ops;
}

/** LCS diff of `before[i0:i1]` against `after[j0:j1]`, appended to `ops` with absolute line numbers. */
function diffMiddle(before: string[], after: string[], i0: number, i1: number, j0: number, j1: number, ops: DiffOp[]): void {
  const n = i1 - i0;
  const m = j1 - j0;
  const pushRemove = (i: number) => ops.push({ beforeLine: i + 1, text: before[i] as string, type: "remove" });
  const pushAdd = (j: number) => ops.push({ afterLine: j + 1, text: after[j] as string, type: "add" });
  if (n === 0 || m === 0 || n * m > MAX_LCS_CELLS) {
    for (let i = i0; i < i1; i += 1) pushRemove(i);
    for (let j = j0; j < j1; j += 1) pushAdd(j);
    return;
  }
  // lcs[i][j] = LCS length of the middle's before[i:] vs after[j:] (relative indexes)
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = lcs[i]!;
    const nextRow = lcs[i + 1]!;
    for (let j = m - 1; j >= 0; j -= 1) {
      row[j] =
        before[i0 + i] === after[j0 + j]
          ? (nextRow[j + 1] ?? 0) + 1
          : Math.max(nextRow[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i0 + i] === after[j0 + j]) {
      ops.push({ afterLine: j0 + j + 1, beforeLine: i0 + i + 1, text: before[i0 + i] as string, type: "equal" });
      i += 1;
      j += 1;
    } else if ((lcs[i + 1]![j] ?? 0) >= (lcs[i]![j + 1] ?? 0)) {
      pushRemove(i0 + i);
      i += 1;
    } else {
      pushAdd(j0 + j);
      j += 1;
    }
  }
  for (; i < n; i += 1) pushRemove(i0 + i);
  for (; j < m; j += 1) pushAdd(j0 + j);
}

/**
 * Split a line into word-boundary tokens, alternating word runs and
 * whitespace runs (`match` never returns an empty string, so joining the
 * result reconstructs the original line exactly — required for `pre-wrap`
 * rendering to stay faithful).
 */
export function tokenizeWords(text: string): string[] {
  return text.match(/\s+|\S+/g) ?? [];
}

/**
 * Word-boundary diff between one changed line pair, split back into each
 * side's own token list. Reuses `diffLines` (it only ever compares by `===`,
 * so it works identically over word tokens): filtering out the tokens that
 * belong only to the other side reconstructs each original line's tokens in
 * order, annotated with which ones are shared vs. changed.
 */
export function wordDiffPair(
  removedText: string,
  addedText: string,
): { removed: WordOp[]; added: WordOp[] } {
  const tokenOps = diffLines(
    tokenizeWords(removedText),
    tokenizeWords(addedText),
  );
  const removed: WordOp[] = [];
  const added: WordOp[] = [];
  for (const op of tokenOps) {
    if (op.type !== "add") {
      removed.push({
        text: op.text,
        type: op.type === "remove" ? "remove" : "equal",
      });
    }
    if (op.type !== "remove") {
      added.push({ text: op.text, type: op.type === "add" ? "add" : "equal" });
    }
  }
  return { added, removed };
}

/**
 * Walks a line-diff op list and, for every contiguous changed block, pairs up
 * the k-th "remove" with the k-th "add" (mirrors the pairing `toSplitRows`
 * already does for the split view) and attaches a word-boundary diff to each
 * paired op. A remove/add with no counterpart in the block (a pure deletion or
 * a pure insertion) is left unpaired — there is nothing to diff it against, so
 * it keeps rendering as a fully washed line. Mutates `ops` in place; only
 * called when `granularity === "word"`, on the fresh array `diffLines` just
 * produced for this render.
 */
export function annotateWordDiff(ops: DiffOp[]): void {
  let index = 0;
  while (index < ops.length) {
    if (ops[index]!.type === "equal") {
      index += 1;
      continue;
    }
    const removes: DiffOp[] = [];
    const adds: DiffOp[] = [];
    while (index < ops.length && ops[index]!.type !== "equal") {
      const op = ops[index]!;
      if (op.type === "remove") removes.push(op);
      else adds.push(op);
      index += 1;
    }
    const pairCount = Math.min(removes.length, adds.length);
    for (let k = 0; k < pairCount; k += 1) {
      const removeOp = removes[k]!;
      const addOp = adds[k]!;
      const { added, removed } = wordDiffPair(removeOp.text, addOp.text);
      removeOp.wordOps = removed;
      addOp.wordOps = added;
    }
  }
}

/** A cell in the split view (one side of a row). */
export type SplitCell = {
  line: number;
  text: string;
  type: "equal" | "add" | "remove";
  wordOps?: WordOp[];
};

export type SplitRow = {
  key: string;
  left?: SplitCell;
  right?: SplitCell;
  equal: boolean;
};

/** Pair remove/add runs side by side for the split view. */
export function toSplitRows(ops: DiffOp[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let index = 0;
  while (index < ops.length) {
    const op = ops[index]!;
    if (op.type === "equal") {
      rows.push({
        equal: true,
        key: `e-${op.beforeLine}`,
        left: { line: op.beforeLine ?? 0, text: op.text, type: "equal" },
        right: { line: op.afterLine ?? 0, text: op.text, type: "equal" },
      });
      index += 1;
      continue;
    }
    // Collect the contiguous changed block (removes then adds).
    const removes: DiffOp[] = [];
    const adds: DiffOp[] = [];
    while (index < ops.length && ops[index]!.type !== "equal") {
      const current = ops[index]!;
      if (current.type === "remove") removes.push(current);
      else adds.push(current);
      index += 1;
    }
    const length = Math.max(removes.length, adds.length);
    for (let k = 0; k < length; k += 1) {
      const remove = removes[k];
      const add = adds[k];
      rows.push({
        equal: false,
        key: `c-${remove?.beforeLine ?? "x"}-${add?.afterLine ?? "x"}`,
        left: remove
          ? {
              line: remove.beforeLine ?? 0,
              text: remove.text,
              type: "remove",
              wordOps: remove.wordOps,
            }
          : undefined,
        right: add
          ? {
              line: add.afterLine ?? 0,
              text: add.text,
              type: "add",
              wordOps: add.wordOps,
            }
          : undefined,
      });
    }
  }
  return rows;
}

/**
 * Collapse plan over a row list: returns segments that are either visible
 * rows or a collapsed run (with its start index + count) to expand.
 */
export type Segment<T> =
  | { kind: "rows"; rows: T[] }
  | { kind: "collapsed"; start: number; count: number; rows: T[] };

export function planCollapse<T>(
  rows: T[],
  isEqual: (row: T) => boolean,
  context: number | undefined,
  expanded: ReadonlySet<number>,
): Segment<T>[] {
  if (context === undefined) return [{ kind: "rows", rows }];
  const segments: Segment<T>[] = [];
  let index = 0;
  while (index < rows.length) {
    if (!isEqual(rows[index]!)) {
      // Absorb the changed run.
      const start = index;
      while (index < rows.length && !isEqual(rows[index]!)) index += 1;
      segments.push({ kind: "rows", rows: rows.slice(start, index) });
      continue;
    }
    const start = index;
    while (index < rows.length && isEqual(rows[index]!)) index += 1;
    const run = rows.slice(start, index);
    // First run keeps only trailing context; last run only leading; interior
    // runs keep both. Collapse only when it actually hides ≥ 2 lines.
    const keepHead = start === 0 ? 0 : context;
    const keepTail = index === rows.length ? 0 : context;
    const hidden = run.length - keepHead - keepTail;
    if (hidden < 2 || expanded.has(start)) {
      segments.push({ kind: "rows", rows: run });
      continue;
    }
    if (keepHead > 0) {
      segments.push({ kind: "rows", rows: run.slice(0, keepHead) });
    }
    segments.push({
      count: hidden,
      kind: "collapsed",
      rows: run.slice(keepHead, run.length - keepTail),
      start,
    });
    if (keepTail > 0) {
      segments.push({ kind: "rows", rows: run.slice(run.length - keepTail) });
    }
  }
  return segments;
}

/** One syntax-color run returned by a host `DiffViewer` highlighter. */
export type DiffViewerHighlightSpan = {
  text: string;
  color?: string;
};

/**
 * One painted run after syntax spans and optional word-diff ops are
 * intersected. `wordType` is set only when this run sits inside a word-diffed
 * line; `"equal"` still means "present on both sides," not "leave unstyled."
 */
export type PaintedDiffSpan = {
  text: string;
  color?: string;
  wordType?: WordOp["type"];
};

function joinedText(spans: readonly { text: string }[]): string {
  return spans.reduce((acc, span) => acc + span.text, "");
}

/**
 * Intersect host syntax spans with optional word-diff ops. If the spans do
 * not reconstruct `line` exactly, they are discarded and the line paints as
 * a single uncolored run (word-diff washes still apply when `wordOps` match).
 */
export function paintHighlightedLine(
  line: string,
  spans?: readonly DiffViewerHighlightSpan[],
  wordOps?: readonly WordOp[],
): PaintedDiffSpan[] {
  const resolvedSpans =
    spans && spans.length > 0 && joinedText(spans) === line
      ? spans
      : [{ text: line }];
  const resolvedWords =
    wordOps && wordOps.length > 0 && joinedText(wordOps) === line
      ? wordOps
      : undefined;
  if (!resolvedWords) {
    return resolvedSpans.map((span) => ({
      color: span.color,
      text: span.text,
    }));
  }

  const painted: PaintedDiffSpan[] = [];
  let spanIndex = 0;
  let spanOffset = 0;
  let wordIndex = 0;
  let wordOffset = 0;
  while (spanIndex < resolvedSpans.length && wordIndex < resolvedWords.length) {
    const span = resolvedSpans[spanIndex];
    const word = resolvedWords[wordIndex];
    if (!span || !word) break;
    const take = Math.min(
      span.text.length - spanOffset,
      word.text.length - wordOffset,
    );
    if (take > 0) {
      painted.push({
        color: span.color,
        text: span.text.slice(spanOffset, spanOffset + take),
        wordType: word.type,
      });
    }
    spanOffset += take;
    wordOffset += take;
    if (spanOffset >= span.text.length) {
      spanIndex += 1;
      spanOffset = 0;
    }
    if (wordOffset >= word.text.length) {
      wordIndex += 1;
      wordOffset = 0;
    }
  }
  return painted.length > 0 ? painted : [{ text: line }];
}
