/**
 * Math in a reply's Markdown: `$…$` inline, `$$…$$` as a display block, and
 * ```math fences.
 *
 * The Markdown parser treats every pair of dollar signs as math, so prose
 * about money or shell variables ("$5 and $10", "$HOME/$USER") would turn
 * into formulas. Before parsing, {@link prepareMarkdownMath} keeps a `$` as
 * math only when it reads as math and escapes every other one:
 *
 * - An opening `$` has a non-space character right after it and no letter,
 *   digit or `=` right before it.
 * - The closing `$` has a non-space character right before it and no letter
 *   or digit right after it.
 * - `$$…$$` on one line, inside a sentence, stays inline display math.
 * - A `$$` block must be closed; an unclosed one stays text, so it cannot
 *   swallow the rest of the reply.
 *
 * Code fences and inline code are left exactly as written.
 */

const FENCE_OPENING = /^\s*(`{3,}|~{3,})/;
/** Indentation and quote markers a generated line must repeat. */
const LINE_PREFIX = /^((?:[ \t]*>)*[ \t]*)/;
/** How far a `$$` block may run before its closing `$$`. */
const DISPLAY_LOOKAHEAD_LINES = 200;

function isWhitespace(char: string | undefined) {
  return char === undefined || /\s/.test(char);
}

function isWordChar(char: string | undefined) {
  return char !== undefined && /[\p{L}\p{N}_]/u.test(char);
}

/** Index of the `$` that closes inline math opened at `start`, or -1. */
function inlineMathEnd(line: string, start: number): number {
  const before = line[start - 1];
  if (isWordChar(before) || before === "=") return -1;
  if (isWhitespace(line[start + 1])) return -1;
  for (let index = start + 1; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "`") return -1;
    if (char !== "$") continue;
    if (line[index + 1] === "$") return -1;
    if (isWhitespace(line[index - 1]) || isWordChar(line[index + 1])) return -1;
    return index;
  }
  return -1;
}

/** End of the backtick code span opened at `start` (exclusive), or -1. */
function codeSpanEnd(line: string, start: number): number {
  let run = 0;
  while (line[start + run] === "`") run += 1;
  for (let index = start + run; index < line.length; ) {
    if (line[index] !== "`") {
      index += 1;
      continue;
    }
    let closing = 0;
    while (line[index + closing] === "`") closing += 1;
    if (closing === run) return index + closing;
    index += closing;
  }
  return -1;
}

/** Offset of an unescaped `$$` at or after `from`, or -1. */
function doubleDollarAt(line: string, from: number): number {
  for (let index = from; index < line.length - 1; index += 1) {
    if (line[index] === "\\") {
      index += 1;
      continue;
    }
    if (line[index] === "$" && line[index + 1] === "$") return index;
  }
  return -1;
}

const URL_START = /^(?:<)?https?:\/\//i;

/** One line of prose with every `$` that is not math escaped. */
export function escapeNonMathDollars(line: string): string {
  if (!line.includes("$")) return line;
  let out = "";
  for (let index = 0; index < line.length; ) {
    const char = line[index]!;
    if (char === "\\") {
      out += line.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (char === "`") {
      const end = codeSpanEnd(line, index);
      let run = 1;
      while (line[index + run] === "`") run += 1;
      const stop = end > 0 ? end : index + run;
      out += line.slice(index, stop);
      index = stop;
      continue;
    }
    if ((char === "h" || char === "H" || char === "<") && URL_START.test(line.slice(index, index + 9))) {
      // A URL keeps its dollars: an autolink does not read escapes.
      let stop = index + 1;
      while (stop < line.length && !/\s/.test(line[stop]!) && !(char === "<" && line[stop - 1] === ">")) {
        stop += 1;
      }
      out += line.slice(index, stop);
      index = stop;
      continue;
    }
    if (char === "$") {
      if (line[index + 1] === "$") {
        const close = doubleDollarAt(line, index + 2);
        if (close > index + 2) {
          out += line.slice(index, close + 2);
          index = close + 2;
        } else {
          out += "\\$\\$";
          index += 2;
        }
        continue;
      }
      const end = inlineMathEnd(line, index);
      if (end > 0) {
        out += line.slice(index, end + 1);
        index = end + 1;
      } else {
        out += "\\$";
        index += 1;
      }
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

interface DisplayBlock {
  /** Lines that replace `lines[start..end]`. */
  lines: string[];
  end: number;
}

/**
 * A `$$` display block starting at `lines[start]`, written in any of the
 * usual shapes, rewritten with `$$` on lines of their own. Null when the
 * line does not open one or the block never closes.
 */
function displayBlockAt(lines: readonly string[], start: number): DisplayBlock | null {
  const first = lines[start]!;
  const prefix = LINE_PREFIX.exec(first)?.[1] ?? "";
  const body = first.slice(prefix.length).trimEnd();
  if (!body.startsWith("$$")) return null;
  const opening = body.slice(2);
  // `$$ x $$` on one line.
  if (opening.length > 2 && opening.endsWith("$$") && doubleDollarAt(opening, 0) === opening.length - 2) {
    const tex = opening.slice(0, -2).trim();
    return tex ? { lines: [`${prefix}$$`, `${prefix}${tex}`, `${prefix}$$`], end: start } : null;
  }
  if (opening.includes("$")) return null;
  const inner: string[] = opening.trim() ? [`${prefix}${opening.trim()}`] : [];
  const limit = Math.min(lines.length, start + 1 + DISPLAY_LOOKAHEAD_LINES);
  for (let index = start + 1; index < limit; index += 1) {
    const line = lines[index]!;
    if (FENCE_OPENING.test(line)) return null;
    const trimmed = line.trimEnd();
    if (trimmed.endsWith("$$")) {
      const linePrefix = LINE_PREFIX.exec(line)?.[1] ?? "";
      const last = trimmed.slice(linePrefix.length, -2).trim();
      if (last.includes("$")) return null;
      if (last) inner.push(`${prefix}${last}`);
      if (inner.length === 0) return null;
      return { lines: [`${prefix}$$`, ...inner, `${prefix}$$`], end: index };
    }
    inner.push(line);
  }
  return null;
}

/**
 * Markdown made ready for the math parser: dollars that are not math are
 * escaped, and display blocks put their `$$` on lines of their own. Text with
 * no `$` is returned unchanged.
 */
export function prepareMarkdownMath(markdown: string): string {
  if (!markdown.includes("$")) return markdown;
  const lines = markdown.split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (fence !== null) {
      out.push(line);
      const closing = FENCE_OPENING.exec(line)?.[1];
      if (closing && closing[0] === fence[0] && closing.length >= fence.length && !line.trim().slice(closing.length)) {
        fence = null;
      }
      continue;
    }
    const opening = FENCE_OPENING.exec(line)?.[1];
    if (opening) {
      fence = opening;
      out.push(line);
      continue;
    }
    if (!line.includes("$")) {
      out.push(line);
      continue;
    }
    const block = displayBlockAt(lines, index);
    if (block) {
      out.push(...block.lines);
      index = block.end;
      continue;
    }
    out.push(escapeNonMathDollars(line));
  }
  return out.join("\n");
}
