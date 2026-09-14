import * as stylex from "@stylexjs/stylex";

export type StyleXValue = stylex.StyleXArray<stylex.CompiledStyles | boolean | null | undefined>;

/**
 * The host style-composition channel every ADS component and compound part
 * accepts.
 *
 * `xstyle` takes StyleX styles (one, or an array) and is merged **last** into
 * the part's own `stylex.props(...)` call — see `sx` below — so composition is
 * deterministic: whatever the host passes wins over the part's base styles for
 * the properties it names, and nothing else moves. Styles handed in through
 * `className` instead resolve by bundler emission order, which is a coin flip.
 *
 * It exists for the layout and geometry affordances the host owns — margin,
 * grid/flex placement, `inlineSize`, `min*`/`max*` sizes, `flex`, `alignSelf`,
 * `order`, `position` — not for re-theming. Colors, focus rings, and
 * typography belong to the component and its tokens; overriding them through
 * `xstyle` forks the system one call site at a time.
 *
 * `className` remains a hook/test-id channel, not a styling channel.
 */
export type XstyleProp = {
  /**
   * Host-owned layout/geometry styles, merged last. Do not use it to override
   * color, focus ring, or typography tokens.
   */
  xstyle?: StyleXValue;
};

/**
 * Compose StyleX styles into a class name. Falsy entries are dropped, so a
 * conditional style — or an absent `xstyle` — can be passed inline.
 *
 * Pass the host's `xstyle` last; StyleX resolves the final argument's
 * properties over the earlier ones.
 *
 * Host adaptation: `StyleXValue` is exported and widened to a `StyleXArray`,
 * and the entries are handed to `stylex.props` unfiltered. `props` already
 * ignores falsy members, and pre-filtering forced a cast to
 * `stylex.StyleXStyles[]` that rejected the conditional arrays and marker
 * classes `xstyle` exists to carry.
 */
export function sx(...styles: StyleXValue[]): string {
  const props = stylex.props(...styles);
  return props.className ?? "";
}

export function cx(
  ...classNames: Array<string | false | null | undefined>
): string | undefined {
  const merged = classNames.filter(Boolean).join(" ");
  return merged.length > 0 ? merged : undefined;
}
