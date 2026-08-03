import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Tailwind v4 only generates variant forms (`motion-safe:`, `hover:`, …) for
 * utilities it knows about. A hand-written `.animate-foo` rule inside
 * `@layer utilities` is *not* registered, so `motion-safe:animate-foo` compiles
 * to nothing at all and the animation silently never runs — which is exactly how
 * the agent trace motion shipped broken once. Custom animation utilities must be
 * declared with `@utility` instead.
 */

const CSS_PATH = join(import.meta.dir, "..", "src", "globals.css");
const css = readFileSync(CSS_PATH, "utf8");

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("custom animation utilities", () => {
  it("declares every animate-* utility with @utility, not inside @layer", () => {
    const layerBlocks = css.match(/@layer\s+utilities\s*\{[\s\S]*?\n\}/g) ?? [];
    const offenders = layerBlocks.flatMap((block) =>
      [...block.matchAll(/^\s*\.(animate-[a-z0-9-]+)\s*\{/gm)].map((match) => match[1]),
    );
    expect(offenders).toEqual([]);
  });

  it("registers every variant-prefixed animate-* class used in src", () => {
    const registered = new Set(
      [...css.matchAll(/@utility\s+(animate-[a-z0-9-]+)\s*\{/g)].map((match) => match[1]!),
    );
    /*
     * Registered by Tailwind core or by `tw-animate-css` as `--animate-*` theme
     * entries, so their variant forms are generated without a local `@utility`.
     */
    const builtin = new Set([
      "animate-spin",
      "animate-pulse",
      "animate-bounce",
      "animate-ping",
      "animate-in",
      "animate-out",
    ]);

    const missing = new Map<string, string[]>();
    for (const file of collectSourceFiles(join(import.meta.dir, "..", "src"))) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/[a-z-]+:(animate-[a-z0-9-]+)/g)) {
        const name = match[1]!;
        if (registered.has(name) || builtin.has(name)) continue;
        /* `animate-none` is a core utility, not a keyframe animation. */
        if (name === "animate-none") continue;
        const existing = missing.get(name) ?? [];
        existing.push(file.replace(`${join(import.meta.dir, "..")}/`, ""));
        missing.set(name, existing);
      }
    }

    expect(Object.fromEntries(missing)).toEqual({});
  });

  it("keeps a @keyframes definition for every declared animation utility", () => {
    const keyframes = new Set(
      [...css.matchAll(/@keyframes\s+([a-z0-9-]+)/g)].map((match) => match[1]!),
    );
    const missing: string[] = [];
    for (const match of css.matchAll(/@utility\s+animate-[a-z0-9-]+\s*\{([^}]*)\}/g)) {
      const body = match[1]!;
      const name = body.match(/animation:\s*([a-z0-9-]+)/)?.[1];
      if (name && !keyframes.has(name)) {
        missing.push(name);
      }
    }
    expect(missing).toEqual([]);
  });
});
