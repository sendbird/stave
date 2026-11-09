import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { splitSearchHighlight } from "@/lib/search-highlight";

/**
 * Text with the characters a search matched marked, the same way wherever a
 * list is searched (the command palette, Fleet). The mark is a tint behind the
 * text, so the matched characters keep their own color and weight.
 */
export function SearchHighlight(props: { text: string; query: string }) {
  const parts = splitSearchHighlight(props.text, props.query);
  if (parts.length === 1 && !parts[0]?.match) return props.text;
  return (
    <>
      {parts.map((part, index) =>
        part.match ? (
          <mark key={index} className={sx(styles.match)}>{part.text}</mark>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

const styles = stylex.create({
  match: {
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-warning"]} 30%, transparent)`,
    borderRadius: vars["--aui-radius-mark"],
    color: "inherit",
  },
});
