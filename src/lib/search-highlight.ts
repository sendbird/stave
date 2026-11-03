/**
 * Where the words of a search query appear in a piece of text, as merged
 * `[start, end)` ranges in reading order, for drawing the matched characters.
 *
 * Every whitespace-separated word is found case-insensitively, every time it
 * occurs; overlapping or touching matches merge. Korean and other scripts
 * without case match as typed, including a syllable still being composed. When
 * lowercasing changes the text's length (a dotted capital I, for one), offsets
 * into the lowercased copy would cut the original in the wrong place, so no
 * range is returned rather than a wrong one.
 */
export function searchHighlightRanges(text: string, query: string): Array<[number, number]> {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0 || !text) return [];
  const lowered = text.toLocaleLowerCase();
  if (lowered.length !== text.length) return [];
  const ranges: Array<[number, number]> = [];
  for (const word of words) {
    let from = 0;
    while (from <= lowered.length - word.length) {
      const index = lowered.indexOf(word, from);
      if (index === -1) break;
      ranges.push([index, index + word.length]);
      from = index + word.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return merged;
}

/** The text cut into plain and matched pieces, in order. */
export function splitSearchHighlight(text: string, query: string): Array<{ text: string; match: boolean }> {
  const ranges = searchHighlightRanges(text, query);
  if (ranges.length === 0) return [{ text, match: false }];
  const parts: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push({ text: text.slice(cursor, start), match: false });
    parts.push({ text: text.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts;
}
