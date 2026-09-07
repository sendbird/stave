/**
 * A thematic break directly under a line of prose: `text` then `---`.
 *
 * In CommonMark that is not a rule at all — it is a **setext heading**, and the
 * sentence above it becomes an `<h2>`. That single rule is the reported
 * "assistant text sometimes renders like a heading": a model writes a sentence
 * and then a separator with no blank line between them, which it means as a
 * divider, and the parser turns the sentence into a title.
 *
 * Three or more dashes only. `-` and `--` are the same ambiguity, but a blank
 * line in front of them makes them an empty list item rather than a rule, so
 * "fixing" those would trade one wrong render for another; and `***` / `___`
 * are unambiguous thematic breaks in every position, so they need no help.
 */
const DASH_RULE = /^ {0,3}-{3,}[ \t]*$/;

/** Opens or closes a fenced code block. Content inside one is not markdown. */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Block starters that are *not* a paragraph, and therefore cannot be the first
 * line of a setext heading. A `---` under any of them already parses the way a
 * reader expects, so leaving them alone keeps this transform from reflowing
 * list looseness or breaking a table apart.
 */
const NOT_PARAGRAPH = /^ {0,3}([-*+>#|]|\d+[.)])(\s|$)/;

/**
 * Insert the blank line that turns an accidental setext heading back into the
 * horizontal rule the author meant.
 *
 * Done as a text normalization rather than a remark plugin on purpose: by the
 * time a plugin sees the tree the heading has already been built, and the
 * `position` data cannot distinguish `Title\n---` from `## Title` after the
 * fact — the information needed to make the decision only exists in the source
 * text. Returns the input unchanged when there is nothing to fix, so the
 * common case costs one scan and no allocation.
 */
export function hardenSetextHeadings(content: string): string {
  if (!content.includes("---")) return content;

  const lines = content.split("\n");
  const out: string[] = [];
  let fence: string | null = null;

  for (const line of lines) {
    if (fence !== null) {
      out.push(line);
      if (line.trimStart().startsWith(fence)) fence = null;
      continue;
    }

    const opening = FENCE.exec(line);
    if (opening?.[1] != null) {
      fence = opening[1].slice(0, 3);
      out.push(line);
      continue;
    }

    const previous = out.at(-1);
    if (
      DASH_RULE.test(line) &&
      previous != null &&
      previous.trim().length > 0 &&
      !NOT_PARAGRAPH.test(previous)
    ) {
      out.push("");
    }
    out.push(line);
  }

  return out.length === lines.length ? content : out.join("\n");
}
