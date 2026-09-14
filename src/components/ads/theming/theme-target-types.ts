import type { ThemeProperty, ThemeState } from "./theme-contract";

/**
 * One themeable target: a rendered element a product brand can address by a
 * stable name, independently of the atomic class StyleX happened to hash for
 * it this build.
 *
 * A target is NOT the same thing as a component. `Dialog` publishes six
 * targets (popup, backdrop, header, title, description, footer) because each
 * paints a different surface; `Card` publishes one and reaches its parts
 * through slots, because they share the card's surface and only ever move
 * together. The rule is the one the generator has to satisfy: a target exists
 * where a brand needs a selector, not wherever the source happens to have a
 * `<div>`.
 */
export type ThemeTargetSpec = {
  /**
   * The axes a brand may switch on, as `data-<axis>` on the target element.
   *
   * Values are the component's own prop values, verbatim — `variant`,
   * `size`, `tone`. Reflecting them is what lets a recipe say
   * `.ads-button[data-variant="primary"]` without ADS inventing a second
   * vocabulary for the same distinction.
   */
  readonly axes?: Readonly<Record<string, readonly string[]>>;
  /**
   * Every public export name whose rendered output carries this target's
   * class. This is the ledger's join column: an export that appears in no
   * target and no exclusion fails `check:theme-targets`, which is how the
   * coverage claim stays true as components are added.
   */
  readonly exports: readonly string[];
  /** Properties a recipe may set on the target itself. */
  readonly properties: readonly ThemeProperty[];
  /**
   * What actually carries the class, for the ledger and for review. Write the
   * element, not the component — "the `<button>` Base UI renders", not
   * "Button".
   */
  readonly root: string;
  /**
   * Addressable descendants, as `data-ads-slot="<name>"`, each with its own
   * property allowance.
   *
   * A slot is public API. Do not add one for every wrapper the implementation
   * happens to need: a slot the brand can select is a slot the implementation
   * can no longer delete.
   */
  readonly slots?: Readonly<Record<string, readonly ThemeProperty[]>>;
  /** States the target actually enters. A target with no `:hover` lists none. */
  readonly states?: readonly ThemeState[];
};

export type ThemeTargetRegistry = Readonly<Record<string, ThemeTargetSpec>>;

/**
 * Public exports that render DOM but are deliberately not theme targets, each
 * with the reason. The guard requires a reason string; it does not read it, a
 * reviewer does.
 */
export type ThemeTargetExclusions = Readonly<Record<string, string>>;
