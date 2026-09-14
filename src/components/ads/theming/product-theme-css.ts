import { themeStates, type ThemeState } from "./theme-contract";
import type { ProductTheme } from "./product-theme";
import { themeTargetClassName } from "./theme-props";
import type { ThemeTargetName } from "./theme-targets";

/**
 * A product theme, as CSS.
 *
 * Static output from a static definition — call it in a build step and write
 * the result to a stylesheet. It is deliberately not a hook that inserts a
 * `<style>` during render: a brand is a build-time fact, and inserting
 * stylesheets per render means the first paint is unthemed and every
 * concurrent render races the sheet registry.
 *
 * ## Three structural decisions, each load-bearing
 *
 * **`@scope … to ([data-ads-theme])`.** A descendant selector
 * (`[data-ads-theme="alpha"] .ads-button`) also matches buttons inside a NESTED
 * provider, and the nested brand's rule has identical specificity, so which one
 * wins is decided by the order two independent brands happened to be
 * concatenated in. `@scope` with a lower boundary stops at the next theme root,
 * so nesting, sibling isolation, and an inner default resetting an outer brand
 * are properties of the selector rather than of the build order. Measured in
 * Chromium: an `alpha` button inside `alpha > beta` paints beta, a `default`
 * inside that paints ADS's own value, and a sibling `beta` is unaffected.
 *
 * **Every static selector has the same specificity.** Axis and slot selectors
 * are wrapped in `:where()`, so `.ads-button` and
 * `.ads-button:where([data-variant="primary"])` are both `(0,1,0)` and a state
 * rule is `(0,2,0)` whatever it qualifies. Without that, a variant's
 * `:hover` (0,3,0) would outrank the base's `:disabled` (0,2,0) and a disabled
 * primary button would light up under the pointer.
 *
 * **States are emitted in a fixed order, last-wins.** All four sit at one
 * specificity, so `hover, active, focus-visible, disabled` in source order IS
 * the precedence rule: disabled paint survives a pointer, and focus survives
 * a press.
 */
export function generateProductThemeCss(
  themes: readonly ProductTheme[],
): string {
  const tokens = themes.map((theme) => renderTokens(theme)).filter(Boolean);
  const recipes = themes.map((theme) => renderRecipes(theme)).filter(Boolean);
  const sheet: string[] = [];
  if (tokens.length > 0) sheet.push(TOKEN_BANNER, ...tokens);
  if (recipes.length > 0)
    sheet.push(`@layer ads-theme {\n${recipes.join("\n")}}\n`);
  return sheet.join("");
}

const TOKEN_BANNER = `/*
 * Token overrides are UNLAYERED, and that is not a slip.
 *
 * StyleX emits \`defineVars\` and \`createTheme\` at priority 0, which
 * \`processStylexRules\` deliberately leaves outside every layer — measured:
 * \`:root, .x1bww51g { --ads-color-accent: … }\` and
 * \`.x1u4pik4.x1u4pik4 { … }\` both sit in no layer. An unlayered declaration
 * outranks every layered one whatever its specificity, so a brand token
 * written into \`@layer ads-theme\` could never win. Matching that origin and
 * out-specifying it is the only mechanism left.
 *
 * The repeated attribute is what buys the specificity: \`[data-ads-theme="x"]\`
 * three times is (0,3,0), above the theme class's (0,2,0) and the \`:root\`
 * group's (0,1,0), with no !important and nothing for a product override in
 * \`@layer product\` to fight — a product that wants a different palette sets
 * the token on its own root, which is the same mechanism one level in.
 *
 * A nested theme root re-declares ADS's own palette (ProductThemeProvider
 * applies the mode's theme class), so a brand's tokens stop at the boundary
 * even though custom properties inherit through it.
 */
`;

const INDENT = "    ";

function renderTokens(theme: ProductTheme): string {
  const tokens = Object.entries(theme.tokens ?? {}).filter(
    ([, value]) => value != null,
  );
  if (tokens.length === 0) return "";
  // On the theme root, so the brand's palette reaches app-owned markup inside
  // the region too — the difference between theming ADS and theming a product.
  const attribute = `[data-ads-theme="${theme.id}"]`;
  const selector = `${attribute}${attribute}${attribute}`;
  const body = tokens
    .map(([token, value]) => `  ${token}: ${value as string};`)
    .join("\n");
  return `${selector} {\n${body}\n}\n`;
}

