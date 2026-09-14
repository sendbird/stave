import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as stylex from "@stylexjs/stylex";

import { ThemeProvider } from "@/components/ads/components/ThemeProvider";
import { PortalProductThemeScope } from "@/components/ads/theming/ProductThemeProvider";
import { adsThemeVariables } from "@/components/system/ads-theme";
import { darkTheme, lightTheme } from "@/components/ads/tokens/themes.stylex";

/**
 * `PortalProductThemeScope` wraps every ADS surface that leaves its provider's
 * DOM subtree through a portal — dialogs, menus, popovers, drawers, selects,
 * tooltips. Upstream re-applies the mode and density token groups there,
 * because it supports a provider scoped to a REGION, and a portal is exactly
 * where the React tree and the DOM tree disagree about where a node lives.
 *
 * This host cannot take that behaviour as written. It mounts one
 * `ThemeProvider` at the root with `syncDocument`, so the token group is
 * already on `document.documentElement`; `StaveDesignProvider` then publishes
 * the host's own palette mapping (`--ads-color-*` -> `var(--background)` and
 * friends) over it as INLINE custom properties on `<html>`. A declaration on a
 * closer element outranks an inherited value, so re-applying `lightTheme` on
 * the portal wrapper would replace the user's saved Stave theme with the design
 * system's stock palette inside every overlay in the product.
 *
 * The vendored copy therefore applies those groups only when a product brand is
 * actually scoped. Nothing mounts `ProductThemeProvider` today, so the case that
 * matters is the unbranded one: these assertions fail if a future ADS re-sync
 * silently restores the unconditional form.
 */

/** The atomic classes a `createTheme` group contributes, as a Set. */
function themeClasses(theme: Parameters<typeof stylex.props>[0]) {
  const { className } = stylex.props(theme);
  return new Set((className ?? "").split(/\s+/).filter(Boolean));
}

/** Class list of the innermost rendered element — the portal scope wrapper. */
function innermostClasses(html: string) {
  const opens = [...html.matchAll(/<div class="([^"]*)"/g)];
  const last = opens.at(-1);
  return new Set((last?.[1] ?? "").split(/\s+/).filter(Boolean));
}

describe("PortalProductThemeScope", () => {
  test("does not re-declare the ADS token group when no brand is scoped", () => {
    const html = renderToStaticMarkup(
      createElement(
        ThemeProvider,
        { theme: "light" },
        createElement(PortalProductThemeScope, null, "portalled"),
      ),
    );
    expect(html).toContain("portalled");

    const scope = innermostClasses(html);
    const light = themeClasses(lightTheme);
    expect(light.size).toBeGreaterThan(0);
    const leaked = [...light].filter((c) => scope.has(c));
    expect(leaked).toEqual([]);
  });

  test("does not re-declare the density group either", () => {
    const html = renderToStaticMarkup(
      createElement(
        ThemeProvider,
        { theme: "dark", density: "compact" },
        createElement(PortalProductThemeScope, null, "portalled"),
      ),
    );

    const scope = innermostClasses(html);
    const dark = themeClasses(darkTheme);
    expect([...dark].filter((c) => scope.has(c))).toEqual([]);
  });

  test("still re-establishes mode and density as attributes across the portal", () => {
    const html = renderToStaticMarkup(
      createElement(
        ThemeProvider,
        { theme: "dark", density: "compact" },
        createElement(PortalProductThemeScope, null, "portalled"),
      ),
    );

    // Attributes are what a portalled subtree genuinely cannot inherit through
    // a React boundary, and unlike the token classes they declare no custom
    // property, so they cannot shadow the host mapping.
    const wrapper = [...html.matchAll(/<div [^>]*>/g)].at(-1)?.[0] ?? "";
    expect(wrapper).toContain('data-theme="dark"');
    expect(wrapper).toContain('data-density="compact"');
    // No brand is mounted, so the brand attribute is absent rather than empty.
    expect(wrapper).not.toContain("data-ads-theme");
  });

  test("the host palette mapping publishes explicit ADS custom properties", () => {
    // `adsThemeVariables` is what `StaveDesignProvider` writes onto `<html>`.
    // Were tokens ever reverted to StyleX-hashed keys, this mapping would go
    // back to publishing `--x1abc`, which no stylesheet can read or override.
    const names = Object.keys(adsThemeVariables);
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => !name.startsWith("--ads-"))).toEqual([]);
    expect(adsThemeVariables["--ads-color-canvas"]).toBe("var(--background)");
  });
});
