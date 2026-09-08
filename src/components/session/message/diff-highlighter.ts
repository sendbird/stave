import { useCallback, useEffect, useState } from "react";
import {
  getSyntaxHighlighter,
  highlightLineSpans,
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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getSyntaxHighlighter().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const theme = isDark ? "github-dark" : "github-light";
  return useCallback(
    (line: string, lang?: string): readonly SyntaxSpan[] =>
      highlightLineSpans(line, lang ?? language, theme),
    [language, ready, theme],
  );
}
