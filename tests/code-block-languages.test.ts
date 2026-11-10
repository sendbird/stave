import { describe, expect, test } from "bun:test";
import { resolveCodeBlockLanguage } from "../src/components/ai-elements/code-block-language";
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
});
