import type { Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditorApi, IDisposable, IPosition } from "monaco-editor";

export interface InlineCompletionSettings {
  enabled: boolean;
}

const DEBOUNCE_MS = 500;
const MIN_PREFIX_LENGTH = 10;

let registeredDisposable: IDisposable | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let activeRequestId = 0;

function getWorkspaceFilePath(uri: { scheme: string; path: string; query?: string }): string | null {
  if (uri.scheme !== "file" || uri.query) {
    return null;
  }
  const normalized = uri.path.replaceAll("\\", "/").replace(/^\/+/, "");
  return normalized || null;
}

function clearDebounce() {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

export function configureInlineCompletions(args: {
  monaco: Monaco;
  getSettings: () => InlineCompletionSettings;
}) {
  if (registeredDisposable) {
    return;
  }

  registeredDisposable = args.monaco.languages.registerInlineCompletionsProvider(
    { pattern: "**" },
    {
      provideInlineCompletions: async (
        model: MonacoEditorApi.ITextModel,
        position: IPosition,
        _context: unknown,
        token: { isCancellationRequested: boolean; onCancellationRequested: (listener: () => void) => IDisposable },
      ) => {
        const currentSettings = args.getSettings();
        if (!currentSettings.enabled) {
          return { items: [] };
        }

        const requestFn = window.api?.inlineCompletion?.request;
        const abortFn = window.api?.inlineCompletion?.abort;
        if (!requestFn || !abortFn) {
          return { items: [] };
        }

        const filePath = getWorkspaceFilePath(model.uri);
        if (!filePath) {
          return { items: [] };
        }

        const fullText = model.getValue();
        const offset = model.getOffsetAt(position);
        const prefix = fullText.slice(0, offset);
        const suffix = fullText.slice(offset);

        if (prefix.trim().length < MIN_PREFIX_LENGTH) {
          return { items: [] };
        }

        // Cancel previous in-flight request
        void abortFn();
        clearDebounce();

        const requestId = ++activeRequestId;

        const completionText = await new Promise<string | null>((resolve) => {
          if (token.isCancellationRequested) {
            resolve(null);
            return;
          }

          const cancelDisposable = token.onCancellationRequested(() => {
            clearDebounce();
            void abortFn();
            resolve(null);
          });

          debounceTimer = setTimeout(async () => {
            debounceTimer = null;

            if (token.isCancellationRequested || requestId !== activeRequestId) {
              cancelDisposable.dispose();
              resolve(null);
              return;
            }

            try {
              const result = await requestFn({
                prefix,
                suffix,
                filePath,
                language: model.getLanguageId(),
              });

              cancelDisposable.dispose();

              if (token.isCancellationRequested || requestId !== activeRequestId) {
                resolve(null);
                return;
              }

              if (!result.ok || !result.text.trim()) {
                resolve(null);
                return;
              }

              resolve(result.text);
            } catch {
              cancelDisposable.dispose();
              resolve(null);
            }
          }, DEBOUNCE_MS);
        });

        if (!completionText) {
          return { items: [] };
        }

        return {
          items: [
            {
              insertText: completionText,
              range: {
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              },
            },
          ],
        };
      },

      freeInlineCompletions() {
        // No resources to free
      },
    },
  );
}

export function disposeInlineCompletions() {
  clearDebounce();
  registeredDisposable?.dispose();
  registeredDisposable = null;
  activeRequestId = 0;
}
