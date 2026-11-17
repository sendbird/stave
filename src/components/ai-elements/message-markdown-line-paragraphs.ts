import type {
  Paragraph,
  Parent,
  PhrasingContent,
  Root,
  RootContent,
} from "mdast";

/**
 * Remark plugin: each source line of a paragraph becomes its own paragraph.
 *
 * Markdown joins lines separated by one newline into one paragraph, and the
 * message paragraph keeps those newlines (`white-space: pre-wrap`), so short
 * status lines written one per line stack at the bare line pitch: a new
 * statement looks the same as a long line wrapping. As separate paragraphs
 * they take the message's own paragraph spacing, while a line that wraps on
 * its own stays one paragraph.
 *
 * Only paragraphs change. Code, tables, headings and hard breaks (two trailing
 * spaces or a backslash) keep their meaning, and list items are left alone:
 * a list item's lines already read as one item and its spacing is the list's.
 * A newline inside emphasis or a link stays where it is.
 */
export function remarkLineParagraphs() {
  return (tree: Root) => {
    splitChildren(tree);
  };
}

function splitChildren(parent: Parent) {
  if (parent.type === "listItem") return;
  const next: RootContent[] = [];
  for (const child of parent.children as RootContent[]) {
    if (child.type === "paragraph") {
      next.push(...splitParagraph(child));
      continue;
    }
    if ("children" in child) splitChildren(child);
    next.push(child);
  }
  (parent as { children: RootContent[] }).children = next;
}

function splitParagraph(paragraph: Paragraph): Paragraph[] {
  const lines: PhrasingContent[][] = [[]];
  for (const child of paragraph.children) {
    if (child.type !== "text" || !child.value.includes("\n")) {
      lines[lines.length - 1]!.push(child);
      continue;
    }
    child.value.split("\n").forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1]!.push({ type: "text", value: part });
    });
  }
  const kept = lines.filter((line) =>
    line.some((node) => node.type !== "text" || node.value.trim()),
  );
  if (kept.length < 2) return [paragraph];
  return kept.map((children) => ({ type: "paragraph", children }));
}
