/**
 * Pasted text that stays in the draft but shows as one collapsed chip in the
 * prompt editor, so a long paste does not flood the composer.
 *
 * The draft value keeps the original text. Only the editor display changes, so
 * send, queue, prompt batch, and enhancement paths receive the real text.
 */

export const PASTED_TEXT_COLLAPSE_MIN_LINES = 5;
export const PASTED_TEXT_COLLAPSE_MIN_CHARACTERS = 800;

export interface PastedTextBlock {
  id: number;
  text: string;
  lineCount: number;
}

export type PastedTextBlockSegment =
  | { type: "text"; text: string }
  | { type: "pasted"; block: PastedTextBlock };

export function countPastedTextLines(text: string): number {
  const lines = text.split(/\r\n|\r|\n/);
  return lines.length - Number(lines.length > 1 && lines.at(-1) === "");
}

export function shouldCollapsePastedText(text: string): boolean {
  if (!text.trim()) return false;
  return text.length >= PASTED_TEXT_COLLAPSE_MIN_CHARACTERS
    || countPastedTextLines(text) >= PASTED_TEXT_COLLAPSE_MIN_LINES;
}

/**
 * Splits `text` at every occurrence of a registered block. When two blocks
 * start at the same index, the longer one wins.
 */
export function splitPastedTextBlocks(
  text: string,
  blocks: readonly PastedTextBlock[] | undefined,
): PastedTextBlockSegment[] {
  const candidates = (blocks ?? []).filter((block) => block.text.length > 0);
  if (!text || candidates.length === 0) {
    return text ? [{ type: "text", text }] : [];
  }

  const segments: PastedTextBlockSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let match: { index: number; block: PastedTextBlock } | null = null;
    for (const block of candidates) {
      const index = text.indexOf(block.text, cursor);
      if (index < 0) continue;
      if (
        !match ||
        index < match.index ||
        (index === match.index && block.text.length > match.block.text.length)
      ) {
        match = { index, block };
      }
    }
    if (!match) break;
    if (match.index > cursor) {
      segments.push({ type: "text", text: text.slice(cursor, match.index) });
    }
    segments.push({ type: "pasted", block: match.block });
    cursor = match.index + match.block.text.length;
  }
  if (cursor < text.length) {
    segments.push({ type: "text", text: text.slice(cursor) });
  }
  return segments;
}

interface PastedTextBlockScope {
  nextId: number;
  blocks: PastedTextBlock[];
}

const EMPTY_BLOCKS: readonly PastedTextBlock[] = [];
const scopes = new Map<string, PastedTextBlockScope>();
const listeners = new Set<() => void>();

/**
 * Blocks live per draft scope for the app session. They are not persisted: after
 * a restart the draft keeps its full text and shows it uncollapsed.
 */
export const pastedTextBlockRegistry = {
  register(scopeId: string, text: string): PastedTextBlock {
    const scope = scopes.get(scopeId) ?? { nextId: 1, blocks: [] };
    const existing = scope.blocks.find((block) => block.text === text);
    if (existing) return existing;
    const block: PastedTextBlock = {
      id: scope.nextId,
      text,
      lineCount: countPastedTextLines(text),
    };
    scopes.set(scopeId, { nextId: scope.nextId + 1, blocks: [...scope.blocks, block] });
    for (const listener of listeners) listener();
    return block;
  },
  get(scopeId: string): readonly PastedTextBlock[] {
    return scopes.get(scopeId)?.blocks ?? EMPTY_BLOCKS;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Test-only reset. */
  clear(): void {
    scopes.clear();
    for (const listener of listeners) listener();
  },
};
