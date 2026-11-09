/** One line of a unified diff as the side view shows it. */
export interface TarsDiffLine {
  /** The line's number before the change; null for an added line. */
  oldLine: number | null;
  /** The line's number after the change; null for a removed line. */
  newLine: number | null;
  sign: "+" | "-" | " ";
  text: string;
}

/**
 * The range the quote names: the changed file's lines after the change when
 * any selected line still exists, otherwise (only removed lines) the lines
 * before it.
 */
export interface TarsDiffQuoteRange {
  side: "new" | "old";
  start: number;
  end: number;
}

/** A quote stays a small part of the 8,000-character message it goes into. */
export const TARS_DIFF_QUOTE_MAX_LINES = 60;
export const TARS_DIFF_QUOTE_MAX_CHARS = 4_000;

export function tarsDiffQuoteRange(lines: readonly TarsDiffLine[]): TarsDiffQuoteRange | null {
  const after = lines.flatMap((line) => line.newLine !== null ? [line.newLine] : []);
  const numbers = after.length ? after : lines.flatMap((line) => line.oldLine !== null ? [line.oldLine] : []);
  if (!numbers.length) return null;
  return { side: after.length ? "new" : "old", start: Math.min(...numbers), end: Math.max(...numbers) };
}

/**
 * A quoted reference for the composer: a header naming the file and range
 * (the caller words it), then the selected lines as a diff block. It is text
 * the user edits and sends; quoting never sends anything. Long selections are
 * cut at a line boundary and say so with a final `…` line.
 */
export function quoteTarsDiffLines(args: {
  lines: readonly TarsDiffLine[];
  header: (range: TarsDiffQuoteRange) => string;
}): string | null {
  const range = tarsDiffQuoteRange(args.lines);
  if (!range) return null;
  const body: string[] = [];
  let size = 0;
  let cut = false;
  for (const line of args.lines) {
    const text = `${line.sign} ${line.text}`.trimEnd();
    if (body.length >= TARS_DIFF_QUOTE_MAX_LINES || size + text.length + 1 > TARS_DIFF_QUOTE_MAX_CHARS) { cut = true; break; }
    body.push(text);
    size += text.length + 1;
  }
  if (cut) body.push("…");
  // A fence longer than any backtick run inside keeps quoted code from closing it early.
  const longest = Math.max(2, ...args.lines.map((line) => Math.max(0, ...(line.text.match(/`+/g) ?? []).map((run) => run.length))));
  const fence = "`".repeat(longest + 1);
  return `${args.header(range)}\n${fence}diff\n${body.join("\n")}\n${fence}\n`;
}
