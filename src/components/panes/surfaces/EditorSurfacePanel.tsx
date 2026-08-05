import MonacoEditor, { DiffEditor, type Monaco } from "@monaco-editor/react";
import type {
  editor as MonacoEditorApi,
  IPosition,
  IRange,
} from "monaco-editor";
import { FileCode2, LoaderCircle } from "lucide-react";
import type { IDockviewPanelProps } from "dockview-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import {
  createDiffReviewController,
  type DiffReviewController,
  type DiffReviewControllerUpdate,
} from "@/components/layout/editor-diff-review-controller";
import {
  collectModifiedDiffCommentableLines,
  getModifiedDiffEditorLine,
  resolveTaskReviewDraft,
  shouldRenderDiffEditorSurface,
  type TaskReviewDraftState,
} from "@/components/layout/editor-diff-review";
import { EditorImagePreviewOverlay } from "@/components/layout/editor-image-preview-overlay";
import {
  attachInlineCompletionInteractionTracking,
  configureInlineCompletions,
  type InlineCompletionSettings,
} from "@/components/layout/editor-inline-completions";
import {
  clearLanguageIntelligenceMarkers,
  configureMonacoLanguageIntelligence,
  resyncLanguageIntelligenceModels,
  stopLanguageIntelligenceSessions,
  type LanguageIntelligenceRuntime,
} from "@/components/layout/editor-language-intelligence";
import {
  buildDiffEditorModelPath,
  releaseDiffEditorModels,
} from "@/components/layout/editor-main-panel.utils";
import { EditorMarkdownPreview } from "@/components/layout/editor-markdown-preview";
import {
  configureMonacoDefaults,
  supportsWorkspaceTypeLibraries,
  syncWorkspaceMonacoSupport,
  toMonacoModelPath,
  toMonacoSelection,
  toWorkspaceFilePath,
  type PendingEditorNavigation,
} from "@/components/layout/editor-monaco-workspace-support";
import { GitGraphView } from "@/components/git-graph/GitGraphView";
import {
  buildEditorBulkClosePlan,
  closeEditorTabs,
  copyEditorTabBreadcrumbsPath,
  copyEditorTabPath,
  copyEditorTabRelativePath,
  resolveEditorTabAbsolutePath,
  type EditorBulkCloseKind,
  type EditorBulkClosePlan,
} from "@/components/panes/editor-tab-actions";
import { isGitGraphEditorTab } from "@/components/panes/editor-tab-presentation";
import { EditorSurfaceToolbar } from "@/components/panes/surfaces/editor-surface-toolbar";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui";
import { isSnapshotDiffEditorTab } from "@/lib/editor/snapshot-diff-tabs";
import { formatFileSize } from "@/lib/fs/file-preview-limits";
import { buildPanePanelId, parsePanePanelId } from "@/lib/panes/types";
import { resolvePathBaseName } from "@/lib/path-utils";
import { useAppStore } from "@/store/app.store";
import { canSendEditorContextToTask } from "@/store/editor.utils";
import { isDiffEditorTab } from "@/store/layout.utils";
import type { ReviewComment, ReviewCommentDraft } from "@/types/review";

const EMPTY_REVIEW_COMMENTS: ReviewComment[] = [];

/**
 * Monaco view state (cursor, selection, scroll) preserved across panel
 * hide/show. Editor panels use Dockview's default renderer and unmount when
 * hidden, so the view state must outlive the component instance.
 */
const editorViewStateByTabId = new Map<
  string,
  MonacoEditorApi.ICodeEditorViewState
>();
const diffEditorViewStateByTabId = new Map<
  string,
  MonacoEditorApi.IDiffEditorViewState
>();

/**
 * Navigation requested through Monaco's editor opener (go to definition /
 * peek). The target file may open in a different panel than the source, so
 * the pending selection lives at module level and is consumed by whichever
 * editor surface hosts the target file.
 */
let pendingEditorNavigation: PendingEditorNavigation | null = null;

let editorOpenerRegistered = false;

/**
 * Most recently mounted/focused code editor. Inline completion refreshes are
 * registered once globally, so they need a live editor to trigger against.
 */
