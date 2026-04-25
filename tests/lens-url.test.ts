import { describe, expect, test } from "bun:test";
import { normalizeLensUrl } from "../electron/main/browser/browser-url";

describe("normalizeLensUrl", () => {
  test("defaults localhost targets to http", () => {
    expect(normalizeLensUrl("localhost:8888")).toBe("http://localhost:8888");
    expect(normalizeLensUrl("127.0.0.1:3000/path")).toBe(
      "http://127.0.0.1:3000/path",
    );
  });

  test("defaults remote targets to https", () => {
    expect(normalizeLensUrl("example.com")).toBe("https://example.com");
  });

  test("preserves explicit protocols", () => {
    expect(normalizeLensUrl("http://localhost:5173")).toBe(
      "http://localhost:5173",
    );
    expect(normalizeLensUrl("https://example.com")).toBe(
      "https://example.com",
    );
  });

  test("blocks dangerous protocols", () => {
    expect(() => normalizeLensUrl("javascript:alert(1)")).toThrow(
      "Blocked protocol: javascript:alert(1)",
    );
  });
});
