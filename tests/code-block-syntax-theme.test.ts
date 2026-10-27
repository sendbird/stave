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
import { buildCustomThemeCss } from "../src/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "../src/lib/themes/builtin-themes";
import {
  contrastRatio,
  oklabToOklch,
  parseCssColor,
} from "../src/lib/themes/contrast";
import {
  CODE_SYNTAX_COLORS,
  deriveSyntaxColorTokens,
  fitSyntaxColor,
  SYNTAX_TEXT_FLOOR,
  syntaxColorVariable,
} from "../src/lib/themes/syntax-contrast";

const globalsCss = readFileSync(
  join(import.meta.dir, "../src/globals.css"),
  "utf8",
);

/** `--editor` as declared in the `:root` or `.dark` block of globals.css. */
function editorSurfaceValue(block: ":root" | ".dark") {
  const start = globalsCss.indexOf(`\n${block} {`);
  expect(start).toBeGreaterThan(-1);
  const body = globalsCss.slice(start, globalsCss.indexOf("\n}", start));
  const match = body.match(/\n\s*--editor:\s*([^;]+);/);
  expect(match).not.toBeNull();
  return match![1]!.trim();
}

function editorSurface(block: ":root" | ".dark") {
  const color = parseCssColor(editorSurfaceValue(block));
  expect(color).not.toBeNull();
  return color!;
}

/**
 * Every foreground a palette can emit. The highlighter does not paint token
 * backgrounds, so rules that declare one are drawn on the code surface too.
 */
function paletteColors(theme: ThemeRegistrationRaw) {
  const colors = new Set<string>();
  for (const rule of theme.tokenColors ?? []) {
    if (rule.settings?.foreground) colors.add(rule.settings.foreground.toLowerCase());
  }
  const fg = theme.colors?.["editor.foreground"];
  if (fg) colors.add(fg.toLowerCase());
  return [...colors].sort();
}

const PALETTES = {
  light: CODE_THEME_LIGHT_REGISTRATION,
  dark: CODE_THEME_DARK_REGISTRATION,
} as const;

