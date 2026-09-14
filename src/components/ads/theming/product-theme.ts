import { lightThemeValues, type ThemedTokenName } from "../tokens/theme-values";
import type { ThemeProperty, ThemeState } from "./theme-contract";
import type { ThemeTargetSpec } from "./theme-target-types";
import type { ThemeTargetName } from "./theme-targets";
import { themeTargets } from "./theme-targets";

/**
 * The tokens a brand may set: the theme-varying palette, and only that.
 *
 * Not every ADS token. A custom property inherits and CSS cannot un-inherit
 * one, so a brand's token would keep applying inside a nested region that
 * opted back out — measured: with `--ads-radius-panel` in a brand's token map,
 * a nested `theme={null}` button reset its radius (a scoped recipe) and kept
 * the brand's fill (an inherited token). The themed set is exactly the set a
 * theme root can re-establish wholesale, which is what
 * `ProductThemeProvider` does, so restricting to it makes the reset complete
 * instead of partial. Everything else belongs in a component recipe.
 */
export type ThemeTokenName = ThemedTokenName;

/**
 * Declarations for one rule. Property names are the target's allowance, values
 * are CSS strings.
 *
 * Strings and not numbers: `borderWidth: 1` is not a length, and silently
 * appending `px` to a bare number is how a system ends up with two spellings
 * for the same value and a rule that means something different from what was
 * written.
 */
export type ThemeDeclarations<Name extends ThemeTargetName> = {
  readonly [Property in TargetProperty<Name>]?: string;
};

type TargetProperty<Name extends ThemeTargetName> =
  (typeof themeTargets)[Name]["properties"][number] & ThemeProperty;

type TargetState<Name extends ThemeTargetName> =
  (typeof themeTargets)[Name] extends { states: readonly (infer State)[] }
    ? State & ThemeState
    : never;

type TargetSlot<Name extends ThemeTargetName> =
  (typeof themeTargets)[Name] extends { slots: infer Slots }
    ? keyof Slots & string
    : never;

type TargetAxis<Name extends ThemeTargetName> =
  (typeof themeTargets)[Name] extends { axes: infer Axes } ? Axes : never;

/** A rule and the states of the same element. */
export type ThemeRule<Name extends ThemeTargetName> = {
  readonly base?: ThemeDeclarations<Name>;
  readonly states?: {
    readonly [State in TargetState<Name>]?: ThemeDeclarations<Name>;
  };
};

/**
 * One target's recipe.
 *
 * `variants` is keyed by axis, then by the axis's own values, so
 * `variants.variant.primary` reads as the thing it selects —
 * `.ads-button[data-variant="primary"]`.
 */
export type ThemeTargetRecipe<Name extends ThemeTargetName> =
  ThemeRule<Name> & {
    readonly slots?: {
      readonly [Slot in TargetSlot<Name>]?: ThemeRule<Name>;
    };
    readonly variants?: {
      readonly [Axis in keyof TargetAxis<Name>]?: {
        readonly [Value in TargetAxis<Name>[Axis] extends readonly (infer V)[]
          ? V & string
          : never]?: ThemeRule<Name>;
      };
    };
  };

export type ProductThemeInput = {
  /**
   * The brand's identity, and the value of `data-ads-theme`. Lowercase
   * kebab-case, because it is concatenated into a selector and a theme
   * definition is developer-authored input, not an end-user CSS service.
   */
  readonly id: string;
  /** Token overrides, published on the theme's scope root. */
  readonly tokens?: { readonly [Token in ThemeTokenName]?: string };
  readonly components?: {
    readonly [Name in ThemeTargetName]?: ThemeTargetRecipe<Name>;
  };
};

/** A validated theme. The brand identity is the only thing consumers need. */
export type ProductTheme = ProductThemeInput & {
  readonly __ads_product_theme: true;
};

const THEME_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Declare a product brand.
 *
 * Validated here rather than in the generator, so the error names the line of
 * the definition that is wrong instead of a line of CSS nobody wrote. The
 * checks are not decoration: `id` and every axis value reach a selector by
 * concatenation, so a value carrying `{`, `}` or `;` would let a definition
 * write rules outside its own scope — a theme definition is trusted input, and
 * a validated boundary is what keeps it that way when it starts arriving from
 * a config file.
 */
export function defineProductTheme(input: ProductThemeInput): ProductTheme {
  const problems = validateProductTheme(input);
  if (problems.length > 0) {
    throw new Error(
      `defineProductTheme(${JSON.stringify(input.id)}):\n  ${problems.join("\n  ")}`,
    );
  }
  return { ...input, __ads_product_theme: true };
}

