import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  getSyntaxHighlighter,
  highlightLineSpans,
  isSyntaxHighlighterReady,
  syntaxThemeFor,
  type SyntaxSpan,
} from "@/lib/syntax-highlight";
import { isDarkDocument, subscribeToThemeChanges } from "@/lib/themes/theme-change";
import { useAppStore } from "@/store/app.store";

/**
 * Sync per-line highlighter for an opened DiffViewer. First paint is plain
 * text until the shared Shiki singleton resolves; only mounted (open) diffs
 * pay for this warmup.
 */
export function useDiffLineHighlighter(language?: string) {
  // The syntax palette must match the theme the diff is painted in: its
  // surface and added/removed washes come from the root `.dark` class, so the
  // palette does too. Picked from the store flag alone, a light page whose
  // flag still said dark drew near-white tokens on the light washes, leaving
  // changed words as empty colored boxes. The flag only stands in where there
  // is no document (server render).
  const storeDark = useAppStore((state) => state.isDarkMode);
  const isDark = useSyncExternalStore(
    subscribeToThemeChanges,
    () => isDarkDocument(storeDark),
    () => storeDark,
  );
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
