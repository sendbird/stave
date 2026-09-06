import { describe, expect, test } from "bun:test";
import {
  buildFilesystemSearchRgArgs,
  normalizeFilesystemSearchQuery,
  parseFilesystemSearchMatchLine,
} from "../electron/main/ipc/filesystem-search";

describe("filesystem search helpers", () => {
  test("malformed match events do not throw or invent results", () => {
    for (const event of [null, [], { type: "match", data: { path: { text: 42 }, line_number: 1, lines: { text: "match" } } },
      { type: "match", data: { path: { text: "file" }, line_number: -1, lines: { text: "match" } } }]) {
      expect(parseFilesystemSearchMatchLine(JSON.stringify(event))).toBeNull();
    }
  });
  test("trims single-line queries", () => {
    expect(normalizeFilesystemSearchQuery("  hello world  ")).toBe(
      "hello world",
    );
  });

  test("preserves multiline indentation while trimming outer blank lines", () => {
    expect(
      normalizeFilesystemSearchQuery("\n  const x = 1;\n  return x;\n\n"),
    ).toBe("  const x = 1;\n  return x;");
  });

  test("enables multiline ripgrep mode only for multiline queries", () => {
    expect(buildFilesystemSearchRgArgs("needle")).not.toContain("--multiline");
    expect(
      buildFilesystemSearchRgArgs("const x = 1;\nreturn x;"),
    ).toContain("--multiline");
  });

  test("parses ripgrep json match lines into grouped results", () => {
    const parsed = parseFilesystemSearchMatchLine(
      JSON.stringify({
        type: "match",
        data: {
          path: { text: "./src/example.ts" },
          line_number: 12,
          lines: { text: "  const x = 1;\n  return x;\n" },
        },
      }),
    );

    expect(parsed).toEqual({
      file: "src/example.ts",
      match: {
        line: 12,
        text: "  const x = 1;\n  return x;",
      },
    });
  });

  test("ignores non-match ripgrep events", () => {
    expect(
      parseFilesystemSearchMatchLine(
        JSON.stringify({ type: "summary", data: { matches: 0 } }),
      ),
    ).toBeNull();
  });
});
