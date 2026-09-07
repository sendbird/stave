/**
 * Pure diff engine for `DiffViewer` — line-level LCS diff, the word-boundary
 * diff `granularity="word"` layers on top of a changed line pair, the
 * split-view row pairing, and the context-collapse planner. No React, no
 * styles: `DiffViewer.tsx` owns rendering, this module owns the data.
 *
 * Split out when the word-diff addition pushed `DiffViewer.tsx` past the
 * repo's 500-line file ceiling (`bun run check:structure`) — the same
 * data/rendering split `DataTable.sizing.ts` already uses for `DataTable`.
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
 * Classic LCS (longest common subsequence) line diff via dynamic programming.
 * O(n·m) time/space — fine for the code/document sizes a viewer shows.
 */
export function diffLines(before: string[], after: string[]): DiffOp[] {
  const n = before.length;
  const m = after.length;
  // lcs[i][j] = LCS length of before[i:] vs after[j:]
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = lcs[i]!;
    const nextRow = lcs[i + 1]!;
    for (let j = m - 1; j >= 0; j -= 1) {
      row[j] =
        before[i] === after[j]
          ? (nextRow[j + 1] ?? 0) + 1
          : Math.max(nextRow[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const beforeLine = before[i] as string;
    const afterLine = after[j] as string;
    if (beforeLine === afterLine) {
      ops.push({
        afterLine: j + 1,
        beforeLine: i + 1,
        text: beforeLine,
        type: "equal",
      });
      i += 1;
      j += 1;
    } else if ((lcs[i + 1]![j] ?? 0) >= (lcs[i]![j + 1] ?? 0)) {
      ops.push({ beforeLine: i + 1, text: beforeLine, type: "remove" });
      i += 1;
    } else {
      ops.push({ afterLine: j + 1, text: afterLine, type: "add" });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ beforeLine: i + 1, text: before[i] as string, type: "remove" });
    i += 1;
  }
  while (j < m) {
    ops.push({ afterLine: j + 1, text: after[j] as string, type: "add" });
    j += 1;
  }
  return ops;
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
