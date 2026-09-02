import type { Macro, MacroTokenMatch } from "./types";

const MACRO_QUERY_PATTERN = /!([A-Za-z0-9-]*)$/;

export function getActiveMacroTokenMatch(args: {
  value: string;
  caretIndex: number;
}): MacroTokenMatch | null {
  const cappedCaretIndex = Math.max(
    0,
    Math.min(args.caretIndex, args.value.length),
  );
  const beforeCaret = args.value.slice(0, cappedCaretIndex);
  const lineStart = Math.max(0, beforeCaret.lastIndexOf("\n") + 1);
  const activeSlice = beforeCaret.slice(lineStart);
  const match = activeSlice.match(MACRO_QUERY_PATTERN);

  if (!match) {
    return null;
  }

  const triggerStart = cappedCaretIndex - match[0].length;
  const prefixChar = triggerStart > 0 ? (args.value[triggerStart - 1] ?? "") : "";
  if (prefixChar && !/\s|\(/.test(prefixChar)) {
    return null;
  }

  return {
    start: triggerStart,
    end: cappedCaretIndex,
    query: match[1] ?? "",
    token: match[0],
  };
}

export function filterMacroEntries(args: {
  macros: readonly Macro[];
  query: string;
}): Macro[] {
  const normalizedQuery = args.query.trim().toLowerCase();
  const sorted = [...args.macros].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
  if (!normalizedQuery) {
    return sorted;
  }

  return sorted
    .filter((macro) => {
      const haystacks = [
        macro.slug,
        macro.label,
        macro.description ?? "",
      ];
      return haystacks.some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      );
    })
    .sort((left, right) => {
      const leftIsExact = left.slug.toLowerCase() === normalizedQuery;
      const rightIsExact = right.slug.toLowerCase() === normalizedQuery;
      return Number(rightIsExact) - Number(leftIsExact);
    });
}

export function applyMacroInsert(args: {
  draftText: string;
  body: string;
  insertMode: Macro["insertMode"];
  tokenMatch?: Pick<MacroTokenMatch, "start" | "end">;
}): { text: string; caretIndex: number } {
  const withoutToken = args.tokenMatch
    ? `${args.draftText.slice(0, args.tokenMatch.start)}${args.draftText.slice(args.tokenMatch.end)}`
    : args.draftText;
  const remaining = withoutToken.trim().length === 0 ? "" : withoutToken;

  if (args.insertMode === "replace" || remaining.length === 0) {
    return {
      text: args.body,
      caretIndex: args.body.length,
    };
  }

  if (args.insertMode === "prepend") {
    const joiner =
      args.body.endsWith("\n") || remaining.startsWith("\n") ? "" : "\n\n";
    const text = `${args.body}${joiner}${remaining}`;
    return { text, caretIndex: args.body.length };
  }

  const joiner =
    remaining.endsWith("\n") || args.body.startsWith("\n") ? "" : "\n\n";
  const text = `${remaining}${joiner}${args.body}`;
  return { text, caretIndex: text.length };
}
