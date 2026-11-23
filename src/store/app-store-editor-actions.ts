import type { StoreApi } from "zustand";
import { i18n } from "@/i18n/runtime";
import { formatWithEslint } from "@/components/layout/editor-language-intelligence";
import { loadWorkspaceEditorTabBodies } from "@/lib/db/workspaces.db";
import { isSnapshotDiffEditorTab } from "@/lib/editor/snapshot-diff-tabs";
import { workspaceFsAdapter } from "@/lib/fs";
import { isPdfFilePath } from "@/lib/fs/file-preview-limits";
import type { WorkspaceFileData, WorkspaceImageData } from "@/lib/fs/fs.types";
import { COMMIT_GRAPH_TITLE } from "@/lib/git-graph/presentation";
import { toast } from "@/lib/notifications/toast";
import { resolveWorkspaceRelativeFilePath } from "@/lib/workspace-file-path";
import type { AppState } from "@/store/app-store.types";
import {
  canSendEditorContextToTask,
  canSendWorkspaceFileToTask,
  getTooLargeEditorTabMetadata,
  isImageFilePath,
  isHtmlEditorTab,
  isMarkdownEditorTab,
  resolveLanguage,
  updateMessageById,
} from "@/store/editor.utils";
import { resolveEditorLayoutForActivatedTab } from "@/store/layout.utils";
import type { EditorTab, PromptDraft } from "@/types/chat";

const EMPTY_PROMPT_DRAFT: PromptDraft = {
  text: "",
  attachedFilePaths: [],
  attachments: [],
};

/** Deterministic editor-tab id for the per-workspace commit graph panel. */
export function gitGraphTabId(workspaceId: string): string {
  return `git-graph:${workspaceId}`;
}

export function resolveOpenableGitGraphWorkspaceId(args: {
  activeWorkspaceId: string;
  repositoryPath: string | null;
  workspaces: ReadonlyArray<{ id: string }>;
  workspacePathById: Record<string, string>;
}): string | null {
  const workspaceId = args.activeWorkspaceId.trim();
  if (
    !workspaceId ||
    !args.workspaces.some((workspace) => workspace.id === workspaceId)
  ) {
    return null;
  }

  const workspacePath =
    args.workspacePathById[workspaceId] ?? args.repositoryPath ?? "";
  return workspacePath.trim() ? workspaceId : null;
}

type EditorActionName =
  | "resolveDiff"
  | "openDiffInEditor"
  | "openGitGraph"
  | "openFileFromTree"
  | "setActiveEditorTab"
  | "setEditorTabHtmlViewMode"
  | "closeEditorTab"
  | "requestCloseActiveEditorTab"
  | "clearPendingCloseEditorTab"
  | "clearPendingEditorSelection"
  | "updateEditorContent"
  | "saveActiveEditorTab"
  | "resolveEditorTabConflict"
  | "checkOpenTabConflicts"
  | "sendEditorContextToChat"
  | "sendWorkspaceFileToChat";

type EditorActions = Pick<AppState, EditorActionName>;
type AppStoreSet = StoreApi<AppState>["setState"];
type AppStoreGet = StoreApi<AppState>["getState"];

function incrementWorkspaceSnapshotVersion(
  state: Pick<AppState, "workspaceSnapshotVersion">,
) {
  return state.workspaceSnapshotVersion + 1;
}

function getEditorWorkspaceRoot(state: AppState) {
  return state.workspacePathById[state.activeWorkspaceId] || state.repositoryPath;
}

function isSameEditorWorkspace(current: AppState, captured: AppState) {
  return (
    current.activeWorkspaceId === captured.activeWorkspaceId &&
    getEditorWorkspaceRoot(current) === getEditorWorkspaceRoot(captured)
  );
}

function hasSameEditorBase(tab: EditorTab, captured: EditorTab) {
  return (
    tab.filePath === captured.filePath &&
    tab.kind === captured.kind &&
    tab.contentState === captured.contentState &&
    tab.baseRevision === captured.baseRevision &&
    tab.savedContent === captured.savedContent &&
    tab.originalContent === captured.originalContent &&
    tab.hasConflict === captured.hasConflict &&
    tab.conflictRevision === captured.conflictRevision
  );
}

