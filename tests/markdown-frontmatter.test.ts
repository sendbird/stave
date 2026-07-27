import { describe, expect, test } from "bun:test";
import { parseMarkdownFrontmatter } from "@/lib/markdown-frontmatter";

describe("parseMarkdownFrontmatter", () => {
  test("splits scalar frontmatter off the markdown body", () => {
    const parsed = parseMarkdownFrontmatter(
      ["---", "name: stave-release", "category: release", "---", "", "# Title"].join(
        "\n",
      ),
    );

    expect(parsed.hasFrontmatter).toBe(true);
    expect(parsed.entries).toEqual([
      { key: "name", values: ["stave-release"] },
      { key: "category", values: ["release"] },
    ]);
    expect(parsed.body).toBe("\n# Title");
  });

  test("returns the original content untouched when there is no frontmatter", () => {
    const content = "# Title\n\nSome body\n\n---\n\nAfter a thematic break";
    const parsed = parseMarkdownFrontmatter(content);

    expect(parsed.hasFrontmatter).toBe(false);
    expect(parsed.entries).toEqual([]);
    expect(parsed.body).toBe(content);
  });

  test("ignores a fence that does not start the document", () => {
    const content = "Intro\n\n---\nname: not-frontmatter\n---\n";
    const parsed = parseMarkdownFrontmatter(content);

    expect(parsed.hasFrontmatter).toBe(false);
    expect(parsed.body).toBe(content);
  });

  test("parses flow sequences without splitting quoted commas", () => {
    const parsed = parseMarkdownFrontmatter(
      ['---', 'tools: [claude, codex]', 'notes: ["a, b", c]', "---", "body"].join(
        "\n",
      ),
    );

    expect(parsed.entries).toEqual([
      { key: "tools", values: ["claude", "codex"] },
      { key: "notes", values: ["a, b", "c"] },
    ]);
  });

  test("collects block sequence items under their key", () => {
    const parsed = parseMarkdownFrontmatter(
      [
        "---",
        "test-prompts:",
        '  - "현재 diff 리뷰해줘"',
        "  - review this branch",
        "category: review",
        "---",
        "body",
      ].join("\n"),
    );

    expect(parsed.entries).toEqual([
      {
        key: "test-prompts",
        values: ["현재 diff 리뷰해줘", "review this branch"],
      },
      { key: "category", values: ["review"] },
    ]);
  });

  test("flattens nested mappings into dotted keys and drops empty containers", () => {
    const parsed = parseMarkdownFrontmatter(
      ["---", "metadata:", "  owner: platform", "  tier: 1", "---", "body"].join(
        "\n",
      ),
    );

    expect(parsed.entries).toEqual([
      { key: "metadata.owner", values: ["platform"] },
      { key: "metadata.tier", values: ["1"] },
    ]);
  });

  test("joins literal and folded block scalars", () => {
    const parsed = parseMarkdownFrontmatter(
      [
        "---",
        "literal: |",
        "  line one",
        "  line two",
        "folded: >",
        "  wrapped",
        "  description",
        "---",
        "body",
      ].join("\n"),
    );

    expect(parsed.entries).toEqual([
      { key: "literal", values: ["line one\nline two"] },
      { key: "folded", values: ["wrapped description"] },
    ]);
  });

  test("strips an empty frontmatter block", () => {
    const parsed = parseMarkdownFrontmatter("---\n---\n# Title");

    expect(parsed.hasFrontmatter).toBe(true);
    expect(parsed.entries).toEqual([]);
    expect(parsed.body).toBe("# Title");
  });

  test("skips comments and tolerates CRLF line endings", () => {
    const parsed = parseMarkdownFrontmatter(
      "---\r\n# a comment\r\nname: value\r\n---\r\nbody",
    );

    expect(parsed.entries).toEqual([{ key: "name", values: ["value"] }]);
    expect(parsed.body).toBe("body");
  });
});
