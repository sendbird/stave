import { createHighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import {
  CODE_BLOCK_PRE_TRANSFORMER,
  CODE_BLOCK_THEME,
  type CodeBlockHighlightRequest,
  type CodeBlockHighlightResponse,
  type SyntaxCommonLang,
} from "./syntax-highlight-shared";

/*
 * Code-block highlighting runs here so grammar compilation (over 100ms the
 * first time a large grammar such as TSX is used) and back-to-back blocks in a
 * loaded transcript never block the renderer's main thread. Loading the same
 * grammar set as the main-thread singleton keeps language aliases (`ts`, `sh`,
 * `yml`, ...) resolving exactly as before.
 */
const LANGUAGE_LOADERS: Record<SyntaxCommonLang, () => Promise<unknown>> = {
  javascript: () => import("shiki/langs/javascript.mjs"),
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  bash: () => import("shiki/langs/bash.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  diff: () => import("shiki/langs/diff.mjs"),
};

const highlighterPromise = createHighlighterCore({
  themes: [import("shiki/themes/github-dark.mjs")],
  langs: Object.values(LANGUAGE_LOADERS).map((load) => load()) as never,
  engine: createOnigurumaEngine(import("shiki/wasm")),
});

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<CodeBlockHighlightRequest>) => void) | null;
  postMessage: (message: CodeBlockHighlightResponse) => void;
};

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

scope.onmessage = (event) => {
  const { id, code, lang } = event.data;
  void highlighterPromise.then(
    (highlighter) => {
      try {
        scope.postMessage({
          id,
          html: highlighter.codeToHtml(code, {
            lang,
            theme: CODE_BLOCK_THEME,
            transformers: [CODE_BLOCK_PRE_TRANSFORMER],
          }),
        });
      } catch (error) {
        scope.postMessage({ id, error: describe(error) });
      }
    },
    (error: unknown) => {
      scope.postMessage({ id, error: describe(error), fatal: true });
    },
  );
};