describe("code syntax palettes", () => {
  test("the runtime color list is every color the palettes emit", () => {
    expect([...CODE_SYNTAX_COLORS.light].sort()).toEqual(paletteColors(PALETTES.light));
    expect([...CODE_SYNTAX_COLORS.dark].sort()).toEqual(paletteColors(PALETTES.dark));
  });

  for (const [mode, block] of [["light", ":root"], ["dark", ".dark"]] as const) {
    test(`every ${mode} color reaches ${SYNTAX_TEXT_FLOOR}:1 on Stave's default ${mode} code surface`, () => {
      const surface = editorSurface(block);
      const failures = paletteColors(PALETTES[mode])
        .map((color) => ({ color, ratio: contrastRatio(parseCssColor(color)!, surface) }))
        .filter(({ ratio }) => ratio < SYNTAX_TEXT_FLOOR);
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
      // Hue is not meaningful for near-grays; there only lightness matters.
      if (before.c > 0.02) expect(Math.abs(after.h - before.h)).toBeLessThan(1);
      expect(Math.abs(after.l - before.l)).toBeGreaterThan(0.005);
    }
  });

  test("the source colors were below the floor, so each replacement is needed", () => {
    const light = editorSurface(":root");
    const dark = editorSurface(".dark");
    for (const source of Object.keys(SYNTAX_COLOR_ADJUSTMENTS.light)) {
      expect(contrastRatio(parseCssColor(source)!, light)).toBeLessThan(SYNTAX_TEXT_FLOOR);
    }
    for (const source of Object.keys(SYNTAX_COLOR_ADJUSTMENTS.dark)) {
      expect(contrastRatio(parseCssColor(source)!, dark)).toBeLessThan(SYNTAX_TEXT_FLOOR);
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

describe("syntax colors on each theme's code surface", () => {
  test("covers every built-in theme in both modes", () => {
    const modes = new Set(BUILTIN_CUSTOM_THEMES.map((theme) => theme.baseMode));
    expect(modes).toEqual(new Set(["light", "dark"]));
    for (const theme of BUILTIN_CUSTOM_THEMES) {
      expect(parseCssColor(theme.tokens.editor ?? "")).not.toBeNull();
    }
  });

  for (const theme of BUILTIN_CUSTOM_THEMES) {
    test(`${theme.id}: every ${theme.baseMode} palette color reaches ${SYNTAX_TEXT_FLOOR}:1`, () => {
      const mode = theme.baseMode;
      const surface = parseCssColor(theme.tokens.editor!)!;
      const css = buildCustomThemeCss({ theme });
      const failures: string[] = [];
      for (const color of CODE_SYNTAX_COLORS[mode]) {
        // What the theme's stylesheet actually publishes for this color.
        const declared = css.match(
          new RegExp(`${syntaxColorVariable(mode, color)}: ([^;]+);`),
        )?.[1];
        const painted = declared ?? color;
        const ratio = contrastRatio(parseCssColor(painted)!, surface);
        if (ratio < SYNTAX_TEXT_FLOOR) failures.push(`${color} -> ${painted}: ${ratio.toFixed(2)}`);
      }
      expect(failures).toEqual([]);
    });
  }

  test("a fitted color keeps its hue and moves away from the surface", () => {
    const lotus = parseCssColor("#f2ecbc")!;
    const fitted = fitSyntaxColor("#22863a", lotus);
    expect(contrastRatio(parseCssColor("#22863a")!, lotus)).toBeLessThan(SYNTAX_TEXT_FLOOR);
    expect(contrastRatio(parseCssColor(fitted)!, lotus)).toBeGreaterThanOrEqual(SYNTAX_TEXT_FLOOR);
    const before = oklabToOklch(parseCssColor("#22863a")!);
    const after = oklabToOklch(parseCssColor(fitted)!);
    expect(Math.abs(after.h - before.h)).toBeLessThan(2);
    expect(after.l).toBeLessThan(before.l);
    // A color that already passes is left alone.
    expect(fitSyntaxColor("#24292e", lotus)).toBe("#24292e");
  });

  test("a user theme gets replacements for its own code surface", () => {
    const css = buildCustomThemeCss({
      theme: {
        id: "user-parchment",
        name: "Parchment",
        description: "",
        baseMode: "light",
        tokens: { editor: "#e8e2b0" },
      },
    });
    const surface = parseCssColor("#e8e2b0")!;
    for (const color of CODE_SYNTAX_COLORS.light) {
      const declared = css.match(new RegExp(`${syntaxColorVariable("light", color)}: ([^;]+);`))?.[1];
      const ratio = contrastRatio(parseCssColor(declared ?? color)!, surface);
      expect(ratio).toBeGreaterThanOrEqual(SYNTAX_TEXT_FLOOR);
    }
    expect(css).not.toContain("--stave-syntax-dark-");
  });

  test("unparseable surfaces publish nothing", () => {
    expect(deriveSyntaxColorTokens({ mode: "light", editor: "var(--x)" })).toEqual({});
    expect(deriveSyntaxColorTokens({ mode: "light", editor: undefined })).toEqual({});
  });
});

describe("code block theme selection", () => {
  test("diffs pick the palette for the app mode", () => {
    expect(syntaxThemeFor(false)).toBe(CODE_THEME_LIGHT);
    expect(syntaxThemeFor(true)).toBe(CODE_THEME_DARK);
  });

  test("per-line diff spans are cached per palette and use the theme's replacements", async () => {
    await getSyntaxHighlighter();
    const keyword = (theme: ReturnType<typeof syntaxThemeFor>) =>
      highlightLineSpans("const value = 1", "typescript", theme)
        .find((span) => span.text.trim() === "const")
        ?.color?.toLowerCase();
    expect(keyword(CODE_THEME_LIGHT)).toBe("var(--stave-syntax-light-d13847,#d13847)");
    expect(keyword(CODE_THEME_DARK)).toBe("var(--stave-syntax-dark-f97583,#f97583)");
    // Asking again after the other mode still returns the right palette.
    expect(keyword(CODE_THEME_LIGHT)).toBe("var(--stave-syntax-light-d13847,#d13847)");
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
    expect(html).toContain(
      "--shiki-light:var(--stave-syntax-light-d13847,#D13847);--shiki-dark:var(--stave-syntax-dark-f97583,#F97583)",
    );
    expect(html).toContain("--shiki-dark:var(--stave-syntax-dark-8b949e,#8B949E)");
    // Every token color goes through a theme replacement variable.
    expect(html).not.toMatch(/--shiki-(?:light|dark):#/);
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
      expect(html).toContain(
        "--shiki-light:var(--stave-syntax-light-d13847,#D13847);--shiki-dark:var(--stave-syntax-dark-f97583,#F97583)",
      );
      expect(html).not.toMatch(/[";]color:#/);
    } finally {
      worker.terminate();
    }
  }, 20_000);
});
