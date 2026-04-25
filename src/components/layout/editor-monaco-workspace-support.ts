import type { Monaco } from "@monaco-editor/react";
import type { IPosition, IRange } from "monaco-editor";
import { loadWorkspaceTypeScriptCompilerOptions, type WorkspaceTypeScriptCompilerOptions } from "./editor-monaco-tsconfig";

export type MonacoDisposable = { dispose(): void };

interface WorkspaceMonacoSupportState {
  rootPath: string;
  typeDefDisposables: MonacoDisposable[];
  sourceFileDisposables: MonacoDisposable[];
  compilerOptionsLoaded: boolean;
  activeContextKey: string | null;
  contextVersion: number;
  loadedTypeDefContextKeys: Set<string>;
  loadedSourceContextKeys: Set<string>;
  loadedTypeDefPaths: Set<string>;
  loadedSourceFilePaths: Set<string>;
  bootstrapPromises: Map<string, Promise<void>>;
  typeDefsPromises: Map<string, Promise<void>>;
  sourceFilesPromises: Map<string, Promise<void>>;
  compilerOptionsPromise?: Promise<void>;
  cancelDeferredSourceLoad?: (() => void) | null;
}

export interface PendingEditorNavigation {
  filePath: string;
  selection: IRange | null;
}

let monacoDefaultsConfigured = false;
let activeWorkspaceMonacoSupport: WorkspaceMonacoSupportState | null = null;
let activeTypeScriptBootstrapSequence = 0;

function getMonacoEnumValue(args: {
  enumValues: Record<string, number>;
  key: string;
  fallback: number;
}) {
  const value = args.enumValues[args.key];
  return typeof value === "number" ? value : args.fallback;
}

function resolveMonacoSourceLanguage(filePath: string) {
  const lower = filePath.toLowerCase();
  if (/\.(tsx?|mts|cts)$/.test(lower) || lower.endsWith(".d.ts")) {
    return "typescript";
  }
  if (/\.(jsx?|mjs|cjs)$/.test(lower)) {
    return "javascript";
  }
  return undefined;
}

function toMonacoBaseUrl(baseUrl?: string) {
  const normalized = (baseUrl ?? "").replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
  if (!normalized || normalized === ".") {
    return "file:///";
  }
  return `file:///${normalized}`;
}

function mapTsOptionNameToMonacoEnumKey(value: string, fallbackKey: string) {
  const normalized = value.trim().toLowerCase();
  const mappings: Record<string, string> = {
    classic: "Classic",
    node: "NodeJs",
    node10: "NodeJs",
    node16: "Node16",
    nodenext: "NodeNext",
    bundler: "Bundler",
    preserve: "Preserve",
    react: "React",
    "react-native": "ReactNative",
    "react-jsx": "ReactJSX",
    "react-jsxdev": "ReactJSXDev",
    "react-jsx-dev": "ReactJSXDev",
    commonjs: "CommonJS",
    amd: "AMD",
    umd: "UMD",
    system: "System",
    es2015: "ES2015",
    es2016: "ES2016",
    es2017: "ES2017",
    es2018: "ES2018",
    es2019: "ES2019",
    es2020: "ES2020",
    es2021: "ES2021",
    es2022: "ES2022",
    es2023: "ES2023",
    esnext: "ESNext",
  };
  return mappings[normalized] ?? fallbackKey;
}

function resolveMonacoEnumValue(args: {
  enumValues: Record<string, number>;
  value?: string;
  fallbackKey: string;
  fallbackValue: number;
}) {
  if (!args.value) {
    return getMonacoEnumValue({
      enumValues: args.enumValues,
      key: args.fallbackKey,
      fallback: args.fallbackValue,
    });
  }
  const key = mapTsOptionNameToMonacoEnumKey(args.value, args.fallbackKey);
  return getMonacoEnumValue({
    enumValues: args.enumValues,
    key,
    fallback: args.fallbackValue,
  });
}

function isMonacoRange(value: IRange | IPosition): value is IRange {
  return "endLineNumber" in value && "endColumn" in value;
}

export function toMonacoSelection(selectionOrPosition?: IRange | IPosition) {
  if (!selectionOrPosition) {
    return null;
  }
  if (isMonacoRange(selectionOrPosition)) {
    return selectionOrPosition;
  }
  return {
    startLineNumber: selectionOrPosition.lineNumber,
    startColumn: selectionOrPosition.column,
    endLineNumber: selectionOrPosition.lineNumber,
    endColumn: selectionOrPosition.column,
  };
}

