import MonacoEditor, { DiffEditor, type Monaco } from "@monaco-editor/react";
import type {
  editor as MonacoEditorApi,
  IPosition,
  IRange,
} from "monaco-editor";
import { FileCode2, LoaderCircle } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { resolvePathBaseName } from "@/lib/path-utils";
import { useAppStore } from "@/store/app.store";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { copyTextToClipboard } from "@/lib/clipboard";
import { canSendEditorContextToTask } from "@/store/editor.utils";
import {
  buildDiffEditorModelPath,
  releaseDiffEditorModels,
  type DiffEditorModelOwner,
} from "./editor-main-panel.utils";
import { EditorImagePreviewOverlay } from "./editor-image-preview-overlay";
import { EditorMainTabStrip } from "./editor-main-tab-strip";
import { EditorMainToolbar } from "./editor-main-toolbar";
import { EditorMarkdownPreview } from "./editor-markdown-preview";
import {
  clearLanguageIntelligenceMarkers,
  configureMonacoLanguageIntelligence,
  resyncLanguageIntelligenceModels,
  stopLanguageIntelligenceSessions,
  type LanguageIntelligenceRuntime,
  type LanguageIntelligenceSettings,
} from "./editor-language-intelligence";
import {
  configureInlineCompletions,
  attachInlineCompletionInteractionTracking,
  type InlineCompletionSettings,
} from "./editor-inline-completions";
import {
  configureMonacoDefaults,
  syncWorkspaceMonacoSupport,
  supportsWorkspaceTypeLibraries,
  toMonacoModelPath,
  toMonacoSelection,
  toWorkspaceFilePath,
  type MonacoDisposable,
  type PendingEditorNavigation,
} from "./editor-monaco-workspace-support";

