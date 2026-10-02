/**
 * When a quoted answer collapses behind "Show all".
 *
 * The estimate is a lower bound on the lines the answer renders in a side
 * panel: a prose line wraps at most every `RESPONSE_CHARS_PER_LINE` characters
 * (a 384px panel fits fewer), a fenced code line never wraps (it scrolls), and
 * blank lines are dropped because Markdown folds them into paragraph spacing.
 * The collapsed height in `collapsible-response.styles.ts` is under eleven
 * body lines, so anything past `RESPONSE_COLLAPSE_MIN_LINES` always overflows
 * it and "Show all" always reveals more.
 */
export const RESPONSE_CHARS_PER_LINE = 64;
export const RESPONSE_COLLAPSE_MIN_LINES = 16;

const FENCE = /^\s*(```|~~~)/;

export function estimateResponseLines(
  text: string,
  charsPerLine = RESPONSE_CHARS_PER_LINE,
): number {
  let lines = 0;
  let inFence = false;
  for (const raw of text.split("\n")) {
    if (FENCE.test(raw)) {
      inFence = !inFence;
      lines += 1;
      continue;
    }
    if (inFence) {
      lines += 1;
      continue;
    }
    const line = raw.trim();
    if (!line) continue;
    lines += Math.ceil(line.length / charsPerLine);
  }
  return lines;
}

export function shouldCollapseResponse(text: string): boolean {
  return estimateResponseLines(text) > RESPONSE_COLLAPSE_MIN_LINES;
}