function toWorkspaceSupportContextKey(entryFilePath?: string | null) {
  const normalized = (entryFilePath ?? "").trim();
  return normalized || "__workspace__";
}

function syncMonacoModels(args: {
  monaco: Monaco;
  files: Array<{ content: string; filePath: string }>;
}) {
  const disposables: MonacoDisposable[] = [];
  for (const file of args.files) {
    const modelUri = args.monaco.Uri.parse(file.filePath);
    const existingModel = args.monaco.editor.getModel(modelUri);
    if (existingModel) {
      continue;
    }
    const model = args.monaco.editor.createModel(
      file.content,
      resolveMonacoSourceLanguage(file.filePath),
      modelUri,
    );
    disposables.push(model);
  }
  return disposables;
}

export function toWorkspaceFilePath(resource: { scheme: string; path: string }) {
  if (resource.scheme !== "file") {
    return null;
  }
  const normalized = resource.path.replaceAll("\\", "/").replace(/^\/+/, "");
  return normalized || null;
}

function disposeMonacoDisposables(disposables: MonacoDisposable[]) {
  for (const disposable of disposables) {
    disposable.dispose();
  }
  disposables.length = 0;
}

function resetWorkspaceMonacoSupportContext(args: {
  state: WorkspaceMonacoSupportState;
  nextContextKey: string | null;
}) {
  args.state.activeContextKey = args.nextContextKey;
  args.state.contextVersion += 1;
  disposeMonacoDisposables(args.state.typeDefDisposables);
  disposeMonacoDisposables(args.state.sourceFileDisposables);
  args.state.loadedTypeDefContextKeys.clear();
  args.state.loadedSourceContextKeys.clear();
  args.state.loadedTypeDefPaths.clear();
  args.state.loadedSourceFilePaths.clear();
  args.state.bootstrapPromises.clear();
  args.state.typeDefsPromises.clear();
  args.state.sourceFilesPromises.clear();
}

function disposeWorkspaceMonacoSupport(state: WorkspaceMonacoSupportState) {
  state.cancelDeferredSourceLoad?.();
  state.cancelDeferredSourceLoad = null;
  resetWorkspaceMonacoSupportContext({
    state,
    nextContextKey: null,
  });
  if (activeWorkspaceMonacoSupport === state) {
    activeWorkspaceMonacoSupport = null;
  }
}

function getWorkspaceMonacoSupportState(rootPath: string) {
  if (activeWorkspaceMonacoSupport?.rootPath === rootPath) {
    return activeWorkspaceMonacoSupport;
  }
  if (activeWorkspaceMonacoSupport) {
    disposeWorkspaceMonacoSupport(activeWorkspaceMonacoSupport);
  }
  activeWorkspaceMonacoSupport = {
    rootPath,
    typeDefDisposables: [],
    sourceFileDisposables: [],
    compilerOptionsLoaded: false,
    activeContextKey: null,
    contextVersion: 0,
    loadedTypeDefContextKeys: new Set<string>(),
    loadedSourceContextKeys: new Set<string>(),
    loadedTypeDefPaths: new Set<string>(),
    loadedSourceFilePaths: new Set<string>(),
    bootstrapPromises: new Map<string, Promise<void>>(),
    typeDefsPromises: new Map<string, Promise<void>>(),
    sourceFilesPromises: new Map<string, Promise<void>>(),
    cancelDeferredSourceLoad: null,
  };
  return activeWorkspaceMonacoSupport;
}

function addMonacoExtraLibs(args: {
  monaco: Monaco;
  files: Array<{ content: string; filePath: string }>;
}) {
  const disposables: MonacoDisposable[] = [];
  for (const file of args.files) {
    disposables.push(args.monaco.languages.typescript.typescriptDefaults.addExtraLib(file.content, file.filePath));
    disposables.push(args.monaco.languages.typescript.javascriptDefaults.addExtraLib(file.content, file.filePath));
  }
  return disposables;
}

