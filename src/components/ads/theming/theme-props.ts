import type { ThemeTargetName } from "./theme-targets";
import { themeTargets } from "./theme-targets";

/**
 * The axis names the whole registry may use, as a closed set.
 *
 * Closed on purpose. Every name here becomes a `data-*` attribute in the
 * public DOM contract and a selector segment a product theme can depend on, so
 * the cost of one is permanent. Four cover the system today; adding a fifth is
 * a reviewed change to this union and to `ThemeTargetProps` below, not a new
 * string in one component's registry entry.
 *
 * None of them may shadow a Base UI state attribute — see
 * `reservedStateAttributes`, which `check:theme-targets` enforces against this
 * union.
 */
export type ThemeAxisName = "density" | "size" | "tone" | "variant";

/**
 * What a component spreads onto its styled root.
 *
 * Concretely keyed rather than `Record<string, string>`: a spread of an index
 * signature is not assignable to a component's props, and the whole point is
 * that this spreads onto Base UI roots and intrinsic elements alike without a
 * cast at 300 call sites.
 */
export type ThemeTargetProps = {
  className: string;
  "data-density"?: string;
  "data-size"?: string;
  "data-tone"?: string;
  "data-variant"?: string;
};

type TargetAxes<Name extends ThemeTargetName> =
  (typeof themeTargets)[Name] extends { axes: infer Axes }
    ? {
        readonly [Axis in keyof Axes]?: Axes[Axis] extends readonly (infer Value)[]
          ? Value
          : never;
      }
    : Record<never, never>;

/**
 * `ads-button`, `ads-dialog-popup` — the stable root class for a target.
 *
 * Exported so a test, a docs fixture or a generator can name a target without
 * hard-coding the prefix in a second place.
 */
export function themeTargetClassName(name: ThemeTargetName): string {
  return `ads-${name}`;
}

/**
 * The stable identity a themeable element carries: its target class plus the
 * axis values a brand can switch on.
 *
 * Spread it FIRST and re-add `className` through the component's own `cx(sx(…),
 * theme.className, className)`:
 *
 * ```tsx
 * const theme = themeProps("button", { size, tone, variant });
 * <Root {...theme} className={cx(sx(styles.root, xstyle), theme.className, className)} />
 * ```
 *
 * The explicit `className` after the spread is what wins, so the target class
 * lands in the same string as the atomic classes and the consumer's own — one
 * class attribute, one order, no second channel.
 *
 * Undefined axis values are dropped rather than rendered as `"undefined"`: an
 * absent attribute means "this component does not have that axis here", which
 * is a different statement from any value it could carry.
 */
export function themeProps<Name extends ThemeTargetName>(
  name: Name,
  axes?: TargetAxes<Name>,
): ThemeTargetProps {
  const props: ThemeTargetProps = { className: themeTargetClassName(name) };
  if (axes == null) return props;
  const values = axes as Readonly<Record<string, string | undefined>>;
  if (values.density != null) props["data-density"] = values.density;
  if (values.size != null) props["data-size"] = values.size;
  if (values.tone != null) props["data-tone"] = values.tone;
  if (values.variant != null) props["data-variant"] = values.variant;
  return props;
}

type TargetSlots<Name extends ThemeTargetName> =
  (typeof themeTargets)[Name] extends { slots: infer Slots }
    ? keyof Slots & string
    : never;

/**
 * A registered addressable descendant: `data-ads-slot="icon"`.
 *
 * Scoped by the target's class at generation time
 * (`.ads-button [data-ads-slot="icon"]`), so the same slot name means the same
 * part in every component that publishes it, and naming one in a recipe for a
 * component that does not publish it is a compile error rather than a rule
 * that matches nothing.
 */
export function themeSlotProps<Name extends ThemeTargetName>(
  _target: Name,
  slot: TargetSlots<Name>,
): { "data-ads-slot": string } {
  return { "data-ads-slot": slot };
}
