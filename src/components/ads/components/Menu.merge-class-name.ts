import { cx } from "../utils/stylex";

/**
 * `className` on a Base UI part may be a string or a `(state) => string`
 * callback. Merge Atelier's base styles with a caller-supplied `className` of
 * either shape, preserving the state argument.
 *
 * Split out of `Menu.tsx` verbatim — a move, not a rewrite — because the stable
 * theme-target attributes pushed that file over the 500-line source limit. The
 * local variant allows an `undefined`-returning `base`, which the shared
 * `merge-class-name.ts` deliberately does not; the menu parts fold in
 * `theme.className` through `cx`, whose result is `string | undefined`.
 */
export type ClassNameProp<State> =
  | string
  | undefined
  | ((state: State) => string | undefined);

export function mergeClassName<State>(
  base: (state: State) => string | undefined,
  className: ClassNameProp<State>,
): (state: State) => string | undefined {
  return (state) =>
    cx(
      base(state),
      typeof className === "function" ? className(state) : className,
    );
}