function applyEditorDiskContents(
  tab: EditorTab,
  disk: WorkspaceFileData | WorkspaceImageData,
): EditorTab {
  const content = "dataUrl" in disk ? disk.dataUrl : disk.content;
  return {
    ...tab,
    content: disk.tooLarge ? "" : content,
    contentState: disk.tooLarge ? "too-large" : "ready",
    originalContent: disk.tooLarge
      ? undefined
      : tab.id.startsWith("file:") && tab.kind !== "image"
        ? content
        : tab.originalContent,
    savedContent: disk.tooLarge
      ? undefined
      : tab.kind === "image"
        ? tab.savedContent
        : content,
    baseRevision: disk.revision,
    fileSizeBytes: disk.sizeBytes,
    fileSizeLimitBytes: disk.maxSizeBytes,
    hasConflict: false,
    conflictRevision: null,
    isDirty: false,
  };
}

function editorFileKey(state: AppState, tab: EditorTab) {
  return JSON.stringify([
    state.activeWorkspaceId,
    getEditorWorkspaceRoot(state),
    tab.filePath,
  ]);
}

/**
 * Disk anchor for a freshly opened live diff tab: the modified side's content
 * together with the revision of the very read that produced it.
 *
 * The anchor is what gives the tab's first save the same stale-write protection
 * a file tab has, and it is what lets the conflict poll tell "unchanged on disk"
 * apart from "never anchored". Content and revision have to come from one read.
 * The caller's `newContent` was produced by an earlier `git diff` request, so
 * pairing it with a revision read afterwards can anchor already-stale content to
 * a newer revision — the poll then treats the tab as current and the first save
 * passes the revision check, dropping the update the tab never showed. For a
 * live diff the modified side IS the file on disk, so when the two reads
 * disagree this one wins for both fields.
 *
 * A snapshot diff has no anchor to take: neither side is the file on disk, and
 * the tab is neither refreshed nor saved. A failed or oversized read degrades to
 * `null` so a missing anchor never blocks the diff from opening.
 */
async function readDiffTabDiskAnchor(args: {
  editorTabId: string;
  filePath: string;
}): Promise<{ content: string; revision: string } | null> {
  if (isSnapshotDiffEditorTab({ id: args.editorTabId })) {
    return null;
  }
  try {
    const disk = await workspaceFsAdapter.readFile({
      filePath: args.filePath,
    });
    if (!disk || disk.tooLarge || !disk.revision) {
      return null;
    }
    return { content: disk.content, revision: disk.revision };
  } catch {
    return null;
  }
}

