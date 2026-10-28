import { useCallback, useEffect, useState } from "react";
import {
  getSyntaxHighlighter,
  highlightLineSpans,
  isSyntaxHighlighterReady,
  syntaxThemeFor,
  type SyntaxSpan,
} from "@/lib/syntax-highlight";
import { useAppStore } from "@/store/app.store";

/**
 * Sync per-line highlighter for an opened DiffViewer. First paint is plain
 * text until the shared Shiki singleton resolves; only mounted (open) diffs
 * pay for this warmup.
 */
export function useDiffLineHighlighter(language?: string) {
  const isDark = useAppStore((state) => state.isDarkMode);
  // Ready from the first render once any diff has loaded the highlighter, so
  // switching files does not repaint every row from plain text.
  const [ready, setReady] = useState(isSyntaxHighlighterReady);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    void getSyntaxHighlighter().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  const theme = syntaxThemeFor(isDark);
  return useCallback(
    (line: string, lang?: string): readonly SyntaxSpan[] =>
      highlightLineSpans(line, lang ?? language, theme),
    [language, ready, theme],
  );
}
