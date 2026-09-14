import * as stylex from "@stylexjs/stylex";
import * as React from "react";

import { useTheme } from "../components/ThemeProvider";
import {
  compactDensityTheme,
  darkTheme,
  highContrastTheme,
  lightTheme,
} from "../tokens/themes.stylex";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import type { ProductTheme } from "./product-theme";

const baseThemeStyles = {
  dark: darkTheme,
  "high-contrast": highContrastTheme,
  light: lightTheme,
} as const;

type ProductThemeContextValue =
  | { active: false }
  | { active: true; id: string };

const ProductThemeContext = React.createContext<ProductThemeContextValue>({
  active: false,
});

/**
 * The brand in effect here, or `undefined` outside every provider.
 *
 * Read it where an element leaves the DOM subtree it was written in — a
 * portalled popup, a `createPortal` into a canvas overlay — and stamp
 * `data-ads-theme` on the element that lands elsewhere. `@scope` is a fact
 * about the DOM tree, and a portal is precisely the case where the DOM tree
 * and the React tree disagree.
 */
export function useProductTheme(): string | undefined {
  const value = React.useContext(ProductThemeContext);
  return value.active && value.id !== "" ? value.id : undefined;
}

export type ProductThemeProviderProps = {
  children?: React.ReactNode;
  /**
   * The brand, or `null` for "ADS's own appearance here".
   *
   * `null` is not the same as leaving the provider out. It renders a theme
   * root with no brand, which TERMINATES an enclosing brand's `@scope` — the
   * supported way for one region of a branded product to opt back out.
   */
  theme: ProductTheme | string | null;
};

/**
 * Scope a product brand to a region.
 *
 * Separate from `ThemeProvider` on purpose. Mode (light/dark/high-contrast) and
 * density are axes of ONE product's appearance and belong to the document;
 * brand identity is which product you are looking at, and two of them can be on
 * screen at once. Folding them together would have made the brand a document
 * fact too, which is exactly the thing that cannot be true for a shell hosting
 * several tools. Nest them in either order.
 *
 * Renders one element, `display: contents`, so it takes part in no layout —
 * `@scope` needs a scoping root, and an element that is not there cannot be
 * one. If that matters for your grid, stamp `data-ads-theme` on an element you
 * already render instead; the attribute is the contract, this component is a
 * convenience over it.
 */
export function ProductThemeProvider({
  children,
  theme,
}: ProductThemeProviderProps) {
  const id = theme == null ? "" : typeof theme === "string" ? theme : theme.id;
  const { density, resolvedTheme } = useTheme();

  // Re-establish ADS's own palette on every theme root, brand or not.
  //
  // `@scope … to ([data-ads-theme])` bounds a brand's RULES, and measurement
  // says it does that exactly right — a button inside a nested root takes back
  // ADS's radius. It cannot bound a brand's TOKENS: a custom property is
  // inherited and no selector un-inherits one, so before this the same button
  // kept the outer brand's fill, which its own ADS rule reads through
  // `--ads-color-accent`. Re-declaring the mode's palette here is the only
  // thing that can reset an inherited value, because it is the only place the
  // base value exists.
  //
  // Density rides along because `stylex.props` of a theme also carries the var
  // group's DEFAULT class, which re-declares every token including the ones
  // `compactDensityTheme` overrode. Measured: without this line a compact
  // region inside a brand went back to 36px controls.
  const baseTheme = stylex.props(baseThemeStyles[resolvedTheme]);
  const baseDensity =
    density === "compact" ? stylex.props(compactDensityTheme) : null;

  return (
    <ProductThemeContext.Provider value={{ active: true, id }}>
      <div
        className={cx(
          sx(styles.contents),
          baseTheme.className,
          baseDensity?.className,
        )}
        data-ads-theme={id}
        style={
          {
            ...baseTheme.style,
            ...baseDensity?.style,
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </ProductThemeContext.Provider>
  );
}

/**
 * `data-ads-theme` for an element that is about to be portalled out of its
 * provider, or `undefined` when there is no brand to carry.
 *
 * Returning `undefined` rather than `""` matters: an empty value would make the
 * element a theme root and terminate a brand it is actually inside, which is
 * what happens when a popup is rendered inline rather than portalled.
 */
export function usePortalProductThemeProps():
  | { "data-ads-theme": string }
  | undefined {
  const value = React.useContext(ProductThemeContext);
  return value.active ? { "data-ads-theme": value.id } : undefined;
}

/**
 * Re-establish every visual axis around content that leaves its provider's DOM
 * subtree through a portal.
 *
 * The wrapper intentionally has no box. Its only job is to make the nearest
 * React theme context true in the portalled DOM tree: product brand (including
 * an explicit `theme={null}` reset), color mode, density, native color scheme,
 * and selection colors. It never mutates `document.documentElement`, so two
 * sibling or nested providers can open surfaces at the same time without
 * racing over global state.
 */
export function PortalProductThemeScope({
  children,
}: {
  children?: React.ReactNode;
}) {
  const productTheme = React.useContext(ProductThemeContext);
  const { density, resolvedTheme } = useTheme();
  /*
   * HOST MODIFICATION. Upstream re-applies the mode and density token groups
   * unconditionally, because it supports a provider scoped to a REGION: a
   * subtree on a different mode than the document has to carry its own token
   * values across a portal, since `@scope` bounds rules but cannot un-inherit
   * a custom property.
   *
   * This host mounts exactly one `ThemeProvider`, at the root, with
   * `syncDocument` — so the token group, the density group, `color-scheme` and
   * the `data-theme`/`data-density` attributes are already on
   * `document.documentElement`, which every portal inherits from. Re-declaring
   * them here is not merely redundant: `StaveDesignProvider` publishes the
   * host's own palette mapping (`../system/ads-theme`) as INLINE custom
   * properties on `<html>`, and a class on a closer element outranks an
   * inherited value. Applying `lightTheme`/`darkTheme` on the portal wrapper
   * would therefore replace the user's saved Stave theme with the design
   * system's stock palette inside every dialog, menu, popover, drawer, select
   * and tooltip.
   *
   * The groups are still applied when a product theme IS active, because at
   * that point the host has opted into brand scoping and the upstream reason
   * applies again.
   */
  const scopedToBrand = productTheme.active;
  const baseTheme = scopedToBrand
    ? stylex.props(baseThemeStyles[resolvedTheme])
    : null;
  const baseDensity =
    scopedToBrand && density === "compact"
      ? stylex.props(compactDensityTheme)
      : null;
  const nativeChrome = stylex.props(styles.nativeChrome);

  return (
    <div
      className={cx(
        sx(styles.contents),
        nativeChrome.className,
        baseTheme?.className,
        baseDensity?.className,
        resolvedTheme === "dark" ? sx(styles.dark) : sx(styles.light),
      )}
      data-ads-theme={productTheme.active ? productTheme.id : undefined}
      data-density={density}
      data-theme={resolvedTheme}
      style={
        {
          ...baseTheme?.style,
          ...baseDensity?.style,
          ...nativeChrome.style,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

const styles = stylex.create({
  contents: { display: "contents" },
  dark: { colorScheme: "dark" },
  light: { colorScheme: "light" },
  nativeChrome: {
    "--ads-selection-background": vars["--ads-color-text"],
    "--ads-selection-color": vars["--ads-color-text-inverted"],
  },
});
