import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * `src/globals.css` is now plain CSS: the Tailwind build plugin and dependency
 * are gone, so any Tailwind-only authoring directive left in the sheet would
 * ship raw into the bundle and be silently dropped by the browser.
 *
 * App motion itself no longer lives here — it is authored as local
 * `stylex.keyframes` inside the owning `*.styles.ts` module — so this file no
 * longer asserts a list of `.animate-*` classes. What it guards instead:
 *
 *  - No Tailwind-only authoring construct (`@utility`, `@apply`,
 *    `@custom-variant`, `@theme`, `@source`, `@plugin`, the `theme()`
 *    function, or the `tailwindcss` / `tw-animate-css` / `shadcn` imports)
 *    survives in the app stylesheet.
 *  - Every animation the sheet still references resolves to a `@keyframes`
 *    that exists, so a global rule can never animate a missing name.
 *  - Every `@keyframes` the sheet still defines has a real consumer, so the
 *    dead-code pile the migration cleared cannot quietly grow back.
 *  - The canonical cascade layer order is declared ahead of `@import`, byte
 *    identical to the `#stave-style-layers` block in `index.html`.
 */

const ROOT = join(import.meta.dir, "..");
const CSS_PATH = join(ROOT, "src", "globals.css");
const css = readFileSync(CSS_PATH, "utf8");
const html = readFileSync(join(ROOT, "index.html"), "utf8");

/** Strip CSS block comments so historical mentions in prose never match. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

const code = stripComments(css);

/** `animation:` values that name a behaviour rather than a `@keyframes`. */
const ANIMATION_KEYWORDS = new Set([
  "none",
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);

function definedKeyframes(source: string): Set<string> {
  return new Set(
    [...source.matchAll(/@keyframes\s+([a-zA-Z0-9_-]+)/g)].map(
      (match) => match[1]!,
    ),
  );
}

/**
 * Names referenced by `animation:` / `animation-name:` declarations. The
 * shorthand puts the name first in every declaration this sheet authors, so
 * the leading identifier is the reference unless it is a bare keyword.
 */
function referencedKeyframes(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(
    /animation(?:-name)?:\s*([a-zA-Z0-9_-]+)/g,
  )) {
    const name = match[1]!;
    if (!ANIMATION_KEYWORDS.has(name)) names.add(name);
  }
  return names;
}

/** Global `@keyframes` names StyleX modules reach by string literal. */
function sourceAnimationNames(): Set<string> {
  const names = new Set<string>();
  for (const relative of readdirSync(join(ROOT, "src"), { recursive: true })) {
    const path = String(relative);
    if (!/\.(ts|tsx|css)$/.test(path) || path === "globals.css") continue;
    const source = readFileSync(join(ROOT, "src", path), "utf8");
    for (const match of source.matchAll(
      /animationName:\s*["'`]([a-zA-Z0-9_-]+)["'`]/g,
    )) {
      names.add(match[1]!);
    }
    for (const match of source.matchAll(
      /animation(?:-name)?:\s*([a-zA-Z0-9_-]+)/g,
    )) {
      const name = match[1]!;
      if (!ANIMATION_KEYWORDS.has(name)) names.add(name);
    }
  }
  return names;
}

describe("globals.css is plain CSS", () => {
  it("contains no Tailwind-only authoring constructs", () => {
    const forbidden = [
      /@utility\b/,
      /@apply\b/,
      /@custom-variant\b/,
      /@theme\b/,
      /@variant\b/,
      /@source\b/,
      /@plugin\b/,
      /@config\b/,
      /\btheme\(/,
      /@import\s+["']tailwindcss["']/,
      /@import\s+["']tw-animate-css["']/,
      /@import\s+["']shadcn\//,
    ];
    const offenders = forbidden
      .filter((pattern) => pattern.test(code))
      .map((pattern) => pattern.source);
    expect(offenders).toEqual([]);
  });

  it("declares the canonical layer order ahead of every @import", () => {
    const layerOrder = /@layer reset, theme, base, priority1[^;]+;/;
    const fromHtml = html.match(layerOrder)?.[0];
    expect(fromHtml).toBeTruthy();
    expect(code.match(layerOrder)?.[0]).toBe(fromHtml!);

    // A name-only `@layer` statement is the one at-rule the spec allows before
    // `@import`; placing it after the imports would append these layers behind
    // whatever the imported sheets declare and invert the intended order.
    const statementIndex = code.indexOf(fromHtml!);
    const firstImport = code.indexOf("@import");
    expect(statementIndex).toBeGreaterThanOrEqual(0);
    expect(firstImport).toBeGreaterThan(statementIndex);
  });
});

describe("global keyframes", () => {
  it("resolves every animation the stylesheet references", () => {
    const defined = definedKeyframes(code);
    const missing = [...referencedKeyframes(code)].filter(
      (name) => !defined.has(name),
    );
    expect(missing).toEqual([]);
  });

  it("keeps a consumer for every keyframes it still defines", () => {
    const consumed = new Set([
      ...referencedKeyframes(code),
      ...sourceAnimationNames(),
    ]);
    const orphaned = [...definedKeyframes(code)].filter(
      (name) => !consumed.has(name),
    );
    expect(orphaned).toEqual([]);
  });
});