function buildMonacoCompilerOptions(args: {
  monaco: Monaco;
  workspaceCompilerOptions?: WorkspaceTypeScriptCompilerOptions | null;
}) {
  const scriptTargetValues = args.monaco.languages.typescript.ScriptTarget as unknown as Record<string, number>;
  const moduleKindValues = args.monaco.languages.typescript.ModuleKind as unknown as Record<string, number>;
  const moduleResolutionValues = args.monaco.languages.typescript.ModuleResolutionKind as unknown as Record<string, number>;
  const workspaceCompilerOptions = args.workspaceCompilerOptions;
  return {
    target: resolveMonacoEnumValue({
      enumValues: scriptTargetValues,
      value: workspaceCompilerOptions?.target,
      fallbackKey: "ES2022",
      fallbackValue: args.monaco.languages.typescript.ScriptTarget.ESNext,
    }),
    lib: workspaceCompilerOptions?.lib?.map((entry) => entry.toLowerCase()) ?? ["es2022", "dom", "dom.iterable"],
    module: resolveMonacoEnumValue({
      enumValues: moduleKindValues,
      value: workspaceCompilerOptions?.module,
      fallbackKey: "ESNext",
      fallbackValue: args.monaco.languages.typescript.ModuleKind.ESNext,
    }),
    moduleResolution: resolveMonacoEnumValue({
      enumValues: moduleResolutionValues,
      value: workspaceCompilerOptions?.moduleResolution,
      fallbackKey: "Bundler",
      fallbackValue: args.monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    }),
    jsx: resolveMonacoEnumValue({
      enumValues: args.monaco.languages.typescript.JsxEmit as unknown as Record<string, number>,
      value: workspaceCompilerOptions?.jsx,
      fallbackKey: "ReactJSX",
      fallbackValue: args.monaco.languages.typescript.JsxEmit.ReactJSX,
    }),
    allowJs: workspaceCompilerOptions?.allowJs ?? true,
    allowNonTsExtensions: true,
    allowSyntheticDefaultImports: workspaceCompilerOptions?.allowSyntheticDefaultImports ?? true,
    esModuleInterop: workspaceCompilerOptions?.esModuleInterop ?? true,
    types: workspaceCompilerOptions?.types?.length ? workspaceCompilerOptions.types : ["node"],
    resolveJsonModule: workspaceCompilerOptions?.resolveJsonModule ?? true,
    resolvePackageJsonExports: true,
    resolvePackageJsonImports: true,
    strict: workspaceCompilerOptions?.strict ?? true,
    noEmit: workspaceCompilerOptions?.noEmit ?? true,
    skipLibCheck: workspaceCompilerOptions?.skipLibCheck ?? true,
    baseUrl: toMonacoBaseUrl(workspaceCompilerOptions?.baseUrl),
    paths: workspaceCompilerOptions?.paths,
  };
}

function applyMonacoCompilerOptions(args: {
  monaco: Monaco;
  workspaceCompilerOptions?: WorkspaceTypeScriptCompilerOptions | null;
}) {
  const compilerOptions = buildMonacoCompilerOptions(args);
  args.monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
  args.monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);
}

function setMonacoTypeScriptSemanticDiagnosticsEnabled(args: {
  monaco: Monaco;
  enabled: boolean;
}) {
  const diagnosticsOptions = {
    noSemanticValidation: !args.enabled,
    noSyntaxValidation: false,
    onlyVisible: true,
  };
  args.monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
  args.monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
}

export function configureMonacoDefaults(monaco: Monaco) {
  if (monacoDefaultsConfigured) {
    return;
  }

  // Large workspaces can register hundreds or thousands of models for inspect support.
  // Eagerly mirroring all of them into the TS worker can leave hover/definition stuck loading.
  monaco.languages.typescript.typescriptDefaults.setEagerModelSync(false);
  monaco.languages.typescript.javascriptDefaults.setEagerModelSync(false);
  setMonacoTypeScriptSemanticDiagnosticsEnabled({
    monaco,
    enabled: false,
  });
  applyMonacoCompilerOptions({ monaco, workspaceCompilerOptions: null });
  monacoDefaultsConfigured = true;
}

async function ensureWorkspaceCompilerOptionsLoaded(args: {
  monaco: Monaco;
  state: WorkspaceMonacoSupportState;
}) {
  if (args.state.compilerOptionsLoaded || args.state.compilerOptionsPromise) {
    return args.state.compilerOptionsPromise;
  }

  args.state.compilerOptionsPromise = loadWorkspaceTypeScriptCompilerOptions(args.state.rootPath)
    .then((workspaceCompilerOptions) => {
      if (activeWorkspaceMonacoSupport !== args.state) {
        return;
      }
      applyMonacoCompilerOptions({
        monaco: args.monaco,
        workspaceCompilerOptions,
      });
      args.state.compilerOptionsLoaded = true;
    })
    .finally(() => {
      args.state.compilerOptionsPromise = undefined;
    });

  return args.state.compilerOptionsPromise;
}

