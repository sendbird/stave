import type { Monaco } from "@monaco-editor/react";
import type {
  editor as MonacoEditorApi,
  IDisposable,
  IMarkdownString,
  IPosition,
  IRange,
  languages as MonacoLanguages,
} from "monaco-editor";

export interface LanguageIntelligenceSettings {
  enabled: boolean;
  pythonLspCommand: string;
  typescriptLspCommand: string;
  eslintEnabled: boolean;
}

export interface LanguageIntelligenceRuntime {
  getWorkspaceRootPath(): string;
  getSettings(): LanguageIntelligenceSettings;
}

interface SupportedLanguage {
  monacoLanguageId: string;
  lspLanguageId: LspLanguageId;
  getCommandOverride: (settings: LanguageIntelligenceSettings) => string | undefined;
}

// Keep in sync with LspLanguageId in src/types/window-api.d.ts
type LspLanguageId = "python" | "typescript";

interface LspRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

interface LspDiagnostic {
  severity?: number;
  message: string;
  source?: string;
  code?: string;
  range: LspRange;
}

const supportedLanguages: SupportedLanguage[] = [
  {
    monacoLanguageId: "python",
    lspLanguageId: "python",
    getCommandOverride: (settings) => settings.pythonLspCommand.trim() || undefined,
  },
  // TypeScript LSP handles both .ts/.tsx (Monaco: "typescript") and
  // .js/.jsx (Monaco: "javascript") files using the same server session.
  {
    monacoLanguageId: "typescript",
    lspLanguageId: "typescript",
    getCommandOverride: (settings) => settings.typescriptLspCommand.trim() || undefined,
  },
  {
    monacoLanguageId: "javascript",
    lspLanguageId: "typescript",
    getCommandOverride: (settings) => settings.typescriptLspCommand.trim() || undefined,
  },
];

const diagnosticsByFileKey = new Map<string, LspDiagnostic[]>();
const modelDisposables = new Map<string, IDisposable>();
const runtimeRef: { current: LanguageIntelligenceRuntime | null } = { current: null };

let languageIntelligenceConfigured = false;
let diagnosticsSubscriptionDisposer: (() => void) | null = null;

function getSupportedLanguage(languageId: string) {
  return supportedLanguages.find((language) => language.monacoLanguageId === languageId) ?? null;
}

function toWorkspaceFilePath(uri: { scheme: string; path: string; query?: string }) {
  if (uri.scheme !== "file" || uri.query) {
    return null;
  }
  const normalized = uri.path.replaceAll("\\", "/").replace(/^\/+/, "");
  return normalized || null;
}

function toMarkerSeverity(monaco: Monaco, severity?: number): number {
  switch (severity) {
    case 1:
      return monaco.MarkerSeverity.Error;
    case 2:
      return monaco.MarkerSeverity.Warning;
    case 3:
      return monaco.MarkerSeverity.Info;
    case 4:
      return monaco.MarkerSeverity.Hint;
    default:
      return monaco.MarkerSeverity.Info;
  }
}

function toMonacoRange(range: LspRange): IRange {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  };
}

function toLspPosition(position: IPosition) {
  return {
    line: position.lineNumber - 1,
    character: position.column - 1,
  };
}

function toDiagnosticsKey(args: { rootPath: string; languageId: string; filePath: string }) {
  return `${args.rootPath}:${args.languageId}:${args.filePath}`;
}

function toMonacoDocumentation(value: unknown): IMarkdownString | undefined {
  if (typeof value === "string") {
    return { value };
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => toMonacoDocumentation(item)?.value)
      .filter((item): item is string => Boolean(item));
    return parts.length > 0 ? { value: parts.join("\n\n") } : undefined;
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const item = value as { language?: string; value?: string; kind?: string };
  if (typeof item.kind === "string" && typeof item.value === "string") {
    return {
      value: item.kind === "markdown" ? item.value : item.value.replaceAll("\n", "  \n"),
    };
  }
  if (typeof item.language === "string" && typeof item.value === "string") {
    return {
      value: `\`\`\`${item.language}\n${item.value}\n\`\`\``,
    };
  }
  return undefined;
}

