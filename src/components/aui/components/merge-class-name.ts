import { cx } from "../utils/stylex";

/**
 * `className` on a Base UI part may be a string or a `(state) => string`
 * callback. These helpers merge Atelier's base styles with a caller-supplied
 * `className` of either shape, preserving the state argument.
 */
export type ClassNameProp<State> =
  | string
  | undefined
  | ((state: State) => string | undefined);

export function mergeClassName<State>(
  base: (state: State) => string,
  className: ClassNameProp<State>,
): (state: State) => string | undefined {
  return (state) =>
    cx(
      base(state),
      typeof className === "function" ? className(state) : className,
    );
}
