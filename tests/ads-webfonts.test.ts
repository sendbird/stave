import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, test } from "bun:test";

const require = createRequire(import.meta.url);

describe("ADS webfonts", () => {
  test("fonts.css package imports resolve on disk", () => {
    const css = readFileSync(
      new URL("../src/components/ads/fonts.css", import.meta.url),
      "utf8",
    );
    const imports = [...css.matchAll(/@import\s+"([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(imports.length).toBeGreaterThan(0);
    for (const spec of imports) {
      expect(existsSync(require.resolve(spec))).toBe(true);
    }
  });
});