async function ensureWorkspaceTypeDefsLoaded(args: {
  monaco: Monaco;
  state: WorkspaceMonacoSupportState;
  entryFilePath?: string;
}) {
  const contextKey = toWorkspaceSupportContextKey(args.entryFilePath);
  if (args.state.activeContextKey !== contextKey) {
    resetWorkspaceMonacoSupportContext({
      state: args.state,
      nextContextKey: contextKey,
    });
  }
  if (args.state.loadedTypeDefContextKeys.has(contextKey)) {
    return undefined;
  }
  const existingPromise = args.state.typeDefsPromises.get(contextKey);
  if (existingPromise) {
    return existingPromise;
  }

  const readTypeDefs = window.api?.fs?.readTypeDefs;
  if (!readTypeDefs) {
    args.state.loadedTypeDefContextKeys.add(contextKey);
    return undefined;
  }

  const contextVersion = args.state.contextVersion;
  const typeDefsPromise = readTypeDefs({
    rootPath: args.state.rootPath,
    entryFilePath: args.entryFilePath,
  })
    .then((result) => {
      if (
        activeWorkspaceMonacoSupport !== args.state
        || args.state.activeContextKey !== contextKey
        || args.state.contextVersion !== contextVersion
      ) {
        return;
      }
      args.state.loadedTypeDefContextKeys.add(contextKey);
      if (!result.ok) {
        return;
      }
      const nextFiles = result.libs.filter((file) => !args.state.loadedTypeDefPaths.has(file.filePath));
      if (nextFiles.length === 0) {
        return;
      }
      for (const file of nextFiles) {
        args.state.loadedTypeDefPaths.add(file.filePath);
      }
      args.state.typeDefDisposables.push(...addMonacoExtraLibs({
        monaco: args.monaco,
        files: nextFiles,
      }));
    })
    .finally(() => {
      if (args.state.typeDefsPromises.get(contextKey) === typeDefsPromise) {
        args.state.typeDefsPromises.delete(contextKey);
      }
    });

  args.state.typeDefsPromises.set(contextKey, typeDefsPromise);
  return typeDefsPromise;
}

async function ensureWorkspaceSourceFilesLoaded(args: {
  monaco: Monaco;
  state: WorkspaceMonacoSupportState;
  entryFilePath?: string;
}) {
  const contextKey = toWorkspaceSupportContextKey(args.entryFilePath);
  if (args.state.activeContextKey !== contextKey) {
    resetWorkspaceMonacoSupportContext({
      state: args.state,
      nextContextKey: contextKey,
    });
  }
  if (args.state.loadedSourceContextKeys.has(contextKey)) {
    return undefined;
  }
  const existingPromise = args.state.sourceFilesPromises.get(contextKey);
  if (existingPromise) {
    return existingPromise;
  }

  const readSourceFiles = window.api?.fs?.readSourceFiles;
  if (!readSourceFiles) {
    args.state.loadedSourceContextKeys.add(contextKey);
    return undefined;
  }

  const contextVersion = args.state.contextVersion;
  const sourceFilesPromise = readSourceFiles({
    rootPath: args.state.rootPath,
    entryFilePath: args.entryFilePath,
  })
    .then((result) => {
      if (
        activeWorkspaceMonacoSupport !== args.state
        || args.state.activeContextKey !== contextKey
        || args.state.contextVersion !== contextVersion
      ) {
        return;
      }
      args.state.loadedSourceContextKeys.add(contextKey);
      if (!result.ok) {
        return;
      }
      const nextFiles = result.files.filter((file) => !args.state.loadedSourceFilePaths.has(file.filePath));
      if (nextFiles.length === 0) {
        return;
      }
      for (const file of nextFiles) {
        args.state.loadedSourceFilePaths.add(file.filePath);
      }
      args.state.sourceFileDisposables.push(...syncMonacoModels({
        monaco: args.monaco,
        files: nextFiles,
      }));
      args.state.sourceFileDisposables.push(...addMonacoExtraLibs({
        monaco: args.monaco,
        files: nextFiles,
      }));
    })
    .finally(() => {
      if (args.state.sourceFilesPromises.get(contextKey) === sourceFilesPromise) {
        args.state.sourceFilesPromises.delete(contextKey);
      }
    });

  args.state.sourceFilesPromises.set(contextKey, sourceFilesPromise);
  return sourceFilesPromise;
}

