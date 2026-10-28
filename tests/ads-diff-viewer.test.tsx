import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { DiffViewer } from "@/components/ads/components/DiffViewer";
import {
  annotateWordDiff,
  diffLines,
  MAX_LCS_CELLS,
  paintHighlightedLine,
  planCollapse,
  splitLines,
  toSplitRows,
} from "@/components/ads/components/DiffViewer.diff";
import { languageFromFilePath } from "@/lib/syntax-highlight";

const read = (relative: string) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

/**
 * The installed ADS copy is host-owned source ported from upstream. These pin
 * the contracts Stave's turn-event surface depends on when it renders a file
 * diff through the ADS `DiffViewer` instead of the retired external viewer.
 */
describe("ADS DiffViewer (installed copy)", () => {
  test("renders a unified diff with add/remove signs and line numbers", () => {
    const html = renderToStaticMarkup(
      createElement(DiffViewer, {
        before: "const a = 1;\nconst b = 2;\n",
        after: "const a = 1;\nconst b = 3;\n",
      }),
    );
    // The removed line and its replacement both render, so the reader sees the
    // before/after pair rather than a single mutated line.
    expect(html).toContain("const b = 2;");
    expect(html).toContain("const b = 3;");
    // Diff signs are present for the changed rows.
    expect(html).toContain("+");
    expect(html).toContain("-");
    // A group role wraps the diff for assistive tech.
    expect(html).toContain('role="group"');
  });

  test("word granularity emphasizes only the changed run inside a paired line", () => {
    const html = renderToStaticMarkup(
      createElement(DiffViewer, {
        before: "the quick brown fox\n",
        after: "the quick red fox\n",
        granularity: "word",
      }),
    );
    // The shared prefix/suffix words survive; the changed tokens are what the
    // inline emphasis wraps.
    expect(html).toContain("quick");
    expect(html).toContain("brown");
    expect(html).toContain("red");
  });

  test("split mode lays out two side-by-side columns", () => {
    const html = renderToStaticMarkup(
      createElement(DiffViewer, {
        before: "alpha\nbeta\n",
        after: "alpha\ngamma\n",
        mode: "split",
      }),
    );
    expect(html).toContain("beta");
    expect(html).toContain("gamma");
  });

  test("a host highlighter paints per-span color and still reconstructs the line", () => {
    const html = renderToStaticMarkup(
      createElement(DiffViewer, {
        after: "const b = 3;\n",
        before: "const b = 2;\n",
        highlighter: (line) =>
          line.startsWith("const")
            ? [
                { color: "rgb(207, 34, 46)", text: "const" },
                { text: line.slice("const".length) },
              ]
            : [{ text: line }],
        language: "typescript",
      }),
    );
    expect(html).toContain("color:rgb(207, 34, 46)");
    expect(html).toContain(">const</span>");
    expect(html).toContain(" b = 2;");
    expect(html).toContain(" b = 3;");
  });

  test("context collapses long unchanged runs behind an Expand affordance", () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    const after = before.replace("line 10", "line 10 changed");
    const html = renderToStaticMarkup(
      createElement(DiffViewer, { before, after, context: 2 }),
    );
    expect(html).toContain("Expand");
    expect(html).toContain("unchanged");
  });

  test("ads-theme maps diff identity to the host git ramp, not success/danger", () => {
    const source = read("src/components/system/ads-theme.ts");
    expect(source).toContain('"--ads-color-diff-added": "var(--diff-added)"');
    expect(source).toContain(
      '"--ads-color-diff-added-text": "var(--diff-added-foreground)"',
    );
    expect(source).toContain('"--ads-color-diff-removed": "var(--diff-removed)"');
    expect(source).toContain(
      '"--ads-color-diff-removed-text": "var(--diff-removed-foreground)"',
    );
    expect(source).toContain('"--ads-color-success": "var(--success)"');
    expect(source).toContain('"--ads-color-danger": "var(--destructive)"');
  });

  test("the port authors styles with StyleX tokens, not utility strings", () => {
    const source = read("src/components/ads/components/DiffViewer.tsx");
    expect(source).toContain('from "@stylexjs/stylex"');
    expect(source).toContain('vars["--ads-color-diff-added"]');
    expect(source).toContain('vars["--ads-color-diff-removed"]');
    expect(source).not.toContain('vars["--ads-color-success-soft"]');
    expect(source).not.toContain('vars["--ads-color-danger-soft"]');
    // Ported to the installed layout: recipes in ../recipes, tokens in
    // ../tokens, utils in ../utils.
    expect(source).toContain('from "../recipes/focus-ring"');
    expect(source).toContain('from "../tokens/tokens.stylex"');
    expect(source).toContain('from "../utils/stylex"');
    // Embedded diffs compose host geometry in the same StyleX merge.
    expect(source).toContain("type XstyleProp");
    expect(source).toContain("& XstyleProp");
    expect(source).toContain("sx(styles.root, xstyle)");
  });
});