let lastFocusedCodeEditor: MonacoEditorApi.IStandaloneCodeEditor | null = null;

function getWorkspaceRootPath(): string {
  const state = useAppStore.getState();
  return (
    state.workspacePathById[state.activeWorkspaceId] ?? state.projectPath ?? ""
  );
}

const languageIntelligenceRuntime: LanguageIntelligenceRuntime = {
  getWorkspaceRootPath,
  getSettings: () => {
    const settings = useAppStore.getState().settings;
    return {
      enabled: settings.editorLspEnabled,
      pythonLspCommand: settings.pythonLspCommand,
      typescriptLspCommand: settings.typescriptLspCommand,
      eslintEnabled: settings.editorEslintEnabled,
    };
  },
};

function getInlineCompletionSettings(): InlineCompletionSettings {
  return { enabled: useAppStore.getState().settings.editorAiCompletions };
}

function triggerInlineSuggestRefresh() {
  lastFocusedCodeEditor?.trigger(
    "inline-completion",
    "editor.action.inlineSuggest.trigger",
    {},
  );
}

function ensureEditorOpenerRegistered(monaco: Monaco) {
  if (editorOpenerRegistered) {
    return;
  }
  editorOpenerRegistered = true;
  monaco.editor.registerEditorOpener({
    openCodeEditor: async (
      _source: MonacoEditorApi.ICodeEditor,
      resource: { scheme: string; path: string },
      selectionOrPosition?: IRange | IPosition,
    ) => {
      const filePath = toWorkspaceFilePath(resource);
      if (!filePath) {
        return false;
      }
      pendingEditorNavigation = {
        filePath,
        selection: toMonacoSelection(selectionOrPosition),
      };
      try {
        await useAppStore.getState().openFileFromTree({ filePath });
        return true;
      } catch {
        pendingEditorNavigation = null;
        return false;
      }
    },
  });
}

interface LanguageIntelligenceLifecycleState {
  rootPath: string;
  enabled: boolean;
  pythonLspCommand: string;
  typescriptLspCommand: string;
}

/**
 * LSP session lifecycle is shared by every mounted editor panel: sessions are
 * stopped when the workspace root or the LSP commands change, NOT when an
 * individual panel unmounts (hidden panels unmount while siblings keep using
 * the sessions).
 */
let lastLanguageIntelligenceState: LanguageIntelligenceLifecycleState | null =
  null;

function syncLanguageIntelligenceLifecycle(monaco: Monaco | null) {
  if (!monaco) {
    return;
  }
  const settings = useAppStore.getState().settings;
  const currentState: LanguageIntelligenceLifecycleState = {
    rootPath: getWorkspaceRootPath(),
    enabled: settings.editorLspEnabled,
    pythonLspCommand: settings.pythonLspCommand,
    typescriptLspCommand: settings.typescriptLspCommand,
  };
  const previousState = lastLanguageIntelligenceState;
  if (
    previousState &&
    previousState.rootPath === currentState.rootPath &&
    previousState.enabled === currentState.enabled &&
    previousState.pythonLspCommand === currentState.pythonLspCommand &&
    previousState.typescriptLspCommand === currentState.typescriptLspCommand
  ) {
    return;
  }
  lastLanguageIntelligenceState = currentState;

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
      previousState.typescriptLspCommand !== currentState.typescriptLspCommand);
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

  resyncLanguageIntelligenceModels(monaco);
}

/**
 * Dockview panel wrapper for an editor file tab: a single-file Monaco surface
 * (text / diff / markdown preview / image / commit graph) bound to the panel's
 * editorTabId.
 */
export function EditorSurfacePanel(props: IDockviewPanelProps) {
  const surface = parsePanePanelId(props.api.id);
  if (surface?.kind !== "editor") {
    return null;
  }
  return (
    <EditorTabSurface
      key={surface.editorTabId}
      editorTabId={surface.editorTabId}
    />
  );
}

