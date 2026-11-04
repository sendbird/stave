import { expect, test } from "bun:test";
import { resolveCodeBlockLanguage } from "../src/components/ai-elements/code-block-language";
import { composerFontSize } from "../src/components/ai-elements/prompt-input-text-size";

test("plain fences bypass syntax grammars", () => {
  for (const language of [undefined, "", "text", "plaintext", "plain", "txt", " TEXT "]) {
    expect(resolveCodeBlockLanguage(language)).toBeNull();
  }
  expect(resolveCodeBlockLanguage(" TypeScript ")).toBe("typescript");
});

test("composer follows reader size, panel cap and proportional mono size", () => {
  for (const size of [12, 16, 20, 24]) {
    for (const scale of ["conversation", "panel"] as const) {
      const effective = scale === "panel" ? Math.min(size, 14) : size;
      expect(composerFontSize(scale, size, false)).toBe(effective);
      expect(composerFontSize(scale, size, true)).toBe(effective * 15 / 16);
    }
  }
});
