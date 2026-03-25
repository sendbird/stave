import MonacoEditor, { DiffEditor, type Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditorApi, IPosition, IRange } from "monaco-editor";
import { AlignJustify, Columns2, FileCode2, PenLine, Save, Send, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "@/store/app.store";
import { Badge, Button, Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { copyTextToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import { buildDiffEditorModelPath, releaseDiffEditorModels, type DiffEditorModelOwner } from "./editor-main-panel.utils";
import {
  clearLanguageIntelligenceMarkers,
  configureMonacoLanguageIntelligence,
  resyncLanguageIntelligenceModels,
  stopLanguageIntelligenceSessions,
  type LanguageIntelligenceRuntime,
  type LanguageIntelligenceSettings,
} from "./editor-language-intelligence";
import { loadWorkspaceTypeScriptCompilerOptions, type WorkspaceTypeScriptCompilerOptions } from "./editor-monaco-tsconfig";

type MonacoDisposable = { dispose(): void };

interface WorkspaceMonacoSupportState {
  rootPath: string;
  typeDefDisposables: MonacoDisposable[];
  sourceFileDisposables: MonacoDisposable[];
  compilerOptionsLoaded: boolean;
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

interface PendingEditorNavigation {
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

function toMonacoSelection(selectionOrPosition?: IRange | IPosition) {
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

function toWorkspaceFilePath(resource: { scheme: string; path: string }) {
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

function disposeWorkspaceMonacoSupport(state: WorkspaceMonacoSupportState) {
  state.cancelDeferredSourceLoad?.();
  state.cancelDeferredSourceLoad = null;
  disposeMonacoDisposables(state.typeDefDisposables);
  disposeMonacoDisposables(state.sourceFileDisposables);
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

function configureMonacoDefaults(monaco: Monaco) {
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

  const typeDefsPromise = readTypeDefs({
    rootPath: args.state.rootPath,
    entryFilePath: args.entryFilePath,
  })
    .then((result) => {
      if (activeWorkspaceMonacoSupport !== args.state) {
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
      args.state.typeDefsPromises.delete(contextKey);
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

  const sourceFilesPromise = readSourceFiles({
    rootPath: args.state.rootPath,
    entryFilePath: args.entryFilePath,
  })
    .then((result) => {
      if (activeWorkspaceMonacoSupport !== args.state) {
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
    })
    .finally(() => {
      args.state.sourceFilesPromises.delete(contextKey);
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

  const bootstrapSequence = ++activeTypeScriptBootstrapSequence;
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
    args.state.bootstrapPromises.delete(contextKey);
    if (
      activeWorkspaceMonacoSupport === args.state
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

function supportsWorkspaceTypeLibraries(language: string) {
  return language === "typescript" || language === "javascript";
}

function syncWorkspaceMonacoSupport(args: {
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
    setMonacoTypeScriptSemanticDiagnosticsEnabled({
      monaco: args.monaco,
      enabled: true,
    });
    return;
  }

  setMonacoTypeScriptSemanticDiagnosticsEnabled({
    monaco: args.monaco,
    enabled: true,
  });
}

export function EditorMainPanel() {
  const [
    activeTaskId,
    activeWorkspaceId,
    isDarkMode,
    editorTabs,
    activeEditorTabId,
    editorDiffMode,
    diffViewMode,
    editorMinimap,
    editorFontSize,
    editorFontFamily,
    editorLineNumbers,
    editorTabSize,
    editorWordWrap,
    editorLspEnabled,
    pythonLspCommand,
    setLayout,
    updateSettings,
    setActiveEditorTab,
    reorderEditorTabs,
    closeEditorTab,
    updateEditorContent,
    openFileFromTree,
    sendEditorContextToChat,
    toggleEditorDiffMode,
    saveActiveEditorTab,
  ] = useAppStore(useShallow((state) => [
    state.activeTaskId,
    state.activeWorkspaceId,
    state.isDarkMode,
    state.editorTabs,
    state.activeEditorTabId,
    state.layout.editorDiffMode,
    state.settings.diffViewMode,
    state.settings.editorMinimap,
    state.settings.editorFontSize,
    state.settings.editorFontFamily,
    state.settings.editorLineNumbers,
    state.settings.editorTabSize,
    state.settings.editorWordWrap,
    state.settings.editorLspEnabled,
    state.settings.pythonLspCommand,
    state.setLayout,
    state.updateSettings,
    state.setActiveEditorTab,
    state.reorderEditorTabs,
    state.closeEditorTab,
    state.updateEditorContent,
    state.openFileFromTree,
    state.sendEditorContextToChat,
    state.toggleEditorDiffMode,
    state.saveActiveEditorTab,
  ] as const));
  const workspaceRootPath = useAppStore((state) => state.workspacePathById[state.activeWorkspaceId] ?? state.projectPath ?? "");
  const [tabToClose, setTabToClose] = useState<{ id: string; fileName: string } | null>(null);
  const [bulkCloseRequest, setBulkCloseRequest] = useState<{ tabIds: string[]; title: string; description: string } | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dropTargetTabId, setDropTargetTabId] = useState<string | null>(null);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<MonacoEditorApi.IStandaloneCodeEditor | null>(null);
  const diffEditorRef = useRef<DiffEditorModelOwner | null>(null);
  const activeDiffTabIdRef = useRef<string | null>(null);
  const pendingEditorNavigationRef = useRef<PendingEditorNavigation | null>(null);
  const editorOpenerDisposableRef = useRef<MonacoDisposable | null>(null);
  const workspaceRootPathRef = useRef(workspaceRootPath);
  const languageIntelligenceSettingsRef = useRef<LanguageIntelligenceSettings>({
    enabled: editorLspEnabled,
    pythonLspCommand,
  });
  const languageIntelligenceRuntimeRef = useRef<LanguageIntelligenceRuntime>({
    getWorkspaceRootPath: () => workspaceRootPathRef.current,
    getSettings: () => languageIntelligenceSettingsRef.current,
  });
  const previousLanguageIntelligenceStateRef = useRef<{
    rootPath: string;
    enabled: boolean;
    pythonLspCommand: string;
  } | null>(null);

  workspaceRootPathRef.current = workspaceRootPath;
  languageIntelligenceSettingsRef.current = {
    enabled: editorLspEnabled,
    pythonLspCommand,
  };

  const activeTab = editorTabs.find((tab) => tab.id === activeEditorTabId) ?? null;
  const isImageTab = (tab: { kind?: "text" | "image"; language: string } | null) =>
    Boolean(tab && (tab.kind === "image" || tab.language === "image"));
  const isChatDiffTab = (tab: { id: string; kind?: "text" | "image"; originalContent?: string } | null) =>
    Boolean(tab && tab.kind !== "image" && !tab.id.startsWith("file:") && tab.originalContent != null);
  const activeTabIsImage = isImageTab(activeTab);
  const monacoTheme = isDarkMode ? "vs-dark" : "vs";
  const activeModelPath = activeTab ? toMonacoModelPath(activeTab.filePath) : undefined;
  const showDiffDisplayControls = Boolean(editorDiffMode && activeTab?.originalContent != null && !activeTabIsImage);
  const activeDiffSessionKey = showDiffDisplayControls && activeTab ? activeTab.id : null;
  const shouldLoadWorkspaceSupport = Boolean(
    workspaceRootPath
    && activeTab
    && !activeTabIsImage
    && supportsWorkspaceTypeLibraries(activeTab.language),
  );
  const workspaceSupportEntryFilePath = shouldLoadWorkspaceSupport ? activeTab?.filePath : undefined;
  activeDiffTabIdRef.current = showDiffDisplayControls && activeTab ? activeTab.id : null;

  function configureMonaco(monaco: Monaco) {
    monacoRef.current = monaco;
    configureMonacoDefaults(monaco);
    configureMonacoLanguageIntelligence({
      monaco,
      runtime: languageIntelligenceRuntimeRef.current,
    });
    if (!editorOpenerDisposableRef.current) {
      editorOpenerDisposableRef.current = monaco.editor.registerEditorOpener({
        openCodeEditor: async (
          _source: MonacoEditorApi.ICodeEditor,
          resource: { scheme: string; path: string },
          selectionOrPosition?: IRange | IPosition,
        ) => {
          const filePath = toWorkspaceFilePath(resource);
          if (!filePath) {
            return false;
          }
          pendingEditorNavigationRef.current = {
            filePath,
            selection: toMonacoSelection(selectionOrPosition),
          };
          try {
            await openFileFromTree({ filePath });
            return true;
          } catch {
            pendingEditorNavigationRef.current = null;
            return false;
          }
        },
      });
    }
    syncWorkspaceMonacoSupport({
      monaco,
      workspaceRootPath,
      shouldLoadWorkspaceSupport,
      entryFilePath: workspaceSupportEntryFilePath,
    });
  }

  useEffect(() => {
    return () => {
      editorOpenerDisposableRef.current?.dispose();
      editorOpenerDisposableRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!imagePreviewOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setImagePreviewOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [imagePreviewOpen]);

  useEffect(() => {
    syncWorkspaceMonacoSupport({
      monaco: monacoRef.current,
      workspaceRootPath,
      shouldLoadWorkspaceSupport,
      entryFilePath: workspaceSupportEntryFilePath,
    });
  }, [shouldLoadWorkspaceSupport, workspaceRootPath, workspaceSupportEntryFilePath]);

  useEffect(() => {
    const monaco = monacoRef.current;
    const currentState = {
      rootPath: workspaceRootPath,
      enabled: editorLspEnabled,
      pythonLspCommand,
    };
    const previousState = previousLanguageIntelligenceStateRef.current;
    previousLanguageIntelligenceStateRef.current = currentState;

    if (!monaco) {
      return;
    }

    const rootsToStop = new Set<string>();
    if (previousState?.rootPath && previousState.rootPath !== currentState.rootPath) {
      rootsToStop.add(previousState.rootPath);
    }
    if (!currentState.enabled && currentState.rootPath) {
      rootsToStop.add(currentState.rootPath);
    }
    if (
      currentState.enabled
      && previousState
      && previousState.pythonLspCommand !== currentState.pythonLspCommand
      && currentState.rootPath
    ) {
      rootsToStop.add(currentState.rootPath);
    }

    if (rootsToStop.size > 0) {
      clearLanguageIntelligenceMarkers(monaco);
      for (const rootPath of rootsToStop) {
        void stopLanguageIntelligenceSessions(rootPath);
      }
    }

    if (!currentState.enabled || !currentState.rootPath) {
      clearLanguageIntelligenceMarkers(monaco);
      return;
    }

    const shouldResync = !previousState
      || previousState.rootPath !== currentState.rootPath
      || previousState.enabled !== currentState.enabled
      || previousState.pythonLspCommand !== currentState.pythonLspCommand;

    if (shouldResync) {
      resyncLanguageIntelligenceModels(monaco);
    }
  }, [editorLspEnabled, pythonLspCommand, workspaceRootPath]);

  useEffect(() => {
    return () => {
      void stopLanguageIntelligenceSessions();
    };
  }, []);

  useEffect(() => {
    const pendingNavigation = pendingEditorNavigationRef.current;
    const editor = editorRef.current;
    if (!pendingNavigation || !editor || !activeTab || activeTabIsImage || Boolean(activeDiffSessionKey)) {
      return;
    }
    if (activeTab.filePath !== pendingNavigation.filePath) {
      return;
    }
    if (pendingNavigation.selection) {
      editor.setSelection(pendingNavigation.selection);
      editor.revealRangeInCenter(pendingNavigation.selection);
    }
    editor.focus();
    pendingEditorNavigationRef.current = null;
  }, [activeDiffSessionKey, activeTab, activeTabIsImage]);

  useEffect(() => {
    if (activeTabIsImage || Boolean(activeDiffSessionKey)) {
      editorRef.current = null;
    }
  }, [activeDiffSessionKey, activeTabIsImage]);

  useLayoutEffect(() => {
    if (!activeDiffSessionKey) {
      return;
    }

    return () => {
      // @monaco-editor/react disposes diff models before disposing the widget.
      // Reset the widget first so Monaco does not observe disposed models mid-unmount.
      releaseDiffEditorModels(diffEditorRef.current);
      diffEditorRef.current = null;
    };
  }, [activeDiffSessionKey]);

  function handleTabDragStart(event: DragEvent<HTMLDivElement>, tabId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", tabId);
    setDraggingTabId(tabId);
  }

  function handleTabDrop(event: DragEvent<HTMLDivElement>, toTabId: string) {
    event.preventDefault();
    const fromTabId = draggingTabId ?? event.dataTransfer.getData("text/plain");
    if (fromTabId && fromTabId !== toTabId) {
      reorderEditorTabs({ fromTabId, toTabId });
    }
    setDropTargetTabId(null);
    setDraggingTabId(null);
  }

  const pendingCloseEditorTabId = useAppStore((s) => s.pendingCloseEditorTabId);
  const clearPendingCloseEditorTab = useAppStore((s) => s.clearPendingCloseEditorTab);

  useEffect(() => {
    if (!pendingCloseEditorTabId) {
      return;
    }
    clearPendingCloseEditorTab();
    requestCloseTab(pendingCloseEditorTabId);
  }, [pendingCloseEditorTabId]); // eslint-disable-line react-hooks/exhaustive-deps

  function requestCloseTab(tabId: string) {
    const tab = editorTabs.find((item) => item.id === tabId);
    if (!tab) {
      return;
    }
    if (tab.isDirty) {
      setTabToClose({
        id: tab.id,
        fileName: tab.filePath.split("/").filter(Boolean).at(-1) ?? tab.filePath,
      });
      return;
    }
    closeEditorTab({ tabId: tab.id });
  }

  function requestCloseTabs(args: { tabIds: string[]; title: string; description: string }) {
    const uniqueIds = Array.from(new Set(args.tabIds));
    if (uniqueIds.length === 0) {
      return;
    }
    const dirtyCount = uniqueIds.filter((id) => editorTabs.find((tab) => tab.id === id)?.isDirty).length;
    if (dirtyCount > 0) {
      setBulkCloseRequest({
        tabIds: uniqueIds,
        title: args.title,
        description: `${args.description} ${dirtyCount} unsaved tab(s) will also be closed.`,
      });
      return;
    }
    for (const tabId of uniqueIds) {
      closeEditorTab({ tabId });
    }
  }

  async function copyText(value: string) {
    if (!value) {
      return;
    }
    try {
      await copyTextToClipboard(value);
    } catch {
      // Keep silent; clipboard API can be denied based on runtime permissions.
    }
  }

  function resolveAbsolutePath(filePath: string) {
    const root = workspaceRootPath.replace(/[\\/]+$/, "");
    const relative = filePath.replace(/^[/\\]+/, "");
    if (!root) {
      return filePath;
    }
    return `${root}/${relative}`;
  }

  return (
    <section data-testid="editor-main" className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col rounded-lg border border-border/80 bg-card shadow-sm">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/80 px-3 text-sm">
        <p className="inline-flex items-center gap-2 font-medium text-foreground">
          <FileCode2 className="size-4 text-muted-foreground" />
          Editor
        </p>
        <TooltipProvider>
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                    disabled={!activeTab?.isDirty || activeTabIsImage}
                    onClick={() => void saveActiveEditorTab()}
                  >
                    <Save className="size-4" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">Save (Ctrl S)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                    disabled={!activeTab?.originalContent || activeTabIsImage}
                    onClick={toggleEditorDiffMode}
                  >
                    {editorDiffMode ? <PenLine className="size-4" /> : <Columns2 className="size-4" />}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">{editorDiffMode ? "Back to Edit" : "View Diff"}</TooltipContent>
            </Tooltip>
            {showDiffDisplayControls ? (
              <div className="flex items-center gap-0.5 rounded-md border border-border/80 bg-background/70 p-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={cn(
                        "h-6 w-6 rounded-sm p-0 text-muted-foreground",
                        diffViewMode === "unified" && "bg-secondary text-foreground",
                      )}
                      onClick={() => updateSettings({ patch: { diffViewMode: "unified" } })}
                      aria-label="Unified Diff"
                    >
                      <AlignJustify className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Unified Diff</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={cn(
                        "h-6 w-6 rounded-sm p-0 text-muted-foreground",
                        diffViewMode === "split" && "bg-secondary text-foreground",
                      )}
                      onClick={() => updateSettings({ patch: { diffViewMode: "split" } })}
                      aria-label="Split Diff"
                    >
                      <Columns2 className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Split Diff</TooltipContent>
                </Tooltip>
              </div>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                    disabled={!activeTab}
                    onClick={() => sendEditorContextToChat({ taskId: activeTaskId })}
                  >
                    <Send className="size-4" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">Send to Agent</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                  onClick={() => setLayout({ patch: { editorVisible: false } })}
                >
                  <X className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close Editor</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface text-editor-foreground">
        {editorTabs.length > 0 && <div
          className="tab-strip-scroll min-w-0 w-full max-w-full flex items-end gap-0.5 overflow-x-auto border-b border-border/80 bg-transparent pt-px"
          onWheel={(event) => {
            if (event.deltaY !== 0) {
              event.currentTarget.scrollLeft += event.deltaY;
              event.preventDefault();
            }
          }}
        >
          {editorTabs.map((tab) => (
            <ContextMenu key={tab.id} onOpenChange={(open) => { if (open) setActiveEditorTab({ tabId: tab.id }); }}>
              <ContextMenuTrigger asChild>
                <div
                  draggable
                  onDragStart={(event) => handleTabDragStart(event, tab.id)}
                  onDragEnd={() => {
                    setDraggingTabId(null);
                    setDropTargetTabId(null);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (draggingTabId && draggingTabId !== tab.id) {
                      setDropTargetTabId(tab.id);
                    }
                  }}
                  onDrop={(event) => handleTabDrop(event, tab.id)}
                  className={[
                    "group -mb-px flex shrink-0 items-center gap-1.5 rounded-t-md border px-3 py-1.5 text-sm transition-colors",
                    tab.id === activeEditorTabId
                      ? "border-border/80 border-b-editor bg-editor-tab-active text-editor-foreground"
                      : "border-transparent border-b-border/80 bg-editor-tab text-muted-foreground hover:bg-editor-muted hover:text-editor-foreground",
                    dropTargetTabId === tab.id && draggingTabId && draggingTabId !== tab.id ? "outline outline-1 outline-primary/60" : "",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    className="max-w-56 min-w-0 truncate text-left"
                    title={tab.filePath}
                    onClick={() => setActiveEditorTab({ tabId: tab.id })}
                  >
                    {tab.filePath.split("/").filter(Boolean).at(-1) ?? tab.filePath}
                  </button>
                  {isChatDiffTab(tab) ? (
                    <Badge variant="outline" className="h-4 rounded-sm px-1 text-[10px] uppercase tracking-[0.08em]">
                      Diff
                    </Badge>
                  ) : null}
                  {tab.isDirty ? <span className="text-sm leading-none text-success">●</span> : null}
                  {tab.hasConflict ? <span className="rounded px-1 text-sm font-medium text-warning">!</span> : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`close-${tab.filePath}`}
                    className={[
                      "ml-1 size-4 rounded-sm p-0 transition-colors",
                      "text-muted-foreground hover:bg-editor-muted hover:text-editor-foreground",
                      tab.id === activeEditorTabId ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                    ].join(" ")}
                    onClick={() => {
                      requestCloseTab(tab.id);
                    }}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => requestCloseTab(tab.id)}>Close</ContextMenuItem>
                <ContextMenuItem
                  onSelect={() =>
                    requestCloseTabs({
                      tabIds: editorTabs.filter((t) => t.id !== tab.id).map((t) => t.id),
                      title: "Close Other Tabs",
                      description: "Close all tabs except this tab?",
                    })
                  }
                >
                  Close Others
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() => {
                    const startIndex = editorTabs.findIndex((t) => t.id === tab.id);
                    const rightTabIds = startIndex >= 0 ? editorTabs.slice(startIndex + 1).map((t) => t.id) : [];
                    requestCloseTabs({
                      tabIds: rightTabIds,
                      title: "Close Tabs to the Right",
                      description: "Close all tabs to the right?",
                    });
                  }}
                >
                  Close to the Right
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() =>
                    requestCloseTabs({
                      tabIds: editorTabs.filter((t) => !t.isDirty).map((t) => t.id),
                      title: "Close Saved Tabs",
                      description: "Close all saved tabs?",
                    })
                  }
                >
                  Close Saved
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() =>
                    requestCloseTabs({
                      tabIds: editorTabs.map((t) => t.id),
                      title: "Close All Tabs",
                      description: "Close all open tabs?",
                    })
                  }
                >
                  Close All
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => void copyText(resolveAbsolutePath(tab.filePath))}>
                  Copy Path
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => void copyText(tab.filePath)}>
                  Copy Relative Path
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => void copyText(tab.filePath.split("/").filter(Boolean).join(" > "))}>
                  Copy Breadcrumbs Path
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>}

        <div className="min-h-0 flex-1 overflow-hidden">
          {activeTab ? (
            activeTabIsImage ? (
              <div className="flex h-full items-center justify-center overflow-auto bg-editor p-4">
                {activeTab.content ? (
                  <img
                    src={activeTab.content}
                    alt={activeTab.filePath.split("/").filter(Boolean).at(-1) ?? activeTab.filePath}
                    className="max-h-full max-w-full cursor-zoom-in object-contain"
                    title="Click to open full screen"
                    onClick={() => setImagePreviewOpen(true)}
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">Unable to load image preview.</div>
                )}
              </div>
            ) : editorDiffMode && activeTab.originalContent ? (
              <DiffEditor
                key={activeDiffSessionKey ?? "diff-editor"}
                height="100%"
                language={activeTab.language}
                original={activeTab.originalContent}
                modified={activeTab.content}
                beforeMount={configureMonaco}
                originalModelPath={buildDiffEditorModelPath({
                  filePath: activeTab.filePath,
                  tabId: activeTab.id,
                  side: "original",
                })}
                modifiedModelPath={buildDiffEditorModelPath({
                  filePath: activeTab.filePath,
                  tabId: activeTab.id,
                  side: "modified",
                })}
                theme={monacoTheme}
                options={{
                  readOnly: false,
                  renderSideBySide: diffViewMode === "split",
                  fixedOverflowWidgets: true,
                  minimap: { enabled: editorMinimap },
                  fontSize: editorFontSize,
                  fontFamily: editorFontFamily,
                  lineNumbers: editorLineNumbers,
                  wordWrap: editorWordWrap ? "on" : "off",
                }}
                onMount={(editor) => {
                  editorRef.current = null;
                  diffEditorRef.current = editor;
                  editor.getOriginalEditor().updateOptions({ tabSize: editorTabSize });
                  editor.getModifiedEditor().updateOptions({ tabSize: editorTabSize });
                  editor.getModifiedEditor().onDidChangeModelContent(() => {
                    const activeDiffTabId = activeDiffTabIdRef.current;
                    if (!activeDiffTabId) {
                      return;
                    }
                    const value = editor.getModifiedEditor().getValue();
                    updateEditorContent({ tabId: activeDiffTabId, content: value });
                  });
                }}
              />
            ) : (
              <MonacoEditor
                height="100%"
                language={activeTab.language}
                value={activeTab.content}
                path={activeModelPath}
                beforeMount={configureMonaco}
                onMount={(editor) => {
                  editorRef.current = editor;
                }}
                onChange={(value) =>
                  updateEditorContent({
                    tabId: activeTab.id,
                    content: value ?? "",
                  })
                }
                theme={monacoTheme}
                options={{
                  fixedOverflowWidgets: true,
                  minimap: { enabled: editorMinimap },
                  fontSize: editorFontSize,
                  fontFamily: editorFontFamily,
                  lineNumbers: editorLineNumbers,
                  tabSize: editorTabSize,
                  wordWrap: editorWordWrap ? "on" : "off",
                }}
              />
            )
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <Empty data-testid="editor-empty-state" className="border-none bg-transparent p-0">
                <EmptyHeader className="gap-3">
                  <EmptyMedia
                    variant="icon"
                    className="size-14 rounded-2xl bg-primary/10 text-primary [&_svg:not([class*='size-'])]:size-7"
                  >
                    <FileCode2 strokeWidth={1.5} />
                  </EmptyMedia>
                  <div className="flex flex-col gap-1">
                    <EmptyTitle className="text-2xl font-semibold">Open a file</EmptyTitle>
                    <EmptyDescription className="max-w-md text-sm">
                      Open a file from the Explorer or Changes panel to start editing.
                    </EmptyDescription>
                  </div>
                </EmptyHeader>
              </Empty>
            </div>
          )}
        </div>
      </div>
      {imagePreviewOpen && activeTabIsImage && activeTab ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-overlay p-6 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label="Image full screen preview"
          onClick={() => setImagePreviewOpen(false)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-sm border border-border/80 bg-card/90 px-2 py-1 text-sm text-foreground hover:bg-accent"
            onClick={(event) => {
              event.stopPropagation();
              setImagePreviewOpen(false);
            }}
          >
            Close
          </button>
          <img
            src={activeTab.content}
            alt={activeTab.filePath.split("/").filter(Boolean).at(-1) ?? activeTab.filePath}
            className="max-h-full max-w-full cursor-zoom-out object-contain"
            title="Click to close full screen"
            onClick={(event) => {
              event.stopPropagation();
              setImagePreviewOpen(false);
            }}
          />
        </div>
      ) : null}
      <ConfirmDialog
        open={Boolean(tabToClose)}
        title="Close Tab Without Saving"
        description={tabToClose ? `Close "${tabToClose.fileName}" without saving changes?` : ""}
        confirmLabel="Close Tab"
        onCancel={() => setTabToClose(null)}
        onConfirm={() => {
          if (!tabToClose) {
            return;
          }
          closeEditorTab({ tabId: tabToClose.id });
          setTabToClose(null);
        }}
      />
      <ConfirmDialog
        open={Boolean(bulkCloseRequest)}
        title={bulkCloseRequest?.title ?? "Close Tabs"}
        description={bulkCloseRequest?.description ?? ""}
        confirmLabel="Close Tabs"
        onCancel={() => setBulkCloseRequest(null)}
        onConfirm={() => {
          if (!bulkCloseRequest) {
            return;
          }
          for (const tabId of bulkCloseRequest.tabIds) {
            closeEditorTab({ tabId });
          }
          setBulkCloseRequest(null);
        }}
      />
    </section>
  );
}

function toMonacoModelPath(filePath: string) {
  const normalized = filePath.replaceAll("\\", "/").replace(/^\/+/, "");
  return `file:///${normalized}`;
}