function EditorTabSurface({ editorTabId }: { editorTabId: string }) {
  const tab = useAppStore(
    (state) => state.editorTabs.find((item) => item.id === editorTabId) ?? null,
  );
  const [
    activeTaskId,
    isDarkMode,
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
    pythonLspCommand,
    typescriptLspCommand,
    pendingEditorSelection,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeTaskId,
          state.isDarkMode,
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
          state.settings.pythonLspCommand,
          state.settings.typescriptLspCommand,
          state.pendingEditorSelection,
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
  const reviewCommentsForActiveTask = useAppStore(
    (state) =>
      state.reviewCommentsByTask[state.activeTaskId] ?? EMPTY_REVIEW_COMMENTS,
  );

  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [bulkClosePlan, setBulkClosePlan] =
    useState<EditorBulkClosePlan | null>(null);
  const [reviewDraftState, setReviewDraftState] =
    useState<TaskReviewDraftState | null>(null);

  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<MonacoEditorApi.IStandaloneCodeEditor | null>(null);
  const diffEditorRef = useRef<MonacoEditorApi.IStandaloneDiffEditor | null>(
    null,
  );
  const diffReviewControllerRef = useRef<DiffReviewController | null>(null);

  const isActiveEditorTab = activeEditorTabId === editorTabId;
  const tabContentTooLarge = tab?.contentState === "too-large";
  const tabContentPending = Boolean(
    tab && (tab.contentState === "deferred" || tab.contentState === "loading"),
  );
  const tabContentUnavailable = tabContentPending || tabContentTooLarge;
  const tabIsImage = Boolean(
    tab && (tab.kind === "image" || tab.language === "image"),
  );
  const tabIsMarkdown = Boolean(
    tab && tab.language === "markdown" && !tabIsImage,
  );
  // The store tracks diff/preview mode for the ACTIVE editor tab only (layout
  // flags). Non-active panels fall back to the tab's intrinsic mode so a
  // source-control diff keeps rendering as a diff in a background split.
  const diffMode = isActiveEditorTab ? editorDiffMode : isDiffEditorTab(tab);
  const showMarkdownPreview = Boolean(
    tabIsMarkdown &&
    isActiveEditorTab &&
    editorMarkdownPreviewMode &&
    !diffMode,
  );
  const monacoTheme = isDarkMode ? "vs-dark" : "vs";
  const modelPath = tab ? toMonacoModelPath(tab.filePath) : undefined;
  const renderDiffEditor = shouldRenderDiffEditorSurface({
    diffMode,
    originalContent: tab?.originalContent,
  });
  const showDiffDisplayControls = Boolean(renderDiffEditor && !tabIsImage);
  const diffSessionKey = showDiffDisplayControls && tab ? tab.id : null;
  // A snapshot diff shows two frozen sides, so there is nothing to edit or
  // save. Keeping it writable would let Cmd+S drop a stale snapshot on top of
  // the working tree file. Added files still use the diff editor: their empty
  // original side is meaningful, and line review controls belong to that diff.
  const tabIsReadOnly = isSnapshotDiffEditorTab(tab);
  const showCodeEditor = Boolean(
    tab &&
    tab.kind !== "git-graph" &&
    !tabContentUnavailable &&
    !tabIsImage &&
    !showMarkdownPreview &&
    !renderDiffEditor,
  );
  const absolutePath = tab
    ? resolveEditorTabAbsolutePath({
        filePath: tab.filePath,
        workspaceRootPath,
      })
    : "";
  const activeFileReviewComments = useMemo(() => {
    if (!tab?.filePath) {
      return EMPTY_REVIEW_COMMENTS;
    }
    return reviewCommentsForActiveTask.filter(
      (comment) => comment.filePath === tab.filePath,
    );
  }, [tab?.filePath, reviewCommentsForActiveTask]);
  const reviewDraft = resolveTaskReviewDraft(reviewDraftState, activeTaskId);
  const canAddReviewComment = Boolean(
    activeTaskId && tab && diffSessionKey && !tabContentUnavailable,
  );
  const canSubmitReviewFeedback = Boolean(
    activeTaskId && reviewCommentsForActiveTask.length > 0,
  );
  const sendToAgentDisabled =
    !canSendEditorContextToTask({
      taskId: activeTaskId,
      hasActiveEditorTab: Boolean(tab),
      isTaskResponding: activeTaskIsResponding,
    }) || tabContentUnavailable;
  const shouldLoadWorkspaceSupport = Boolean(
    workspaceRootPath &&
    tab &&
    !tabIsImage &&
    supportsWorkspaceTypeLibraries(tab.language),
  );
  const workspaceSupportEntryFilePath = shouldLoadWorkspaceSupport
    ? tab?.filePath
    : undefined;

  /**
   * Store actions that operate on the "active" editor tab (save, diff/preview
   * flags, send-to-agent) need this panel's tab active first. setActiveEditorTab
   * is a no-op when it already is.
   */
  const ensureTabActive = useCallback(() => {
    const store = useAppStore.getState();
    if (store.activeEditorTabId !== editorTabId) {
      store.setActiveEditorTab({ tabId: editorTabId });
    }
  }, [editorTabId]);

  const performSave = useCallback(() => {
    ensureTabActive();
    void useAppStore.getState().saveActiveEditorTab();
  }, [ensureTabActive]);
  const performSaveRef = useRef(performSave);
  performSaveRef.current = performSave;

  function handleToggleDiffMode() {
    const nextDiffMode = !diffMode;
    ensureTabActive();
    useAppStore.getState().setLayout({
      patch: {
        editorDiffMode: nextDiffMode,
        ...(nextDiffMode ? { editorMarkdownPreviewMode: false } : {}),
      },
    });
  }

  function handleToggleMarkdownPreviewMode() {
    const nextPreviewMode = !showMarkdownPreview;
    ensureTabActive();
    useAppStore.getState().setLayout({
      patch: {
        editorMarkdownPreviewMode: nextPreviewMode,
        ...(nextPreviewMode ? { editorDiffMode: false } : {}),
      },
    });
  }

  function handleSendToAgent() {
    ensureTabActive();
    const store = useAppStore.getState();
    store.sendEditorContextToChat({ taskId: store.activeTaskId });
  }

  function handleBulkClose(kind: EditorBulkCloseKind) {
    const store = useAppStore.getState();
    const pinnedTabIds = store.editorTabs
      .filter((item) =>
        Boolean(
          store.paneTabMeta[
            buildPanePanelId({ kind: "editor", editorTabId: item.id })
          ]?.pinned,
        ),
      )
      .map((item) => item.id);
    const plan = buildEditorBulkClosePlan({
      editorTabs: store.editorTabs,
      anchorTabId: editorTabId,
      kind,
      pinnedTabIds,
    });
    if (!plan) {
      return;
    }
    if (plan.dirtyTabIds.length > 0) {
      setBulkClosePlan(plan);
      return;
    }
    closeEditorTabs({ tabIds: plan.tabIds });
  }

  const startReviewCommentDraft = useCallback(
    (args: { line?: number } = {}) => {
      if (!activeTaskId || !tab || !diffSessionKey) {
        return;
      }
      const diffEditor = diffEditorRef.current;
      const firstChangedLine = collectModifiedDiffCommentableLines(
        diffEditor?.getLineChanges() ?? null,
      )[0];
      const line =
        args.line ??
        getModifiedDiffEditorLine(diffEditor) ??
        firstChangedLine ??
        (diffEditor?.getModifiedEditor().getModel()?.getLineCount() ? 1 : null);
      if (!line) {
        return;
      }
      setReviewDraftState({
        taskId: activeTaskId,
        draft: {
          filePath: tab.filePath,
          line,
          side: "modified",
          body: "",
        },
      });
    },
    [activeTaskId, diffSessionKey, tab],
  );

  const submitReviewCommentDraft = useCallback(() => {
    if (!reviewDraft || !activeTaskId) {
      return;
    }
    const comment = useAppStore.getState().addReviewComment({
      taskId: activeTaskId,
      filePath: reviewDraft.filePath,
      line: reviewDraft.line,
      side: reviewDraft.side,
      body: reviewDraft.body,
    });
    if (comment) {
      setReviewDraftState(null);
    }
  }, [activeTaskId, reviewDraft]);

  function submitActiveTaskReviewFeedback() {
    if (!activeTaskId || reviewCommentsForActiveTask.length === 0) {
      return;
    }
    void useAppStore.getState().submitReviewFeedback({ taskId: activeTaskId });
  }

  const buildDiffReviewControllerUpdate = useCallback(
    (): DiffReviewControllerUpdate => ({
      comments: activeFileReviewComments,
      draft: reviewDraft,
      onStartDraft: (line) => startReviewCommentDraft({ line }),
      onDraftBodyChange: (body) =>
        setReviewDraftState((current) =>
          current?.taskId === activeTaskId
            ? { ...current, draft: { ...current.draft, body } }
            : current,
        ),
      onCancelDraft: () => setReviewDraftState(null),
      onSubmitDraft: submitReviewCommentDraft,
      onRemoveComment: (commentId) =>
        useAppStore.getState().removeReviewComment({
          taskId: activeTaskId,
          commentId,
        }),
    }),
    [
      activeFileReviewComments,
      activeTaskId,
      reviewDraft,
      startReviewCommentDraft,
      submitReviewCommentDraft,
    ],
  );

  useLayoutEffect(() => {
    diffReviewControllerRef.current?.update(buildDiffReviewControllerUpdate());
  }, [buildDiffReviewControllerUpdate]);

  function applyPendingNavigation(
    editor: MonacoEditorApi.IStandaloneCodeEditor,
  ) {
    const navigation = pendingEditorNavigation;
    if (!navigation || !tab || navigation.filePath !== tab.filePath) {
      return false;
    }
    if (navigation.selection) {
      editor.setSelection(navigation.selection);
      editor.revealRangeInCenter(navigation.selection);
    }
    editor.focus();
    pendingEditorNavigation = null;
    return true;
  }

  const applyPendingStoreSelection = useCallback(
    (editor: MonacoEditorApi.IStandaloneCodeEditor) => {
      const state = useAppStore.getState();
      const pending = state.pendingEditorSelection;
      if (!pending || pending.tabId !== editorTabId) {
        return;
      }
      const model = editor.getModel();
      if (!model) {
        return;
      }
      const lineNumber = Math.min(
        Math.max(1, pending.line),
        model.getLineCount(),
      );
      const maxColumn = model.getLineMaxColumn(lineNumber);
      const column = Math.min(Math.max(1, pending.column ?? 1), maxColumn);
      editor.setSelection({
        startLineNumber: lineNumber,
        startColumn: column,
        endLineNumber: lineNumber,
        endColumn: column,
      });
      editor.setPosition({ lineNumber, column });
      editor.revealPositionInCenter({ lineNumber, column });
      editor.focus();
      state.clearPendingEditorSelection();
    },
    [editorTabId],
  );

  function configureMonaco(monaco: Monaco) {
    monacoRef.current = monaco;
    configureMonacoDefaults(monaco);
    configureMonacoLanguageIntelligence({
      monaco,
      runtime: languageIntelligenceRuntime,
    });
    configureInlineCompletions({
      monaco,
      getSettings: getInlineCompletionSettings,
      triggerInlineSuggestRefresh,
    });
    ensureEditorOpenerRegistered(monaco);
    syncLanguageIntelligenceLifecycle(monaco);
    if (useAppStore.getState().activeEditorTabId === editorTabId) {
      syncWorkspaceMonacoSupport({
        monaco,
        workspaceRootPath,
        shouldLoadWorkspaceSupport,
        entryFilePath: workspaceSupportEntryFilePath,
      });
    }
  }

  // Deferred tabs (restored sessions) are hydrated by the store when they are
  // activated through setActiveEditorTab / openFileFromTree. Activation via a
  // pane click bypasses both, so trigger hydration when the panel shows a
  // deferred tab.
  const tabContentState = tab?.contentState;
  const tabFilePath = tab?.filePath;
  useEffect(() => {
    if (tabContentState !== "deferred" || !tabFilePath) {
      return;
    }
    const store = useAppStore.getState();
    if (store.activeEditorTabId === editorTabId) {
      void store.openFileFromTree({ filePath: tabFilePath });
    } else {
      store.setActiveEditorTab({ tabId: editorTabId });
    }
  }, [tabContentState, tabFilePath, editorTabId]);

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

  // The workspace TS/JS type-library support is global to Monaco, so only the
  // active editor tab drives it (mirrors the previous single-editor panel).
  useEffect(() => {
    if (!isActiveEditorTab) {
      return;
    }
    syncWorkspaceMonacoSupport({
      monaco: monacoRef.current,
      workspaceRootPath,
      shouldLoadWorkspaceSupport,
      entryFilePath: workspaceSupportEntryFilePath,
    });
  }, [
    isActiveEditorTab,
    shouldLoadWorkspaceSupport,
    workspaceRootPath,
    workspaceSupportEntryFilePath,
  ]);

  useEffect(() => {
    syncLanguageIntelligenceLifecycle(monacoRef.current);
  }, [
    editorLspEnabled,
    pythonLspCommand,
    typescriptLspCommand,
    workspaceRootPath,
  ]);

  // Pending navigation from Monaco's editor opener (go to definition).
  useEffect(() => {
    const editor = editorRef.current;
    if (
      !pendingEditorNavigation ||
      !editor ||
      !tab ||
      tabIsImage ||
      showMarkdownPreview ||
      Boolean(diffSessionKey)
    ) {
      return;
    }
    applyPendingNavigation(editor);
    // isActiveEditorTab re-runs this when an already-mounted panel becomes
    // the navigation target (openFileFromTree on an open file).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diffSessionKey, isActiveEditorTab, tab, tabIsImage, showMarkdownPreview]);

  // Pending caret placement requested by openFileFromTree({ line, column }).
  useEffect(() => {
    const editor = editorRef.current;
    if (
      !pendingEditorSelection ||
      pendingEditorSelection.tabId !== editorTabId ||
      !editor ||
      !tab ||
      tabIsImage ||
      showMarkdownPreview ||
      Boolean(diffSessionKey)
    ) {
      return;
    }
    applyPendingStoreSelection(editor);
  }, [
    applyPendingStoreSelection,
    diffSessionKey,
    editorTabId,
    pendingEditorSelection,
    tab,
    tabIsImage,
    showMarkdownPreview,
  ]);

  // Markdown preview hides Monaco, so Cmd/Ctrl+S needs a window-level catch.
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
      performSaveRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showMarkdownPreview]);

  // Persist the code editor view state whenever the Monaco branch unmounts
  // (panel hidden/closed or mode switch). Runs as a layout cleanup so it
  // executes before @monaco-editor/react disposes the editor in its passive
  // effect cleanup.
  useLayoutEffect(() => {
    if (!showCodeEditor) {
      return;
    }
    return () => {
      const editor = editorRef.current;
      if (editor) {
        try {
          const viewState = editor.saveViewState();
          if (viewState) {
            editorViewStateByTabId.set(editorTabId, viewState);
          }
        } catch {
          // The editor may already be disposed during teardown races.
        }
        if (lastFocusedCodeEditor === editor) {
          lastFocusedCodeEditor = null;
        }
      }
      editorRef.current = null;
    };
  }, [showCodeEditor, editorTabId]);

  // Same for the diff editor, plus the model-release workaround:
  // @monaco-editor/react disposes diff models before disposing the widget, so
  // reset the widget first so Monaco does not observe disposed models.
  useLayoutEffect(() => {
    if (!diffSessionKey) {
      return;
    }
    return () => {
      const diffEditor = diffEditorRef.current;
      if (diffEditor) {
        try {
          const viewState = diffEditor.saveViewState();
          if (viewState) {
            diffEditorViewStateByTabId.set(editorTabId, viewState);
          }
        } catch {
          // The diff editor may already be disposed during teardown races.
        }
      }
      diffReviewControllerRef.current?.dispose();
      diffReviewControllerRef.current = null;
      releaseDiffEditorModels(diffEditorRef.current);
      diffEditorRef.current = null;
    };
  }, [diffSessionKey, editorTabId]);

  // Drop preserved view state once the tab itself is closed.
  useEffect(
    () => () => {
      const stillOpen = useAppStore
        .getState()
        .editorTabs.some((item) => item.id === editorTabId);
      if (!stillOpen) {
        editorViewStateByTabId.delete(editorTabId);
        diffEditorViewStateByTabId.delete(editorTabId);
      }
    },
    [editorTabId],
  );

  useEffect(() => {
    if (!reviewDraftState) {
      return;
    }
    if (
      reviewDraftState.taskId !== activeTaskId ||
      !tab?.filePath ||
      !diffSessionKey ||
      reviewDraftState.draft.filePath !== tab.filePath
    ) {
      setReviewDraftState(null);
    }
  }, [activeTaskId, diffSessionKey, tab?.filePath, reviewDraftState]);

  if (!tab) {
    // The panel is about to be reconciled away (tab closed in the store).
    return null;
  }

  return (
    <section
      data-testid="editor-surface"
      className="flex h-full min-h-0 min-w-0 w-full flex-col bg-card"
    >
      {!isGitGraphEditorTab(tab) ? (
        <EditorSurfaceToolbar
          tab={tab}
          absolutePath={absolutePath}
          tabIsImage={tabIsImage}
          tabIsMarkdown={tabIsMarkdown}
          sendToAgentDisabled={sendToAgentDisabled}
          diffMode={diffMode}
          markdownPreviewMode={showMarkdownPreview}
          diffViewMode={diffViewMode}
          showDiffDisplayControls={showDiffDisplayControls}
          reviewCommentCount={reviewCommentsForActiveTask.length}
          canAddReviewComment={canAddReviewComment}
          canSubmitReviewFeedback={canSubmitReviewFeedback}
          onSave={performSave}
          onToggleDiffMode={handleToggleDiffMode}
          onToggleMarkdownPreviewMode={handleToggleMarkdownPreviewMode}
          onChangeDiffViewMode={(mode) =>
            useAppStore.getState().updateSettings({
              patch: { diffViewMode: mode },
            })
          }
          onAddReviewComment={() => startReviewCommentDraft()}
          onSubmitReviewFeedback={submitActiveTaskReviewFeedback}
          onSendToAgent={handleSendToAgent}
          onBulkClose={handleBulkClose}
          onCopyPath={() =>
            void copyEditorTabPath({
              filePath: tab.filePath,
              workspaceRootPath,
            })
          }
          onCopyRelativePath={() =>
            void copyEditorTabRelativePath({ filePath: tab.filePath })
          }
          onCopyBreadcrumbsPath={() =>
            void copyEditorTabBreadcrumbsPath({ filePath: tab.filePath })
          }
        />
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface text-editor-foreground">
        <div className="min-h-0 flex-1 overflow-hidden">
          {tab.kind === "git-graph" ? (
            <GitGraphView
              key={workspaceRootPath || "git-graph:no-workspace"}
              workspaceCwd={workspaceRootPath || undefined}
            />
          ) : tabContentTooLarge ? (
            <div className="flex h-full items-center justify-center bg-editor p-6">
              <Empty className="border-none bg-transparent p-0">
                <EmptyHeader className="gap-3">
                  <EmptyMedia
                    variant="icon"
                    className="size-14 rounded-2xl bg-primary/10 text-primary [&_svg:not([class*='size-'])]:size-7"
                  >
                    <FileCode2 strokeWidth={1.5} />
                  </EmptyMedia>
                  <div className="flex flex-col gap-1">
                    <EmptyTitle className="text-xl font-semibold">
                      File is too large to preview
                    </EmptyTitle>
                    <EmptyDescription className="max-w-md text-sm">
                      {`This file is ${formatFileSize(tab.fileSizeBytes)}. The built-in editor previews files up to ${formatFileSize(tab.fileSizeLimitBytes)}.`}
                    </EmptyDescription>
                  </div>
                </EmptyHeader>
              </Empty>
            </div>
          ) : tabContentPending ? (
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
                      Restoring this editor tab without blocking the rest of the
                      workspace.
                    </EmptyDescription>
                  </div>
                </EmptyHeader>
              </Empty>
            </div>
          ) : tabIsImage ? (
            <div className="flex h-full items-center justify-center overflow-auto bg-editor p-4">
              {tab.content ? (
                <img
                  src={tab.content}
                  alt={resolvePathBaseName({
                    path: tab.filePath,
                    fallback: tab.filePath,
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
              content={tab.content}
              fontSize={editorFontSize}
            />
          ) : renderDiffEditor ? (
            <DiffEditor
              key={diffSessionKey ?? "diff-editor"}
              height="100%"
              language={tab.language}
              original={tab.originalContent}
              modified={tab.content}
              beforeMount={configureMonaco}
              originalModelPath={buildDiffEditorModelPath({
                filePath: tab.filePath,
                tabId: tab.id,
                side: "original",
              })}
              modifiedModelPath={buildDiffEditorModelPath({
                filePath: tab.filePath,
                tabId: tab.id,
                side: "modified",
              })}
              theme={monacoTheme}
              options={{
                readOnly: tabIsReadOnly,
                renderSideBySide: diffViewMode === "split",
                fixedOverflowWidgets: true,
                glyphMargin: true,
                minimap: { enabled: editorMinimap },
                fontSize: editorFontSize,
                fontFamily: editorFontFamily,
                lineNumbers: editorLineNumbers,
                wordWrap: editorWordWrap ? "on" : "off",
              }}
              onMount={(editor, monaco) => {
                editorRef.current = null;
                diffEditorRef.current = editor;
                const savedViewState =
                  diffEditorViewStateByTabId.get(editorTabId);
                if (savedViewState) {
                  editor.restoreViewState(savedViewState);
                }
                diffReviewControllerRef.current?.dispose();
                diffReviewControllerRef.current = createDiffReviewController({
                  diffEditor: editor,
                  monaco,
                });
                diffReviewControllerRef.current.update(
                  buildDiffReviewControllerUpdate(),
                );
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
                      performSaveRef.current();
                    },
                  );
                editor.getModifiedEditor().onDidChangeModelContent(() => {
                  const value = editor.getModifiedEditor().getValue();
                  useAppStore.getState().updateEditorContent({
                    tabId: editorTabId,
                    content: value,
                  });
                });
              }}
            />
          ) : (
            <MonacoEditor
              height="100%"
              language={tab.language}
              value={tab.content}
              path={modelPath}
              beforeMount={configureMonaco}
              onMount={(editor, monaco) => {
                editorRef.current = editor;
                lastFocusedCodeEditor = editor;
                const savedViewState = editorViewStateByTabId.get(editorTabId);
                if (savedViewState) {
                  editor.restoreViewState(savedViewState);
                }
                editor.onDidFocusEditorText(() => {
                  lastFocusedCodeEditor = editor;
                });
                attachInlineCompletionInteractionTracking(editor);
                editor.addCommand(
                  monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
                  () => {
                    performSaveRef.current();
                  },
                );
                // Panels mount on demand, so navigation targets may arrive
                // before Monaco is ready. Apply them once the editor exists.
                if (!applyPendingNavigation(editor)) {
                  applyPendingStoreSelection(editor);
                }
              }}
              onChange={(value) =>
                useAppStore.getState().updateEditorContent({
                  tabId: editorTabId,
                  content: value ?? "",
                })
              }
              theme={monacoTheme}
              options={{
                readOnly: tabIsReadOnly,
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
          )}
        </div>
      </div>
      <EditorImagePreviewOverlay
        open={Boolean(imagePreviewOpen && tabIsImage)}
        imageSrc={tab.content ?? ""}
        alt={resolvePathBaseName({
          path: tab.filePath,
          fallback: tab.filePath,
        })}
        onClose={() => setImagePreviewOpen(false)}
      />
      <ConfirmDialog
        open={Boolean(bulkClosePlan)}
        title={bulkClosePlan?.title ?? "Close Tabs"}
        description={bulkClosePlan?.description ?? ""}
        confirmLabel="Close Tabs"
        onCancel={() => setBulkClosePlan(null)}
        onConfirm={() => {
          if (!bulkClosePlan) {
            return;
          }
          closeEditorTabs({ tabIds: bulkClosePlan.tabIds });
          setBulkClosePlan(null);
        }}
      />
    </section>
  );
}