export function createEditorActions(args: {
  set: AppStoreSet;
  get: AppStoreGet;
}): EditorActions {
  const { set, get } = args;
  // A poll must not adopt the bytes of a write before its save is acknowledged.
  const pendingSaves = new Set<string>();

  function updateEditorTab(
    capturedState: AppState,
    capturedTab: EditorTab,
    update: (tab: EditorTab) => EditorTab,
  ) {
    let applied = false;
    set((state) => {
      if (!isSameEditorWorkspace(state, capturedState)) {
        return state;
      }
      const tab = state.editorTabs.find((tab) => tab.id === capturedTab.id);
      if (!tab || !hasSameEditorBase(tab, capturedTab)) {
        return state;
      }
      const updated = update(tab);
      if (updated === tab) {
        return state;
      }
      applied = true;
      return {
        editorTabs: state.editorTabs.map((item) =>
          item === tab ? updated : item,
        ),
        workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
      };
    });
    return applied;
  }

  const hydrateDeferredEditorTab = async (args: {
    workspaceId: string;
    tabId: string;
  }) => {
    let filePath = "";
    let shouldHydrate = false;

    set((state) => {
      if (state.activeWorkspaceId !== args.workspaceId) {
        return {};
      }
      const targetTab = state.editorTabs.find((tab) => tab.id === args.tabId);
      if (
        !targetTab ||
        targetTab.contentState === "ready" ||
        targetTab.contentState === "loading" ||
        targetTab.contentState === "too-large" ||
        targetTab.contentState === "read-only"
      ) {
        return {};
      }
      if (targetTab.id.startsWith("file:") && !targetTab.isDirty && isPdfFilePath(targetTab.filePath)) {
        return {
          editorTabs: state.editorTabs.map((tab) => tab.id === args.tabId
            ? { ...tab, content: "", contentState: "read-only" }
            : tab),
        };
      }
      filePath = targetTab.filePath;
      shouldHydrate = true;
      return {
        editorTabs: state.editorTabs.map((tab) =>
          tab.id === args.tabId
            ? {
                ...tab,
                contentState: "loading",
              }
            : tab,
        ),
      };
    });

    if (!shouldHydrate) {
      return;
    }

    let body = null as
      Awaited<ReturnType<typeof loadWorkspaceEditorTabBodies>>[number] | null;
    let tooLargeMetadata: ReturnType<typeof getTooLargeEditorTabMetadata> =
      null;
    try {
      body =
        (
          await loadWorkspaceEditorTabBodies({
            workspaceId: args.workspaceId,
            tabIds: [args.tabId],
          })
        )[0] ?? null;
    } catch {
      body = null;
    }

    if (!body && filePath) {
      const state = get();
      const workspaceRootPath =
        state.workspacePathById[args.workspaceId] || state.repositoryPath;
      let fileData = await workspaceFsAdapter.readFile({
        filePath,
      });
      if (!fileData && workspaceRootPath) {
        await workspaceFsAdapter.setRoot?.({
          rootPath: workspaceRootPath,
          rootName: state.repositoryName ?? "project",
        });
        fileData = await workspaceFsAdapter.readFile({
          filePath,
        });
      }
      if (fileData) {
        tooLargeMetadata = getTooLargeEditorTabMetadata(fileData);
        if (!tooLargeMetadata) {
          body = {
            id: args.tabId,
            content: fileData.content,
            originalContent: fileData.content,
            savedContent: fileData.content,
          };
        }
      }
    }

    set((state) => {
      if (state.activeWorkspaceId !== args.workspaceId) {
        return {};
      }
      const targetTab = state.editorTabs.find((tab) => tab.id === args.tabId);
      if (!targetTab || targetTab.contentState !== "loading") {
        return {};
      }
      return {
        editorTabs: state.editorTabs.map((tab) => {
          if (tab.id !== args.tabId) {
            return tab;
          }
          if (tooLargeMetadata) {
            return {
              ...tab,
              content: "",
              contentState: "too-large",
              originalContent: undefined,
              savedContent: undefined,
              baseRevision: tooLargeMetadata.baseRevision,
              fileSizeBytes: tooLargeMetadata.fileSizeBytes,
              fileSizeLimitBytes: tooLargeMetadata.fileSizeLimitBytes,
              hasConflict: false,
              isDirty: false,
            };
          }
          if (!body) {
            return {
              ...tab,
              contentState: "deferred",
            };
          }
          return {
            ...tab,
            content: body.content,
            contentState: "ready",
            ...(body.originalContent !== undefined
              ? { originalContent: body.originalContent }
              : {}),
            ...(body.savedContent !== undefined
              ? { savedContent: body.savedContent }
              : {}),
          };
        }),
      };
    });
  };

  /**
   * Writes one tab to disk against the revision its edits started from. A tab
   * flagged with a conflict is not written at all: the user has to choose
   * Keep mine or Reload first, so a repeated Cmd+S cannot overwrite the
   * change that arrived on disk.
   */
  const saveEditorTab = async (
    tabId: string,
  ): Promise<{ ok: boolean; conflict?: boolean }> => {
    const state = get();
    const activeTab = state.editorTabs.find((tab) => tab.id === tabId);
    if (!activeTab) {
      return { ok: false };
    }
    if (activeTab.contentState && activeTab.contentState !== "ready") {
      return { ok: false };
    }
    if (activeTab.kind === "image") {
      return { ok: false };
    }
    // Neither side of a snapshot diff is the file on disk, so `filePath` is
    // not a live handle. Writing here would drop a frozen snapshot on top of
    // the working tree copy, reverting everything changed since.
    if (isSnapshotDiffEditorTab(activeTab)) {
      return { ok: false };
    }
    if (activeTab.hasConflict) {
      return { ok: false, conflict: true };
    }

    const fileKey = editorFileKey(state, activeTab);
    if (pendingSaves.has(fileKey)) {
      return { ok: false };
    }
    pendingSaves.add(fileKey);

    try {
      const rootPath = getEditorWorkspaceRoot(state) ?? undefined;
      const filePath = activeTab.filePath;
      const draft = activeTab.content;
      const formatted =
        state.settings.editorFormatOnSave &&
        state.settings.editorEslintEnabled &&
        rootPath
          ? await formatWithEslint({ rootPath, filePath, text: draft })
          : null;

      const current = get();
      const tab = current.editorTabs.find((tab) => tab.id === tabId);
      if (
        !isSameEditorWorkspace(current, state) ||
        !tab ||
        !hasSameEditorBase(tab, activeTab)
      ) {
        return { ok: false };
      }
      const contentToSave = tab.content === draft ? (formatted ?? draft) : draft;
      const result = await workspaceFsAdapter.writeFile({
        rootPath,
        filePath,
        content: contentToSave,
        expectedRevision: activeTab.baseRevision,
      });

      if (!result.ok) {
        if (result.conflict) {
          updateEditorTab(state, activeTab, (tab) => ({
            ...tab,
            hasConflict: true,
            conflictRevision: result.revision ?? tab.conflictRevision,
          }));
        } else {
          toast.error(i18n.t("editor:saveConflict.saveFailed"), {
            description: filePath,
          });
        }
        return { ok: false, conflict: result.conflict };
      }

      updateEditorTab(state, activeTab, (tab) => {
        // Apply formatting only to the draft it was computed from. The disk
        // anchor always describes the text the write actually acknowledged.
        const content = tab.content === draft ? contentToSave : tab.content;
        return {
          ...tab,
          content,
          contentState: "ready",
          originalContent: tab.id.startsWith("file:")
            ? contentToSave
            : tab.originalContent,
          savedContent: contentToSave,
          baseRevision: result.revision ?? tab.baseRevision,
          hasConflict: false,
          conflictRevision: null,
          isDirty: content !== contentToSave,
        };
      });

      return { ok: true };
    } finally {
      pendingSaves.delete(fileKey);
    }
  };

  return {
    resolveDiff: ({ taskId, messageId, accepted, partIndex }) => {
      set((state) => {
        const current = state.messagesByTask[taskId] ?? [];
        return {
          messagesByTask: {
            ...state.messagesByTask,
            [taskId]: updateMessageById({
              messages: current,
              messageId,
              update: (message) => ({
                ...message,
                parts: message.parts.map((part, index) => {
                  if (part.type !== "code_diff") {
                    return part;
                  }
                  if (partIndex != null && index !== partIndex) {
                    return part;
                  }
                  return {
                    ...part,
                    status: accepted ? "accepted" : "rejected",
                  };
                }),
              }),
            }),
          },
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
    },
    openDiffInEditor: async ({
      editorTabId,
      filePath,
      oldContent,
      newContent,
      isStale,
    }) => {
      const diskAnchor = await readDiffTabDiskAnchor({
        editorTabId,
        filePath,
      });
      // Reading the anchor suspends this action, so a newer request can have
      // taken over the surface that asked for this diff. Committing anyway would
      // make the superseded file active again.
      if (isStale?.()) {
        return;
      }
      const modifiedContent = diskAnchor?.content ?? newContent;
      const diskRevision = diskAnchor?.revision ?? null;

      set((state) => {
        const existing = state.editorTabs.find((tab) => tab.id === editorTabId);
        const nextLanguage = resolveLanguage({ filePath });
        if (existing) {
          const canRefreshExisting = !existing.isDirty;
          const nextBaseRevision = diskRevision ?? existing.baseRevision;
          const shouldRefreshExisting =
            canRefreshExisting &&
            (existing.filePath !== filePath ||
              existing.language !== nextLanguage ||
              existing.originalContent !== oldContent ||
              existing.content !== modifiedContent ||
              existing.savedContent !== modifiedContent ||
              existing.baseRevision !== nextBaseRevision);

          return {
            editorTabs: shouldRefreshExisting
              ? state.editorTabs.map((tab) =>
                  tab.id === existing.id
                    ? {
                        ...tab,
                        filePath,
                        language: nextLanguage,
                        content: modifiedContent,
                        contentState: "ready",
                        originalContent: oldContent,
                        savedContent: modifiedContent,
                        baseRevision: nextBaseRevision,
                        hasConflict: false,
                        isDirty: false,
                      }
                    : tab,
                )
              : state.editorTabs,
            activeEditorTabId: existing.id,
            layout: {
              ...state.layout,
              editorDiffMode: true,
              editorMarkdownPreviewMode: false,
            },
            workspaceSnapshotVersion:
              shouldRefreshExisting || state.activeEditorTabId !== existing.id
                ? incrementWorkspaceSnapshotVersion(state)
                : state.workspaceSnapshotVersion,
          };
        }

        const nextTab: EditorTab = {
          id: editorTabId,
          filePath,
          kind: "text",
          language: nextLanguage,
          content: modifiedContent,
          contentState: "ready",
          originalContent: oldContent,
          savedContent: modifiedContent,
          baseRevision: diskRevision,
          hasConflict: false,
          isDirty: false,
        };
        // Leaving the diff of an HTML file lands on its source, as a markdown
        // diff does; the preview toggle still offers the rendered page.
        if (isHtmlEditorTab(nextTab)) {
          nextTab.htmlViewMode = "source";
        }

        return {
          editorTabs: [...state.editorTabs, nextTab],
          activeEditorTabId: nextTab.id,
          layout: {
            ...state.layout,
            editorDiffMode: true,
            editorMarkdownPreviewMode: false,
          },
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
    },
    openGitGraph: () => {
      set((state) => {
        const workspaceId = resolveOpenableGitGraphWorkspaceId({
          activeWorkspaceId: state.activeWorkspaceId,
          repositoryPath: state.repositoryPath,
          workspaces: state.workspaces,
          workspacePathById: state.workspacePathById,
        });
        if (!workspaceId) {
          return {};
        }
        const tabId = gitGraphTabId(workspaceId);
        const existing = state.editorTabs.find((tab) => tab.id === tabId);
        if (existing) {
          return {
            activeEditorTabId: existing.id,
            layout: {
              ...state.layout,
              editorDiffMode: false,
              editorMarkdownPreviewMode: false,
            },
            workspaceSnapshotVersion:
              state.activeEditorTabId !== existing.id
                ? incrementWorkspaceSnapshotVersion(state)
                : state.workspaceSnapshotVersion,
          };
        }

        const nextTab: EditorTab = {
          id: tabId,
          filePath: COMMIT_GRAPH_TITLE,
          kind: "git-graph",
          language: "",
          content: "",
          hasConflict: false,
          isDirty: false,
        };

        return {
          editorTabs: [...state.editorTabs, nextTab],
          activeEditorTabId: nextTab.id,
          layout: {
            ...state.layout,
            editorDiffMode: false,
            editorMarkdownPreviewMode: false,
          },
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
    },
    openFileFromTree: async ({ filePath, line, column, fallbackContent }) => {
      const state = get();
      const workspaceId = state.activeWorkspaceId;
      const workspaceRootPath =
        state.workspacePathById[state.activeWorkspaceId] ||
        state.repositoryPath ||
        workspaceFsAdapter.getRootPath?.() ||
        undefined;
      const normalizedFilePath = resolveWorkspaceRelativeFilePath({
        filePath,
        workspacePath: workspaceRootPath,
      });
      if (!normalizedFilePath) {
        return;
      }

      const normalizedLine =
        typeof line === "number" && Number.isFinite(line)
          ? Math.max(1, Math.floor(line))
          : undefined;
      const normalizedColumn =
        typeof column === "number" && Number.isFinite(column)
          ? Math.max(1, Math.floor(column))
          : undefined;
      const pendingSelection = normalizedLine
        ? {
            tabId: `file:${normalizedFilePath}`,
            line: normalizedLine,
            ...(normalizedColumn ? { column: normalizedColumn } : {}),
          }
        : null;
      const isImageFile = isImageFilePath({ filePath: normalizedFilePath });
      const isPdf = isPdfFilePath(normalizedFilePath);
      let fileData = isImageFile || isPdf
        ? null
        : await workspaceFsAdapter.readFile({
            filePath: normalizedFilePath,
          });
      let imageData = isImageFile
        ? await workspaceFsAdapter.readFileDataUrl({
            filePath: normalizedFilePath,
          })
        : null;
      if (get().activeWorkspaceId !== workspaceId) {
        return;
      }
      if (!isPdf && !fileData && !imageData) {
        if (workspaceRootPath) {
          await workspaceFsAdapter.setRoot?.({
            rootPath: workspaceRootPath,
            rootName: state.repositoryName ?? "project",
          });
          fileData = isImageFile
            ? null
            : await workspaceFsAdapter.readFile({
                filePath: normalizedFilePath,
              });
          imageData = isImageFile
            ? await workspaceFsAdapter.readFileDataUrl({
                filePath: normalizedFilePath,
              })
            : null;
        }
      }

      const tooLargeMetadata = getTooLargeEditorTabMetadata(isImageFile ? imageData : fileData);
      const contentState = isPdf ? "read-only" : (tooLargeMetadata?.contentState ?? "ready");
      const fileContent = isPdf || tooLargeMetadata
        ? ""
        : isImageFile ? (imageData?.dataUrl ?? "") : (fileData?.content ?? fallbackContent ?? "");
      const editableContent = isImageFile || contentState !== "ready" ? undefined : fileContent;
      const fileTabData = {
        content: fileContent,
        contentState,
        originalContent: editableContent,
        savedContent: editableContent,
        baseRevision: (isImageFile ? imageData?.revision : fileData?.revision) ?? null,
        fileSizeBytes: tooLargeMetadata?.fileSizeBytes,
        fileSizeLimitBytes: tooLargeMetadata?.fileSizeLimitBytes,
        hasConflict: false,
        isDirty: false,
      } satisfies Partial<EditorTab>;

      let existingDeferredTabId: string | null = null;
      set((state) => {
        if (state.activeWorkspaceId !== workspaceId) {
          return {};
        }
        const tabId = `file:${normalizedFilePath}`;
        const existing = state.editorTabs.find((tab) => tab.id === tabId);
        if (existing) {
          // Crossing the editable byte limit on disk can change the surface
          // when a file is reopened, but a dirty buffer still owns its tab.
          const changeSurface = !existing.isDirty && existing.contentState !== contentState &&
            (isPdf || (!isImageFile && fileData &&
              (tooLargeMetadata || existing.contentState === "too-large")));
          existingDeferredTabId =
            !changeSurface && existing.contentState === "deferred" ? existing.id : null;
          return {
            ...(changeSurface && {
              editorTabs: state.editorTabs.map((tab) =>
                tab.id === existing.id ? { ...tab, ...fileTabData, conflictRevision: null } : tab,
              ),
            }),
            activeEditorTabId: existing.id,
            layout: {
              ...state.layout,
              editorDiffMode: false,
              editorMarkdownPreviewMode: isMarkdownEditorTab(existing)
                ? true
                : state.layout.editorMarkdownPreviewMode,
            },
            pendingEditorSelection: pendingSelection,
            workspaceSnapshotVersion:
              (changeSurface || state.activeEditorTabId !== existing.id)
                ? incrementWorkspaceSnapshotVersion(state)
                : state.workspaceSnapshotVersion,
          };
        }

        const nextTab: EditorTab = {
          id: tabId,
          filePath: normalizedFilePath,
          kind: isImageFile ? "image" : "text",
          language: resolveLanguage({ filePath: normalizedFilePath }),
          ...fileTabData,
        };
        // A new HTML tab opens the way the user last left one.
        if (isHtmlEditorTab(nextTab)) {
          nextTab.htmlViewMode = state.settings.editorHtmlViewMode;
        }

        return {
          editorTabs: [...state.editorTabs, nextTab],
          activeEditorTabId: nextTab.id,
          layout: {
            ...state.layout,
            editorDiffMode: false,
            editorMarkdownPreviewMode: isMarkdownEditorTab(nextTab)
              ? true
              : state.layout.editorMarkdownPreviewMode,
          },
          pendingEditorSelection: pendingSelection,
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
      if (existingDeferredTabId) {
        void hydrateDeferredEditorTab({
          workspaceId: state.activeWorkspaceId,
          tabId: existingDeferredTabId,
        });
      }
    },
    setActiveEditorTab: ({ tabId }) => {
      let workspaceId = "";
      let shouldHydrate = false;
      set((state) => {
        if (state.activeEditorTabId === tabId) {
          return {};
        }
        const selectedTab = state.editorTabs.find((tab) => tab.id === tabId);
        if (!selectedTab) {
          return {};
        }
        workspaceId = state.activeWorkspaceId;
        shouldHydrate = selectedTab.contentState === "deferred";
        return {
          activeEditorTabId: tabId,
          layout: {
            ...state.layout,
            ...resolveEditorLayoutForActivatedTab({
              tab: selectedTab,
              layout: state.layout,
            }),
          },
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
      if (shouldHydrate && workspaceId) {
        void hydrateDeferredEditorTab({
          workspaceId,
          tabId,
        });
      }
    },
    setEditorTabHtmlViewMode: ({ tabId, mode }) =>
      set((state) => {
        const tab = state.editorTabs.find((item) => item.id === tabId);
        if (!tab || !isHtmlEditorTab(tab)) {
          return {};
        }
        const isActive = state.activeEditorTabId === tabId;
        return {
          editorTabs: state.editorTabs.map((item) =>
            item.id === tabId ? { ...item, htmlViewMode: mode } : item,
          ),
          // The last pick is how the next HTML tab opens.
          settings: { ...state.settings, editorHtmlViewMode: mode },
          // Diff and preview are mutually exclusive views of the active tab.
          ...(isActive && mode === "preview" && state.layout.editorDiffMode
            ? { layout: { ...state.layout, editorDiffMode: false } }
            : {}),
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      }),
    closeEditorTab: ({ tabId }) =>
      set((state) => {
        const closingIndex = state.editorTabs.findIndex(
          (tab) => tab.id === tabId,
        );
        if (closingIndex < 0) {
          return {};
        }
        const nextPendingEditorSelection =
          state.pendingEditorSelection?.tabId === tabId
            ? null
            : state.pendingEditorSelection;
        const nextTabs = state.editorTabs.filter((tab) => tab.id !== tabId);
        if (nextTabs.length === 0) {
          return {
            editorTabs: [],
            activeEditorTabId: null,
            pendingEditorSelection: null,
            layout: {
              ...state.layout,
              editorDiffMode: false,
              editorMarkdownPreviewMode: false,
            },
            workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
          };
        }

        if (state.activeEditorTabId !== tabId) {
          return {
            editorTabs: nextTabs,
            pendingEditorSelection: nextPendingEditorSelection,
            workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
          };
        }

        const fallbackIndex = Math.max(0, closingIndex - 1);
        const fallbackTab = nextTabs[fallbackIndex] ?? nextTabs[0];

        return {
          editorTabs: nextTabs,
          activeEditorTabId: fallbackTab?.id ?? null,
          pendingEditorSelection: nextPendingEditorSelection,
          layout: {
            ...state.layout,
            ...resolveEditorLayoutForActivatedTab({
              tab: fallbackTab,
              layout: state.layout,
            }),
          },
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      }),
    requestCloseActiveEditorTab: () =>
      set((state) => {
        if (!state.activeEditorTabId) {
          return {};
        }
        return { pendingCloseEditorTabId: state.activeEditorTabId };
      }),
    clearPendingCloseEditorTab: () => set({ pendingCloseEditorTabId: null }),
    clearPendingEditorSelection: () => set({ pendingEditorSelection: null }),
    updateEditorContent: ({ tabId, content }) => {
      // A snapshot diff is a record of a past state, so a save is refused for
      // it. Accepting edits would leave a dirty tab that can never be written
      // and prompts on close, so the store drops them regardless of which
      // editor surface produced them.
      if (isSnapshotDiffEditorTab({ id: tabId })) {
        return;
      }
      set((state) => {
        let changed = false;
        const nextTabs = state.editorTabs.map((tab) => {
          if (
            tab.id !== tabId ||
            tab.kind === "image" ||
            tab.content === content
          ) {
            return tab;
          }
          changed = true;
          return {
            ...tab,
            content,
            isDirty:
              (tab.savedContent ?? tab.originalContent ?? tab.content) !==
              content,
          };
        });

        if (!changed) {
          return {};
        }

        return {
          editorTabs: nextTabs,
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
    },
    saveActiveEditorTab: async () => {
      const tabId = get().activeEditorTabId;
      return tabId ? saveEditorTab(tabId) : { ok: false };
    },
    resolveEditorTabConflict: async ({ tabId, resolution }) => {
      const state = get();
      const tab = state.editorTabs.find((item) => item.id === tabId);
      if (
        !tab?.hasConflict ||
        tab.kind === "image" ||
        pendingSaves.has(editorFileKey(state, tab))
      ) {
        return { ok: false };
      }
      const target = {
        rootPath: getEditorWorkspaceRoot(state) ?? undefined,
        filePath: tab.filePath,
      };
      if (resolution === "keep-mine") {
        // Keep mine overwrites only the disk version the user was shown. If
        // the file moved again since, the save conflicts again.
        const diskRevision =
          tab.conflictRevision ??
          (await workspaceFsAdapter.readFile(target))?.revision ??
          null;
        const applied = updateEditorTab(state, tab, (current) => ({
          ...current,
          baseRevision: diskRevision,
          hasConflict: false,
          conflictRevision: null,
        }));
        return applied ? saveEditorTab(tabId) : { ok: false };
      }

      const disk = await workspaceFsAdapter.readFile(target);
      if (!disk) {
        toast.error(i18n.t("editor:saveConflict.reloadFailed"), {
          description: tab.filePath,
        });
        return { ok: false };
      }
      const applied = updateEditorTab(state, tab, (current) =>
        current.content === tab.content
          ? applyEditorDiskContents(current, disk)
          : current,
      );
      return { ok: applied };
    },
    checkOpenTabConflicts: async () => {
      const state = get();
      const rootPath = getEditorWorkspaceRoot(state) ?? undefined;
      const reads = new Map<
        string,
        { captured: EditorTab; disk: WorkspaceFileData | WorkspaceImageData }
      >();

      for (const tab of state.editorTabs) {
        if (!isSameEditorWorkspace(get(), state)) {
          return;
        }
        if (
          (tab.contentState && tab.contentState !== "ready") ||
          tab.kind === "git-graph" ||
          isSnapshotDiffEditorTab(tab) ||
          pendingSaves.has(editorFileKey(state, tab))
        ) {
          continue;
        }
        const target = { rootPath, filePath: tab.filePath };
        const disk =
          tab.kind === "image"
            ? await workspaceFsAdapter.readFileDataUrl(target)
            : await workspaceFsAdapter.readFile(target);
        if (disk) {
          reads.set(tab.id, { captured: tab, disk });
        }
      }

      if (reads.size === 0) {
        return;
      }
      set((current) => {
        if (!isSameEditorWorkspace(current, state)) {
          return current;
        }
        let changed = false;
        const editorTabs = current.editorTabs.map((tab) => {
          const read = reads.get(tab.id);
          if (!read || !hasSameEditorBase(tab, read.captured)) {
            return tab;
          }
          const { disk } = read;
          if (
            pendingSaves.has(editorFileKey(state, tab)) ||
            (!disk.tooLarge &&
              tab.baseRevision &&
              disk.revision === tab.baseRevision) ||
            (tab.hasConflict && tab.conflictRevision === disk.revision)
          ) {
            return tab;
          }

          changed = true;
          // Use the current draft state. The user may have edited the tab
          // while the read was in flight.
          if (tab.isDirty) {
            return {
              ...tab,
              hasConflict: true,
              conflictRevision: disk.revision,
            };
          }

          return applyEditorDiskContents(tab, disk);
        });

        return changed
          ? {
              editorTabs,
              workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(current),
            }
          : current;
      });
    },
    sendEditorContextToChat: ({ taskId }) => {
      const state = get();
      const tabId = state.activeEditorTabId;
      const activeTab = state.editorTabs.find((tab) => tab.id === tabId);
      if (
        !canSendEditorContextToTask({
          taskId,
          hasActiveEditorTab: Boolean(activeTab),
          isTaskResponding: Boolean(
            taskId && state.activeTurnIdsByTask[taskId],
          ),
        }) ||
        !activeTab ||
        (activeTab.contentState && activeTab.contentState !== "ready")
      ) {
        return;
      }

      get().sendWorkspaceFileToChat({
        taskId,
        filePath: activeTab.filePath,
      });
    },
    sendWorkspaceFileToChat: ({ taskId, filePath }) => {
      const state = get();
      const normalizedFilePath = filePath.trim();
      if (
        !canSendWorkspaceFileToTask({
          taskId,
          filePath: normalizedFilePath,
          isTaskResponding: Boolean(
            taskId && state.activeTurnIdsByTask[taskId],
          ),
        })
      ) {
        return;
      }

      const currentDraft =
        state.promptDraftByTask[taskId] ?? EMPTY_PROMPT_DRAFT;
      if (!currentDraft.attachedFilePaths.includes(normalizedFilePath)) {
        get().updatePromptDraft({
          taskId,
          patch: {
            attachedFilePaths: [
              ...currentDraft.attachedFilePaths,
              normalizedFilePath,
            ],
          },
        });
      }

      set((s) => ({ promptFocusNonce: s.promptFocusNonce + 1 }));
    },
  };
}
