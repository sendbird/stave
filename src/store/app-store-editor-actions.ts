import type { StoreApi } from "zustand";
import { formatWithEslint } from "@/components/layout/editor-language-intelligence";
import { loadWorkspaceEditorTabBodies } from "@/lib/db/workspaces.db";
import { workspaceFsAdapter } from "@/lib/fs";
import { COMMIT_GRAPH_TITLE } from "@/lib/git-graph/presentation";
import { resolveWorkspaceRelativeFilePath } from "@/lib/workspace-file-path";
import type { AppState } from "@/store/app-store.types";
import {
  canSendEditorContextToTask,
  canSendWorkspaceFileToTask,
  getTooLargeEditorTabMetadata,
  isImageFilePath,
  isMarkdownEditorTab,
  resolveLanguage,
  updateMessageById,
} from "@/store/editor.utils";
import { isDiffEditorTab } from "@/store/layout.utils";
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
  projectPath: string | null;
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
    args.workspacePathById[workspaceId] ?? args.projectPath ?? "";
  return workspacePath.trim() ? workspaceId : null;
}

type EditorActionName =
  | "resolveDiff"
  | "openDiffInEditor"
  | "openGitGraph"
  | "openFileFromTree"
  | "setActiveEditorTab"
  | "closeEditorTab"
  | "requestCloseActiveEditorTab"
  | "clearPendingCloseEditorTab"
  | "clearPendingEditorSelection"
  | "updateEditorContent"
  | "saveActiveEditorTab"
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

