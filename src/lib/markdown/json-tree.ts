/**
 * JSON in a reply's code block, read as a tree the chat can fold.
 *
 * The parser is a small strict JSON reader rather than `JSON.parse`, because
 * the tree must show the document as written: `JSON.parse` moves integer-like
 * keys to the front of an object and rounds integers past 2^53, so the tree
 * would show a different order or number than the text it came from.
 */

export type JsonTreeNode =
  | { kind: "object"; entries: JsonTreeEntry[] }
  | { kind: "array"; items: JsonTreeNode[] }
  | { kind: "string"; value: string }
  | { kind: "number"; raw: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "null" };

export interface JsonTreeEntry {
  key: string;
  value: JsonTreeNode;
}

export interface JsonTreeDocument {
  root: JsonTreeNode;
  /** Every value in the document, containers included. */
  nodeCount: number;
}

/** Larger blocks stay plain code: a tree that size helps nobody read it. */
export const JSON_TREE_MAX_CHARS = 200 * 1024;

/** Nesting deeper than this stays plain code instead of a deep recursion. */
const MAX_DEPTH = 256;

const JSON_FENCE_LANGUAGES = new Set(["json"]);

class JsonSyntaxError extends Error {}

const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const WHITESPACE = /[ \t\n\r]*/y;

function parseDocument(text: string): JsonTreeDocument {
  let at = 0;
  let nodeCount = 0;

  const fail = (): never => {
    throw new JsonSyntaxError();
  };
  const skipWhitespace = () => {
    WHITESPACE.lastIndex = at;
    WHITESPACE.exec(text);
    at = WHITESPACE.lastIndex;
  };
  const expect = (literal: string) => {
    if (!text.startsWith(literal, at)) fail();
    at += literal.length;
  };
  const readString = (): string => {
    const start = at;
    at += 1;
    while (at < text.length) {
      const char = text.charCodeAt(at);
      if (char === 0x22) {
        at += 1;
        // The literal is already validated JSON string syntax up to here;
        // `JSON.parse` decodes its escapes and rejects bad ones.
        return JSON.parse(text.slice(start, at)) as string;
      }
      if (char === 0x5c) at += 2;
      else if (char < 0x20) fail();
      else at += 1;
    }
    return fail();
  };

  const readValue = (depth: number): JsonTreeNode => {
    if (depth > MAX_DEPTH) fail();
    skipWhitespace();
    nodeCount += 1;
    const char = text[at];
    if (char === "{") {
      at += 1;
      const entries: JsonTreeEntry[] = [];
      skipWhitespace();
      if (text[at] === "}") {
        at += 1;
        return { kind: "object", entries };
      }
      for (;;) {
        skipWhitespace();
        if (text[at] !== '"') fail();
        const key = readString();
        skipWhitespace();
        expect(":");
        entries.push({ key, value: readValue(depth + 1) });
        skipWhitespace();
        if (text[at] === ",") {
          at += 1;
          continue;
        }
        expect("}");
        return { kind: "object", entries };
      }
    }
    if (char === "[") {
      at += 1;
      const items: JsonTreeNode[] = [];
      skipWhitespace();
      if (text[at] === "]") {
        at += 1;
        return { kind: "array", items };
      }
      for (;;) {
        items.push(readValue(depth + 1));
        skipWhitespace();
        if (text[at] === ",") {
          at += 1;
          continue;
        }
        expect("]");
        return { kind: "array", items };
      }
    }
    if (char === '"') return { kind: "string", value: readString() };
    if (text.startsWith("true", at)) {
      at += 4;
      return { kind: "boolean", value: true };
    }
    if (text.startsWith("false", at)) {
      at += 5;
      return { kind: "boolean", value: false };
    }
    if (text.startsWith("null", at)) {
      at += 4;
      return { kind: "null" };
    }
    NUMBER.lastIndex = at;
    const number = NUMBER.exec(text);
    if (!number) return fail();
    at = NUMBER.lastIndex;
    return { kind: "number", raw: number[0] };
  };

  const root = readValue(0);
  skipWhitespace();
  if (at !== text.length) fail();
  return { root, nodeCount };
}

/**
 * The tree of a JSON object or array, or null when the text is not one (a
 * lone string or number, invalid JSON, nesting past the limit, or a body
 * larger than {@link JSON_TREE_MAX_CHARS}).
 */
export function parseJsonTree(text: string): JsonTreeDocument | null {
  if (text.length > JSON_TREE_MAX_CHARS) return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return parseDocument(trimmed);
  } catch (error) {
    if (error instanceof JsonSyntaxError || error instanceof SyntaxError) return null;
    throw error;
  }
}

/**
 * The tree a fenced block shows: a ```json fence, or a fence with no language
 * whose body is a JSON object or array. Anything else, and JSON that does not
 * parse, stays a code block.
 */
export function jsonTreeForFence(
  language: string | undefined,
  code: string,
): JsonTreeDocument | null {
  const normalized = language?.trim().toLowerCase();
  if (normalized && !JSON_FENCE_LANGUAGES.has(normalized)) return null;
  return parseJsonTree(code);
}

/**
 * How many levels open at first: everything in a small document, the top two
 * levels of a medium one, only the root's children of a large one.
 */
export function initialJsonOpenDepth(document: JsonTreeDocument): number {
  if (document.nodeCount <= 200) return Number.POSITIVE_INFINITY;
  if (document.nodeCount <= 2_000) return 2;
  return 1;
}

/** A container shows this many children before a "show more" control. */
export const JSON_TREE_CHILD_PAGE = 100;
