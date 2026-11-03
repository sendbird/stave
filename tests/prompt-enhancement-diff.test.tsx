import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PromptEnhancementDiffBody } from "@/components/session/prompt-enhancement-diff";

describe("PromptEnhancementDiffBody", () => {
  test("marks removed and added words with del/ins and a spoken marker, not colour alone", () => {
    const html = renderToStaticMarkup(
      createElement(PromptEnhancementDiffBody, {
        sourceText: "fix the bug in login",
        enhancedPrompt: "Fix the login redirect bug",
      }),
    );
    expect(html).toContain("Removed words: 3 · Added words: 3");
    expect(html).toContain("Removed words are struck through; added words are underlined.");
    expect(html).toMatch(/<del[^>]*><span[^>]*>Removed: <\/span>fix<\/del>/);
    expect(html).toMatch(/<ins[^>]*><span[^>]*>Added: <\/span>Fix<\/ins>/);
    // The diff box is a labelled region that scrolls, not a live log.
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Word changes"');
    expect(html).not.toContain('role="log"');
  });
});