function toCompletionKind(monaco: Monaco, kind?: number) {
  const fallback = monaco.languages.CompletionItemKind.Text;
  const mapping: Record<number, MonacoLanguages.CompletionItemKind> = {
    1: monaco.languages.CompletionItemKind.Text,
    2: monaco.languages.CompletionItemKind.Method,
    3: monaco.languages.CompletionItemKind.Function,
    4: monaco.languages.CompletionItemKind.Constructor,
    5: monaco.languages.CompletionItemKind.Field,
    6: monaco.languages.CompletionItemKind.Variable,
    7: monaco.languages.CompletionItemKind.Class,
    8: monaco.languages.CompletionItemKind.Interface,
    9: monaco.languages.CompletionItemKind.Module,
    10: monaco.languages.CompletionItemKind.Property,
    11: monaco.languages.CompletionItemKind.Unit,
    12: monaco.languages.CompletionItemKind.Value,
    13: monaco.languages.CompletionItemKind.Enum,
    14: monaco.languages.CompletionItemKind.Keyword,
    15: monaco.languages.CompletionItemKind.Snippet,
    16: monaco.languages.CompletionItemKind.Color,
    17: monaco.languages.CompletionItemKind.File,
    18: monaco.languages.CompletionItemKind.Reference,
    19: monaco.languages.CompletionItemKind.Folder,
    20: monaco.languages.CompletionItemKind.EnumMember,
    21: monaco.languages.CompletionItemKind.Constant,
    22: monaco.languages.CompletionItemKind.Struct,
    23: monaco.languages.CompletionItemKind.Event,
    24: monaco.languages.CompletionItemKind.Operator,
    25: monaco.languages.CompletionItemKind.TypeParameter,
  };
  return kind ? mapping[kind] ?? fallback : fallback;
}

function applyStoredDiagnosticsToModel(monaco: Monaco, model: MonacoEditorApi.ITextModel) {
  const runtime = runtimeRef.current;
  const supportedLanguage = getSupportedLanguage(model.getLanguageId());
  const filePath = toWorkspaceFilePath(model.uri);
  const rootPath = runtime?.getWorkspaceRootPath() ?? "";

  if (!runtime || !supportedLanguage || !filePath || !rootPath) {
    return;
  }

  const diagnostics = diagnosticsByFileKey.get(toDiagnosticsKey({
    rootPath,
    languageId: supportedLanguage.lspLanguageId,
    filePath,
  })) ?? [];

  monaco.editor.setModelMarkers(
    model,
    `lsp:${supportedLanguage.lspLanguageId}`,
    diagnostics.map((diagnostic) => ({
      severity: toMarkerSeverity(monaco, diagnostic.severity),
      message: diagnostic.message,
      source: diagnostic.source,
      code: diagnostic.code,
      ...toMonacoRange(diagnostic.range),
    })),
  );
}

async function syncModel(monaco: Monaco, model: MonacoEditorApi.ITextModel) {
  const runtime = runtimeRef.current;
  const lspApi = window.api?.lsp;
  const supportedLanguage = getSupportedLanguage(model.getLanguageId());
  const filePath = toWorkspaceFilePath(model.uri);
  const rootPath = runtime?.getWorkspaceRootPath() ?? "";
  const settings = runtime?.getSettings();

  if (!runtime || !lspApi?.syncDocument || !settings?.enabled || !supportedLanguage || !filePath || !rootPath) {
    return;
  }

  await lspApi.syncDocument({
    rootPath,
    languageId: supportedLanguage.lspLanguageId,
    filePath,
    documentLanguageId: model.getLanguageId(),
    text: model.getValue(),
    version: model.getVersionId(),
    commandOverride: supportedLanguage.getCommandOverride(settings),
  });
}

async function closeModel(model: MonacoEditorApi.ITextModel) {
  const runtime = runtimeRef.current;
  const lspApi = window.api?.lsp;
  const supportedLanguage = getSupportedLanguage(model.getLanguageId());
  const filePath = toWorkspaceFilePath(model.uri);
  const rootPath = runtime?.getWorkspaceRootPath() ?? "";

  if (!lspApi?.closeDocument || !supportedLanguage || !filePath || !rootPath) {
    return;
  }

  await lspApi.closeDocument({
    rootPath,
    languageId: supportedLanguage.lspLanguageId,
    filePath,
  });
}