async function ensureWorkspaceTypeScriptBootstrapLoaded(args: {
  monaco: Monaco;
  state: WorkspaceMonacoSupportState;
  entryFilePath?: string;
}) {
  const contextKey = toWorkspaceSupportContextKey(args.entryFilePath);
  const existingPromise = args.state.bootstrapPromises.get(contextKey);
  if (existingPromise) {
    return existingPromise;
  }
  if (args.state.activeContextKey !== contextKey) {
    resetWorkspaceMonacoSupportContext({
      state: args.state,
      nextContextKey: contextKey,
    });
  }

  const bootstrapSequence = ++activeTypeScriptBootstrapSequence;
  const contextVersion = args.state.contextVersion;
  setMonacoTypeScriptSemanticDiagnosticsEnabled({
    monaco: args.monaco,
    enabled: false,
  });

  const bootstrapPromise: Promise<void> = Promise.all([
    ensureWorkspaceCompilerOptionsLoaded(args),
    ensureWorkspaceTypeDefsLoaded({
      ...args,
      entryFilePath: args.entryFilePath,
    }),
    ensureWorkspaceSourceFilesLoaded({
      ...args,
      entryFilePath: args.entryFilePath,
    }),
  ]).then(() => undefined).finally(() => {
    if (args.state.bootstrapPromises.get(contextKey) === bootstrapPromise) {
      args.state.bootstrapPromises.delete(contextKey);
    }
    if (
      activeWorkspaceMonacoSupport === args.state
      && args.state.activeContextKey === contextKey
      && args.state.contextVersion === contextVersion
      && activeTypeScriptBootstrapSequence === bootstrapSequence
    ) {
      setMonacoTypeScriptSemanticDiagnosticsEnabled({
        monaco: args.monaco,
        enabled: true,
      });
    }
  });

  args.state.bootstrapPromises.set(contextKey, bootstrapPromise);
  return bootstrapPromise;
}

export function supportsWorkspaceTypeLibraries(language: string) {
  return language === "typescript" || language === "javascript";
}

export function syncWorkspaceMonacoSupport(args: {
  monaco: Monaco | null;
  workspaceRootPath: string;
  shouldLoadWorkspaceSupport: boolean;
  entryFilePath?: string;
}) {
  if (!args.monaco || !args.workspaceRootPath) {
    if (args.monaco) {
      setMonacoTypeScriptSemanticDiagnosticsEnabled({
        monaco: args.monaco,
        enabled: true,
      });
    }
    if (activeWorkspaceMonacoSupport) {
      disposeWorkspaceMonacoSupport(activeWorkspaceMonacoSupport);
    }
    return;
  }

  const supportState = getWorkspaceMonacoSupportState(args.workspaceRootPath);
  void ensureWorkspaceCompilerOptionsLoaded({
    monaco: args.monaco,
    state: supportState,
  });
  if (args.shouldLoadWorkspaceSupport && args.entryFilePath) {
    supportState.cancelDeferredSourceLoad?.();
    supportState.cancelDeferredSourceLoad = null;
    void ensureWorkspaceTypeScriptBootstrapLoaded({
      monaco: args.monaco,
      state: supportState,
      entryFilePath: args.entryFilePath,
    });
    return;
  }

  if (!args.shouldLoadWorkspaceSupport) {
    supportState.cancelDeferredSourceLoad?.();
    supportState.cancelDeferredSourceLoad = null;
    resetWorkspaceMonacoSupportContext({
      state: supportState,
      nextContextKey: null,
    });
    setMonacoTypeScriptSemanticDiagnosticsEnabled({
      monaco: args.monaco,
      enabled: true,
    });
    return;
  }

  resetWorkspaceMonacoSupportContext({
    state: supportState,
    nextContextKey: null,
  });
  setMonacoTypeScriptSemanticDiagnosticsEnabled({
    monaco: args.monaco,
    enabled: true,
  });
}

export function toMonacoModelPath(filePath: string) {
  const normalized = filePath.replaceAll("\\", "/").replace(/^\/+/, "");
  return `file:///${normalized}`;
}
