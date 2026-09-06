import * as stylex from "@stylexjs/stylex";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type * as React from "react";

import {
  compactDensityTheme,
  darkTheme,
  highContrastTheme,
  lightTheme,
} from "../tokens/themes.stylex";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";

export type Theme = "light" | "dark" | "high-contrast" | "system";
export type ResolvedTheme = "light" | "dark" | "high-contrast";

/**
 * Theme-level density preset. `regular` is the token defaults (applying it is
 * a no-op); `compact` layers `compactDensityTheme` — every control metric one
 * uniform 4px tier down, plus the space ramp one step down from `space12` up.
 * Composes with any color theme.
 *
 * **`density` and `size` are orthogonal, and this is the axis that moves the
 * ramp.** The preset offsets the whole control-height ramp; a component's
 * `size` prop picks a step within it. So a sized control stays distinguishable
 * from its neighbours at either preset — under `compact` the steps are xs 24 /
 * sm 28 / md 32 / lg 36. `controlHeightXl` (44px) is the one metric the offset
 * skips, because it is the `pointer: coarse` target WCAG 2.5.8 puts a floor
 * under.
 *
 * This did NOT used to hold, and the failure is worth stating because the
 * shape recurs: the preset overrode only the *semantic* `controlHeight`, so
 * `size="md"` moved to 32px while `size="sm"` sat on an unmoved
 * `controlHeightSm` — also 32px. Two named steps, one rendered height. A
 * density preset that reaches some of a ramp destroys the axis it is supposed
 * to modulate.
 *
 * A per-component `density` prop is a different axis again — internal air, not
 * height — and reads the fixed `densityPad` scale that no theme can touch, so
 * it does not double-compact. The type ramp never changes: density is spatial
 * only. See `compactDensityTheme` in themes.stylex.ts.
 */
export type ThemeDensity = "regular" | "compact";

const themeStyles = {
  dark: darkTheme,
  "high-contrast": highContrastTheme,
  light: lightTheme,
} as const;

const nativeChromeStyles = stylex.create({
  root: {
    // Thumb only. A painted track turns a native scrollbar into a channel
    // running the height of the region, which reads as a border the app did
    // not ask for. `colorScrollbarTrack` still belongs to `ScrollArea`, which
    // draws its own and wants the channel.
    scrollbarColor: `${vars.colorScrollbarThumb} transparent`,
  },
  // Applied to <html> under `syncDocument` so the document itself — the strip
  // behind overscroll, and everything outside the React root — carries the
  // themed canvas instead of the browser's white default.
  documentSurface: {
    backgroundColor: vars.colorCanvas,
  },
  dark: {
    colorScheme: "dark",
  },
  light: {
    colorScheme: "light",
  },
});

const colorSchemeStyles = {
  dark: nativeChromeStyles.dark,
  "high-contrast": nativeChromeStyles.light,
  light: nativeChromeStyles.light,
} as const;

const DARK_QUERY = "(prefers-color-scheme: dark)";

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "light";
  }
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export type ThemeContextValue = {
  density: ThemeDensity;
  /** The theme actually rendered — `system` already resolved. */
  resolvedTheme: ResolvedTheme;
  /**
   * Requests a theme change. Backed by the nearest provider's
   * `onThemeChange`; a no-op when the provider is uncontrolled, so callers can
   * always render a control and let the host decide whether it does anything.
   */
  setTheme: (theme: Theme) => void;
  /** The requested theme, including the literal `system` preference. */
  theme: Theme;
};

const noopSetTheme = () => {};

const ThemeContext = createContext<ThemeContextValue>({
  density: "regular",
  resolvedTheme: "light",
  setTheme: noopSetTheme,
  theme: "light",
});

/**
 * Reads the active theme from the nearest `ThemeProvider`. Any component in the
 * tree — including a sub-app mounted inside the Atelier shell — can use this to
 * branch on `resolvedTheme` (chart palettes, canvas/raster colors, embedded
 * third-party widgets) or to offer its own theme control via `setTheme`.
 */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export type ThemeProviderProps = React.ComponentProps<"div"> & {
  /** Density preset composed with the color theme. @default "regular" */
  density?: ThemeDensity;
  /**
   * Called when a descendant requests a theme via `useTheme().setTheme`. Pair
   * with a controlled `theme` prop; without it `setTheme` is inert.
   */
  onThemeChange?: (theme: Theme) => void;
  /**
   * Also mirror the theme onto `document.documentElement` (theme class, CSS
   * variables, `data-theme`, native `color-scheme`).
   *
   * The provider themes its own subtree via a wrapper `<div>`, but menus,
   * dialogs and toasts portal to `document.body` — outside that div — and would
   * otherwise fall back to the unthemed light defaults. Enable this on the
   * single top-level provider that owns the page. @default false
   */
  syncDocument?: boolean;
  theme?: Theme;
};

