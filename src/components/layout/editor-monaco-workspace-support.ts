import type { Monaco } from "@monaco-editor/react";
import type { IPosition, IRange } from "monaco-editor";
import { loadWorkspaceTypeScriptCompilerOptions, type WorkspaceTypeScriptCompilerOptions } from "./editor-monaco-tsconfig";

export type MonacoDisposable = { dispose(): void };

interface WorkspaceMonacoSupportState {
  rootPath: string;
  compilerOptionsLoaded: boolean;
  compilerOptionsPromise?: Promise<void>;
}

export interface PendingEditorNavigation {
  filePath: string;
  selection: IRange | null;
}

let monacoDefaultsConfigured = false;
let activeWorkspaceMonacoSupport: WorkspaceMonacoSupportState | null = null;

function getMonacoEnumValue(args: {
  enumValues: Record<string, number>;
  key: string;
  fallback: number;
}) {
  const value = args.enumValues[args.key];
  return typeof value === "number" ? value : args.fallback;
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

export function toWorkspaceFilePath(resource: { scheme: string; path: string }) {
  if (resource.scheme !== "file") {
    return null;
  }
  const normalized = resource.path.replaceAll("\\", "/").replace(/^\/+/, "");
  return normalized || null;
}

function disposeWorkspaceMonacoSupport(state: WorkspaceMonacoSupportState) {
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
    compilerOptionsLoaded: false,
  };
  return activeWorkspaceMonacoSupport;
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

  // Keep Monaco aligned with VS Code-style sync: only opened editor models are
  // mirrored to the TypeScript worker. Project-wide intelligence belongs to LSP.
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
  setMonacoTypeScriptSemanticDiagnosticsEnabled({
    monaco: args.monaco,
    enabled: args.shouldLoadWorkspaceSupport,
  });
}

export function toMonacoModelPath(filePath: string) {
  const normalized = filePath.replaceAll("\\", "/").replace(/^\/+/, "");
  return `file:///${normalized}`;
}
