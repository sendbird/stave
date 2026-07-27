/**
 * Frontmatter extraction for the markdown preview surfaces.
 *
 * `react-markdown` + `remark-gfm` follow CommonMark, which has no concept of
 * frontmatter: the opening `---` becomes a thematic break and the closing `---`
 * promotes the metadata lines into a setext heading. Preview surfaces therefore
 * split the frontmatter off before handing the body to the markdown renderer,
 * and render the parsed keys as structured metadata instead.
 *
 * This is a deliberately small YAML subset (scalars, flow sequences, block
 * sequences, block scalars, one level of nesting flattened into dotted keys).
 * It is display-only: unsupported YAML degrades to a best-effort label rather
 * than throwing, because the input is whatever file the user happens to open.
 */

const BYTE_ORDER_MARK = "﻿";

/**
 * Matches a leading `---` fenced block. The inner capture is optional so an
 * empty frontmatter block (`---\n---`) is still recognised and stripped.
 */
const FRONTMATTER_FENCE_PATTERN =
  /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

const KEY_LINE_PATTERN = /^(\s*)([^\s#][^:]*?)\s*:(?:\s+(.*))?\s*$/;
const SEQUENCE_ITEM_PATTERN = /^(\s*)-(?:\s+(.*))?\s*$/;
const BLOCK_SCALAR_PATTERN = /^([|>])[+-]?\d*$/;

/** Defensive caps so a pathological file cannot explode the preview DOM. */
const MAX_ENTRIES = 64;
const MAX_VALUES_PER_ENTRY = 64;

export interface MarkdownFrontmatterEntry {
  /** Dotted path for nested keys, e.g. `metadata.owner`. */
  key: string;
  /** Empty for a key with no scalar value, multiple for sequences. */
  values: string[];
}

export interface ParsedMarkdownFrontmatter {
  hasFrontmatter: boolean;
  entries: MarkdownFrontmatterEntry[];
  /** Frontmatter source without the `---` fences. */
  raw: string;
  /** Markdown body safe to hand to the renderer. */
  body: string;
}

function unquote(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  const isQuoted =
    (first === '"' && last === '"') || (first === "'" && last === "'");
  return isQuoted ? trimmed.slice(1, -1).trim() : trimmed;
}

/**
 * Split a YAML flow sequence body on top-level commas, ignoring commas inside
 * quotes or nested brackets so descriptions like `["a, b", c]` stay intact.
 */
function splitFlowItems(input: string) {
  const items: string[] = [];
  let current = "";
  let quote: string | null = null;
  let depth = 0;

  for (const char of input) {
    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "[" || char === "{") {
      depth += 1;
      current += char;
      continue;
    }
    if (char === "]" || char === "}") {
      depth -= 1;
      current += char;
      continue;
    }
    if (char === "," && depth === 0) {
      items.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  items.push(current);

  return items.map(unquote).filter((item) => item.length > 0);
}

function isFlowSequence(value: string) {
  return value.startsWith("[") && value.endsWith("]");
}

function toScalarValues(rawValue: string) {
  const value = rawValue.trim();
  if (!value) {
    return [];
  }
  if (isFlowSequence(value)) {
    return splitFlowItems(value.slice(1, -1).trim());
  }
  const unquoted = unquote(value);
  return unquoted ? [unquoted] : [];
}

function measureIndent(line: string) {
  const match = /^[ \t]*/.exec(line);
  return match ? match[0].length : 0;
}

interface BlockScalarState {
  entry: MarkdownFrontmatterEntry;
  indent: number;
  folded: boolean;
  lines: string[];
}

function flushBlockScalar(state: BlockScalarState) {
  if (state.folded) {
    const joined = state.lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join(" ");
    if (joined) {
      state.entry.values = [joined];
    }
    return;
  }

  // A literal block keeps its internal shape, so strip only the indentation
  // shared by every non-empty line (YAML's block indentation indicator).
  const contentLines = state.lines.filter((line) => line.trim().length > 0);
  const commonIndent = contentLines.reduce(
    (smallest, line) => Math.min(smallest, measureIndent(line)),
    Number.POSITIVE_INFINITY,
  );
  const offset = Number.isFinite(commonIndent) ? commonIndent : 0;
  const joined = state.lines
    .map((line) => line.slice(offset))
    .join("\n")
    .replace(/\n+$/, "");
  if (joined.trim()) {
    state.entry.values = [joined];
  }
}

/**
 * Parse the frontmatter source into ordered display entries.
 *
 * Exported for tests; callers normally want {@link parseMarkdownFrontmatter}.
 */
export function parseFrontmatterEntries(raw: string) {
  const entries: MarkdownFrontmatterEntry[] = [];
  /** Open parent keys, used to build dotted paths for nested mappings. */
  const parents: Array<{ indent: number; key: string }> = [];
  let lastEntry: MarkdownFrontmatterEntry | null = null;
  let blockScalar: BlockScalarState | null = null;

  for (const line of raw.split(/\r?\n/)) {
    const indent = measureIndent(line);

    if (blockScalar) {
      const isBlank = line.trim().length === 0;
      if (isBlank || indent > blockScalar.indent) {
        blockScalar.lines.push(isBlank ? "" : line);
        continue;
      }
      flushBlockScalar(blockScalar);
      blockScalar = null;
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed === "---") {
      continue;
    }

    const sequenceMatch = SEQUENCE_ITEM_PATTERN.exec(line);
    if (sequenceMatch) {
      const item = unquote(sequenceMatch[2] ?? "");
      if (lastEntry && item && lastEntry.values.length < MAX_VALUES_PER_ENTRY) {
        lastEntry.values.push(item);
      }
      continue;
    }

    const keyMatch = KEY_LINE_PATTERN.exec(line);
    if (!keyMatch) {
      // Folded continuation of the previous scalar (e.g. a wrapped value).
      const lastValue = lastEntry?.values.at(-1);
      if (lastEntry && lastValue !== undefined) {
        lastEntry.values[lastEntry.values.length - 1] =
          `${lastValue} ${trimmed}`;
      }
      continue;
    }

    if (entries.length >= MAX_ENTRIES) {
      break;
    }

    const [, , rawKey = "", rawValue = ""] = keyMatch;
    while ((parents.at(-1)?.indent ?? -1) >= indent) {
      parents.pop();
    }

    const key = unquote(rawKey);
    const fullKey = [...parents.map((parent) => parent.key), key].join(".");
    const entry: MarkdownFrontmatterEntry = { key: fullKey, values: [] };

    const blockScalarMatch = BLOCK_SCALAR_PATTERN.exec(rawValue.trim());
    if (blockScalarMatch) {
      blockScalar = {
        entry,
        indent,
        folded: blockScalarMatch[1] === ">",
        lines: [],
      };
    } else {
      entry.values = toScalarValues(rawValue);
    }

    if (entry.values.length === 0 && !blockScalar) {
      // Could be a parent mapping or the head of a block sequence; both are
      // resolved once the following lines are read.
      parents.push({ indent, key });
    }

    entries.push(entry);
    lastEntry = entry;
  }

  if (blockScalar) {
    flushBlockScalar(blockScalar);
  }

  // Drop pure container keys: a valueless key that only exists to namespace the
  // nested entries below it would otherwise render as an empty row.
  return entries.filter((entry) => {
    if (entry.values.length > 0) {
      return true;
    }
    const prefix = `${entry.key}.`;
    return !entries.some((other) => other.key.startsWith(prefix));
  });
}

/**
 * Split leading YAML frontmatter off a markdown document.
 *
 * Returns the original content as `body` when no frontmatter fence is present,
 * so callers can use the result unconditionally.
 */
export function parseMarkdownFrontmatter(
  content: string,
): ParsedMarkdownFrontmatter {
  const normalized = content.startsWith(BYTE_ORDER_MARK)
    ? content.slice(BYTE_ORDER_MARK.length)
    : content;
  const match = FRONTMATTER_FENCE_PATTERN.exec(normalized);

  if (!match) {
    return { hasFrontmatter: false, entries: [], raw: "", body: content };
  }

  const raw = match[1] ?? "";
  return {
    hasFrontmatter: true,
    entries: parseFrontmatterEntries(raw),
    raw,
    body: normalized.slice(match[0].length),
  };
}
