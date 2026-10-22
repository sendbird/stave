import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dir, "..");
const globals = readFileSync(path.join(root, "src/globals.css"), "utf8");

/** Every renderer source except the stylesheet's own declarations. */
function rendererSources(): string {
  const parts: string[] = [];
  for (const file of new Glob("src/**/*.{ts,tsx,css}").scanSync({ cwd: root })) {
    const text = readFileSync(path.join(root, file), "utf8");
    parts.push(file === "src/globals.css" ? text.replace(/^\s*--[a-z0-9-]+:.*$/gm, "") : text);
  }
  return parts.join("\n");
}

describe("globals.css token layer", () => {
  test("keeps no Tailwind-era color aliases or radius scale", () => {
    expect(globals.match(/^\s*--color-[a-z0-9-]+:/gm) ?? []).toEqual([]);
    expect(globals.match(/^\s*--radius-[a-z0-9-]+:/gm) ?? []).toEqual([]);
  });

  test("every font property the layer defines is read somewhere", () => {
    const start = globals.indexOf(" * Font custom properties.");
    expect(start).toBeGreaterThan(-1);
    const block = globals.slice(globals.indexOf(":root {", start), globals.indexOf("\n}", start));
    const defined = [...block.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((match) => match[1]!);
    expect(defined).toEqual(["--font-sans", "--font-mono", "--font-heading"]);
    const sources = rendererSources();
    for (const name of defined) expect(sources).toContain(`var(${name}`);
  });
});
