/**
 * Highlighted-HTML cache for code blocks. It survives component remounts so
 * previously highlighted blocks never flash the plain fallback, and it is
 * bounded by entry count and by total characters (keys hold the full source,
 * values hold the larger Shiki HTML). Oversized sources are never cached.
 */
export interface HighlightCacheLimits {
  maxEntries: number;
  maxTotalChars: number;
  maxCodeChars: number;
}

export const DEFAULT_HIGHLIGHT_CACHE_LIMITS: HighlightCacheLimits = {
  maxEntries: 500,
  maxTotalChars: 20_000_000,
  maxCodeChars: 100_000,
};

export function createHighlightCache(
  limits: HighlightCacheLimits = DEFAULT_HIGHLIGHT_CACHE_LIMITS,
) {
  const entries = new Map<string, string>();
  let totalChars = 0;

  const keyFor = (code: string, language: string) =>
    code.length > limits.maxCodeChars ? null : `${language}\0${code}`;

  const remove = (key: string) => {
    const value = entries.get(key);
    if (value === undefined) {
      return;
    }
    entries.delete(key);
    totalChars -= key.length + value.length;
  };

  return {
    keyFor,
    get(key: string | null) {
      return key === null ? undefined : entries.get(key);
    },
    set(key: string | null, html: string) {
      if (key === null) {
        return;
      }
      const size = key.length + html.length;
      if (size > limits.maxTotalChars) {
        return;
      }
      remove(key);
      while (
        entries.size > 0 &&
        (entries.size >= limits.maxEntries ||
          totalChars + size > limits.maxTotalChars)
      ) {
        const oldestKey = entries.keys().next().value;
        if (oldestKey === undefined) {
          break;
        }
        remove(oldestKey);
      }
      entries.set(key, html);
      totalChars += size;
    },
    get size() {
      return entries.size;
    },
    get totalChars() {
      return totalChars;
    },
  };
}
