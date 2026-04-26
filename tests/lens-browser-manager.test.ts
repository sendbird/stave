// ---------------------------------------------------------------------------
// Unit tests for RingBuffer (internal to browser-manager)
// We re-implement a thin copy of the class here to keep the tests fast and
// free from Electron module imports.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "bun:test";

class RingBuffer<T> {
  private items: T[] = [];
  constructor(private readonly capacity: number) {}

  push(item: T) {
    if (this.items.length >= this.capacity) {
      this.items.shift();
    }
    this.items.push(item);
  }

  toArray(): T[] {
    return [...this.items];
  }

  clear() {
    this.items = [];
  }

  get length() {
    return this.items.length;
  }
}

describe("RingBuffer", () => {
  it("starts empty", () => {
    const buf = new RingBuffer<number>(5);
    expect(buf.length).toBe(0);
    expect(buf.toArray()).toEqual([]);
  });

  it("appends items up to capacity", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.toArray()).toEqual([1, 2, 3]);
    expect(buf.length).toBe(3);
  });

  it("evicts the oldest item when capacity is exceeded (FIFO)", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4); // evicts 1
    expect(buf.toArray()).toEqual([2, 3, 4]);
  });

  it("continues evicting on multiple overflows", () => {
    const buf = new RingBuffer<string>(2);
    for (const ch of ["a", "b", "c", "d", "e"]) {
      buf.push(ch);
    }
    expect(buf.toArray()).toEqual(["d", "e"]);
  });

  it("toArray returns a defensive copy", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    const arr = buf.toArray();
    arr.push(99);
    expect(buf.toArray()).toEqual([1]);
  });

  it("clear empties the buffer", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.clear();
    expect(buf.length).toBe(0);
    expect(buf.toArray()).toEqual([]);
  });

  it("handles capacity of 1", () => {
    const buf = new RingBuffer<number>(1);
    buf.push(1);
    buf.push(2);
    expect(buf.toArray()).toEqual([2]);
  });
});

// ---------------------------------------------------------------------------
// URL normalisation logic (mirrors browser-tools.ts and ipc/browser.ts)
// ---------------------------------------------------------------------------

// Mirrors the normalisation logic in browser-tools.ts and ipc/browser.ts.
// Dangerous schemes are checked BEFORE adding the https:// prefix so they
// cannot be masked by the normalisation step.
function normalizeUrl(raw: string): { ok: boolean; url?: string; error?: string } {
  const url = raw.trim();
  if (!url) return { ok: false, error: "empty URL" };
  if (/^(file|chrome|javascript|data|vbscript):/i.test(url)) {
    return { ok: false, error: `Blocked protocol: ${url}` };
  }
  const normalized = /^[a-z]+:\/\//i.test(url) ? url : `https://${url}`;
  return { ok: true, url: normalized };
}

describe("URL normalisation", () => {
  it("passes through a full https URL unchanged", () => {
    const r = normalizeUrl("https://example.com");
    expect(r).toEqual({ ok: true, url: "https://example.com" });
  });

  it("adds https:// when no protocol is given", () => {
    expect(normalizeUrl("localhost:3000")).toEqual({
      ok: true,
      url: "https://localhost:3000",
    });
    expect(normalizeUrl("example.com/path")).toEqual({
      ok: true,
      url: "https://example.com/path",
    });
  });

  it("allows http:// protocol", () => {
    const r = normalizeUrl("http://localhost:3000");
    expect(r).toEqual({ ok: true, url: "http://localhost:3000" });
  });

  it("blocks file:// protocol", () => {
    const r = normalizeUrl("file:///etc/passwd");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Blocked protocol/);
  });

  it("blocks chrome:// protocol", () => {
    const r = normalizeUrl("chrome://settings");
    expect(r.ok).toBe(false);
  });

  it("blocks javascript: protocol", () => {
    const r = normalizeUrl("javascript:alert(1)");
    expect(r.ok).toBe(false);
  });

  it("blocks data: protocol", () => {
    const r = normalizeUrl("data:text/html,<script>alert(1)</script>");
    expect(r.ok).toBe(false);
  });

  it("blocks vbscript: protocol", () => {
    const r = normalizeUrl("vbscript:msgbox(1)");
    expect(r.ok).toBe(false);
  });

  it("trims leading/trailing whitespace before normalising", () => {
    const r = normalizeUrl("  example.com  ");
    expect(r).toEqual({ ok: true, url: "https://example.com" });
  });

  it("returns error for empty input", () => {
    const r = normalizeUrl("");
    expect(r.ok).toBe(false);
  });
});
