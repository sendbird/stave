const LIST_MARKER_PATTERN =
  /^(\s*)(?:[-+*]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/;

function normalizeCopyComparisonText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripMarkdownListMarkers(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(LIST_MARKER_PATTERN, "$1"))
    .join("\n");
}

function hasMarkdownListMarkers(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .some((line) => LIST_MARKER_PATTERN.test(line));
}

export function resolveUserMessageClipboardPlainText(args: {
  sourceMarkdown: string;
  selectedText: string;
}) {
  if (!hasMarkdownListMarkers(args.sourceMarkdown)) {
    return null;
  }

  const normalizedSelected = normalizeCopyComparisonText(args.selectedText);
  if (!normalizedSelected) {
    return null;
  }

  const normalizedSource = normalizeCopyComparisonText(args.sourceMarkdown);
  if (normalizedSelected === normalizedSource) {
    return args.sourceMarkdown;
  }

  const normalizedRenderedSource = normalizeCopyComparisonText(
    stripMarkdownListMarkers(args.sourceMarkdown),
  );
  return normalizedSelected === normalizedRenderedSource
    ? args.sourceMarkdown
    : null;
}
