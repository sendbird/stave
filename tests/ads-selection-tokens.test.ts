import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/*
 * Stave's copy of the ADS selection contract.
 *
 * `::selection` can only be reached from plain CSS through a stable custom
 * property (StyleX hashes a `defineVars` key), and the pair used to be
 * per-`data-theme` blocks of oklch literals transcribed from the shipped
 * themes. That copy could never be right here: Stave maps the whole ADS color
 * group onto its own saved themes in `src/components/system/ads-theme.ts`, so
 * dragging across text painted the design system's ink — measured
 * `oklch(0.985 0.007 89)` on a workspace whose own `--foreground` is `#CCCAC2`
 * — no matter which theme or accent the user had chosen.
 *
 * Upstream now publishes the pair FROM `colorText`/`colorTextInverted` on the
 * theme provider, which is what makes it follow a Stave theme. Upstream guards
 * that arrangement in `scripts/lib/color-sourcing.mjs`; that script does not
 * run in this repository, so the installed copy is guarded here.
 */

const stylesCss = readFileSync("src/components/ads/styles.css", "utf8");
const themeProvider = readFileSync(
  "src/components/ads/components/ThemeProvider.tsx",
  "utf8",
);

describe("::selection follows theme tokens", () => {
  test("the rule reads the stable pair and nothing else", () => {
    const rule = stylesCss.match(/\n {2}::selection \{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule?.[1]).toContain("background: var(--ads-selection-background);");
    expect(rule?.[1]).toContain("color: var(--ads-selection-color);");
  });

  test("no theme hardcodes the pair back into the stylesheet", () => {
    const assignments = stylesCss.match(/--ads-selection-[a-z]+:\s*[^;]+;/g);
    expect(assignments).toBeNull();
  });

  test("both publishers assign it from the color tokens", () => {
    // The wrapper themes the React subtree; the `<html>` mirror is the only
    // ancestor a portaled dialog, menu or toast inherits from. A pair on one
    // and not the other means selecting text inside a dialog silently falls
    // back to the user agent's highlight.
    for (const rule of ["root", "documentSurface"]) {
      const block = themeProvider.match(
        new RegExp(`\\n {2}${rule}: \\{([\\s\\S]*?)\\n {2}\\},`),
      );
      expect(block, `nativeChromeStyles.${rule}`).not.toBeNull();
      expect(block?.[1]).toContain(
        '"--ads-selection-background": vars.colorText,',
      );
      expect(block?.[1]).toContain(
        '"--ads-selection-color": vars.colorTextInverted,',
      );
    }
  });
});