describe("DiffViewer diff engine", () => {
  test("classifies equal, added, and removed lines by LCS", () => {
    const ops = diffLines(
      splitLines("a\nb\nc"),
      splitLines("a\nB\nc"),
    );
    const types = ops.map((op) => op.type);
    expect(types).toContain("equal");
    expect(types).toContain("add");
    expect(types).toContain("remove");
    // "a" and "c" survive unchanged; only "b" -> "B" is the churn.
    const equalTexts = ops.filter((op) => op.type === "equal").map((op) => op.text);
    expect(equalTexts).toEqual(["a", "c"]);
  });

  test("the line-number gutter is sized by the longest line number", () => {
    const render = (lines: number) =>
      renderToStaticMarkup(
        createElement(DiffViewer, {
          before: Array.from({ length: lines }, (_, index) => `a${index}`).join("\n"),
          after: Array.from({ length: lines }, (_, index) => `b${index}`).join("\n"),
        }),
      );
    expect(render(9)).toContain("--diff-viewer-line-digits:1");
    expect(render(1_200)).toContain("--diff-viewer-line-digits:4");
    expect(render(10_000)).toContain("--diff-viewer-line-digits:5");
  });

  test("a one-line edit in a large file diffs without the full LCS table", () => {
    const before = Array.from({ length: 20_000 }, (_, index) => `line ${index}`);
    const after = [...before];
    after[12_345] = "line 12345 edited";
    const started = performance.now();
    const ops = diffLines(before, after);
    expect(performance.now() - started).toBeLessThan(500);
    expect(ops.filter((op) => op.type !== "equal")).toEqual([
      { beforeLine: 12_346, text: "line 12345", type: "remove" },
      { afterLine: 12_346, text: "line 12345 edited", type: "add" },
    ]);
    expect(ops.at(-1)).toEqual({ afterLine: 20_000, beforeLine: 20_000, text: "line 19999", type: "equal" });
  });

  test("a changed middle above the cell cap renders as removed then added", () => {
    const side = Math.ceil(Math.sqrt(MAX_LCS_CELLS)) + 1;
    const before = ["head", ...Array.from({ length: side }, (_, index) => `old ${index}`), "tail"];
    const after = ["head", ...Array.from({ length: side }, (_, index) => `new ${index}`), "tail"];
    const ops = diffLines(before, after);
    expect(ops[0]).toEqual({ afterLine: 1, beforeLine: 1, text: "head", type: "equal" });
    expect(ops.slice(1, side + 1).every((op) => op.type === "remove")).toBe(true);
    expect(ops.slice(side + 1, 2 * side + 1).every((op) => op.type === "add")).toBe(true);
    expect(ops.at(-1)).toEqual({ afterLine: side + 2, beforeLine: side + 2, text: "tail", type: "equal" });
  });

  test("the ops rebuild both sides with their line numbers", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);
    const pick = () => ["a", "b", "c", "d"][Math.floor(random() * 4)]!;
    for (let round = 0; round < 300; round += 1) {
      const before = Array.from({ length: Math.floor(random() * 12) }, pick);
      const after = Array.from({ length: Math.floor(random() * 12) }, pick);
      const ops = diffLines(before, after);
      const oldSide = ops.filter((op) => op.type !== "add");
      const newSide = ops.filter((op) => op.type !== "remove");
      expect(oldSide.map((op) => op.text)).toEqual(before);
      expect(newSide.map((op) => op.text)).toEqual(after);
      expect(oldSide.map((op) => op.beforeLine)).toEqual(before.map((_, index) => index + 1));
      expect(newSide.map((op) => op.afterLine)).toEqual(after.map((_, index) => index + 1));
    }
  });

  test("annotateWordDiff attaches word ops only to paired changed lines", () => {
    const ops = diffLines(splitLines("one two three"), splitLines("one four three"));
    annotateWordDiff(ops);
    const paired = ops.find((op) => op.wordOps !== undefined);
    expect(paired).toBeDefined();
  });

  test("toSplitRows pairs a remove with its matching add", () => {
    const rows = toSplitRows(diffLines(splitLines("x"), splitLines("y")));
    const changed = rows.find((row) => !row.equal);
    expect(changed?.left?.type).toBe("remove");
    expect(changed?.right?.type).toBe("add");
  });

  test("paintHighlightedLine intersects syntax spans with word-diff ops", () => {
    expect(
      paintHighlightedLine(
        "abcdef",
        [{ color: "#111", text: "abcdef" }],
        [
          { text: "abc", type: "equal" },
          { text: "def", type: "add" },
        ],
      ),
    ).toEqual([
      { color: "#111", text: "abc", wordType: "equal" },
      { color: "#111", text: "def", wordType: "add" },
    ]);
  });

  test("paintHighlightedLine discards spans that do not reconstruct the line", () => {
    expect(
      paintHighlightedLine("const a = 1;", [
        { color: "#c678dd", text: "let" },
        { text: " a = 1;" },
      ]),
    ).toEqual([{ color: undefined, text: "const a = 1;" }]);
  });

  test("planCollapse hides an unchanged run larger than 2x the context", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ equal: i !== 5 }));
    const segments = planCollapse(rows, (row) => row.equal, 1, new Set());
    expect(segments.some((segment) => segment.kind === "collapsed")).toBe(true);
  });
});