/** Every problem, not the first: a definition is fixed in one pass. */
export function validateProductTheme(input: ProductThemeInput): string[] {
  const problems: string[] = [];
  if (!THEME_ID.test(input.id)) {
    problems.push(
      `id ${JSON.stringify(input.id)} must be lowercase kebab-case.`,
    );
  }
  for (const [token, value] of Object.entries(input.tokens ?? {})) {
    if (!(token in lightThemeValues)) {
      problems.push(
        `token "${token}" is not a theme-varying token. Only the palette can be set as a token, because a nested theme root can re-establish it; anything else must be a component recipe.`,
      );
    }
    problems.push(...valueProblems(`token "${token}"`, value));
  }
  for (const [target, recipe] of Object.entries(input.components ?? {})) {
    // Widened on purpose: the registry's literal types are what make the
    // AUTHORING side type-safe, and the same literals make a runtime read of an
    // optional field a union error. The validator's job is the untyped path —
    // a definition arriving from JSON — so it reads the spec as its interface.
    const spec: ThemeTargetSpec | undefined =
      themeTargets[target as ThemeTargetName];
    if (spec == null) {
      problems.push(`"${target}" is not a theme target.`);
      continue;
    }
    const allowed = new Set<string>(spec.properties);
    const states = new Set<string>(spec.states ?? []);
    problems.push(...rulePropblems(target, recipe, allowed, states));
    for (const [axis, values] of Object.entries(recipe.variants ?? {})) {
      const axisValues = spec.axes?.[axis];
      if (axisValues == null) {
        problems.push(`"${target}" has no axis "${axis}".`);
        continue;
      }
      for (const [value, rule] of Object.entries(
        values as Record<string, ThemeRule<ThemeTargetName>>,
      )) {
        if (!axisValues.includes(value)) {
          problems.push(`"${target}" axis "${axis}" has no value "${value}".`);
          continue;
        }
        problems.push(
          ...rulePropblems(`${target}.${axis}.${value}`, rule, allowed, states),
        );
      }
    }
    for (const [slot, rule] of Object.entries(recipe.slots ?? {})) {
      const slotProperties = spec.slots?.[slot];
      if (slotProperties == null) {
        problems.push(`"${target}" has no slot "${slot}".`);
        continue;
      }
      problems.push(
        ...rulePropblems(
          `${target} slot "${slot}"`,
          rule as ThemeRule<ThemeTargetName>,
          new Set<string>(slotProperties),
          states,
        ),
      );
    }
  }
  return problems;
}

function rulePropblems(
  where: string,
  rule: ThemeRule<ThemeTargetName> | undefined,
  allowed: ReadonlySet<string>,
  states: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  problems.push(...declarationProblems(where, rule?.base, allowed));
  for (const [state, declarations] of Object.entries(rule?.states ?? {})) {
    if (!states.has(state)) {
      problems.push(`${where} does not enter the "${state}" state.`);
      continue;
    }
    problems.push(
      ...declarationProblems(
        `${where}:${state}`,
        declarations as Record<string, string>,
        allowed,
      ),
    );
  }
  return problems;
}

function declarationProblems(
  where: string,
  declarations: Readonly<Record<string, string | undefined>> | undefined,
  allowed: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  for (const [property, value] of Object.entries(declarations ?? {})) {
    if (!allowed.has(property)) {
      problems.push(`${where} may not set "${property}".`);
      continue;
    }
    if (value == null) continue;
    problems.push(...valueProblems(`${where} "${property}"`, value));
    // The one accessibility floor in the vocabulary. A brand may recolour,
    // thicken or offset the keyboard ring; it may not remove it, because the
    // component underneath has already suppressed the UA's.
    if (property === "outlineStyle" && /^\s*(none|hidden)\s*$/.test(value)) {
      problems.push(`${where} may not remove the keyboard focus ring.`);
    }
    if (property === "outlineWidth" && /^\s*0[a-z%]*\s*$/.test(value)) {
      problems.push(`${where} may not zero the keyboard focus ring.`);
    }
  }
  return problems;
}

function valueProblems(where: string, value: string | undefined): string[] {
  if (value == null) return [];
  if (/[;{}<]|\/\*|\*\//.test(value)) {
    return [`${where} value contains CSS syntax that would end the rule.`];
  }
  if (/!\s*important/i.test(value)) {
    return [
      `${where} uses !important, which inverts the layer order and would put the brand above the product.`,
    ];
  }
  return [];
}