export function ThemeProvider({
  children,
  className,
  density = "regular",
  onThemeChange,
  style,
  syncDocument = false,
  theme = "light",
  ...props
}: ThemeProviderProps) {
  // SSR-safe default: assume light until the client confirms via matchMedia.
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>("light");

  useEffect(() => {
    if (theme !== "system") {
      return;
    }
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const query = window.matchMedia(DARK_QUERY);
    const sync = () => {
      setSystemTheme(getSystemTheme());
    };
    sync();
    query.addEventListener("change", sync);
    return () => {
      query.removeEventListener("change", sync);
    };
  }, [theme]);

  const resolved: ResolvedTheme = theme === "system" ? systemTheme : theme;
  const themeProps = stylex.props(themeStyles[resolved]);
  // Separate stylex.props call, composed via cx below: the color theme and the
  // density preset belong to the same var group, so merging them in ONE
  // stylex.props(...) call would keep only the last theme (shared merge key).
  // As classNames they compose — their overridden var sets are disjoint.
  const densityProps =
    density === "compact" ? stylex.props(compactDensityTheme) : null;

  // Ease surface colors when the theme flips: a short-lived global transition
  // class makes every background/border/text color glide to its new value
  // instead of snapping. Derived during render so the class lands in the same
  // commit as the theme change (an effect would attach it after the snap).
  const [transitioning, setTransitioning] = useState(false);
  const [lastResolved, setLastResolved] = useState(resolved);
  if (lastResolved !== resolved) {
    setLastResolved(resolved);
    setTransitioning(true);
  }
  useEffect(() => {
    if (!transitioning) {
      return;
    }
    const timer = setTimeout(() => setTransitioning(false), 300);
    return () => clearTimeout(timer);
  }, [transitioning, resolved]);

  // Mirror onto <html> so portaled surfaces (menus, dialogs, toasts, which
  // mount at document.body and never see the wrapper div) resolve the same
  // tokens as the in-tree content. Classes and inline vars are tracked so the
  // cleanup removes exactly what this effect added, leaving anything a host
  // page set on <html> itself untouched.
  const themeClassName = themeProps.className;
  const densityClassName = densityProps?.className;
  // `stylex.props` returns a fresh style object every render, so it is
  // serialized into a stable dependency — otherwise the effect would tear the
  // <html> attributes down and rebuild them on every single render.
  const varsKey = JSON.stringify({
    ...themeProps.style,
    ...densityProps?.style,
  });
  useEffect(() => {
    if (!syncDocument || typeof document === "undefined") {
      return;
    }
    const root = document.documentElement;
    const added = [
      themeClassName,
      densityClassName,
      sx(nativeChromeStyles.documentSurface),
    ]
      .filter((value): value is string => Boolean(value))
      .flatMap((value) => value.split(/\s+/))
      .filter((token) => token && !root.classList.contains(token));
    root.classList.add(...added);

    const appliedVars = JSON.parse(varsKey) as Record<
      string,
      string | undefined
    >;
    for (const [name, value] of Object.entries(appliedVars)) {
      if (name.startsWith("--") && value != null) {
        root.style.setProperty(name, value);
      }
    }

    // Hand-off from a pre-hydration boot script: a host may inline a background
    // on <html> to avoid a light flash before React mounts. Now that the real
    // theme class is on, that inline value would outrank it — so drop it.
    root.style.removeProperty("background-color");

    const previousColorScheme = root.style.colorScheme;
    root.style.colorScheme = resolved === "dark" ? "dark" : "light";
    root.dataset.theme = resolved;
    root.dataset.density = density;

    return () => {
      root.classList.remove(...added);
      for (const name of Object.keys(appliedVars)) {
        if (name.startsWith("--")) {
          root.style.removeProperty(name);
        }
      }
      root.style.colorScheme = previousColorScheme;
      delete root.dataset.theme;
      delete root.dataset.density;
    };
  }, [
    density,
    densityClassName,
    resolved,
    syncDocument,
    themeClassName,
    varsKey,
  ]);

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      density,
      resolvedTheme: resolved,
      setTheme: onThemeChange ?? noopSetTheme,
      theme,
    }),
    [density, onThemeChange, resolved, theme],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      <div
        {...props}
        className={cx(
          themeProps.className,
          densityProps?.className,
          sx(nativeChromeStyles.root, colorSchemeStyles[resolved]),
          transitioning && "atelier-theme-transition",
          className,
        )}
        data-density={density}
        data-theme={resolved}
        style={{ ...themeProps.style, ...densityProps?.style, ...style }}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