describe("ChangedFilesBlock adopts the ADS DiffViewer", () => {
  test("the file-diff card renders through the ADS DiffViewer, not the retired external viewer", () => {
    const source = read("src/components/session/chat-panel-file-blocks.tsx");
    expect(source).toContain(
      'import { DiffViewer } from "@/components/ads/components/DiffViewer"',
    );
    expect(source).toContain("<DiffViewer");
    // The retired `react-diff-viewer-continued` lazy import and its CSS-var
    // theme map are gone.
    expect(source).not.toContain("react-diff-viewer-continued");
    expect(source).not.toContain("ReactDiffViewer");
    expect(source).not.toContain("CHAT_DIFF_VIEWER_STYLES");
    expect(source).toContain("useDiffLineHighlighter");
    expect(source).toContain("languageFromFilePath");
  });
});

describe("highlightLineSpans", () => {
  test("colors a typescript keyword after the shared highlighter warms up", async () => {
    const { getSyntaxHighlighter, highlightLineSpans } = await import(
      "@/lib/syntax-highlight"
    );
    await getSyntaxHighlighter();
    const spans = highlightLineSpans("const x = 1", "typescript", "stave-code-dark");
    expect(spans.some((span) => span.text.includes("const") && span.color)).toBe(
      true,
    );
    expect(spans.reduce((acc, span) => acc + span.text, "")).toBe("const x = 1");
  });
});

describe("languageFromFilePath", () => {
  test("maps common code extensions and ignores unknown ones", () => {
    expect(languageFromFilePath("src/app.tsx")).toBe("tsx");
    expect(languageFromFilePath("lib/util.ts")).toBe("typescript");
    expect(languageFromFilePath("notes.md")).toBe("markdown");
    expect(languageFromFilePath("README")).toBeUndefined();
    expect(languageFromFilePath("image.png")).toBeUndefined();
  });
});
