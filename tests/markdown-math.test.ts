import { describe, expect, test } from "bun:test";
import { escapeNonMathDollars, prepareMarkdownMath } from "@/lib/markdown/math";

describe("prepareMarkdownMath", () => {
  test("text without a dollar sign is returned as is", () => {
    const text = "No math here.\n\n- just a list";
    expect(prepareMarkdownMath(text)).toBe(text);
  });

  test("prices and shell variables stay words", () => {
    expect(escapeNonMathDollars("Costs $5 and $10 total")).toBe("Costs \\$5 and \\$10 total");
    expect(escapeNonMathDollars("between $1,000-$2,000")).toBe("between \\$1,000-\\$2,000");
    expect(escapeNonMathDollars("Use $HOME/$USER")).toBe("Use \\$HOME/\\$USER");
    expect(escapeNonMathDollars("PATH=$HOME/bin:$PATH")).toBe("PATH=\\$HOME/bin:\\$PATH");
  });

  test("inline math stays math next to a price", () => {
    expect(escapeNonMathDollars("pay $5 for $x^2$ and $y$.")).toBe("pay \\$5 for $x^2$ and $y$.");
    expect(escapeNonMathDollars("the $n$-th term")).toBe("the $n$-th term");
    expect(escapeNonMathDollars("inline $$a+b$$ display")).toBe("inline $$a+b$$ display");
  });

  test("code spans, escaped dollars and URLs are left alone", () => {
    expect(escapeNonMathDollars("run `echo $HOME` now $x$")).toBe("run `echo $HOME` now $x$");
    expect(escapeNonMathDollars("already \\$5")).toBe("already \\$5");
    expect(escapeNonMathDollars("see https://example.com/?q=$a and $5")).toBe(
      "see https://example.com/?q=$a and \\$5",
    );
  });

  test("a one-line or multi-line $$ block gets $$ lines of its own", () => {
    expect(prepareMarkdownMath("$$E = mc^2$$")).toBe("$$\nE = mc^2\n$$");
    expect(prepareMarkdownMath("$$\\frac{a}{b}\n+ c$$")).toBe("$$\n\\frac{a}{b}\n+ c\n$$");
    expect(prepareMarkdownMath("$$\nx^2\n$$")).toBe("$$\nx^2\n$$");
    expect(prepareMarkdownMath("> $$x$$")).toBe("> $$\n> x\n> $$");
  });

  test("an unclosed $$ stays text instead of swallowing the reply", () => {
    expect(prepareMarkdownMath("total $$\nnext line")).toBe("total \\$\\$\nnext line");
    expect(prepareMarkdownMath("$$\nx^2")).toBe("\\$\\$\nx^2");
  });

  test("fenced code keeps its dollars", () => {
    const text = "```sh\necho $5 $HOME\n```\nafter $5";
    expect(prepareMarkdownMath(text)).toBe("```sh\necho $5 $HOME\n```\nafter \\$5");
  });
});