export function createEditorActions(args: {
  set: AppStoreSet;
  get: AppStoreGet;
}): EditorActions {
  const { set, get } = args;

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
        targetTab.contentState === "too-large"
      ) {
        return {};
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
        state.workspacePathById[args.workspaceId] || state.projectPath;
      let fileData = await workspaceFsAdapter.readFile({
        filePath,
      });
      if (!fileData && workspaceRootPath) {
        await workspaceFsAdapter.setRoot?.({
          rootPath: workspaceRootPath,
          rootName: state.projectName ?? "project",
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
    openDiffInEditor: ({ editorTabId, filePath, oldContent, newContent }) => {
      set((state) => {
        const existing = state.editorTabs.find((tab) => tab.id === editorTabId);
        const nextLanguage = resolveLanguage({ filePath });
        if (existing) {
          const canRefreshExisting = !existing.isDirty;
          const shouldRefreshExisting =
            canRefreshExisting &&
            (existing.filePath !== filePath ||
              existing.language !== nextLanguage ||
              existing.originalContent !== oldContent ||
              existing.content !== newContent ||
              existing.savedContent !== newContent);

          return {
            editorTabs: shouldRefreshExisting
              ? state.editorTabs.map((tab) =>
                  tab.id === existing.id
                    ? {
                        ...tab,
                        filePath,
                        language: nextLanguage,
                        content: newContent,
                        contentState: "ready",
                        originalContent: oldContent,
                        savedContent: newContent,
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
          content: newContent,
          contentState: "ready",
          originalContent: oldContent,
          savedContent: newContent,
          baseRevision: null,
          hasConflict: false,
          isDirty: false,
        };

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
          projectPath: state.projectPath,
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
      const workspaceRootPath =
        state.workspacePathById[state.activeWorkspaceId] ||
        state.projectPath ||
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
      let fileData = isImageFile
        ? null
        : await workspaceFsAdapter.readFile({
            filePath: normalizedFilePath,
          });
      let imageData = isImageFile
        ? await workspaceFsAdapter.readFileDataUrl({
            filePath: normalizedFilePath,
          })
        : null;
      if (!fileData && !imageData) {
        if (workspaceRootPath) {
          await workspaceFsAdapter.setRoot?.({
            rootPath: workspaceRootPath,
            rootName: state.projectName ?? "project",
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

      let existingDeferredTabId: string | null = null;
      set((state) => {
        const tabId = `file:${normalizedFilePath}`;
        const existing = state.editorTabs.find((tab) => tab.id === tabId);
        if (existing) {
          existingDeferredTabId =
            existing.contentState === "deferred" ? existing.id : null;
          const shouldPreviewMarkdown = isMarkdownEditorTab(existing);
          return {
            activeEditorTabId: existing.id,
            layout: {
              ...state.layout,
              editorDiffMode: false,
              editorMarkdownPreviewMode: shouldPreviewMarkdown
                ? true
                : state.layout.editorMarkdownPreviewMode,
            },
            pendingEditorSelection: pendingSelection,
            workspaceSnapshotVersion:
              state.activeEditorTabId !== existing.id
                ? incrementWorkspaceSnapshotVersion(state)
                : state.workspaceSnapshotVersion,
          };
        }

        const tooLargeMetadata = getTooLargeEditorTabMetadata(
          isImageFile ? imageData : fileData,
        );
        const fileContent = isImageFile
          ? tooLargeMetadata
            ? ""
            : (imageData?.dataUrl ?? "")
          : tooLargeMetadata
            ? ""
            : (fileData?.content ?? fallbackContent ?? "");
        const baseRevision = isImageFile
          ? (imageData?.revision ?? null)
          : (fileData?.revision ?? null);
        const nextLanguage = resolveLanguage({
          filePath: normalizedFilePath,
        });
        const nextTab: EditorTab = {
          id: tabId,
          filePath: normalizedFilePath,
          kind: isImageFile ? "image" : "text",
          language: nextLanguage,
          content: fileContent,
          contentState: tooLargeMetadata?.contentState ?? "ready",
          originalContent:
            isImageFile || tooLargeMetadata ? undefined : fileContent,
          savedContent:
            isImageFile || tooLargeMetadata ? undefined : fileContent,
          baseRevision: tooLargeMetadata?.baseRevision ?? baseRevision,
          fileSizeBytes: tooLargeMetadata?.fileSizeBytes,
          fileSizeLimitBytes: tooLargeMetadata?.fileSizeLimitBytes,
          hasConflict: false,
          isDirty: false,
        };

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
        const isDiffTab = isDiffEditorTab(selectedTab);
        return {
          activeEditorTabId: tabId,
          layout: {
            ...state.layout,
            editorDiffMode: isDiffTab,
            editorMarkdownPreviewMode: isDiffTab
              ? false
              : state.layout.editorMarkdownPreviewMode,
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
        const isDiffTab = isDiffEditorTab(fallbackTab);

        return {
          editorTabs: nextTabs,
          activeEditorTabId: fallbackTab?.id ?? null,
          pendingEditorSelection: nextPendingEditorSelection,
          layout: {
            ...state.layout,
            editorDiffMode: isDiffTab,
            editorMarkdownPreviewMode: isDiffTab
              ? false
              : state.layout.editorMarkdownPreviewMode,
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
            hasConflict: false,
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
      const state = get();
      const tabId = state.activeEditorTabId;
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

      // Format on save with ESLint
      let contentToSave = activeTab.content;
      if (
        state.settings.editorFormatOnSave &&
        state.settings.editorEslintEnabled
      ) {
        const rootPath =
          state.workspacePathById[state.activeWorkspaceId] || state.projectPath;
        if (rootPath) {
          const formatted = await formatWithEslint({
            rootPath,
            filePath: activeTab.filePath,
            text: activeTab.content,
          });
          if (formatted !== null) {
            contentToSave = formatted;
            // Update the tab content with formatted text
            set((s) => ({
              editorTabs: s.editorTabs.map((tab) =>
                tab.id === activeTab.id ? { ...tab, content: formatted } : tab,
              ),
            }));
          }
        }
      }

      let result = await workspaceFsAdapter.writeFile({
        filePath: activeTab.filePath,
        content: contentToSave,
        expectedRevision: activeTab.baseRevision,
      });
      if (!result.ok) {
        const workspaceRootPath =
          state.workspacePathById[state.activeWorkspaceId] || state.projectPath;
        if (workspaceRootPath) {
          await workspaceFsAdapter.setRoot?.({
            rootPath: workspaceRootPath,
            rootName: state.projectName ?? "project",
          });
          result = await workspaceFsAdapter.writeFile({
            filePath: activeTab.filePath,
            content: activeTab.content,
            expectedRevision: activeTab.baseRevision,
          });
        }
      }

      if (!result.ok) {
        if (result.conflict) {
          set((nextState) => ({
            editorTabs: nextState.editorTabs.map((tab) =>
              tab.id === activeTab.id
                ? {
                    ...tab,
                    hasConflict: true,
                    baseRevision: result.revision ?? tab.baseRevision,
                  }
                : tab,
            ),
            workspaceSnapshotVersion:
              incrementWorkspaceSnapshotVersion(nextState),
          }));
        }
        return { ok: false, conflict: result.conflict };
      }

      set((nextState) => ({
        editorTabs: nextState.editorTabs.map((tab) =>
          tab.id === activeTab.id
            ? {
                ...tab,
                contentState: "ready",
                originalContent: tab.id.startsWith("file:")
                  ? tab.content
                  : tab.originalContent,
                savedContent: tab.content,
                baseRevision: result.revision ?? tab.baseRevision,
                hasConflict: false,
                isDirty: false,
              }
            : tab,
        ),
        workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(nextState),
      }));

      return { ok: true };
    },
    checkOpenTabConflicts: async () => {
      const state = get();
      const updates: Array<{
        tabId: string;
        fromDisk: string;
        revision: string;
        dirty: boolean;
        kind: "text" | "image";
        tooLarge?: boolean;
        sizeBytes?: number;
        maxSizeBytes?: number;
      }> = [];

      for (const tab of state.editorTabs) {
        if (tab.contentState && tab.contentState !== "ready") {
          continue;
        }
        if (tab.kind === "image") {
          const imageDisk = await workspaceFsAdapter.readFileDataUrl({
            filePath: tab.filePath,
          });
          if (!imageDisk) {
            continue;
          }
          if (imageDisk.tooLarge) {
            updates.push({
              tabId: tab.id,
              fromDisk: "",
              revision: imageDisk.revision,
              dirty: tab.isDirty,
              kind: "image",
              tooLarge: true,
              sizeBytes: imageDisk.sizeBytes,
              maxSizeBytes: imageDisk.maxSizeBytes,
            });
            continue;
          }
          if (tab.baseRevision && imageDisk.revision === tab.baseRevision) {
            continue;
          }
          updates.push({
            tabId: tab.id,
            fromDisk: imageDisk.dataUrl,
            revision: imageDisk.revision,
            dirty: tab.isDirty,
            kind: "image",
          });
          continue;
        }

        const disk = await workspaceFsAdapter.readFile({
          filePath: tab.filePath,
        });
        if (!disk) {
          continue;
        }
        if (disk.tooLarge) {
          updates.push({
            tabId: tab.id,
            fromDisk: "",
            revision: disk.revision,
            dirty: tab.isDirty,
            kind: "text",
            tooLarge: true,
            sizeBytes: disk.sizeBytes,
            maxSizeBytes: disk.maxSizeBytes,
          });
          continue;
        }

        if (tab.baseRevision && disk.revision === tab.baseRevision) {
          continue;
        }

        updates.push({
          tabId: tab.id,
          fromDisk: disk.content,
          revision: disk.revision,
          dirty: tab.isDirty,
          kind: "text",
        });
      }

      if (updates.length === 0) {
        return;
      }

      set((nextState) => ({
        editorTabs: nextState.editorTabs.map((tab) => {
          const update = updates.find((item) => item.tabId === tab.id);
          if (!update) {
            return tab;
          }

          if (update.dirty) {
            return {
              ...tab,
              hasConflict: true,
              baseRevision: update.revision,
            };
          }

          if (update.tooLarge) {
            return {
              ...tab,
              content: "",
              contentState: "too-large",
              originalContent: undefined,
              savedContent: undefined,
              baseRevision: update.revision,
              fileSizeBytes: update.sizeBytes,
              fileSizeLimitBytes: update.maxSizeBytes,
              hasConflict: false,
              isDirty: false,
            };
          }

          return {
            ...tab,
            content: update.fromDisk,
            contentState: "ready",
            originalContent:
              update.kind === "image"
                ? tab.originalContent
                : tab.id.startsWith("file:")
                  ? update.fromDisk
                  : tab.originalContent,
            savedContent:
              update.kind === "image" ? tab.savedContent : update.fromDisk,
            baseRevision: update.revision,
            hasConflict: false,
            isDirty: false,
          };
        }),
        workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(nextState),
      }));
    },
    sendEditorContextToChat: ({ taskId, instruction }) => {
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
