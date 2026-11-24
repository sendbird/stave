export const PASTED_TEXT_FILE_NAME = "pasted-text.txt";

const PREVIEW_LINES = 3;
const PREVIEW_LINE_LIMIT = 120;
export const PASTED_TEXT_PREVIEW_MAX_LENGTH = PREVIEW_LINES * (PREVIEW_LINE_LIMIT + 1) + PREVIEW_LINES - 1;

export function previewPastedText(text: string): string {
  // Each preview line is bounded, including single-line logs and minified JSON.
  return text.split(/\r\n|\r|\n/, PREVIEW_LINES)
    .map((line) => line.length > PREVIEW_LINE_LIMIT ? line.slice(0, PREVIEW_LINE_LIMIT) + "…" : line)
    .join("\n");
}