function trackModel(monaco: Monaco, model: MonacoEditorApi.ITextModel) {
  const filePath = toWorkspaceFilePath(model.uri);
  if (!filePath) {
    return;
  }

  const key = model.uri.toString();
  if (modelDisposables.has(key)) {
    return;
  }

  const supportedLanguage = getSupportedLanguage(model.getLanguageId());
  const eslintSupported = isEslintSupported(model.getLanguageId());

  const disposable = model.onDidChangeContent(() => {
    if (supportedLanguage) {
      void syncModel(monaco, model);
    }
    if (eslintSupported) {
      scheduleLintWithEslint(monaco, model);
    }
  });
  modelDisposables.set(key, disposable);

  if (supportedLanguage) {
    applyStoredDiagnosticsToModel(monaco, model);
    void syncModel(monaco, model);
  }
  if (eslintSupported) {
    void lintModelWithEslint(monaco, model);
  }
}

function untrackModel(model: MonacoEditorApi.ITextModel) {
  const key = model.uri.toString();
  modelDisposables.get(key)?.dispose();
  modelDisposables.delete(key);

  if (getSupportedLanguage(model.getLanguageId()) && toWorkspaceFilePath(model.uri)) {
    void closeModel(model);
  }
}

function registerProviders(monaco: Monaco) {
  for (const language of supportedLanguages) {
    monaco.languages.registerHoverProvider(language.monacoLanguageId, {
      provideHover: async (model: MonacoEditorApi.ITextModel, position: IPosition) => {
        const runtime = runtimeRef.current;
        const lspApi = window.api?.lsp;
        const filePath = toWorkspaceFilePath(model.uri);
        const settings = runtime?.getSettings();
        const rootPath = runtime?.getWorkspaceRootPath() ?? "";

        if (!lspApi?.hover || !runtime || !settings?.enabled || !filePath || !rootPath) {
          return null;
        }

        await syncModel(monaco, model);
        const result = await lspApi.hover({
          rootPath,
          languageId: language.lspLanguageId,
          filePath,
          ...toLspPosition(position),
          commandOverride: language.getCommandOverride(settings),
        });
        if (!result.ok || !result.value || typeof result.value !== "object") {
          return null;
        }

        const hover = result.value as {
          contents?: unknown;
          range?: LspRange;
        };
        const content = toMonacoDocumentation(hover.contents);
        if (!content) {
          return null;
        }

        return {
          range: hover.range ? toMonacoRange(hover.range) : undefined,
          contents: [content],
        };
      },
    });

    monaco.languages.registerCompletionItemProvider(language.monacoLanguageId, {
      triggerCharacters: [".", "\"", "'", "/", ":"],
      provideCompletionItems: async (model: MonacoEditorApi.ITextModel, position: IPosition) => {
        const runtime = runtimeRef.current;
        const lspApi = window.api?.lsp;
        const filePath = toWorkspaceFilePath(model.uri);
        const settings = runtime?.getSettings();
        const rootPath = runtime?.getWorkspaceRootPath() ?? "";

        if (!lspApi?.completion || !runtime || !settings?.enabled || !filePath || !rootPath) {
          return { suggestions: [] };
        }

        await syncModel(monaco, model);
        const result = await lspApi.completion({
          rootPath,
          languageId: language.lspLanguageId,
          filePath,
          ...toLspPosition(position),
          commandOverride: language.getCommandOverride(settings),
        });
        if (!result.ok || !result.value) {
          return { suggestions: [] };
        }

        const payload = result.value as { items?: unknown[] } | unknown[];
        const items = Array.isArray(payload) ? payload : Array.isArray(payload.items) ? payload.items : [];

        return {
          suggestions: items
            .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
            .map((item) => {
              const labelValue = item.label;
              const label = typeof labelValue === "string"
                ? labelValue
                : typeof (labelValue as { label?: string })?.label === "string"
                  ? (labelValue as { label: string }).label
                  : "completion";
              const textEdit = item.textEdit as { newText?: string; range?: LspRange } | undefined;
              return {
                label,
                kind: toCompletionKind(monaco, typeof item.kind === "number" ? item.kind : undefined),
                detail: typeof item.detail === "string" ? item.detail : undefined,
                documentation: toMonacoDocumentation(item.documentation),
                insertText: typeof textEdit?.newText === "string"
                  ? textEdit.newText
                  : typeof item.insertText === "string"
                    ? item.insertText
                    : label,
                range: textEdit?.range ? toMonacoRange(textEdit.range) : undefined,
                sortText: typeof item.sortText === "string" ? item.sortText : undefined,
                filterText: typeof item.filterText === "string" ? item.filterText : undefined,
                preselect: item.preselect === true,
              };
            }),
        };
      },
    });

    monaco.languages.registerDefinitionProvider(language.monacoLanguageId, {
      provideDefinition: async (model: MonacoEditorApi.ITextModel, position: IPosition) => {
        const runtime = runtimeRef.current;
        const lspApi = window.api?.lsp;
        const filePath = toWorkspaceFilePath(model.uri);
        const settings = runtime?.getSettings();
        const rootPath = runtime?.getWorkspaceRootPath() ?? "";

        if (!lspApi?.definition || !runtime || !settings?.enabled || !filePath || !rootPath) {
          return [];
        }

        await syncModel(monaco, model);
        const result = await lspApi.definition({
          rootPath,
          languageId: language.lspLanguageId,
          filePath,
          ...toLspPosition(position),
          commandOverride: language.getCommandOverride(settings),
        });
        if (!result.ok || !Array.isArray(result.value)) {
          return [];
        }

        return result.value
          .filter((item): item is { filePath: string; range: LspRange } => Boolean(item && typeof item === "object"))
          .map((item) => ({
            uri: monaco.Uri.parse(`file:///${item.filePath.replaceAll("\\", "/").replace(/^\/+/, "")}`),
            range: toMonacoRange(item.range),
          }));
      },
    });
  }
}

