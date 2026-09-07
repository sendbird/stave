import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { buildFontStacks } from "@/lib/themes/apply";

const read = (relative: string) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

describe("app font setting", () => {
  const globals = read("src/globals.css");

  test("self-hosts every face", () => {
    // A remote sheet blocks first paint and, for Pretendard, shipped a build we
    // already have in `node_modules`.
    expect(globals).not.toContain("fonts.googleapis.com");
    expect(globals).not.toContain("cdn.jsdelivr.net");
    expect(globals).toContain("@fontsource-variable/geist");
    expect(globals).toContain(
      'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css',
    );
  });

  test("puts Geist first with Pretendard covering Hangul", () => {
    const stack = globals.slice(globals.indexOf("--font-sans:"));
    const geist = stack.indexOf('"Geist Variable"');
    const pretendard = stack.indexOf('"Pretendard Variable"');
    expect(geist).toBeGreaterThanOrEqual(0);
    expect(pretendard).toBeGreaterThan(geist);
    // Geist carries no Hangul, so the Korean face must be one we ship rather
    // than whatever the reader's OS happens to have.
    expect(stack.indexOf("Pretendard,")).toBeGreaterThan(pretendard);
  });

  test("names the variable JetBrains build the ADS fonts.css actually loads", () => {
    const mono = globals.slice(globals.indexOf("--font-mono:"));
    expect(mono.indexOf('"JetBrains Mono Variable"')).toBeGreaterThanOrEqual(0);
  });

  test("keeps the geometry sheet for third-party glyphs wired up", () => {
    // It declares its own layers, so merely existing is not enough: composer
    // wing icons lose their fixed 16px box when it is not imported.
    expect(globals).toContain("./components/ui/content-integration.css");
  });

  test("the installed ADS copy names the same sans stack", () => {    // ADS components wear `vars.fontSans`, host CSS wears `--font-sans`. If the
    // two disagree, an ADS control and the shell around it render in different
    // typefaces on the same row.
    const tokens = read("src/components/ads/tokens/tokens.stylex.ts");
    const adsStack = tokens.slice(tokens.indexOf("fontSans:"));
    const geist = adsStack.indexOf('"Geist Variable"');
    expect(geist).toBeGreaterThanOrEqual(0);
    expect(adsStack.indexOf('"Pretendard Variable"')).toBeGreaterThan(geist);

    // `styles.css` repeats the stack verbatim on `:root` because StyleX hashes
    // the var name, so the repeat has to lead with Geist as well.
    const adsStyles = read("src/components/ads/styles.css");
    const rootCopy = adsStyles.slice(adsStyles.indexOf("font-family:\n"));
    expect(rootCopy.indexOf('"Geist Variable"')).toBeLessThan(
      rootCopy.indexOf("Pretendard,"),
    );

    // And the faces it names have to be the ones `fonts.css` actually loads.
    const fonts = read("src/components/ads/fonts.css");
    expect(fonts).toContain("@fontsource-variable/geist");
    expect(fonts).toContain(
      "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css",
    );
  });
});

describe("runtime font override", () => {
  const defaults = {
    messageFontFamily: "Geist Variable",
    messageMonoFontFamily: "JetBrains Mono",
    messageKoreanFontFamily: "Pretendard Variable",
  };

  test("keeps the shipped faces reachable behind the user's choice", () => {
    const { sans, mono } = buildFontStacks({
      ...defaults,
      messageFontFamily: "Helvetica Neue",
    });
    // The user's face leads; the shipped stack still backs it up, because these
    // land as inline styles on `<html>` and replace the `:root` stack outright.
    expect(sans.indexOf('"Helvetica Neue"')).toBe(0);
    expect(sans).toContain('"Pretendard Variable"');
    expect(sans.endsWith("sans-serif")).toBe(true);
    // The default mono SETTING says `JetBrains Mono`; the face `fonts.css`
    // loads is `JetBrains Mono Variable`. Without the tail, code text fell
    // through to the platform monospace.
    expect(mono).toContain('"JetBrains Mono Variable"');
  });

  test("states each family once", () => {
    const { sans } = buildFontStacks(defaults);
    const families = sans.split(", ");
    expect(new Set(families).size).toBe(families.length);
    expect(families[0]).toBe('"Geist Variable"');
    expect(families[1]).toBe('"Pretendard Variable"');
  });

  test("leaves generic keywords unquoted", () => {
    const { sans } = buildFontStacks(defaults);
    // Quoted, `-apple-system` and `system-ui` become family names that match
    // nothing at all.
    expect(sans).toContain("-apple-system");
    expect(sans).not.toContain('"-apple-system"');
    expect(sans).not.toContain('"system-ui"');
  });
});

describe("prompt editor box", () => {
  test("the editor and its placeholder share one font family", () => {
    const styles = read("src/components/ai-elements/prompt-input.styles.ts");
    const block = styles.slice(
      styles.indexOf("editorTypographyDefault:"),
      styles.indexOf("enhancementEditorInset:"),
    );
    // `promptEditorTypography.default` is what the placeholder wears too, so a
    // family stated here is a family both of them agree on.
    expect(block).toContain("fontFamily: vars.fontSans");
  });

  test("zeroes the Lexical paragraph so the caret starts on the placeholder line", () => {
    const styles = read(
      "src/components/ai-elements/prompt-lexical-editor.styles.ts",
    );
    const block = styles.slice(styles.indexOf("paragraph: {"));
    expect(block).toContain("margin: 0");
    expect(block).toContain("padding: 0");

    const editor = read("src/components/ai-elements/prompt-lexical-editor.tsx");
    // A theme entry is the only way the class reaches the `<p>` Lexical emits.
    expect(editor).toContain(
      "theme: { paragraph: PROMPT_LEXICAL_PARAGRAPH_CLASS }",
    );
  });
});

describe("composer wing icons", () => {
  test("every prompt-input glyph refuses to shrink", () => {
    const styles = read("src/components/ai-elements/prompt-input.styles.ts");
    for (const name of ["icon4", "icon3", "icon35", "icon35Shrink"]) {
      const line = styles
        .split("\n")
        .find((entry) => entry.trimStart().startsWith(`${name}: {`));
      expect(line).toBeDefined();
      // In a 3.75rem wing the row is narrower than icon + gap + label, so
      // without this the glyph, not the label, gives up its width.
      expect(line).toContain("flexShrink: 0");
    }
  });

  test("sizes glyphs off the ADS control ramp", () => {
    const styles = read("src/components/ai-elements/prompt-input.styles.ts");
    expect(styles).toContain("icon4: { width: vars.controlIconSizeMd");
    expect(styles).toContain("icon35: { width: vars.controlIconSizeSm");
  });

  test("hides a wing whose controls all declined to render", () => {
    const globals = read("src/globals.css");
    expect(globals).toContain(".composer-frame-wing:empty");
  });
});
