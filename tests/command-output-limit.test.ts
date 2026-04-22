import { describe, expect, test } from "bun:test";
import { appendCommandOutput } from "../electron/main/utils/command";

describe("appendCommandOutput", () => {
  test("preserves output below the limit", () => {
    expect(appendCommandOutput("hello", " world")).toBe("hello world");
  });

  test("keeps only the most recent output once the limit is exceeded", () => {
    const chunk = "a".repeat(80_000);
    const result = appendCommandOutput(chunk, `b${"c".repeat(80_000)}`);

    expect(result.length).toBe(128_000);
    expect(result.endsWith(`b${"c".repeat(80_000)}`)).toBe(true);
    expect(result.startsWith("a")).toBe(true);
  });
});
