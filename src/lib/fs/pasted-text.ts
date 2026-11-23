export const PASTED_TEXT_MAX_INLINE_CHARACTERS = 2_000;
export const PASTED_TEXT_MAX_INLINE_LINES = 40;
export const PASTED_TEXT_FILE_NAME = "pasted-text.txt";

const PREVIEW_LINES = 3;
const PREVIEW_LINE_LIMIT = 120;
export const PASTED_TEXT_PREVIEW_MAX_LENGTH = PREVIEW_LINES * (PREVIEW_LINE_LIMIT + 1) + PREVIEW_LINES - 1;

export function shouldAttachPastedText(text: string): boolean {
  if (text.length > PASTED_TEXT_MAX_INLINE_CHARACTERS) return true;
  const lines = text.split(/\r\n|\r|\n/);
  return lines.length - Number(lines.at(-1) === "") > PASTED_TEXT_MAX_INLINE_LINES;
}

export function previewPastedText(text: string): string {
  // Each preview line is bounded, including single-line logs and minified JSON.
  return text.split(/\r\n|\r|\n/, PREVIEW_LINES)
    .map((line) => line.length > PREVIEW_LINE_LIMIT ? line.slice(0, PREVIEW_LINE_LIMIT) + "…" : line)
    .join("\n");
}
