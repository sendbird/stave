import * as stylex from "@stylexjs/stylex";

/**
 * Line-break policy (#809, design direction §5 Korean copy).
 *
 * `keepAll` wraps Korean between words (eojeol), never inside one — the
 * default `word-break` split "어떻게" into "어/떻게" at a narrow width — and
 * `overflow-wrap: anywhere` still breaks a token longer than the line (a path,
 * a URL, a hash), so nothing overflows its box. Latin text is unaffected:
 * `keep-all` only changes breaking between CJK characters.
 *
 * Apply it at a surface root. A portaled popup does not inherit it from the
 * surface that opened it, so a popup body restates it.
 */
export const textWrap = stylex.create({
  keepAll: { overflowWrap: "anywhere", wordBreak: "keep-all" },
});