export function EditorMainPanel() {
  const [
    activeTaskId,
    activeWorkspaceId,
    isDarkMode,
    editorTabs,
    activeEditorTabId,
    editorDiffMode,
    editorMarkdownPreviewMode,
    diffViewMode,
    editorMinimap,
    editorFontSize,
    editorFontFamily,
    editorLineNumbers,
    editorTabSize,
    editorWordWrap,
    editorLspEnabled,
    editorAiCompletions,
    editorEslintEnabled,
    pythonLspCommand,
    typescriptLspCommand,
    setLayout,
    updateSettings,
    setActiveEditorTab,
    reorderEditorTabs,
    closeEditorTab,
    updateEditorContent,
    openFileFromTree,
    pendingEditorSelection,
    clearPendingEditorSelection,
    sendEditorContextToChat,
    toggleEditorDiffMode,
    toggleEditorMarkdownPreviewMode,
    saveActiveEditorTab,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeTaskId,
          state.activeWorkspaceId,
          state.isDarkMode,
          state.editorTabs,
          state.activeEditorTabId,
          state.layout.editorDiffMode,
          state.layout.editorMarkdownPreviewMode,
          state.settings.diffViewMode,
          state.settings.editorMinimap,
          state.settings.editorFontSize,
          state.settings.editorFontFamily,
          state.settings.editorLineNumbers,
          state.settings.editorTabSize,
          state.settings.editorWordWrap,
          state.settings.editorLspEnabled,
          state.settings.editorAiCompletions,
          state.settings.editorEslintEnabled,
          state.settings.pythonLspCommand,
          state.settings.typescriptLspCommand,
          state.setLayout,
          state.updateSettings,
          state.setActiveEditorTab,
          state.reorderEditorTabs,
          state.closeEditorTab,
          state.updateEditorContent,
          state.openFileFromTree,
          state.pendingEditorSelection,
          state.clearPendingEditorSelection,
          state.sendEditorContextToChat,
          state.toggleEditorDiffMode,
          state.toggleEditorMarkdownPreviewMode,
          state.saveActiveEditorTab,
        ] as const,
    ),
  );
  const workspaceRootPath = useAppStore(
    (state) =>
      state.workspacePathById[state.activeWorkspaceId] ??
      state.projectPath ??
      "",
  );
  const activeTaskIsResponding = useAppStore((state) =>
    Boolean(state.activeTurnIdsByTask[state.activeTaskId]),
  );
  const [tabToClose, setTabToClose] = useState<{
    id: string;
    fileName: string;
  } | null>(null);
  const [bulkCloseRequest, setBulkCloseRequest] = useState<{
    tabIds: string[];
    title: string;
    description: string;
  } | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dropTargetTabId, setDropTargetTabId] = useState<string | null>(null);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<MonacoEditorApi.IStandaloneCodeEditor | null>(null);
  const diffEditorRef = useRef<DiffEditorModelOwner | null>(null);
  const activeDiffTabIdRef = useRef<string | null>(null);
  const saveActiveEditorTabRef = useRef(saveActiveEditorTab);
  saveActiveEditorTabRef.current = saveActiveEditorTab;
  const pendingEditorNavigationRef = useRef<PendingEditorNavigation | null>(
    null,
  );
  const editorOpenerDisposableRef = useRef<MonacoDisposable | null>(null);
  const workspaceRootPathRef = useRef(workspaceRootPath);
  const languageIntelligenceSettingsRef = useRef<LanguageIntelligenceSettings>({
    enabled: editorLspEnabled,
    pythonLspCommand,
    typescriptLspCommand,
    eslintEnabled: editorEslintEnabled,
  });
  const languageIntelligenceRuntimeRef = useRef<LanguageIntelligenceRuntime>({
    getWorkspaceRootPath: () => workspaceRootPathRef.current,
    getSettings: () => languageIntelligenceSettingsRef.current,
  });
  const inlineCompletionSettingsRef = useRef<InlineCompletionSettings>({
    enabled: editorAiCompletions,
  });
  const previousLanguageIntelligenceStateRef = useRef<{
    rootPath: string;
    enabled: boolean;
    pythonLspCommand: string;
    typescriptLspCommand: string;
  } | null>(null);

  workspaceRootPathRef.current = workspaceRootPath;
  inlineCompletionSettingsRef.current = {
    enabled: editorAiCompletions,
  };
  languageIntelligenceSettingsRef.current = {
    enabled: editorLspEnabled,
    pythonLspCommand,
    typescriptLspCommand,
    eslintEnabled: editorEslintEnabled,
  };

  const activeTab =
    editorTabs.find((tab) => tab.id === activeEditorTabId) ?? null;
  const activeTabContentPending = Boolean(
    activeTab && activeTab.contentState && activeTab.contentState !== "ready",
  );
  const isImageTab = (
    tab: { kind?: "text" | "image"; language: string } | null,
  ) => Boolean(tab && (tab.kind === "image" || tab.language === "image"));
  const activeTabIsImage = isImageTab(activeTab);
  const activeTabIsMarkdown = Boolean(
    activeTab && activeTab.language === "markdown" && !activeTabIsImage,
  );
  const showMarkdownPreview = Boolean(
    activeTabIsMarkdown && editorMarkdownPreviewMode && !editorDiffMode,
  );
  const monacoTheme = isDarkMode ? "vs-dark" : "vs";
  const activeModelPath = activeTab
    ? toMonacoModelPath(activeTab.filePath)
    : undefined;
  const showDiffDisplayControls = Boolean(
    editorDiffMode && activeTab?.originalContent != null && !activeTabIsImage,
  );
  const activeDiffSessionKey =
    showDiffDisplayControls && activeTab ? activeTab.id : null;
  const sendToAgentDisabled =
    !canSendEditorContextToTask({
      taskId: activeTaskId,
      hasActiveEditorTab: Boolean(activeTab),
      isTaskResponding: activeTaskIsResponding,
    }) || activeTabContentPending;
  const shouldLoadWorkspaceSupport = Boolean(
    workspaceRootPath &&
    activeTab &&
    !activeTabIsImage &&
    supportsWorkspaceTypeLibraries(activeTab.language),
  );
  const workspaceSupportEntryFilePath = shouldLoadWorkspaceSupport
    ? activeTab?.filePath
    : undefined;
  activeDiffTabIdRef.current =
    showDiffDisplayControls && activeTab ? activeTab.id : null;

  function configureMonaco(monaco: Monaco) {
    monacoRef.current = monaco;
    configureMonacoDefaults(monaco);
    configureMonacoLanguageIntelligence({
      monaco,
      runtime: languageIntelligenceRuntimeRef.current,
    });
    configureInlineCompletions({
      monaco,
      getSettings: () => inlineCompletionSettingsRef.current,
      triggerInlineSuggestRefresh: () => {
        editorRef.current?.trigger(
          "inline-completion",
          "editor.action.inlineSuggest.trigger",
          {},
        );
      },
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
  }, [
    shouldLoadWorkspaceSupport,
    workspaceRootPath,
    workspaceSupportEntryFilePath,
  ]);

  useEffect(() => {
    const monaco = monacoRef.current;
    const currentState = {
      rootPath: workspaceRootPath,
      enabled: editorLspEnabled,
      pythonLspCommand,
      typescriptLspCommand,
    };
    const previousState = previousLanguageIntelligenceStateRef.current;
    previousLanguageIntelligenceStateRef.current = currentState;

    if (!monaco) {
      return;
    }

    const rootsToStop = new Set<string>();
    if (
      previousState?.rootPath &&
      previousState.rootPath !== currentState.rootPath
    ) {
      rootsToStop.add(previousState.rootPath);
    }
    if (!currentState.enabled && currentState.rootPath) {
      rootsToStop.add(currentState.rootPath);
    }
    const commandChanged =
      previousState &&
      (previousState.pythonLspCommand !== currentState.pythonLspCommand ||
        previousState.typescriptLspCommand !==
          currentState.typescriptLspCommand);
    if (currentState.enabled && commandChanged && currentState.rootPath) {
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

    const shouldResync =
      !previousState ||
      previousState.rootPath !== currentState.rootPath ||
      previousState.enabled !== currentState.enabled ||
      previousState.pythonLspCommand !== currentState.pythonLspCommand ||
      previousState.typescriptLspCommand !== currentState.typescriptLspCommand;

    if (shouldResync) {
      resyncLanguageIntelligenceModels(monaco);
    }
  }, [
    editorLspEnabled,
    pythonLspCommand,
    typescriptLspCommand,
    workspaceRootPath,
  ]);

  useEffect(() => {
    return () => {
      void stopLanguageIntelligenceSessions();
    };
  }, []);

  useEffect(() => {
    const pendingNavigation = pendingEditorNavigationRef.current;
    const editor = editorRef.current;
    if (
      !pendingNavigation ||
      !editor ||
      !activeTab ||
      activeTabIsImage ||
      showMarkdownPreview ||
      Boolean(activeDiffSessionKey)
    ) {
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
  }, [activeDiffSessionKey, activeTab, activeTabIsImage, showMarkdownPreview]);

  useEffect(() => {
    const editor = editorRef.current;
    if (
      !pendingEditorSelection ||
      !editor ||
      !activeTab ||
      activeTabIsImage ||
      showMarkdownPreview ||
      Boolean(activeDiffSessionKey)
    ) {
      return;
    }
    if (activeTab.id !== pendingEditorSelection.tabId) {
      return;
    }

    const model = editor.getModel();
    if (!model) {
      return;
    }
    const lineNumber = Math.min(
      Math.max(1, pendingEditorSelection.line),
      model.getLineCount(),
    );
    const maxColumn = model.getLineMaxColumn(lineNumber);
    const column = Math.min(
      Math.max(1, pendingEditorSelection.column ?? 1),
      maxColumn,
    );
    const selection = {
      startLineNumber: lineNumber,
      startColumn: column,
      endLineNumber: lineNumber,
      endColumn: column,
    };

    editor.setSelection(selection);
    editor.setPosition({ lineNumber, column });
    editor.revealPositionInCenter({ lineNumber, column });
    editor.focus();
    clearPendingEditorSelection();
  }, [
    activeDiffSessionKey,
    activeTab,
    activeTabIsImage,
    clearPendingEditorSelection,
    pendingEditorSelection,
    showMarkdownPreview,
  ]);

  useEffect(() => {
    if (
      activeTabIsImage ||
      Boolean(activeDiffSessionKey) ||
      showMarkdownPreview
    ) {
      editorRef.current = null;
    }
  }, [activeDiffSessionKey, activeTabIsImage, showMarkdownPreview]);

  useEffect(() => {
    if (!showMarkdownPreview) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "s"
      ) {
        return;
      }
      event.preventDefault();
      void saveActiveEditorTabRef.current();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showMarkdownPreview]);

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
  const clearPendingCloseEditorTab = useAppStore(
    (s) => s.clearPendingCloseEditorTab,
  );

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
        fileName: resolvePathBaseName({
          path: tab.filePath,
          fallback: tab.filePath,
        }),
      });
      return;
    }
    closeEditorTab({ tabId: tab.id });
  }

  function requestCloseTabs(args: {
    tabIds: string[];
    title: string;
    description: string;
  }) {
    const uniqueIds = Array.from(new Set(args.tabIds));
    if (uniqueIds.length === 0) {
      return;
    }
    const dirtyCount = uniqueIds.filter(
      (id) => editorTabs.find((tab) => tab.id === id)?.isDirty,
    ).length;
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
    <section
      data-testid="editor-main"
      className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col bg-card"
    >
      <EditorMainToolbar
        activeTab={activeTab}
        activeTabIsImage={activeTabIsImage}
        activeTabIsMarkdown={activeTabIsMarkdown}
        sendToAgentDisabled={sendToAgentDisabled}
        editorDiffMode={editorDiffMode}
        editorMarkdownPreviewMode={editorMarkdownPreviewMode}
        diffViewMode={diffViewMode}
        showDiffDisplayControls={showDiffDisplayControls}
        onSave={() => void saveActiveEditorTab()}
        onToggleEditorDiffMode={toggleEditorDiffMode}
        onToggleEditorMarkdownPreviewMode={toggleEditorMarkdownPreviewMode}
        onChangeDiffViewMode={(mode) =>
          updateSettings({ patch: { diffViewMode: mode } })
        }
        onSendToAgent={() => sendEditorContextToChat({ taskId: activeTaskId })}
        onCloseEditor={() => setLayout({ patch: { editorVisible: false } })}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface text-editor-foreground">
        <EditorMainTabStrip
          editorTabs={editorTabs}
          activeEditorTabId={activeEditorTabId}
          draggingTabId={draggingTabId}
          dropTargetTabId={dropTargetTabId}
          onSetDraggingTabId={setDraggingTabId}
          onSetDropTargetTabId={setDropTargetTabId}
          onTabDragStart={handleTabDragStart}
          onTabDrop={handleTabDrop}
          onActivateTab={(tabId) => setActiveEditorTab({ tabId })}
          onRequestCloseTab={requestCloseTab}
          onRequestCloseTabs={requestCloseTabs}
          onCopyPath={(filePath) =>
            void copyText(resolveAbsolutePath(filePath))
          }
          onCopyRelativePath={(filePath) => void copyText(filePath)}
          onCopyBreadcrumbs={(filePath) =>
            void copyText(filePath.split("/").filter(Boolean).join(" > "))
          }
        />

        {activeTab ? (
          <div className="flex min-w-0 items-center border-b border-success/30 bg-editor px-3 py-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default truncate text-[11px] text-muted-foreground">
                  {activeTab.filePath}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-sm break-all">
                {resolveAbsolutePath(activeTab.filePath)}
              </TooltipContent>
            </Tooltip>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-hidden">
          {activeTab ? (
            activeTabContentPending ? (
              <div className="flex h-full items-center justify-center bg-editor p-6">
                <Empty className="border-none bg-transparent p-0">
                  <EmptyHeader className="gap-3">
                    <EmptyMedia
                      variant="icon"
                      className="size-14 rounded-2xl bg-primary/10 text-primary [&_svg:not([class*='size-'])]:size-7"
                    >
                      <LoaderCircle
                        className="size-7 animate-spin"
                        strokeWidth={1.6}
                      />
                    </EmptyMedia>
                    <div className="flex flex-col gap-1">
                      <EmptyTitle className="text-xl font-semibold">
                        Loading tab…
                      </EmptyTitle>
                      <EmptyDescription className="max-w-md text-sm">
                        Restoring this editor tab without blocking the rest of
                        the workspace.
                      </EmptyDescription>
                    </div>
                  </EmptyHeader>
                </Empty>
              </div>
            ) : activeTabIsImage ? (
              <div className="flex h-full items-center justify-center overflow-auto bg-editor p-4">
                {activeTab.content ? (
                  <img
                    src={activeTab.content}
                    alt={resolvePathBaseName({
                      path: activeTab.filePath,
                      fallback: activeTab.filePath,
                    })}
                    className="max-h-full max-w-full cursor-zoom-in object-contain"
                    title="Click to open full screen"
                    onClick={() => setImagePreviewOpen(true)}
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Unable to load image preview.
                  </div>
                )}
              </div>
            ) : showMarkdownPreview ? (
              <EditorMarkdownPreview
                data-testid="editor-markdown-preview"
                content={activeTab.content}
                fontSize={editorFontSize}
              />
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
                onMount={(editor, monaco) => {
                  editorRef.current = null;
                  diffEditorRef.current = editor;
                  editor
                    .getOriginalEditor()
                    .updateOptions({ tabSize: editorTabSize });
                  editor
                    .getModifiedEditor()
                    .updateOptions({ tabSize: editorTabSize });
                  editor
                    .getModifiedEditor()
                    .addCommand(
                      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
                      () => {
                        void saveActiveEditorTabRef.current();
                      },
                    );
                  editor.getModifiedEditor().onDidChangeModelContent(() => {
                    const activeDiffTabId = activeDiffTabIdRef.current;
                    if (!activeDiffTabId) {
                      return;
                    }
                    const value = editor.getModifiedEditor().getValue();
                    updateEditorContent({
                      tabId: activeDiffTabId,
                      content: value,
                    });
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
                onMount={(editor, monaco) => {
                  editorRef.current = editor;
                  attachInlineCompletionInteractionTracking(editor);
                  editor.addCommand(
                    monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
                    () => {
                      void saveActiveEditorTabRef.current();
                    },
                  );
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
                  inlineSuggest: {
                    enabled: editorAiCompletions,
                    mode: "subword",
                  },
                }}
              />
            )
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <Empty
                data-testid="editor-empty-state"
                className="border-none bg-transparent p-0"
              >
                <EmptyHeader className="gap-3">
                  <EmptyMedia
                    variant="icon"
                    className="size-14 rounded-2xl bg-primary/10 text-primary [&_svg:not([class*='size-'])]:size-7"
                  >
                    <FileCode2 strokeWidth={1.5} />
                  </EmptyMedia>
                  <div className="flex flex-col gap-1">
                    <EmptyTitle className="text-2xl font-semibold">
                      Open a file
                    </EmptyTitle>
                    <EmptyDescription className="max-w-md text-sm">
                      Open a file from the Explorer or Source Control panel to
                      start editing.
                    </EmptyDescription>
                  </div>
                </EmptyHeader>
              </Empty>
            </div>
          )}
        </div>
      </div>
      <EditorImagePreviewOverlay
        open={Boolean(imagePreviewOpen && activeTabIsImage && activeTab)}
        imageSrc={activeTab?.content ?? ""}
        alt={
          activeTab
            ? resolvePathBaseName({
                path: activeTab.filePath,
                fallback: activeTab.filePath,
              })
            : "Image preview"
        }
        onClose={() => setImagePreviewOpen(false)}
      />
      <ConfirmDialog
        open={Boolean(tabToClose)}
        title="Close Tab Without Saving"
        description={
          tabToClose
            ? `Close "${tabToClose.fileName}" without saving changes?`
            : ""
        }
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
