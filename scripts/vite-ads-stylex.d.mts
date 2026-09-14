import type { Plugin } from "vite";

/**
 * Options accepted by {@link adsStylex}. Everything `@stylexjs/unplugin`'s
 * `UserOptions` accepts is forwarded, minus the two it must own:
 *
 * - `classNamePrefix` is set per origin and cannot be given here.
 * - `useCSSLayers` is always on and always nested under an origin layer; an
 *   unlayered pipeline has no seam to put a theme in, so there is no opt-out.
 *   A host whose external reset is unlayered (see `apps/canvas`) keeps using
 *   `stylex.vite({useCSSLayers: false})` and does not get product themes.
 */
export type AdsStylexOptions = Record<string, unknown> & {
  /**
   * The directories whose modules compile as ADS rather than product. This is
   * a source install, so nothing is included by default: pass the directory
   * ADS was copied into.
   */
  adsRoots?: ReadonlyArray<string>;
  /** Choose which emitted CSS asset the sheet is appended to, by file name. */
  cssInjectionTarget?: (fileName: string) => boolean;
};

export type StylexOrigin = {
  readonly classNamePrefix: string;
  readonly layer: string;
  readonly name: string;
};

/** The origins, in cascade order: ADS first, product last. */
export declare const STYLEX_ORIGINS: ReadonlyArray<StylexOrigin>;

/**
 * The StyleX Vite integration, compiled per origin, so that ADS's atomic
 * classes and a product's land in different cascade layers and a brand theme
 * can sit between them. See the implementation in `vite-ads-stylex.mjs`.
 *
 * Hand-written declarations because the plugin is plain `.mjs` — the Vite
 * configs that import it are type-checked by `bun run typecheck`, and an
 * untyped import fails under `noImplicitAny`.
 */
export declare function adsStylex(options?: AdsStylexOptions): Plugin;

/** Which origin owns a module id. Exported for the compatibility test. */
export declare function createOriginClassifier(
  adsRoots?: ReadonlyArray<string>,
): (id: string) => string;

/** Which origin a collected rule belongs to, read off its own class name. */
export declare function originOfRuleKey(key: string): StylexOrigin | null;

/** Re-key a `defineConsts` rule so it substitutes under another prefix. */
export declare function reprefixConstRule(
  rule: unknown,
  prefix: string,
): unknown;

/** Turn collected rules into one sheet, one layer block set per origin. */
export declare function processRulesByOrigin(
  allRules: ReadonlyArray<unknown>,
  options?: { enableLTRRTLComments?: boolean },
): string;
