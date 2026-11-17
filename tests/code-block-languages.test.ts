import { describe, expect, test } from "bun:test";
import { codeBlockLanguageLabel, resolveCodeBlockLanguage } from "../src/components/ai-elements/code-block-language";
import { chatTypeScale } from "../src/components/ai-elements/message-text-scale";
import { getSyntaxHighlighter } from "../src/lib/syntax-highlight";
import { CODE_BLOCK_PRE_TRANSFORMER, CODE_BLOCK_THEMES } from "../src/lib/syntax-highlight-shared";
import { TARS_GALLERY_CODE_LANGUAGES, TARS_GALLERY_CODE_SAMPLES, tarsGalleryCodeReply } from "../src/dev/tars-preview/tars-code-languages-fixture";

/** The languages a reply commonly carries; each must highlight, not fall back to plain text. */
const REQUIRED = ["ts", "tsx", "js", "json", "bash", "sh", "python", "go", "rust", "sql", "diff", "yaml", "markdown"];

describe("code block languages", () => {
  test("the gallery has a sample for every required language and alias", () => {
    for (const fence of REQUIRED) expect(TARS_GALLERY_CODE_LANGUAGES).toContain(fence);
    const reply = tarsGalleryCodeReply("Intro");
    for (const fence of TARS_GALLERY_CODE_LANGUAGES) expect(reply).toContain("```" + fence + "\n");
  });

  test("names without a grammar of their own resolve to the grammar they stand for; plain names stay plain", () => {
    expect(resolveCodeBlockLanguage("jsonc")).toBe("json");
    expect(resolveCodeBlockLanguage(" GoLang ")).toBe("go");
    expect(resolveCodeBlockLanguage("patch")).toBe("diff");
    expect(resolveCodeBlockLanguage("ts")).toBe("ts");
    expect(resolveCodeBlockLanguage("text")).toBeNull();
  });

  test("every sample is tokenized by its grammar in both palettes", async () => {
    const highlighter = await getSyntaxHighlighter();
    for (const [fence, code] of TARS_GALLERY_CODE_SAMPLES) {
      const lang = resolveCodeBlockLanguage(fence)!;
      const html = highlighter.codeToHtml(code, { lang, themes: CODE_BLOCK_THEMES, defaultColor: false, transformers: [CODE_BLOCK_PRE_TRANSFORMER] });
      // Plain text paints one color; a grammar splits the sample into several token colors.
      const light = new Set(html.match(/--shiki-light:[^;"]+/g) ?? []);
      const dark = new Set(html.match(/--shiki-dark:[^;"]+/g) ?? []);
      expect({ fence, light: light.size > 2, dark: dark.size > 2 }).toEqual({ fence, light: true, dark: true });
    }
  });

  test("a fence id shows as a readable language name where one is known, else as written", () => {
    expect(codeBlockLanguageLabel("golang")).toBe("Go");
    expect(codeBlockLanguageLabel("jsonc")).toBe("JSONC");
    expect(codeBlockLanguageLabel("sh")).toBe("Shell");
    expect(codeBlockLanguageLabel(" TS ")).toBe("TypeScript");
    expect(codeBlockLanguageLabel("hcl")).toBe("hcl");
  });

  test("a diff or patch fence marks its added and removed lines and nothing else; tabs are four columns", async () => {
    const highlighter = await getSyntaxHighlighter();
    const html = highlighter.codeToHtml("--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-old\n+new\n context", {
      lang: resolveCodeBlockLanguage("patch")!, themes: CODE_BLOCK_THEMES, defaultColor: false, transformers: [CODE_BLOCK_PRE_TRANSFORMER],
    });
    expect(html.match(/data-diff="add"/g)).toHaveLength(1);
    expect(html.match(/data-diff="remove"/g)).toHaveLength(1);
    expect(html).toContain("data-diff-block");
    expect(html).toContain("tab-size:4");
    const go = highlighter.codeToHtml("func main() {\n\treturn\n}", { lang: "go", themes: CODE_BLOCK_THEMES, defaultColor: false, transformers: [CODE_BLOCK_PRE_TRANSFORMER] });
    expect(go).toContain("tab-size:4");
    expect(go).not.toContain("data-diff");
  });
});

describe("chat type scale", () => {
  test("secondary and meta are one and two AUI steps below the body, in whole pixels", () => {
    expect(chatTypeScale(16)).toEqual({ body: 16, secondary: 14, meta: 12 });
    expect(chatTypeScale(20)).toEqual({ body: 20, secondary: 18, meta: 15 });
    expect(chatTypeScale(24)).toEqual({ body: 24, secondary: 21, meta: 18 });
  });
});
