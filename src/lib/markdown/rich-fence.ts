import { ANSI_MAX_LINES, isTerminalFence, normalizeTerminalText } from "./ansi";
import { jsonTreeForFence, type JsonTreeDocument } from "./json-tree";

/**
 * What a fenced code block in a reply is drawn as when it is more than code:
 * a JSON tree or terminal output. Null keeps the ordinary code block. Math
 * and diagrams are chosen by their fence name alone and are not covered here.
 */
export type RichFence =
  | { kind: "json"; document: JsonTreeDocument }
  | { kind: "terminal"; text: string }
  | null;

function lineCount(text: string) {
  let count = 1;
  for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) {
    count += 1;
  }
  return count;
}

export function richFenceFor(language: string | undefined, code: string): RichFence {
  const document = jsonTreeForFence(language, code);
  if (document) return { kind: "json", document };
  if (isTerminalFence(language, code) && lineCount(code) <= ANSI_MAX_LINES) {
    return { kind: "terminal", text: normalizeTerminalText(language, code) };
  }
  return null;
}
