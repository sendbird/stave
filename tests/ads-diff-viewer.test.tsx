import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { DiffViewer } from "@/components/ads/components/DiffViewer";
import {
  diffLines,
  splitLines,
  annotateWordDiff,
  toSplitRows,
  planCollapse,
} from "@/components/ads/components/DiffViewer.diff";

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

  test("context collapses long unchanged runs behind an Expand affordance", () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    const after = before.replace("line 10", "line 10 changed");
    const html = renderToStaticMarkup(
      createElement(DiffViewer, { before, after, context: 2 }),
    );
    expect(html).toContain("Expand");
    expect(html).toContain("unchanged");
  });

  test("the port authors styles with StyleX tokens, not utility strings", () => {
    const source = read("src/components/ads/components/DiffViewer.tsx");
    expect(source).toContain('from "@stylexjs/stylex"');
    expect(source).toContain("vars.colorSuccessSoft");
    expect(source).toContain("vars.colorDangerSoft");
    // Ported to the installed layout: recipes in ../recipes, tokens in
    // ../tokens, utils in ../utils.
    expect(source).toContain('from "../recipes/focus-ring"');
    expect(source).toContain('from "../tokens/tokens.stylex"');
    expect(source).toContain('from "../utils/stylex"');
    // The upstream `xstyle`/`XstyleProp` escape hatch is not part of the
    // installed `utils/stylex`, so it must not be imported or used here.
    expect(source).not.toContain("type XstyleProp");
    expect(source).not.toContain("& XstyleProp");
    expect(source).not.toContain("sx(styles.root, xstyle)");
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
  });
});
