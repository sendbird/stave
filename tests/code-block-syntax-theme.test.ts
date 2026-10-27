import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import githubDark from "shiki/themes/github-dark.mjs";
import githubLight from "shiki/themes/github-light.mjs";
import type { ThemeRegistrationRaw } from "shiki/core";
import {
  getSyntaxHighlighter,
  highlightLineSpans,
  syntaxThemeFor,
} from "../src/lib/syntax-highlight";
import {
  CODE_BLOCK_PRE_CLASS,
  CODE_BLOCK_PRE_TRANSFORMER,
  CODE_BLOCK_THEMES,
  CODE_THEME_DARK,
  CODE_THEME_LIGHT,
  type CodeBlockHighlightResponse,
} from "../src/lib/syntax-highlight-shared";
import {
  CODE_THEME_DARK_REGISTRATION,
  CODE_THEME_LIGHT_REGISTRATION,
  SYNTAX_COLOR_ADJUSTMENTS,
} from "../src/lib/syntax-themes";
import {
  contrastRatio,
  oklabToOklch,
  parseCssColor,
} from "../src/lib/themes/contrast";

const globalsCss = readFileSync(
  join(import.meta.dir, "../src/globals.css"),
  "utf8",
);

/** `--editor` as declared in the `:root` or `.dark` block of globals.css. */
function editorSurface(block: ":root" | ".dark") {
  const start = globalsCss.indexOf(`\n${block} {`);
  expect(start).toBeGreaterThan(-1);
  const body = globalsCss.slice(start, globalsCss.indexOf("\n}", start));
  const match = body.match(/\n\s*--editor:\s*([^;]+);/);
  expect(match).not.toBeNull();
  const color = parseCssColor(match![1]);
  expect(color).not.toBeNull();
  return color!;
}

/**
 * Token colors drawn on the code surface. Rules that paint their own
 * background (carriage returns, ignored markup) are measured against that
 * background by the source theme, not against the code surface.
 */
function surfaceTokenColors(theme: ThemeRegistrationRaw) {
  const colors = new Set<string>();
  for (const rule of theme.tokenColors ?? []) {
    if (!rule.settings?.foreground || rule.settings.background) continue;
    colors.add(rule.settings.foreground.toLowerCase());
  }
  const fg = theme.colors?.["editor.foreground"];
  if (fg) colors.add(fg.toLowerCase());
  return [...colors];
}

const MIN_TEXT_CONTRAST = 4.5;

describe("code syntax palettes", () => {
  const cases = [
    { mode: "light", theme: CODE_THEME_LIGHT_REGISTRATION, surface: editorSurface(":root") },
    { mode: "dark", theme: CODE_THEME_DARK_REGISTRATION, surface: editorSurface(".dark") },
  ] as const;

  for (const { mode, theme, surface } of cases) {
    test(`every ${mode} token color reaches ${MIN_TEXT_CONTRAST}:1 on the ${mode} code surface`, () => {
      const failures = surfaceTokenColors(theme)
        .map((color) => ({
          color,
          ratio: contrastRatio(parseCssColor(color)!, surface),
        }))
        .filter(({ ratio }) => ratio < MIN_TEXT_CONTRAST);
      expect(failures).toEqual([]);
    });
  }

  test("the adjusted colors keep their hue and only change lightness", () => {
    for (const [source, replacement] of [
      ...Object.entries(SYNTAX_COLOR_ADJUSTMENTS.light),
      ...Object.entries(SYNTAX_COLOR_ADJUSTMENTS.dark),
    ]) {
      const before = oklabToOklch(parseCssColor(source)!);
      const after = oklabToOklch(parseCssColor(replacement)!);
      expect(Math.abs(after.h - before.h)).toBeLessThan(1);
      expect(Math.abs(after.l - before.l)).toBeGreaterThan(0.005);
    }
  });

  test("the source colors were below the floor, so each replacement is needed", () => {
    const light = editorSurface(":root");
    const dark = editorSurface(".dark");
    for (const source of Object.keys(SYNTAX_COLOR_ADJUSTMENTS.light)) {
      expect(contrastRatio(parseCssColor(source)!, light)).toBeLessThan(MIN_TEXT_CONTRAST);
    }
    for (const source of Object.keys(SYNTAX_COLOR_ADJUSTMENTS.dark)) {
      expect(contrastRatio(parseCssColor(source)!, dark)).toBeLessThan(MIN_TEXT_CONTRAST);
    }
  });

  // Compared as color sets, not rule by rule: Shiki normalizes a registered
  // theme in place (it prepends a global rule), so rule indexes shift once any
  // highlighter in the process has loaded the bundled theme.
  test("only the listed colors differ from the bundled themes", () => {
    const foregrounds = (theme: ThemeRegistrationRaw) =>
      new Set(
        (theme.tokenColors ?? []).flatMap((rule) =>
          rule.settings?.foreground ? [rule.settings.foreground.toLowerCase()] : [],
        ),
      );
    const difference = (a: Set<string>, b: Set<string>) =>
      [...a].filter((color) => !b.has(color)).sort();
    for (const [source, adjusted, replacements] of [
      [githubLight, CODE_THEME_LIGHT_REGISTRATION, SYNTAX_COLOR_ADJUSTMENTS.light],
      [githubDark, CODE_THEME_DARK_REGISTRATION, SYNTAX_COLOR_ADJUSTMENTS.dark],
    ] as const) {
      const before = foregrounds(source);
      const after = foregrounds(adjusted);
      expect(difference(before, after)).toEqual(Object.keys(replacements).sort());
      expect(difference(after, before)).toEqual(Object.values(replacements).sort());
    }
  });
});