// ESLint-supported file extensions
const eslintLanguageIds = new Set([
  "typescript", "javascript", "typescriptreact", "javascriptreact",
  "json", "jsonc", "vue", "svelte", "html", "css", "scss", "less",
]);

function isEslintSupported(languageId: string) {
  return eslintLanguageIds.has(languageId);
}

interface EslintDiagnostic {
  ruleId: string | null;
  severity: number;
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

function applyEslintDiagnosticsToModel(monaco: Monaco, model: MonacoEditorApi.ITextModel, diagnostics: EslintDiagnostic[]) {
  monaco.editor.setModelMarkers(
    model,
    "eslint",
    diagnostics.map((d) => ({
      severity: d.severity === 2 ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
      message: d.ruleId ? `${d.message} (${d.ruleId})` : d.message,
      source: "eslint",
      startLineNumber: d.line,
      startColumn: d.column,
      endLineNumber: d.endLine ?? d.line,
      endColumn: d.endColumn ?? d.column + 1,
    })),
  );
}

let eslintLintTimer: ReturnType<typeof setTimeout> | null = null;

async function lintModelWithEslint(monaco: Monaco, model: MonacoEditorApi.ITextModel) {
  const runtime = runtimeRef.current;
  const eslintApi = window.api?.eslint;
  const settings = runtime?.getSettings();
  const rootPath = runtime?.getWorkspaceRootPath() ?? "";
  const filePath = toWorkspaceFilePath(model.uri);

  if (!eslintApi?.lint || !settings?.eslintEnabled || !filePath || !rootPath) {
    return;
  }

  if (!isEslintSupported(model.getLanguageId())) {
    return;
  }

  const result = await eslintApi.lint({ rootPath, filePath, text: model.getValue() });
  if (result.ok && result.diagnostics) {
    applyEslintDiagnosticsToModel(monaco, model, result.diagnostics);
  }
}

function scheduleLintWithEslint(monaco: Monaco, model: MonacoEditorApi.ITextModel) {
  if (eslintLintTimer) {
    clearTimeout(eslintLintTimer);
  }
  eslintLintTimer = setTimeout(() => {
    eslintLintTimer = null;
    void lintModelWithEslint(monaco, model);
  }, 500);
}

function registerEslintProviders(monaco: Monaco) {
  // Register formatting provider for all ESLint-supported languages
  for (const languageId of eslintLanguageIds) {
    monaco.languages.registerDocumentFormattingEditProvider(languageId, {
      displayName: "ESLint",
      provideDocumentFormattingEdits: async (model: MonacoEditorApi.ITextModel) => {
        const runtime = runtimeRef.current;
        const eslintApi = window.api?.eslint;
        const settings = runtime?.getSettings();
        const rootPath = runtime?.getWorkspaceRootPath() ?? "";
        const filePath = toWorkspaceFilePath(model.uri);

        if (!eslintApi?.fix || !settings?.eslintEnabled || !filePath || !rootPath) {
          return [];
        }

        const result = await eslintApi.fix({ rootPath, filePath, text: model.getValue() });
        if (!result.ok || !result.output) {
          return [];
        }

        // Replace entire document with fixed output
        const fullRange = model.getFullModelRange();
        return [{
          range: fullRange,
          text: result.output,
        }];
      },
    });
  }
}

function registerModelSync(monaco: Monaco) {
  monaco.editor.getModels().forEach((model: MonacoEditorApi.ITextModel) => trackModel(monaco, model));
  monaco.editor.onDidCreateModel((model: MonacoEditorApi.ITextModel) => {
    trackModel(monaco, model);
  });
  monaco.editor.onWillDisposeModel((model: MonacoEditorApi.ITextModel) => {
    untrackModel(model);
  });
  monaco.editor.onDidChangeModelLanguage(({ model, oldLanguage }: {
    model: MonacoEditorApi.ITextModel;
    oldLanguage: string;
  }) => {
    if (getSupportedLanguage(oldLanguage) && toWorkspaceFilePath(model.uri)) {
      untrackModel(model);
    }
    trackModel(monaco, model);
  });
}

function registerDiagnosticsSubscription(monaco: Monaco) {
  if (diagnosticsSubscriptionDisposer || !window.api?.lsp?.subscribeEvents) {
    return;
  }

  diagnosticsSubscriptionDisposer = window.api.lsp.subscribeEvents((event) => {
    if (event.type !== "diagnostics" || !event.filePath) {
      return;
    }

    const key = toDiagnosticsKey({
      rootPath: event.rootPath,
      languageId: event.languageId,
      filePath: event.filePath,
    });
    diagnosticsByFileKey.set(key, event.diagnostics ?? []);

    const model = monaco.editor.getModel(monaco.Uri.parse(`file:///${event.filePath.replaceAll("\\", "/").replace(/^\/+/, "")}`));
    if (model) {
      applyStoredDiagnosticsToModel(monaco, model);
    }
  });
}

export function configureMonacoLanguageIntelligence(args: {
  monaco: Monaco;
  runtime: LanguageIntelligenceRuntime;
}) {
  runtimeRef.current = args.runtime;
  if (languageIntelligenceConfigured) {
    return;
  }

  registerProviders(args.monaco);
  registerEslintProviders(args.monaco);
  registerModelSync(args.monaco);
  registerDiagnosticsSubscription(args.monaco);
  languageIntelligenceConfigured = true;
}

export async function stopLanguageIntelligenceSessions(rootPath?: string) {
  await window.api?.lsp?.stopSessions?.({ rootPath });
}

export function resyncLanguageIntelligenceModels(monaco: Monaco) {
  for (const model of monaco.editor.getModels()) {
    if (!getSupportedLanguage(model.getLanguageId()) || !toWorkspaceFilePath(model.uri)) {
      continue;
    }
    applyStoredDiagnosticsToModel(monaco, model);
    void syncModel(monaco, model);
  }
}

export async function formatWithEslint(args: {
  rootPath: string;
  filePath: string;
  text: string;
}): Promise<string | null> {
  const eslintApi = window.api?.eslint;
  if (!eslintApi?.fix) return null;

  const result = await eslintApi.fix(args);
  if (!result.ok) {
    return null;
  }
  return result.output ?? null;
}

export function clearLanguageIntelligenceMarkers(monaco: Monaco) {
  for (const model of monaco.editor.getModels()) {
    const filePath = toWorkspaceFilePath(model.uri);
    if (!filePath) continue;

    const supportedLanguage = getSupportedLanguage(model.getLanguageId());
    if (supportedLanguage) {
      monaco.editor.setModelMarkers(model, `lsp:${supportedLanguage.lspLanguageId}`, []);
    }
    if (isEslintSupported(model.getLanguageId())) {
      monaco.editor.setModelMarkers(model, "eslint", []);
    }
  }
}
