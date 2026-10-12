/**
 * Turns an editor selection into a Markdown quote for the composer, so a user
 * can point at part of a document (or any file) and write their comment under
 * it. The quote names the file and lines because the agent reads the file
 * itself; the quoted text is what the comment is about.
 */

/** Longest selection quoted verbatim; longer ones are cut with a marker. */
export const MAX_SELECTION_QUOTE_CHARS = 4_000;

export function formatSelectionQuote(args: {
  filePath: string;
  startLine: number;
  endLine: number;
  text: string;
}): string | null {
  const trimmed = args.text.replace(/^\s*\n|\n\s*$/gu, "");
  if (!trimmed.trim()) {
    return null;
  }
  const body =
    trimmed.length > MAX_SELECTION_QUOTE_CHARS
      ? `${trimmed.slice(0, MAX_SELECTION_QUOTE_CHARS)}\n…`
      : trimmed;
  const lines =
    args.startLine === args.endLine
      ? `line ${args.startLine}`
      : `lines ${args.startLine}-${args.endLine}`;
  return [
    `\`${args.filePath}\` ${lines}:`, // i18n-ignore: model-facing prompt text
    ...body.split(/\r?\n/u).map((line) => (line ? `> ${line}` : ">")),
  ].join("\n");
}

/**
 * Appends a quote to the draft, separated from earlier text by a blank line
 * and followed by one, so the user's comment goes right under the quote.
 */
export function appendSelectionQuoteToDraft(draft: string, quote: string) {
  const head = draft.replace(/\s+$/u, "");
  return `${head ? `${head}\n\n` : ""}${quote}\n\n`;
}