describe("code block theme selection", () => {
  test("diffs pick the palette for the app mode", () => {
    expect(syntaxThemeFor(false)).toBe(CODE_THEME_LIGHT);
    expect(syntaxThemeFor(true)).toBe(CODE_THEME_DARK);
  });

  test("per-line diff spans are cached per palette", async () => {
    await getSyntaxHighlighter();
    const keyword = (theme: ReturnType<typeof syntaxThemeFor>) =>
      highlightLineSpans("const value = 1", "typescript", theme).find(
        (span) => span.text.trim() === "const",
      )?.color;
    expect(keyword(CODE_THEME_LIGHT)?.toLowerCase()).toBe("#d13847");
    expect(keyword(CODE_THEME_DARK)?.toLowerCase()).toBe("#f97583");
    // Asking again after the other mode still returns the right palette.
    expect(keyword(CODE_THEME_LIGHT)?.toLowerCase()).toBe("#d13847");
  });

  test("one code block HTML carries both palettes and paints the theme's code surface", async () => {
    const highlighter = await getSyntaxHighlighter();
    const html = highlighter.codeToHtml("// note\nconst value = 1", {
      lang: "typescript",
      themes: CODE_BLOCK_THEMES,
      defaultColor: false,
      transformers: [CODE_BLOCK_PRE_TRANSFORMER],
    });
    expect(html).toContain(CODE_BLOCK_PRE_CLASS);
    expect(html).toContain("background-color:var(--editor)");
    expect(html).toContain("--shiki-light:#D13847;--shiki-dark:#F97583");
    expect(html).toContain("--shiki-dark:#8B949E");
    // No mode is baked in, so a cache keyed by language and source is safe
    // across light/dark switches.
    expect(html).not.toMatch(/[";]color:#/);
  });

  test("globals.css resolves the token colors from the app's dark class", () => {
    expect(globalsCss).toMatch(/\.stave-code-block span \{\s*color: var\(--shiki-light\);/);
    expect(globalsCss).toMatch(/\.dark \.stave-code-block span \{\s*color: var\(--shiki-dark\);/);
  });

  test("the worker returns the same dual-palette HTML", async () => {
    const worker = new Worker(
      new URL("../src/lib/syntax-highlight.worker.ts", import.meta.url),
      { type: "module" },
    );
    try {
      const response = await new Promise<CodeBlockHighlightResponse>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<CodeBlockHighlightResponse>) => resolve(event.data);
        worker.onerror = (event) => reject(new Error(String(event.message)));
        worker.postMessage({ id: 7, code: "const value = 1", lang: "ts" });
      });
      expect(response.id).toBe(7);
      expect("html" in response).toBe(true);
      const html = "html" in response ? response.html : "";
      expect(html).toContain(CODE_BLOCK_PRE_CLASS);
      expect(html).toContain("--shiki-light:#D13847;--shiki-dark:#F97583");
      expect(html).not.toMatch(/[";]color:#/);
    } finally {
      worker.terminate();
    }
  }, 20_000);
});
