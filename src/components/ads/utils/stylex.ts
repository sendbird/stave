import * as stylex from "@stylexjs/stylex";

export type StyleXValue = stylex.StyleXArray<stylex.CompiledStyles | boolean | null | undefined>;

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