function renderRecipes(theme: ProductTheme): string {
  const rules: string[] = [];

  for (const [target, recipe] of Object.entries(theme.components ?? {})) {
    const root = `.${themeTargetClassName(target as ThemeTargetName)}`;
    // Statics first, then states, so the state band is contiguous and its
    // internal order is the precedence rule.
    const statics: string[] = [];
    const states: string[] = [];

    collect(root, recipe as AnyRule, statics, states);
    for (const [axis, values] of Object.entries(recipe.variants ?? {})) {
      for (const [value, rule] of Object.entries(
        values as Record<string, AnyRule>,
      )) {
        collect(
          `${root}:where([data-${axis}="${value}"])`,
          rule,
          statics,
          states,
        );
      }
    }
    for (const [slot, rule] of Object.entries(recipe.slots ?? {})) {
      collect(
        `${root} :where([data-ads-slot="${slot}"])`,
        rule as AnyRule,
        statics,
        states,
      );
    }
    rules.push(...statics, ...states);
  }

  if (rules.length === 0) return "";
  return `  @scope ([data-ads-theme="${theme.id}"]) to ([data-ads-theme]) {\n${rules.join("")}  }\n`;
}

/** The generator walks the untyped shape; the authoring side is where the
 * registry's literal types belong. */
type AnyRule = {
  readonly base?: Readonly<Record<string, string | undefined>>;
  readonly states?: Readonly<
    Partial<Record<ThemeState, Readonly<Record<string, string | undefined>>>>
  >;
};

function collect(
  selector: string,
  rule: AnyRule | undefined,
  statics: string[],
  states: string[],
): void {
  const base = declarations(rule?.base);
  if (base.length > 0) statics.push(block(selector, base));
  for (const state of themeStates) {
    const declared = declarations(rule?.states?.[state]);
    if (declared.length > 0) {
      states.push(block(`${selector}${statePseudo(state)}`, declared));
    }
  }
}

/**
 * One state, one pseudo-class, and nothing else.
 *
 * The mapping is total and closed, which is what stops a `states` key from
 * being a place to smuggle a selector: there is no branch that concatenates the
 * key into the output.
 */
function statePseudo(state: ThemeState): string {
  switch (state) {
    case "active":
      return ":active";
    case "disabled":
      // `:disabled` covers a real disabled control; `[aria-disabled="true"]`
      // covers the ones that cannot carry the attribute — an anchor rendered as
      // a button, and Base UI's `focusableWhenDisabled`, which keeps a busy
      // control in the tab order and therefore NOT `:disabled`.
      return ':is(:disabled, [aria-disabled="true"])';
    case "focus-visible":
      return ":focus-visible";
    case "hover":
      return ":hover";
  }
}

function declarations(
  input: Readonly<Record<string, string | undefined>> | undefined,
): string[] {
  return Object.entries(input ?? {})
    .filter(([, value]) => value != null)
    .map(([property, value]) => `${kebab(property)}: ${value as string};`);
}

/**
 * Emit each rule twice: once matched against the scoping root, once against its
 * descendants.
 *
 * A bare selector inside `@scope` carries an implied descendant combinator, so
 * `.ads-dialog-popup` never matches the scoping root itself. That is exactly the
 * portal case — a dialog popup leaves its provider and carries `data-ads-theme`
 * on its own element, making it BOTH the theme root and the thing being themed.
 * Measured before this: a branded dialog kept ADS's 12px corner instead of the
 * brand's 20px. `:where(:scope)` is (0,0,0), so the pair has one specificity.
 */
function block(selector: string, body: readonly string[]): string {
  const lines = body.map((line) => `${INDENT}  ${line}`).join("\n");
  return `${INDENT}:where(:scope)${selector},\n${INDENT}${selector} {\n${lines}\n${INDENT}}\n`;
}

/** `backgroundColor` → `background-color`. */
function kebab(property: string): string {
  return property.replace(
    /[A-Z]/g,
    (character) => `-${character.toLowerCase()}`,
  );
}
