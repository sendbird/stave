import { describe, expect, test } from "bun:test";
import { createHighlightCache } from "@/components/ai-elements/code-block-highlight-cache";

describe("code block highlight cache", () => {
  test("never caches a source above the per-entry limit", () => {
    const cache = createHighlightCache({ maxEntries: 10, maxTotalChars: 1_000, maxCodeChars: 5 });
    const key = cache.keyFor("123456", "ts");
    expect(key).toBeNull();
    cache.set(key, "<pre>123456</pre>");
    expect(cache.size).toBe(0);
    expect(cache.get(cache.keyFor("12345", "ts"))).toBeUndefined();
  });

  test("evicts the oldest entries to stay under the character budget", () => {
    const cache = createHighlightCache({ maxEntries: 10, maxTotalChars: 40, maxCodeChars: 100 });
    const keys = ["a", "b", "c"].map((code) => cache.keyFor(code, "ts"));
    for (const key of keys) cache.set(key, "x".repeat(10));
    expect(cache.totalChars).toBeLessThanOrEqual(40);
    expect(cache.get(keys[0]!)).toBeUndefined();
    expect(cache.get(keys[2]!)).toBe("x".repeat(10));
  });

  test("keeps the entry count limit and accounts for replaced values", () => {
    const cache = createHighlightCache({ maxEntries: 2, maxTotalChars: 1_000, maxCodeChars: 100 });
    const first = cache.keyFor("one", "ts");
    cache.set(first, "aaaa");
    cache.set(first, "bb");
    expect(cache.size).toBe(1);
    expect(cache.totalChars).toBe(first!.length + 2);
    cache.set(cache.keyFor("two", "ts"), "c");
    cache.set(cache.keyFor("three", "ts"), "d");
    expect(cache.size).toBe(2);
    expect(cache.get(first)).toBeUndefined();
  });
});
